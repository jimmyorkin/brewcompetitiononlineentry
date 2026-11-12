import { test, expect } from '@playwright/test';
import { registerEntrant } from '../helpers/auth';
import { backdateEntries, purgeBboTestEntries, query } from '../helpers/db';
import { ENTRANT_TABLE_MSG, FULL_MSG, TOO_SOON_MSG, bboName, entrantWithEntry, submitEntry } from '../helpers/bluebonnet';

/**
 * Bluebonnet-specific entry rules (not part of stock BCOE&M). They live in
 * includes/process/process_brewing.inc.php, includes/db/BBOtables.db.php and
 * mods/bbo-delete-unpaids.php, driven by bbo_tables and the $BBO* settings in
 * site/config.php (docker/config.php: 4 entries per table, 1 per entrant per
 * table, 60s between adds, unpaid entries deleted after 1 hour).
 *
 * Styles are from BJCP group 26 (Strong Belgian Ales -> bbo_tables 76) and 25
 * (Pale Belgian Ales -> table 75): none need special-ingredient fields, and the
 * generic journeys never pick them, so these tests own those tables. Each test
 * starts from a purged slate ("BBO "-prefixed rows only).
 */

/** A successful add redirects to the list with msg=1 ("entry added"). */
const ADDED = /msg=1(&|$)/;
const TABLE_GROUP_26 = { a: '26-A', b: '26-B', c: '26-C', d: '26-D' };
const OTHER_TABLE_STYLE = '25-A';

test.describe.serial('bluebonnet entry rules', () => {
  test.beforeEach(async () => { await purgeBboTestEntries(); });
  test.afterAll(async () => { await purgeBboTestEntries(); });

  test('a table holds at most 4 entries: the form disables its styles and the server refuses a forced add', async ({ browser, page }) => {
    test.setTimeout(60_000);   // registers five entrants; ~47s on a warm stack
    for (const style of [TABLE_GROUP_26.a, TABLE_GROUP_26.b, TABLE_GROUP_26.c, TABLE_GROUP_26.d]) {
      await entrantWithEntry(browser, style, bboName('fill'));
    }

    await registerEntrant(page);
    await page.goto('/index.php?section=brew&go=entry&action=add');
    // UI guard: every style in the full table is disabled and says why.
    for (const v of Object.values(TABLE_GROUP_26)) {
      const opt = page.locator(`select[name="brewStyle"] option[value="${v}"]`);
      await expect(opt).toBeDisabled();
      expect(await opt.textContent()).toMatch(/medal category is full/i);
    }
    // ...and a style in a different table is still open.
    await expect(page.locator(`select[name="brewStyle"] option[value="${OTHER_TABLE_STYLE}"]`)).toBeEnabled();

    // Server guard: force the disabled option through the form anyway.
    const url = await submitEntry(page, TABLE_GROUP_26.a, bboName('over'), true);
    expect(url).toMatch(/msg=13/);
    await expect(page.locator('body')).toContainText(FULL_MSG);

    const [{ n }] = await query<{ n: number }>("SELECT COUNT(*) n FROM brewing WHERE brewCategory = '26'");
    expect(Number(n)).toBe(4);
  });

  test('an entrant may enter only one style per table: the form disables the rest and the server refuses a forced add (msg=bbo3)', async ({ page }) => {
    await registerEntrant(page);
    const first = bboName('first');
    expect(await submitEntry(page, TABLE_GROUP_26.a, first)).toMatch(ADDED);

    await backdateEntries(first, 5);   // get past the 60s spacing rule so only the table rule can fire

    // UI guard: the rest of the table is disabled for this entrant, and says why.
    await page.goto('/index.php?section=brew&go=entry&action=add');
    const sibling = page.locator(`select[name="brewStyle"] option[value="${TABLE_GROUP_26.b}"]`);
    await expect(sibling).toBeDisabled();
    expect(await sibling.textContent()).toMatch(/entrant maxed in medal category/i);
    await expect(page.locator(`select[name="brewStyle"] option[value="${OTHER_TABLE_STYLE}"]`)).toBeEnabled();

    // Server guard: force the disabled option through anyway.
    const url = await submitEntry(page, TABLE_GROUP_26.b, bboName('second'), true);
    expect(url).toMatch(/msg=bbo3/);
    await expect(page.locator('body')).toContainText(ENTRANT_TABLE_MSG);

    const [{ n }] = await query<{ n: number }>("SELECT COUNT(*) n FROM brewing WHERE brewName LIKE 'BBO %'");
    expect(Number(n)).toBe(1);
  });

  test('entries must be at least 60 seconds apart (msg=bbo4), then are allowed', async ({ page }) => {
    await registerEntrant(page);
    const first = bboName('first');
    expect(await submitEntry(page, TABLE_GROUP_26.a, first)).toMatch(ADDED);

    // UI guard: a countdown modal covers the form while the 60s window is open.
    await page.goto('/index.php?section=brew&go=entry&action=add');
    await expect(page.locator('#bbo-cdt')).toBeVisible();
    expect(Number(await page.locator('#bbo-cdt').textContent())).toBeGreaterThan(0);

    // Server guard: a different table, so only the spacing rule can reject it.
    const tooSoon = await submitEntry(page, OTHER_TABLE_STYLE, bboName('too-soon'), true);
    expect(tooSoon).toMatch(/msg=bbo4/);
    await expect(page.locator('body')).toContainText(TOO_SOON_MSG);

    await backdateEntries(first, 5);
    const ok = await submitEntry(page, OTHER_TABLE_STYLE, bboName('later'));
    expect(ok).toMatch(ADDED);

    const [{ n }] = await query<{ n: number }>("SELECT COUNT(*) n FROM brewing WHERE brewName LIKE 'BBO %'");
    expect(Number(n)).toBe(2);
  });

  test('an unpaid entry older than an hour is logically deleted on the next page load', async ({ page }) => {
    await registerEntrant(page);
    const name = bboName('stale');
    await submitEntry(page, TABLE_GROUP_26.a, name);
    await expect(page.getByText(name).first()).toBeVisible();   // visible while fresh

    await backdateEntries(name, 120);
    await page.goto('/index.php');   // the mod runs from index.php on any request

    // Logical, not physical: row kept in the base table, flagged, hidden by the view.
    const [row] = await query<{ id: number; bboLogicallyDeleted: number }>(
      'SELECT id, bboLogicallyDeleted FROM brewing_bbo_real WHERE brewName = ?', [name]);
    expect(row).toBeDefined();
    expect(Number(row.bboLogicallyDeleted)).toBe(1);
    expect(await query('SELECT id FROM brewing WHERE brewName = ?', [name])).toHaveLength(0);

    // It is audited in barcode_log, and gone from the entrant's list.
    const log = await query<{ user_name: string }>('SELECT user_name FROM barcode_log WHERE entrynum = ?', [String(row.id)]);
    expect(log.map(l => l.user_name)).toContain('1-hour-logical-delete');
    await page.goto('/index.php?section=list');
    await expect(page.getByText(name)).toHaveCount(0);
  });

  test('a paid entry is never logically deleted, however old', async ({ page }) => {
    await registerEntrant(page);
    const name = bboName('paid');
    await submitEntry(page, TABLE_GROUP_26.a, name);

    await query('UPDATE brewing_bbo_real SET brewPaid = 1 WHERE brewName = ?', [name]);
    await backdateEntries(name, 120);
    await page.goto('/index.php');

    const [row] = await query<{ bboLogicallyDeleted: number }>(
      'SELECT bboLogicallyDeleted FROM brewing_bbo_real WHERE brewName = ?', [name]);
    expect(Number(row.bboLogicallyDeleted)).toBe(0);
    await page.goto('/index.php?section=list');
    await expect(page.getByText(name).first()).toBeVisible();
  });

  // KNOWN GAP: process_brewing.inc.php only rejects the literal placeholder value
  // "0-A" (msg=bbo2). A POST with an empty/missing brewStyle - what the browser
  // sends if a disabled option is selected - is accepted and saved as a styleless
  // entry (brewSubCategory NULL) that no table counts. Remove .fixme once the
  // server validates that a real style was supplied.
  test.fixme('the server rejects an add that carries no style (msg=bbo2)', async ({ page }) => {
    await registerEntrant(page);
    await page.goto('/index.php?section=brew&go=entry&action=add');
    await page.fill('input[name="brewName"]', bboName('nostyle'));
    await page.evaluate(() => {
      const sel = document.querySelector<HTMLSelectElement>('select[name="brewStyle"]')!;
      sel.selectedIndex = 0;   // the empty placeholder option
    });
    await page.locator('form[name="form1"] button[type="submit"]').first().click();
    await page.waitForURL(/section=list/);
    expect(page.url()).toMatch(/msg=bbo2/);
    const [{ n }] = await query<{ n: number }>("SELECT COUNT(*) n FROM brewing WHERE brewName LIKE 'BBO %'");
    expect(Number(n)).toBe(0);
  });
});

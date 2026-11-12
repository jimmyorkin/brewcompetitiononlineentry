import { test, expect } from '@playwright/test';
import { loginAsAdmin } from '../helpers/auth';
import { fillDateTime } from '../helpers/forms';
import { createEntrantWithEntry } from '../helpers/entries';
import { query } from '../helpers/db';

/**
 * Admin-side journey over the highest-churn admin hotspots (design spec
 * Section 5): the entries admin lists a new entry; a judging table is created
 * with the entry's style assigned; a score and a 1st place are recorded for
 * the entry and persist. (The public winners page stays out of scope here:
 * docker/03-e2e-fixtures.sql deliberately sets prefsDisplayWinners=N so the
 * entrant journeys run pre-judging; score persistence is asserted in the
 * admin UI instead.)
 */

test.describe.serial('admin journey', () => {
  // Shared with the second test below, which reuses this table/entry to drive
  // the full-page judging-scores form submit (process_judging_scores.inc.php),
  // a different save path than the per-column AJAX save exercised here.
  let sharedTableId: string | undefined;
  let sharedEid: number | undefined;

  test('admin sees entries, builds a judging table, and records a score', async ({ browser, page }) => {
    const { entryName, styleName } = await createEntrantWithEntry(browser);

    await loginAsAdmin(page);

    // — Entries admin lists the new entry —
    await page.goto('/index.php?section=admin&go=entries');
    await expect(page.getByText(entryName).first()).toBeVisible();

    // — Check the entry in (mark received). With jPrefsTablePlanning=0
    //   ("plan by received entries"), a style with zero received entries is
    //   disabled on the judging-table form. The checkbox AJAX-saves. —
    const entryRow = page.locator('tr', { hasText: entryName }).first();
    await Promise.all([
      page.waitForResponse(r => r.url().includes('/ajax/')),
      entryRow.locator('input[name^="brewReceived"]').first().check(),
    ]);

    // — Ensure a judging session exists (tables can't be added without one).
    //   The date MUST be in the future: a past judgingDate flips
    //   $judging_started (includes/constants.inc.php:213-217), which closes
    //   the entry window for every other test sharing this DB. —
    await page.goto('/index.php?section=admin&go=judging_tables');
    const addSessionLink = page.getByRole('link', { name: /add a judging session/i });
    if (await addSessionLink.count()) {
      await addSessionLink.click();
      await page.fill('input[name="judgingLocName"]', 'E2E Session');
      await fillDateTime(page, 'judgingDate', '2029-06-01 09:00 AM');
      await page.fill('input[name="judgingLocation"]', '123 Test Hall');
      // judgingRounds is required but ships empty — leaving it blank makes
      // native validation silently swallow the submit.
      await page.fill('input[name="judgingRounds"]', '1');
      await page.locator('form[name="form1"] input[type="submit"]').click();
      await expect(page).toHaveURL(/go=judging/);
    }

    // — Create a judging table with the entry's style assigned. A style can
    //   belong to only one table, so on repeat runs (same style, table
    //   already exists) reuse the owning table instead: its edit link is
    //   embedded in the style row's "assigned to table" annotation. —
    await page.goto('/index.php?section=admin&go=judging_tables&action=add');
    // Checkbox values are styles.id (numeric) while the brew form's select
    // uses composite "group-num" values — so match the row by style name.
    const styleRow = page.locator('tr', { hasText: styleName }).first();
    await expect(styleRow).toBeVisible();
    let tableId: string | undefined;

    if (await styleRow.locator('input[name="tableStyles[]"]').first().isEnabled()) {
      const tableName = `E2E Table ${Date.now()}`;
      await page.fill('input[name="tableName"]', tableName);
      await styleRow.locator('input[name="tableStyles[]"]').first().check();
      await page.locator('#add-table-submit').click();

      // Verify the table exists and capture its id from the row's edit link
      await page.goto('/index.php?section=admin&go=judging_tables');
      const tableRow = page.locator('tr', { hasText: tableName }).first();
      await expect(tableRow).toBeVisible();
      const editHref = await tableRow
        .locator('a[href*="go=judging_tables"][href*="action=edit"]')
        .first()
        .getAttribute('href');
      tableId = editHref?.match(/id=(\d+)/)?.[1];
    } else {
      const assignedHref = await styleRow
        .locator('a[href*="go=judging_tables"][href*="action=edit"]')
        .first()
        .getAttribute('href');
      tableId = assignedHref?.match(/id=(\d+)/)?.[1];
    }
    expect(tableId, 'judging table id for the entry\'s style').toBeTruthy();

    // — Record a score + 1st place for the entry on that table. Each field
    //   persists itself via AJAX (save_column on blur/change); the "Add
    //   Scores" submit stays disabled and is not the save path here. —
    await page.goto(`/index.php?section=admin&go=judging_scores&action=add&id=${tableId}`);
    const scoreInput = page.locator('input[name^="scoreEntry"]').first();
    await expect(scoreInput).toBeVisible();
    await scoreInput.fill('42');
    await Promise.all([
      page.waitForResponse(r => r.url().includes('/ajax/')),
      scoreInput.blur(),
    ]);
    await Promise.all([
      page.waitForResponse(r => r.url().includes('/ajax/')),
      page.locator('select[name^="scorePlace"]').first().selectOption('1'),
    ]);

    // — Persisted: reopen the table's scores in edit mode —
    await page.goto(`/index.php?section=admin&go=judging_scores&action=edit&id=${tableId}`);
    await expect(page.locator('input[name^="scoreEntry"]').first()).toHaveValue('42');

    sharedTableId = tableId;
    const eidAttr = await page.locator('input[type="hidden"][name^="eid"]').first().getAttribute('value');
    sharedEid = eidAttr ? Number(eidAttr) : undefined;
  });

  /**
   * process_judging_scores.inc.php is reached by the full-page "Update
   * Scores" submit (admin/judging_scores.admin.php:550), a different save
   * path from the per-column AJAX saves above - that button ships
   * `disabled` since AJAX already covers normal use, so it's driven here by
   * enabling it directly. The file's duplicate-score cleanup query interpolates
   * $_POST['eid<n>'] raw (unsterilized) before the fix, so a literal quote in
   * that field previously broke the query (die(mysqli_error(...))); after
   * converting to a bound parameter it's treated as a literal value and the
   * save goes through normally.
   */
  test('judging score save survives a single quote in the eid field', async ({ page }) => {
    test.skip(!sharedTableId || !sharedEid, 'depends on the previous test having created a table/score');

    await loginAsAdmin(page);
    await page.goto(`/index.php?section=admin&go=judging_scores&action=edit&id=${sharedTableId}`);

    const form = page.locator('form[name="scores"]');
    await expect(form).toBeVisible();

    // Append a literal quote to the hidden eid field - the value
    // process_judging_scores.inc.php's duplicate-removal query used to
    // interpolate unescaped - and set the new score to save.
    await page.evaluate((eid) => {
      const eidInput = document.querySelector<HTMLInputElement>(`input[name="eid${eid}"]`);
      if (eidInput) eidInput.value = `${eid}'`;
    }, sharedEid);

    await page.fill(`input[name="scoreEntry${sharedEid}"]`, '55');

    // Submit the form directly: the button ships `disabled` (AJAX normally
    // covers this save) and the form also carries a bootstrap client-side
    // validator, both of which exist to steer normal users toward the AJAX
    // path, not to block this test from exercising the full-page submit
    // handler itself. Wait for the actual process.inc.php response so the DB
    // write is guaranteed to have happened before anything else runs - the
    // redirect lands back on this same edit URL, so a URL-regex wait could
    // otherwise resolve against the page as it already is.
    await Promise.all([
      page.waitForResponse(r => r.url().includes('/includes/process.inc.php')),
      page.evaluate(() => HTMLFormElement.prototype.submit.call(document.querySelector('form[name="scores"]'))),
    ]);
    await page.waitForLoadState('load');

    // Actual effect: the score for the real entry persisted despite the
    // quote in eid, proving the duplicate-removal lookup still matched (and
    // only matched) the intended row rather than erroring out or silently
    // matching zero/every row.
    await page.goto(`/index.php?section=admin&go=judging_scores&action=edit&id=${sharedTableId}`);
    await expect(page.locator(`input[name="scoreEntry${sharedEid}"]`)).toHaveValue('55');

    const rows = await query<{ id: number; eid: number; scoreEntry: number }>(
      'SELECT id, eid, scoreEntry FROM judging_scores WHERE scoreTable = ?', [Number(sharedTableId)]
    );
    // Exactly one score row for this table/entry - no duplicate left behind,
    // and no unrelated row wiped out by an over-broad match.
    expect(rows.filter(r => r.eid === sharedEid)).toHaveLength(1);
    expect(Number(rows.find(r => r.eid === sharedEid)!.scoreEntry)).toBe(55);
  });
});

import { test, expect } from '@playwright/test';
import { registerEntrant, loginAsAdmin } from '../helpers/auth';
import { chooseStyle } from '../helpers/entries';
import { query } from '../helpers/db';

/**
 * SQLi migration phase 2, task 2: lib/process.lib.php, lib/preflight.lib.php,
 * includes/process.inc.php (the main request router, included on nearly
 * every form submission in the app), site/bootstrap.php, and
 * includes/data_cleanup.inc.php - converted from raw mysqli_query()/sprintf()
 * to MysqliDb builder calls (where()/get()/getOne()) or $db_conn->rawQuery()
 * with `?` placeholders, matching upstream/master's own conversion of these
 * files (DDL statements that MySQL cannot prepare - ALTER DATABASE, ALTER
 * TABLE - are deliberately left as raw mysqli_query(), matching upstream's
 * own explicit choice there too; they carry no request-derived values, only
 * trusted identifiers).
 *
 * process.inc.php is the app's main router - nearly every POST flows through
 * it - so this spec exercises two of its real raw-SQL call sites end to end
 * (check_discount's UPDATE, and the admin purge-by-date flow it dispatches
 * to via includes/data_cleanup.inc.php), on top of the existing
 * smoke.spec.ts, which is this task's primary acceptance bar for "did the
 * router still work."
 */

test.describe('sqli migration phase 2 - remaining libs and core request flow (task 2)', () => {
  test('discount code action (check_discount) updates only the submitting brewer\'s row, not every brewer\'s', async ({ page }) => {
    test.slow();

    // contestEntryFeePassword is a single global row - record and restore it
    // so this test doesn't leave shared-stack state behind.
    const [{ contestEntryFeePassword: originalPassword }] = await query<{ contestEntryFeePassword: string | null }>(
      'SELECT contestEntryFeePassword FROM contest_info WHERE id = 1'
    );

    const testPassword = `e2e-discount-${Date.now()}`;

    try {
      await query('UPDATE contest_info SET contestEntryFeePassword = ? WHERE id = 1', [testPassword]);

      // Baseline: how many brewer rows currently have the discount flag set.
      const [{ cnt: before }] = await query<{ cnt: number }>(
        "SELECT COUNT(*) as cnt FROM brewer WHERE brewerDiscount = 'Y'"
      );

      await registerEntrant(page);

      await page.goto('/index.php?section=list');
      await page.getByRole('link', { name: /add.*entry/i }).first().click();
      await expect(page.locator('input[name="brewName"]')).toBeVisible();
      const entryName = `E2E Discount Entry ${Date.now()}`;
      await page.fill('input[name="brewName"]', entryName);
      await chooseStyle(page);
      await page.locator('form[name="form1"] button[type="submit"]').first().click();

      // Confirm the add-entry POST actually persisted before continuing -
      // this app has a known, pre-existing, cross-cutting bug (tracked in
      // TESTING.md's troubleshooting table) where the add-entry POST
      // sometimes redirects normally but the row never lands. Surfacing it
      // here, rather than letting it manifest as "discount form not found"
      // below, makes a real failure in this test unambiguous.
      await page.goto('/index.php?section=list');
      await expect(page.getByText(entryName).first()).toBeVisible();

      await page.goto('/index.php?section=pay');
      const discountForm = page.locator('form[name="form1"]:has(input[name="brewerDiscount"])');
      await expect(discountForm).toBeVisible();

      await discountForm.locator('input[name="brewerDiscount"]').fill(testPassword);
      await discountForm.locator('button[type="submit"], input[type="submit"]').first().click();

      await page.waitForURL(/msg=12/, { timeout: 15000 });

      const [{ cnt: after }] = await query<{ cnt: number }>(
        "SELECT COUNT(*) as cnt FROM brewer WHERE brewerDiscount = 'Y'"
      );

      // Exactly one additional brewer row (this entrant's own) flipped to 'Y' -
      // proves the converted UPDATE's WHERE uid=? bound the submitting
      // entrant's own id and nothing broader.
      expect(after, 'exactly one brewer row (the submitter\'s own) gained the discount flag').toBe(before + 1);
    } finally {
      await query('UPDATE contest_info SET contestEntryFeePassword = ? WHERE id = 1', [originalPassword]);
    }
  });

  test('admin purge-by-date removes only entries older than the threshold (data_cleanup.inc.php entries purge)', async ({ browser }) => {
    test.slow();

    const ctxOld = await browser.newContext();
    const pageOld = await ctxOld.newPage();
    await registerEntrant(pageOld);
    await pageOld.goto('/index.php?section=list');
    await pageOld.getByRole('link', { name: /add.*entry/i }).first().click();
    await expect(pageOld.locator('input[name="brewName"]')).toBeVisible();
    const oldEntryName = `E2E Purge Old Entry ${Date.now()}`;
    await pageOld.fill('input[name="brewName"]', oldEntryName);
    await chooseStyle(pageOld);
    await pageOld.locator('form[name="form1"] button[type="submit"]').first().click();
    // See the comment in the test above re: the known add-entry non-persistence bug.
    await pageOld.goto('/index.php?section=list');
    await expect(pageOld.getByText(oldEntryName).first()).toBeVisible();
    await ctxOld.close();

    const ctxNew = await browser.newContext();
    const pageNew = await ctxNew.newPage();
    await registerEntrant(pageNew);
    await pageNew.goto('/index.php?section=list');
    await pageNew.getByRole('link', { name: /add.*entry/i }).first().click();
    await expect(pageNew.locator('input[name="brewName"]')).toBeVisible();
    const newEntryName = `E2E Purge New Entry ${Date.now()}`;
    await pageNew.fill('input[name="brewName"]', newEntryName);
    await chooseStyle(pageNew);
    await pageNew.locator('form[name="form1"] button[type="submit"]').first().click();
    await pageNew.goto('/index.php?section=list');
    await expect(pageNew.getByText(newEntryName).first()).toBeVisible();
    await ctxNew.close();

    // Back-date the "old" entry so it falls before a threshold the "new"
    // entry doesn't.
    await query("UPDATE brewing SET brewUpdated = brewUpdated - INTERVAL 2 DAY WHERE brewName = ?", [oldEntryName]);
    const thresholdDate = new Date(Date.now() - 86400 * 1000).toISOString().slice(0, 10); // yesterday

    const adminCtx = await browser.newContext();
    const adminPage = await adminCtx.newPage();
    await loginAsAdmin(adminPage);

    // Mirrors the real admin "purge entries older than" flow: POST to
    // process.inc.php?action=purge&dbTable=...&go=entries&view=<date>.
    // Reuse the admin session's own CSRF token from a page that embeds one.
    await adminPage.goto('/index.php?section=admin&go=entries');
    const token = await adminPage.evaluate(() => {
      const el = document.querySelector('input[name="token"]') as HTMLInputElement | null;
      return el?.value ?? '';
    });
    expect(token, 'admin page carries a CSRF token to reuse for the purge POST').not.toBe('');

    const resp = await adminPage.request.post('/includes/process.inc.php?action=purge&go=entries', {
      form: {
        token,
        view: thresholdDate,
        dateThreshold: thresholdDate,
      },
    });
    expect([200, 302]).toContain(resp.status());

    const remaining = await query<{ brewName: string }>(
      'SELECT brewName FROM brewing WHERE brewName IN (?, ?)',
      [oldEntryName, newEntryName]
    );
    const remainingNames = remaining.map(r => r.brewName);

    expect(remainingNames, 'the back-dated entry was purged').not.toContain(oldEntryName);
    expect(remainingNames, 'the recent entry survived the date-scoped purge').toContain(newEntryName);

    await adminCtx.close();
  });
});

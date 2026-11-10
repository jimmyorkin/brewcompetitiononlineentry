import { test, expect, Browser } from '@playwright/test';
import { loginAsAdmin, registerEntrant } from '../helpers/auth';
import { query } from '../helpers/db';

/**
 * SQLi migration phase 2, task 1f (the final sub-task of Task 1):
 * lib/common.lib.php's misc single-call count/lookup utility functions -
 * get_contact_count(), get_entry_count(), get_evaluation_count(),
 * get_participant_count(), entry_info(), check_bos_loc(), table_exists(),
 * user_check(), judging_location_info(), verify_token(), pro_am_check(),
 * user_submitted_eval(), eval_exits(), entries_unconfirmed(),
 * check_special_ingredients(), entries_no_special(), get_archive_count(),
 * brewer_info() - converted from raw mysqli_query()/sprintf() to the
 * MysqliDb builder (where()/get()/getOne()) or $db_conn->rawQuery()/
 * rawQueryOne() with `?` placeholders, matching upstream/master's own
 * conversion of each function (adapted for this fork's own divergences -
 * see tests/Unit/SourceHardeningTest.php and the task-1f report for the
 * details).
 *
 * table_exists() required a technique change, not just a value-binding
 * change: direct testing against this stack's MariaDB confirmed
 * "SHOW TABLES LIKE ?" cannot be prepared at all (a syntax error at prepare
 * time), so it now queries information_schema.tables instead, matching
 * upstream/master's own fix for the same constraint - this function is
 * exercised indirectly by every other test in this file, since
 * get_entry_count()/get_participant_count()/brewer_info()/
 * get_archive_count() all call it internally now.
 *
 * judging_location_info(), pro_am_check(), user_submitted_eval(), and
 * eval_exits() are reachable in production (all with real, non-dead
 * callers) but each requires either a judging-table/judge-assignment setup
 * (judging_location_info(), eval_exits()'s most interesting call site) or
 * PDF/binary output (pro_am_check()'s only caller) that isn't worth standing
 * up for one query each; see the task-1f report for the one-off PHP CLI
 * verification script that exercises all four directly against this
 * stack's live database with seeded fixtures and injection-shaped values.
 * eval_exits() and user_submitted_eval() are ALSO covered here indirectly
 * through get_evaluation_count() (same underlying `evaluation` table).
 *
 * user_check() and check_bos_loc() are dead code (zero callers anywhere in
 * this fork; check_bos_loc() is additionally wrapped in a `/ * ... * /`
 * comment block and has never been live PHP) - see
 * tests/Unit/SourceHardeningTest.php for their query-shape guards.
 */

test.describe('sqli migration phase 2 - common.lib.php misc utility functions (task 1f)', () => {
  test('admin dashboard sidebar counts (get_entry_count, get_participant_count, get_evaluation_count) increase by exactly one disposable fixture each', async ({ page }) => {
    test.slow();
    const unique = `${Date.now()}-${Math.floor(Math.random() * 1e4)}`;
    const dupEid = 900100; // well outside any real entry id range on this stack

    await loginAsAdmin(page);
    await page.goto('/index.php?section=admin');

    const readCount = async (id: string) => Number((await page.locator(`#${id}`).textContent())?.trim());

    const beforePaid = await readCount('admin-dashboard-entries-paid-count');
    const beforePaidReceived = await readCount('admin-dashboard-entries-paid-received-count');
    const beforeParticipants = await readCount('admin-dashboard-participant-count');
    const beforeEvalTotal = await readCount('admin-dashboard-evaluation-count-total');
    const beforeEvalUnique = await readCount('admin-dashboard-evaluation-count');

    let brewingId: number | undefined, brewerId: number | undefined, evalId: number | undefined;
    try {
      const brewing: any = await query(
        `INSERT INTO brewing (brewName, brewStyle, brewCategory, brewCategorySort, brewSubCategory, brewBrewerID, brewPaid, brewReceived, brewConfirmed)
         VALUES (?, 'American IPA', '21', '21', 'A', 9999998, '1', '1', '1')`,
        [`E2E Misc Util ${unique}`]
      );
      brewingId = brewing.insertId;

      const brewer: any = await query(
        'INSERT INTO brewer (brewerEmail, brewerFirstName, brewerLastName) VALUES (?, ?, ?)',
        [`e2e-misc-util-${unique}@example.com`, 'E2e', `MiscUtil${unique}`]
      );
      brewerId = brewer.insertId;

      const evalRow: any = await query(
        'INSERT INTO evaluation (eid, uid, evalJudgeInfo) VALUES (?, 9999998, 1)', [dupEid]
      );
      evalId = evalRow.insertId;

      await page.goto('/index.php?section=admin');
      expect(await readCount('admin-dashboard-entries-paid-count')).toBe(beforePaid + 1);
      expect(await readCount('admin-dashboard-entries-paid-received-count')).toBe(beforePaidReceived + 1);
      expect(await readCount('admin-dashboard-participant-count')).toBe(beforeParticipants + 1);
      expect(await readCount('admin-dashboard-evaluation-count-total')).toBe(beforeEvalTotal + 1);
      expect(await readCount('admin-dashboard-evaluation-count')).toBe(beforeEvalUnique + 1);
    } finally {
      await query('DELETE FROM evaluation WHERE eid = ?', [dupEid]);
      await query('DELETE FROM brewing WHERE id = ?', [brewingId ?? -1]);
      await query('DELETE FROM brewer WHERE id = ?', [brewerId ?? -1]);
    }
  });

  test('admin archive page shows get_archive_count() for the existing brewing_bbo_real archive table', async ({ page }) => {
    // brewing_bbo_real is a real, pre-existing archived-competition table used
    // by other specs (e2e/helpers/entries.ts's backdateEntries()) - safe to
    // read-only count here. The `archive` listing table itself is empty on
    // this stack, so a disposable row pointing at the "bbo_real" suffix is
    // added to make admin/archive.admin.php's do-while loop actually call
    // get_archive_count() for it, then removed afterward.
    const [{ realCount }] = await query<{ realCount: number }>('SELECT COUNT(*) as realCount FROM brewing_bbo_real');
    expect(realCount, 'sanity check: brewing_bbo_real has real rows to count').toBeGreaterThan(0);

    let archiveRowId: number | undefined;
    try {
      const archiveRow: any = await query(
        "INSERT INTO archive (archiveSuffix, archiveProEdition, archiveStyleSet) VALUES ('bbo_real', 0, 'BJCP2021')"
      );
      archiveRowId = archiveRow.insertId;

      await loginAsAdmin(page);
      await page.goto('/index.php?section=admin&go=archive');
      await expect(page.getByText(`bbo_real (${realCount})`, { exact: false })).toBeVisible();
    } finally {
      await query('DELETE FROM archive WHERE id = ?', [archiveRowId ?? -1]);
    }
  });

  test('special_best_data admin page renders entry_info() and brewer_info() for a seeded custom-category winner', async ({ page }) => {
    const unique = `${Date.now()}-${Math.floor(Math.random() * 1e4)}`;
    const entryName = `E2E Entry Info ${unique}`;
    const brewerFirst = 'E2eEntryInfo';
    const brewerLast = `Brewer${unique}`;

    let sbiId: number | undefined, brewingId: number | undefined, brewerId: number | undefined, sbdId: number | undefined;
    try {
      const sbi: any = await query(
        "INSERT INTO special_best_info (sbi_name, sbi_places) VALUES (?, 1)", [`E2E Custom ${unique}`]
      );
      sbiId = sbi.insertId;

      const brewing: any = await query(
        `INSERT INTO brewing (brewName, brewStyle, brewCategory, brewCategorySort, brewSubCategory, brewBrewerID, brewJudgingNumber)
         VALUES (?, 'American IPA', '21', '21', 'A', 9999997, '100')`,
        [entryName]
      );
      brewingId = brewing.insertId;

      const brewer: any = await query(
        'INSERT INTO brewer (uid, brewerEmail, brewerFirstName, brewerLastName) VALUES (9999997, ?, ?, ?)',
        [`e2e-entry-info-${unique}@example.com`, brewerFirst, brewerLast]
      );
      brewerId = brewer.insertId;

      const sbd: any = await query(
        'INSERT INTO special_best_data (sid, bid, eid, sbd_place) VALUES (?, 9999997, ?, 1)',
        [sbiId, brewingId]
      );
      sbdId = sbd.insertId;

      await loginAsAdmin(page);
      await page.goto('/index.php?section=admin&go=special_best_data');

      const row = page.locator('tr', { hasText: entryName }).first();
      await expect(row).toBeVisible();
      // entry_info()'s brewName (column index 0 of its ^-joined return value).
      await expect(row).toContainText(entryName);
      // brewer_info()'s first+last name (columns 0 and 1).
      await expect(row).toContainText(`${brewerFirst} ${brewerLast}`);
    } finally {
      await query('DELETE FROM special_best_data WHERE id = ?', [sbdId ?? -1]);
      await query('DELETE FROM brewing WHERE id = ?', [brewingId ?? -1]);
      await query('DELETE FROM brewer WHERE id = ?', [brewerId ?? -1]);
      await query('DELETE FROM special_best_info WHERE id = ?', [sbiId ?? -1]);
    }
  });

  /**
   * Register a fresh entrant and submit one entry under "Brett Beer" (BJCP2021
   * group 28 sub A, brewStyleReqSpec=1) with the special-ingredients field
   * deliberately left blank - same fixture pattern as task 1d's
   * createUnconfirmedSpecialEntry(), reused here because it's the one real
   * style/flow on this stack that reliably exercises both
   * check_special_ingredients() and the brewConfirmed='0' state
   * entries_unconfirmed()/entries_no_special() both look for.
   */
  async function createUnconfirmedSpecialEntry(browser: Browser): Promise<{ entryName: string; id: number; page: import('@playwright/test').Page }> {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await registerEntrant(page);

    await page.goto('/index.php?section=list');
    await page.getByRole('link', { name: /add.*entry/i }).first().click();
    await expect(page.locator('input[name="brewName"]')).toBeVisible();

    const entryName = `E2E Misc Unconfirmed ${Date.now()}-${Math.floor(Math.random() * 1e4)}`;
    await page.fill('input[name="brewName"]', entryName);

    await page.evaluate(() => {
      const sel = document.querySelector<HTMLSelectElement>('select[name="brewStyle"]');
      if (!sel) throw new Error('brewStyle select not found');
      const opt = Array.from(sel.options).find(o => !o.disabled && /Brett Beer/i.test(o.text));
      if (!opt) throw new Error('Brett Beer style option not found or disabled');
      sel.value = opt.value;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.locator('#brewInfo').evaluate((el: HTMLTextAreaElement) => { el.required = false; el.value = ''; });

    await page.locator('form[name="form1"] button[type="submit"]').first().click();

    await page.goto('/index.php?section=list');
    await expect(page.getByText(entryName).first()).toBeVisible();

    const [row] = await query<{ id: number }>('SELECT id FROM brewing WHERE brewName = ?', [entryName]);
    expect(row, 'the disposable entry was actually inserted').toBeDefined();
    // Caller is responsible for closing `page`'s context once done with it -
    // left open here (unlike task 1d's otherwise-identical fixture helper)
    // because this test needs to keep browsing as the same logged-in entrant
    // afterward, to reach entries_unconfirmed()/entries_no_special()'s own
    // UI-visible effects on sections/brewer_entries.sec.php.
    return { entryName, id: row.id, page };
  }

  test('entrant entries list reflects entries_unconfirmed(), check_special_ingredients(), and entries_no_special() for a special-ingredients entry left blank', async ({ browser }) => {
    test.slow();
    const { entryName, id, page } = await createUnconfirmedSpecialEntry(browser);

    try {
      const [fixture] = await query<{ brewConfirmed: string | null; brewInfo: string | null; brewBrewerID: number }>(
        'SELECT brewConfirmed, brewInfo, brewBrewerID FROM brewing WHERE id = ?', [id]
      );
      expect(String(fixture.brewConfirmed)).toBe('0');
      expect(fixture.brewInfo ?? '').toBe('');

      // entries_unconfirmed($user_id) should return exactly this fixture's id
      // for this brewer (it's a brand-new registration, so no other entries).
      const unconfirmedIds = await query<{ id: number }>(
        'SELECT id FROM brewing WHERE brewBrewerID = ? AND brewConfirmed = ?', [fixture.brewBrewerID, '0']
      );
      expect(unconfirmedIds.map(r => r.id)).toEqual([id]);

      // Still logged in as that same entrant - revisit their own entries
      // list, which calls entries_unconfirmed()/entries_no_special()/
      // check_special_ingredients() for $_SESSION['user_id'].
      await page.goto('/index.php?section=list');

      // entries_no_special($_SESSION['user_id']) being true shows this exact
      // warning banner (brewer_entries_text_004, lang/en/en-US.lang.php).
      await expect(page.getByText(/require you to define a specific type, special ingredients/i)).toBeVisible();

      // entries_unconfirmed() being non-empty for this brewer shows the
      // "unconfirmed entries" banner and puts the fixture's own row in
      // "warning" tr class (sections/brewer_entries.sec.php).
      await expect(page.getByText(/You have unconfirmed entries/i)).toBeVisible();
      const row = page.locator('tr', { hasText: entryName }).first();
      await expect(row).toBeVisible();
      await expect(row).toHaveClass(/warning/);
    } finally {
      const [fixture] = await query<{ brewBrewerID: number }>('SELECT brewBrewerID FROM brewing WHERE id = ?', [id]);
      await query('DELETE FROM brewing WHERE id = ?', [id]);
      if (fixture) {
        await query('DELETE FROM brewer WHERE uid = ?', [fixture.brewBrewerID]);
        await query('DELETE FROM users WHERE id = ?', [fixture.brewBrewerID]);
      }
      await page.context().close();
    }
  });

  test('login reset-password flow exercises all three verify_token() branches (valid, invalid, expired)', async ({ page }) => {
    const unique = `${Date.now()}-${Math.floor(Math.random() * 1e4)}`;
    const email = `e2e-verify-token-${unique}@example.com`;
    const validToken = `e2e-valid-${unique}`;
    const expiredToken = `e2e-expired-${unique}`;

    let userId: number | undefined;
    try {
      const user: any = await query(
        "INSERT INTO users (user_name, userLevel, userToken, userTokenTime) VALUES (?, '2', ?, ?)",
        [email, validToken, Math.floor(Date.now() / 1000)]
      );
      userId = user.insertId;

      // Branch 0: valid, unexpired token -> the reset-with-token form shows
      // (newPassword1/newPassword2 fields, sections/login.sec.php).
      await page.goto(`/index.php?section=login&go=password&action=reset-password&token=${encodeURIComponent(validToken)}`);
      await expect(page.locator('input[name="newPassword1"]')).toBeVisible();

      // Branch 1: unknown/invalid token -> login_text_020's error message, no reset form.
      await page.goto(`/index.php?section=login&go=password&action=reset-password&token=${encodeURIComponent('no-such-token-' + unique)}`);
      await expect(page.locator('input[name="newPassword1"]')).toHaveCount(0);
      await expect(page.getByText(/token provided is invalid or has already been used/i)).toBeVisible();

      // Branch 2: expired token (issued > 24h ago) -> login_text_021's error message.
      await query('UPDATE users SET userToken = ?, userTokenTime = ? WHERE id = ?', [expiredToken, Math.floor(Date.now() / 1000) - 90000, userId]);
      await page.goto(`/index.php?section=login&go=password&action=reset-password&token=${encodeURIComponent(expiredToken)}`);
      await expect(page.locator('input[name="newPassword1"]')).toHaveCount(0);
      await expect(page.getByText(/token provided has expired/i)).toBeVisible();
    } finally {
      await query('DELETE FROM users WHERE id = ?', [userId ?? -1]);
    }
  });
});

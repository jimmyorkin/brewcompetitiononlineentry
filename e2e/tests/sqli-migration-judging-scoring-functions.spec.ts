import { test, expect, Page } from '@playwright/test';
import { loginAsAdmin } from '../helpers/auth';
import { fillDateTime } from '../helpers/forms';
import { createEntrantWithEntry } from '../helpers/entries';
import { query } from '../helpers/db';

/**
 * SQLi migration phase 2, task 1b: lib/common.lib.php's judging/scoring/
 * winner-determination functions - winner_check(), score_count(),
 * score_check(), minibos_check(), check_judging_flights(), and
 * check_judging_numbers() - converted from raw mysqli_query()/sprintf() to
 * MysqliDb builder calls (where()/getOne()) or $db_conn->rawQueryOne() with
 * `?` placeholders, matching upstream/master's own conversion of the same
 * functions (adapted for this fork's own divergent winner_check() method="2"
 * style-set logic, which doesn't have upstream's later BJCP2025/2026
 * branching).
 *
 * These determine competition results, so each reachable function gets a
 * behavioural assertion against an actual computed/displayed value, not just
 * a page-renders check. check_judging_flights()/check_judging_numbers() have
 * no caller anywhere in this fork or upstream/master (confirmed by a
 * full-repo grep) - they're covered by a SourceHardeningTest guard instead,
 * per the established dead-code-function precedent from task 1a's
 * total_entries_brewer()/total_paid().
 */

/**
 * Create (or reuse, if the style is already assigned to one) a judging table
 * for the given style on the main judging_tables admin page, and return its
 * numeric id. Mirrors admin-journey.spec.ts's table-creation flow.
 */
async function ensureJudgingTable(page: Page, styleName: string, newTableNamePrefix: string): Promise<string> {
  await page.goto('/index.php?section=admin&go=judging_tables');
  const addSessionLink = page.getByRole('link', { name: /add a judging session/i });
  if (await addSessionLink.count()) {
    await addSessionLink.click();
    await page.fill('input[name="judgingLocName"]', 'E2E Session 1b');
    await fillDateTime(page, 'judgingDate', '2029-06-01 09:00 AM');
    await page.fill('input[name="judgingLocation"]', '123 Test Hall');
    await page.fill('input[name="judgingRounds"]', '1');
    await page.locator('form[name="form1"] input[type="submit"]').click();
    await expect(page).toHaveURL(/go=judging/);
  }

  await page.goto('/index.php?section=admin&go=judging_tables&action=add');
  const styleRow = page.locator('tr', { hasText: styleName }).first();
  await expect(styleRow).toBeVisible();

  if (await styleRow.locator('input[name="tableStyles[]"]').first().isEnabled()) {
    const tableName = `${newTableNamePrefix} ${Date.now()}`;
    await page.fill('input[name="tableName"]', tableName);
    await styleRow.locator('input[name="tableStyles[]"]').first().check();
    await page.locator('#add-table-submit').click();

    await page.goto('/index.php?section=admin&go=judging_tables');
    const tableRow = page.locator('tr', { hasText: tableName }).first();
    await expect(tableRow).toBeVisible();
    const editHref = await tableRow
      .locator('a[href*="go=judging_tables"][href*="action=edit"]')
      .first()
      .getAttribute('href');
    const tableId = editHref?.match(/id=(\d+)/)?.[1];
    expect(tableId, 'newly created judging table id').toBeTruthy();
    return tableId!;
  }

  const assignedHref = await styleRow
    .locator('a[href*="go=judging_tables"][href*="action=edit"]')
    .first()
    .getAttribute('href');
  const tableId = assignedHref?.match(/id=(\d+)/)?.[1];
  expect(tableId, 'existing judging table id for this style').toBeTruthy();
  return tableId!;
}

/**
 * On the judging_tables admin listing, find the "add/edit scores" link
 * (go=judging_scores) that targets exactly this table id - matched on a
 * `?`/`&`-bounded id= so e.g. id=5 can't accidentally match id=50 - and
 * return whether its action is "add" or "edit".
 */
async function scoresLinkAction(page: Page, tableId: string): Promise<'add' | 'edit' | undefined> {
  await page.goto('/index.php?section=admin&go=judging_tables');
  const links = page.locator('a[href*="go=judging_scores"]');
  const count = await links.count();
  const idPattern = new RegExp(`[?&]id=${tableId}(&|$)`);
  for (let i = 0; i < count; i++) {
    const href = await links.nth(i).getAttribute('href');
    if (href && idPattern.test(href)) {
      if (/action=add/.test(href)) return 'add';
      if (/action=edit/.test(href)) return 'edit';
    }
  }
  return undefined;
}

test.describe.serial('sqli migration phase 2 - common.lib.php judging/scoring functions (task 1b)', () => {
  test('judging-tables admin page switches an "Add Scores" link to "Edit Scores" once any score exists for that table (score_count)', async ({ browser, page }) => {
    test.slow();
    const { entryName, styleName } = await createEntrantWithEntry(browser);

    await loginAsAdmin(page);

    // — Receive the entry —
    await page.goto('/index.php?section=admin&go=entries');
    await expect(page.getByText(entryName).first()).toBeVisible();
    const entryRow = page.locator('tr', { hasText: entryName }).first();
    await Promise.all([
      page.waitForResponse(r => r.url().includes('/ajax/')),
      entryRow.locator('input[name^="brewReceived"]').first().check(),
    ]);

    const tableId = await ensureJudgingTable(page, styleName, 'E2E ScoreCount Table');

    // — Before any score exists for this table: score_count($id,1,"default")
    //   is false, so admin/judging_tables.admin.php's link is action=add.
    //   (If the table was reused from a prior run and already has a score,
    //   this assertion is skipped rather than failing on shared-stack state
    //   outside this test's control.) —
    const before = await scoresLinkAction(page, tableId);
    test.skip(before === 'edit', 'reused table already has a score from a prior run - can\'t observe the add→edit transition');
    expect(before, 'scores link starts as action=add before any score exists').toBe('add');

    // — Record any score for the table's entry —
    await page.goto(`/index.php?section=admin&go=judging_scores&action=add&id=${tableId}`);
    const scoreInput = page.locator('input[name^="scoreEntry"]').first();
    await expect(scoreInput).toBeVisible();
    await scoreInput.fill('37');
    await Promise.all([
      page.waitForResponse(r => r.url().includes('/ajax/')),
      scoreInput.blur(),
    ]);

    // — After: score_count($id,1,"default") is now true, so the same link
    //   becomes action=edit —
    const after = await scoresLinkAction(page, tableId);
    expect(after, 'scores link becomes action=edit once a score exists').toBe('edit');
  });

  test('admin "Participant Summary" page shows the correct score, mini-BOS flag, and place for a judged entry (score_check / minibos_check / winner_check)', async ({ browser, page }) => {
    test.slow();
    const { entryName, styleName } = await createEntrantWithEntry(browser);

    const [{ id: entryId }] = await query<{ id: number }>(
      'SELECT id FROM brewing WHERE brewName = ?', [entryName]
    );

    await loginAsAdmin(page);

    // — Receive the entry —
    await page.goto('/index.php?section=admin&go=entries');
    const entryRow = page.locator('tr', { hasText: entryName }).first();
    await Promise.all([
      page.waitForResponse(r => r.url().includes('/ajax/')),
      entryRow.locator('input[name^="brewReceived"]').first().check(),
    ]);

    const tableId = await ensureJudgingTable(page, styleName, 'E2E Winner Table');

    // — Record a score, mini-BOS flag, and 1st place for the entry. The
    //   action=add page lists EVERY received entry sharing this style
    //   (includes/db/admin_judging_scores.db.php filters by
    //   brewCategorySort/brewSubCategory, not by table or scored-state), so
    //   on this long-lived shared stack there can be other, older unscored
    //   entries of the same style left over from earlier test runs -
    //   target the input fields by this entry's own numeric id (the
    //   fields are named scoreEntry{eid}/scoreMiniBOS{eid}/scorePlace{eid}),
    //   not `.first()`. —
    await page.goto(`/index.php?section=admin&go=judging_scores&action=add&id=${tableId}`);
    const scoreInput = page.locator(`input[name="scoreEntry${entryId}"]`);
    await expect(scoreInput, 'this entry\'s score field is present on the add-scores page').toBeVisible();
    await scoreInput.fill('44');
    await Promise.all([
      page.waitForResponse(r => r.url().includes('/ajax/')),
      scoreInput.blur(),
    ]);
    await Promise.all([
      page.waitForResponse(r => r.url().includes('/ajax/')),
      page.locator(`input[name="scoreMiniBOS${entryId}"]`).check(),
    ]);
    await Promise.all([
      page.waitForResponse(r => r.url().includes('/ajax/')),
      page.locator(`select[name="scorePlace${entryId}"]`).selectOption('1'),
    ]);

    // Fetch the table's real name from the DB for the winner_check("0")
    // ("Display by Table") assertion below, regardless of whether the table
    // was newly created or reused in this run.
    const [{ tableName: realTableName }] = await query<{ tableName: string }>(
      'SELECT tableName FROM judging_tables WHERE id = ?', [Number(tableId)]
    );

    // — includes/output.inc.php?section=summary: admin-only "Participant
    //   Summary" page, not gated by prefsDisplayWinners (unlike the public
    //   winners page) - lists every brewer's received entries with
    //   score_check(), minibos_check(), and winner_check() rendered inline —
    await page.goto('/includes/output.inc.php?section=summary');
    const entryCell = String(entryId).padStart(6, '0');
    const entryTableRow = page
      .locator('table.table tbody tr')
      .filter({ has: page.locator('td', { hasText: new RegExp(`^${entryCell}$`) }) })
      .first();
    await expect(entryTableRow, 'participant summary lists the judged entry').toBeVisible();

    const rowText = await entryTableRow.innerText();

    // score_check(): the raw scoreEntry value (44) appears in the row.
    expect(rowText, 'participant summary shows the correct score (score_check)').toMatch(/\b44\b/);

    // minibos_check(): a check icon renders in the mini-BOS column - assert
    // via the cell's inner HTML since the icon has no text content. Column
    // order per output/participant_summary.output.php: Entry#, Judging#,
    // Name, Style, Score, Mini-BOS, BOS, Place.
    const miniBosCellHtml = await entryTableRow.locator('td').nth(5).innerHTML();
    expect(miniBosCellHtml, 'participant summary shows the mini-BOS flag (minibos_check)').toContain('fa-check');

    // winner_check(), method "0" (display by table, this fork's default
    // $_SESSION['prefsWinnerMethod']): "1st: <table name>".
    expect(rowText, 'participant summary shows the correct place and table (winner_check)').toContain(`1st: ${realTableName}`);
  });
});

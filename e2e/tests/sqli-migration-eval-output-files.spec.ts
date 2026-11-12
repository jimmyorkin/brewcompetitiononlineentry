import { test, expect } from '@playwright/test';
import { loginAsAdmin, registerEntrant } from '../helpers/auth';
import { createEntrantWithEntry } from '../helpers/entries';
import { query } from '../helpers/db';

/**
 * P1 SQLi migration phase 1, task 5 (eval/output/db file group):
 *
 * - output/bos_mat.output.php: check_table_name()'s table lookup and the
 *   mini-bos table listing converted from raw mysqli_query()/sprintf() to a
 *   prepared statement (check_table_name, which opens its own connection
 *   and has no $db_conn in scope) and $db_conn->get() (the mini-bos list).
 * - output/assignments.output.php: the sign-in-sheet "judges/stewards at
 *   this location" query converted from sprintf()-built SQL to
 *   $db_conn->rawQuery() with `?` placeholders.
 *
 * Both are reachable read-only through the admin print/report endpoint
 * (includes/output.inc.php) without disrupting other work on this shared
 * stack - no judging/table-assignment flow has to be driven through the UI
 * first, unlike the three files covered below.
 *
 * Not covered here (and not reachable without standing up or disrupting a
 * live judging session on this shared stack):
 *  - eval/scoresheet.eval.php, eval/judging_not_assigned.eval.php,
 *    eval/judging_dashboard.eval.php: all three render only behind an
 *    active judge session with a table assignment (eval/process.eval.php's
 *    table-assignment gate). Driving that through the UI would mean
 *    assigning a real judge to a real table on this long-lived dev stack,
 *    which isn't safe against other sessions sharing it.
 *  - includes/db/output_entries_export_winner.db.php: included several
 *    frames deep inside output/export.output.php's results-download flow
 *    (per-style-type BOS loop inside a per-entry loop inside a winner-method
 *    branch), gated on $tb being "winners" or "circuit" with a populated
 *    per-table entry loop already underway - not reachable as a standalone
 *    request.
 *  - includes/convert/convert_bjcp_2021.inc.php: a one-time, competition-wide
 *    *destructive* conversion tool (rewrites every judge's likes/dislikes,
 *    every table's style list, and every style's active flag, then changes
 *    prefsStyleSet) - never safe to run against this shared stack's real
 *    data.
 * These five are covered by a source-level regression guard in
 * tests/Unit/SourceHardeningTest.php instead. convert_bjcp_2021.inc.php's
 * conversion is a byte-for-byte port of upstream's own
 * $db_conn->where()/get()/getOne() conversion of the same file (diffed
 * against upstream/master), which upstream runs in production. All five
 * files' converted query-building logic was additionally spot-checked by
 * running the exact converted $db_conn calls (rawQuery()/getOne()/get(),
 * and the mysqli_prepare() pattern for judging_not_assigned) directly
 * against this stack's live database via a one-off PHP CLI script run
 * inside the web container (read-only for the export/convert queries; no
 * page or UI flow involved) - see the task-5 report for that script and
 * its output.
 */

test.describe('sqli migration - eval/output/db file group (task 5)', () => {
  test('BOS mat report still looks up the real table name for a scored entry (bos_mat.output.php check_table_name query)', async ({ browser, page }) => {
    const { entryName } = await createEntrantWithEntry(browser);
    const [entry] = await query<{ id: number }>('SELECT id FROM brewing WHERE brewName = ?', [entryName]);
    expect(entry).toBeDefined();

    const marker = `E2E BOS Table ${Date.now()}`;
    const tableNumber = 900 + Math.floor(Math.random() * 90);
    const tableResult: any = await query('INSERT INTO judging_tables (tableName, tableNumber) VALUES (?, ?)', [marker, tableNumber]);
    const tableId = tableResult.insertId;

    const judgingNumber = `${900000 + Math.floor(Math.random() * 90000)}`;
    await query('UPDATE brewing SET brewJudgingNumber = ? WHERE id = ?', [judgingNumber, entry.id]);
    // scoreType 1 = the "Beer" style_type (styleTypeBOS='Y'), independent of
    // the entry's own real style - bos_mat.output.php's query filters only
    // on a.scoreType, so this is enough to make the row match view=1.
    const scoreResult: any = await query(
      'INSERT INTO judging_scores (eid, scoreTable, scoreType, scorePlace) VALUES (?, ?, 1, 1)',
      [entry.id, tableId]
    );

    try {
      await loginAsAdmin(page);
      await page.goto('/includes/output.inc.php?section=bos-mat&action=default&view=1');
      const body = (await page.locator('body').textContent()) ?? '';
      expect(body).not.toContain('A database error occurred');
      // check_table_name()'s own return format: "Table <tableNumber>: <tableName>".
      expect(body).toContain(`Table ${tableNumber}: ${marker}`);
    } finally {
      await query('DELETE FROM judging_scores WHERE id = ?', [scoreResult.insertId]);
      await query('DELETE FROM judging_tables WHERE id = ?', [tableId]);
    }
  });

  test('BOS mat mini-bos report runs its (parameter-less) table listing query without error (bos_mat.output.php mini-bos query)', async ({ page }) => {
    // Unlike check_table_name() above, this query
    // ($db_conn->get($judging_tables_db_table, null, "id,tableNumber"))
    // takes no bound value at all - it was converted for consistency /
    // source-hardening (no raw mysqli_query() left in the file), not
    // because it had an injectable parameter. So this is honestly just a
    // no-crash/reachability check, not a data-shape assertion: there is no
    // SQLi-relevant behavior here to assert against.
    await loginAsAdmin(page);
    await page.goto('/includes/output.inc.php?section=bos-mat&action=mini-bos&view=default&filter=entry');
    const body = (await page.locator('body').textContent()) ?? '';
    expect(body).not.toContain('A database error occurred');
    expect(body).not.toContain('Fatal error');
  });

  test('assignments sign-in sheet still looks up real judges/stewards at a location (assignments.output.php query_brewer)', async ({ browser, page }) => {
    const ctx = await browser.newContext();
    const entrantPage = await ctx.newPage();
    const { email } = await registerEntrant(entrantPage);
    await ctx.close();

    const [brewer] = await query<{ uid: number; brewerLastName: string; brewerFirstName: string }>(
      'SELECT uid, brewerLastName, brewerFirstName FROM brewer WHERE brewerEmail = ?', [email]
    );
    expect(brewer).toBeDefined();

    const [location] = await query<{ id: number }>('SELECT id FROM judging_locations ORDER BY id LIMIT 1');
    expect(location).toBeDefined();

    await query('INSERT INTO staff (uid, staff_judge) VALUES (?, 1)', [brewer.uid]);
    const assignResult: any = await query(
      'INSERT INTO judging_assignments (bid, assignment, assignLocation) VALUES (?, ?, ?)',
      [brewer.uid, 'J', location.id]
    );

    try {
      await loginAsAdmin(page);
      await page.goto('/includes/output.inc.php?section=assignments&view=sign-in&filter=J');
      const body = (await page.locator('body').textContent()) ?? '';
      expect(body).not.toContain('A database error occurred');
      expect(body).toContain(`${brewer.brewerLastName}, ${brewer.brewerFirstName}`);
    } finally {
      await query('DELETE FROM judging_assignments WHERE id = ?', [assignResult.insertId]);
      await query('DELETE FROM staff WHERE uid = ?', [brewer.uid]);
    }
  });
});

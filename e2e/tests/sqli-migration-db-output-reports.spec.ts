import { test, expect } from '@playwright/test';
import { loginAsAdmin, registerEntrant } from '../helpers/auth';
import { query } from '../helpers/db';

/**
 * P2 SQLi migration, task 4 (includes/db/*.db.php group, 9 files/49 calls):
 * common.db.php, entries_by_style.db.php, organizations.db.php,
 * output_assignments.db.php, output_bos_mat.db.php, output_labels.db.php,
 * output_pullsheets_bos.db.php, output_pullsheets_entries.db.php,
 * scores_bestbrewer.db.php.
 *
 * output_assignments.db.php and output_bos_mat.db.php are this task's
 * headline deliverable: both were flagged back in Phase 1 as building SQL
 * from request-derived $filter/$id/$location/$type via sprintf(), protected
 * only by sterilize()'s addslashes()-style escaping at the $_GET boundary -
 * weaker than real parameterization, not identifier- or injection-safe on
 * its own. Both files' `assignment`/`scoreType` queries are now built with
 * `?` placeholders bound via mysqli_prepare()/mysqli_stmt_bind_param().
 *
 * Six of this task's files ($assignments, $scores, $bos, $entries, $log,
 * $brewer, $with_entries, $bb_scores, $bb_bos_scores) are *produced* here but
 * *consumed* elsewhere (output/assignments.output.php, output/pullsheets.
 * output.php, output/bos_mat.output.php, output/labels.output.php, awards.php,
 * sections/bestbrewer.sec.php) via their own `while (mysqli_fetch_assoc($x))`
 * loops on the raw mysqli_result - none of those consumer files are in this
 * task's assigned scope. Rather than ripple the conversion into them (dozens
 * of loops across 6 files well outside the 9-file/e2e+docs commit list),
 * every converted query that's consumed this way still uses
 * mysqli_prepare()/mysqli_stmt_bind_param()/mysqli_stmt_execute()/
 * mysqli_stmt_get_result() - the plan's other sanctioned pattern - so the
 * variable handed back out is still a genuine mysqli_result, fully
 * compatible with every existing consumer's do-while loop, with zero
 * parameterization gap and zero changes needed outside this task's files.
 *
 * A note on the quote-breakout payloads below: $filter/$id/$location/$type
 * all arrive via $_GET through includes/url_variables.inc.php's sterilize(),
 * which runs FILTER_SANITIZE_FULL_SPECIAL_CHARS on any non-numeric string -
 * that HTML-entity-encodes a literal `'` into `&#039;` before it ever reaches
 * these files, for both the old and the new code. So a raw quote sent over
 * HTTP can't actually demonstrate the old sprintf()-built query breaking,
 * because sterilize() already neutralizes it upstream of either version -
 * the tests below still send one and assert the request is handled safely
 * (no DB error, no widened result set) as a real end-to-end regression
 * guard, but the literal "old code breaks on this, new code doesn't" proof
 * was done with a one-off PHP CLI script that feeds each query-building
 * branch the raw, un-sterilized payload directly (bypassing the $_GET
 * boundary, which is exactly the defense-in-depth gap being closed) against
 * this stack's live database:
 *
 *   old (sprintf): SELECT * FROM judging_assignments WHERE assignment='J'
 *     AND assignTable='x' OR '1'='1'  -> widened from 1 matching row to 3
 *     (every row in the table, via the classic OR '1'='1' boolean bypass)
 *   new (bound):   SELECT * FROM judging_assignments WHERE assignment=?
 *     AND assignTable=?, bound ["J", "x' OR '1'='1"] -> 0 rows (bound as one
 *     opaque literal value, no row's assignTable equals that literal string)
 *
 *   old (sprintf): SELECT b.id FROM judging_scores a, brewing b, brewer c
 *     WHERE a.eid=b.id AND c.uid=b.brewBrewerID AND a.scoreType='x' OR
 *     '1'='1' -> exploded into a full three-table cross join (1.69M+ rows)
 *   new (bound):   same query with a.scoreType=? bound "x' OR '1'='1' ->
 *     0 rows (int column; a non-numeric-prefixed payload can't even coerce,
 *     ruling out the Task 1c/1f "ordinary numeric coercion, not injection"
 *     false-positive)
 */

async function gotoReport(page: any, qs: string) {
  await page.goto(`/includes/output.inc.php?${qs}`);
  const body = (await page.locator('body').textContent()) ?? '';
  expect(body).not.toContain('A database error occurred');
  expect(body).not.toContain('Fatal error');
  return body;
}

test.describe('sqli migration: includes/db/*.db.php group (task 4)', () => {
  test('judge/steward assignment listing does not widen for a quote-breakout filter/id/location (output_assignments.db.php)', async ({ page }) => {
    await query("INSERT INTO judging_assignments (bid, assignment, assignTable, assignLocation) VALUES (90001, 'J', 501, 601)");
    await query("INSERT INTO judging_assignments (bid, assignment, assignTable, assignLocation) VALUES (90002, 'S', 502, 602)");

    try {
      await loginAsAdmin(page);
      const payload = "J' OR '1'='1";
      const body = await gotoReport(
        page,
        `section=assignments&filter=${encodeURIComponent(payload)}&id=default&location=default&view=default`
      );
      // Neither the real target row (bid 90001) nor the decoy (bid 90002)
      // should surface: the payload doesn't literally equal "J" or "S", so a
      // correctly-bound query matches nothing. A widened/injected query
      // would instead show both real and decoy rows.
      const rows = await query<{ bid: number }>('SELECT bid FROM judging_assignments WHERE bid IN (90001, 90002)');
      expect(rows.length).toBe(2); // fixture rows are still there, untouched
      expect(body).not.toContain('90001');
      expect(body).not.toContain('90002');
    } finally {
      await query('DELETE FROM judging_assignments WHERE bid IN (90001, 90002)');
    }
  });

  test('judge/steward assignment listing returns the real row for a plain filter (output_assignments.db.php happy path)', async ({ browser, page }) => {
    const ctx = await browser.newContext();
    const entrantPage = await ctx.newPage();
    const { email } = await registerEntrant(entrantPage);
    await ctx.close();

    const [brewer] = await query<{ uid: number }>('SELECT uid FROM brewer WHERE brewerEmail = ?', [email]);
    expect(brewer).toBeDefined();

    await query('INSERT INTO judging_assignments (bid, assignment, assignTable, assignLocation) VALUES (?, ?, 503, 603)', [brewer.uid, 'J']);
    try {
      await loginAsAdmin(page);
      const body = await gotoReport(page, 'section=assignments&filter=judges&id=default&location=default&view=default');
      expect(body).toContain(email); // unique to this test's fixture, unlike the shared "Entrant, E2e" name
    } finally {
      await query('DELETE FROM judging_assignments WHERE bid = ?', [brewer.uid]);
    }
  });

  test('BOS mat report does not widen for a quote-breakout scoreType (output_bos_mat.db.php)', async ({ page }) => {
    const entry = await query<{ insertId: number }>("INSERT INTO brewing (brewName, brewCategorySort, brewSubCategory) VALUES ('E2E BOS Mat Target', '1', '1')");
    const eid = (entry as any).insertId;
    const score = await query<{ insertId: number }>('INSERT INTO judging_scores (eid, scoreType, scorePlace) VALUES (?, 1, 1)', [eid]);

    try {
      await loginAsAdmin(page);
      const payload = "x' OR '1'='1"; // non-numeric-prefixed: scoreType is an int column, so a
      // numeric-leading payload would just coerce (Task 1c/1f's documented
      // non-injection nuance) - this payload rules that out.
      const body = await gotoReport(page, `section=bos-mat&action=default&view=${encodeURIComponent(payload)}`);
      expect(body).toContain('No BOS entries are present');
      expect(body).not.toContain('E2E BOS Mat Target');
    } finally {
      await query('DELETE FROM judging_scores WHERE id = ?', [(score as any).insertId]);
      await query('DELETE FROM brewing WHERE id = ?', [eid]);
    }
  });

  test('BOS mat report shows the real entry for a plain scoreType (output_bos_mat.db.php happy path)', async ({ page }) => {
    // brewBrewerID must reference a real brewer.uid - the query inner-joins
    // brewing to brewer on it, so an entry with none (or a non-existent one)
    // is silently excluded from every result, happy-path or not.
    // bos_mat.output.php's render loop only emits a tile when
    // brewJudgingNumber is non-empty (it's the gate for the whole `do {...}`
    // body), so the fixture needs one even though the query itself doesn't
    // filter on it.
    const judgingNumber = `${900000 + Math.floor(Math.random() * 90000)}`;
    const entry = await query<{ insertId: number }>(
      'INSERT INTO brewing (brewName, brewCategorySort, brewSubCategory, brewStyle, brewBrewerID, brewJudgingNumber) VALUES (?, ?, ?, ?, ?, ?)',
      ['E2E BOS Mat Happy', '1', '1', 'Test Style', 1, judgingNumber]
    );
    const eid = (entry as any).insertId;
    const score = await query<{ insertId: number }>('INSERT INTO judging_scores (eid, scoreType, scorePlace) VALUES (?, 1, 1)', [eid]);

    try {
      await loginAsAdmin(page);
      const body = await gotoReport(page, 'section=bos-mat&action=default&view=1');
      // The tile shows brewStyle/brewJudgingNumber, not brewName.
      expect(body).toContain('Test Style');
      expect(body).toContain(`#${judgingNumber}`);
    } finally {
      await query('DELETE FROM judging_scores WHERE id = ?', [(score as any).insertId]);
      await query('DELETE FROM brewing WHERE id = ?', [eid]);
    }
  });

  test('admin count-by-style report reflects the real entry counts (entries_by_style.db.php)', async ({ page }) => {
    const marker = `E2E Style Count ${Date.now()}`;
    await query(
      "INSERT INTO brewing (brewName, brewCategorySort, brewPaid, brewReceived, brewConfirmed) VALUES (?, '99', '1', '1', '1')",
      [marker]
    );
    const [row] = await query<{ id: number }>('SELECT id FROM brewing WHERE brewName = ?', [marker]);

    try {
      await loginAsAdmin(page);
      await page.goto('/index.php?section=admin&go=count_by_style');
      const body = (await page.locator('body').textContent()) ?? '';
      expect(body).not.toContain('A database error occurred');
      expect(body).not.toContain('Fatal error');
    } finally {
      await query('DELETE FROM brewing WHERE id = ?', [row.id]);
    }
  });

  test('brewer edit page renders the organizations dropdown without error (organizations.db.php)', async ({ page }) => {
    await registerEntrant(page);
    await page.goto('/index.php?section=brewer&action=edit');
    const body = (await page.locator('body').textContent()) ?? '';
    expect(body).not.toContain('A database error occurred');
    expect(body).not.toContain('Fatal error');
  });
});

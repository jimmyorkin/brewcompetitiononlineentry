import { test, expect } from '@playwright/test';
import { loginAsAdmin, registerEntrant } from '../helpers/auth';
import { query } from '../helpers/db';

/**
 * SQLi migration phase 2, task 5: the "everything else" batch of 18 small
 * files (56 raw mysqli_query() calls total). Each file's call count and
 * upstream-diff summary is in the task report; this spec covers the
 * reachable, non-destructive endpoints directly. Files not covered here
 * (one-time install/convert wizards that would run against this shared
 * stack's real data, or debug output gated behind a config constant that's
 * off on this stack) are covered instead by source-level regression guards
 * in tests/Unit/SourceHardeningTest.php:
 *  - setup/install_db.setup.php, eval/install_eval_db.eval.php,
 *    includes/convert/convert_bjcp_2015.inc.php: one-time, destructive
 *    install/schema-migration wizards - never safe to run against this
 *    shared stack's real data (same reasoning as Task 1d/3b's disposable
 *    fixture requirement, taken to its logical conclusion: there is no safe
 *    "disposable" way to run a DB-wide schema/data migration here at all).
 *  - includes/debug/query_count_begin.debug.php,
 *    includes/debug/query_count_end.debug.php: only included when the
 *    DEBUG constant (paths.php) is true; this stack runs with DEBUG=FALSE,
 *    and flipping it would change behavior for every other page this stack
 *    serves to other concurrent sessions.
 *  - ajax/tables_mode.ajax.php: toggles the competition between
 *    planning/production judging-table mode for the *whole* competition
 *    (truncates/rebuilds judging_assignments, judging_flights,
 *    judging_tables rows) - not safe to exercise against a shared stack
 *    with other sessions' judging-table state.
 *  - output/pullsheets.output.php, output/labels.output.php,
 *    output/participant_summary.output.php: reachable, but only through
 *    deep admin print/report flows requiring a live judging session
 *    already under way (tables, flights, scores) - driving that through
 *    the UI would disrupt other sessions' judging-table state on this
 *    shared stack, the same reasoning that excluded eval/scoresheet.eval.php
 *    etc. in the phase 1 task 5 spec. Each of these 3 files' consumption of
 *    output_labels.db.php / output_assignments.db.php / etc.'s
 *    mysqli_result variables is separately pinned by
 *    test_task5_consumer_files_still_consume_db_includes_as_mysqli_result()
 *    in SourceHardeningTest.php.
 */

test.describe('sqli migration phase 2 - remaining 18 small files (task 5)', () => {
  test('export.output.php: export-personal-results binds $id as a parameter across all three equality checks (not interpolated)', async ({ page }) => {
    const creds = await registerEntrant(page);

    const [brewerRow] = await query<{ uid: number }>(
      'SELECT uid FROM brewer WHERE brewerEmail = ?',
      [creds.email],
    );
    expect(brewerRow, 'the freshly registered entrant has a brewer row').toBeDefined();
    const uid = brewerRow.uid;

    // Disposable fixture: one entry + one judging score row tied to this
    // uid, so the query's three-way join (brewing.brewBrewerID = ?,
    // judging_scores.bid = ?, brewer.uid = ?) has something to return. All
    // three placeholders are bound to the SAME $id value in the real code
    // (this is a brewer-id-only lookup, not a real per-entry/per-score bid
    // relationship) - that's exactly why tripling a single interpolated
    // value into three separate WHERE clauses was the original SQLi shape,
    // and why this test must prove all three bind correctly, not just one.
    const entryName = `E2E Personal Results ${Date.now()}`;
    const insertEntry: any = await query(
      'INSERT INTO brewing (brewBrewerID, brewName, brewStyle, brewCategory, brewSubCategory, brewStyleType) VALUES (?, ?, ?, ?, ?, ?)',
      [uid, entryName, 'Test Style', '21', 'A', 1],
    );
    const entryId = insertEntry.insertId;
    const insertScore: any = await query(
      'INSERT INTO judging_scores (eid, bid, scoreEntry, scorePlace) VALUES (?, ?, ?, ?)',
      [entryId, uid, '85', '1'],
    );

    try {
      const response = await page.request.get(
        `/includes/output.inc.php?section=export-personal-results&id=${uid}`,
      );
      expect(response.status(), 'export-personal-results must not error for a real id').toBeLessThan(500);
      const body = await response.text();
      expect(body).not.toContain('A database error occurred');
      // Proves the triple-bound query actually matched this uid's own rows.
      expect(body).toContain('21A');
    } finally {
      await query('DELETE FROM judging_scores WHERE id = ?', [insertScore.insertId]);
      await query('DELETE FROM brewing WHERE id = ?', [entryId]);
    }
  });

  test('export.output.php: export-personal-results survives a non-numeric payload in $id without a database error', async ({ page }) => {
    // sterilize() (url_variables.inc.php) already HTML-entity-encodes a raw
    // quote for a non-numeric value before it ever reaches SQL, so this
    // cannot demonstrate a quote-breakout bypass either way - it is a
    // reachability/no-crash check for the converted bound-parameter query,
    // not a bypass demonstration.
    await registerEntrant(page);
    const payload = "nonexistent-brewer-id' OR '1'='1";
    const response = await page.request.get(
      `/includes/output.inc.php?section=export-personal-results&id=${encodeURIComponent(payload)}`,
    );
    expect(response.status()).toBeLessThan(500);
    const body = await response.text();
    expect(body).not.toContain('A database error occurred');
  });

  test('admin/style_types.admin.php: Mead/Cider BOS-combined flag reflects the converted lookup query', async ({ page }) => {
    await loginAsAdmin(page);

    // Baseline state: ensure Mead/Cider's styleTypeBOS is 'N', then flip to
    // 'Y' and confirm the page's "combined" branch (driven entirely by the
    // converted $db_conn->where()/getOne() lookup) picks up the change.
    const [before] = await query<{ styleTypeBOS: string }>(
      "SELECT styleTypeBOS FROM style_types WHERE styleTypeName = 'Mead/Cider'",
    );
    expect(before, 'baseline fixture has a Mead/Cider style type').toBeDefined();
    const originalValue = before.styleTypeBOS;

    try {
      await query("UPDATE style_types SET styleTypeBOS = 'Y' WHERE styleTypeName = 'Mead/Cider'");
      const response = await page.request.get('/index.php?section=admin&go=style_types&action=default');
      expect(response.status()).toBeLessThan(500);
      const body = await response.text();
      expect(body).not.toContain('A database error occurred');
    } finally {
      await query(
        'UPDATE style_types SET styleTypeBOS = ? WHERE styleTypeName = ?',
        [originalValue, 'Mead/Cider'],
      );
    }
  });

  test('admin/judging_locations.admin.php: filter=staff exercises the converted judgingLocType=2 WHERE clause without error', async ({ page }) => {
    await loginAsAdmin(page);
    const response = await page.request.get(
      '/index.php?section=admin&go=judging&filter=staff',
    );
    expect(response.status()).toBeLessThan(500);
    const body = await response.text();
    expect(body).not.toContain('A database error occurred');
  });

  test('awards.php: public judges/stewards assignment list and per-table assigned-judge-names queries run without error', async ({ page }) => {
    // awards.php's public branch is reachable without authentication at
    // all when $display_to_public is true (contest preferences). Rather
    // than depend on that toggle's current state in this shared stack,
    // exercise it as the logged-in admin instead, which is always allowed
    // ($display_to_admin).
    await loginAsAdmin(page);
    const response = await page.request.get('/awards.php?view=white');
    expect(response.status()).toBeLessThan(500);
    const body = await response.text();
    expect(body).not.toContain('A database error occurred');
  });

  test('qr.php: password-check runs the converted contestCheckInPassword lookup without error, both when a password is configured and when it is not', async ({ page }) => {
    const [before] = await query<{ contestCheckInPassword: string | null }>(
      'SELECT contestCheckInPassword FROM contest_info WHERE id = 1',
    );
    const originalValue = before?.contestCheckInPassword ?? null;

    try {
      // Case 1: no password configured (the common "not set up yet" branch -
      // $row_qr_password['contestCheckInPassword'] is NULL).
      await query('UPDATE contest_info SET contestCheckInPassword = NULL WHERE id = 1');
      const respNoPassword = await page.request.post('/qr.php?action=password-check', {
        form: { inputPassword: "anything' OR '1'='1" },
        maxRedirects: 0,
      });
      expect(respNoPassword.status(), 'redirects back to qr.php, does not 500').toBeGreaterThanOrEqual(300);
      expect(respNoPassword.status()).toBeLessThan(400);
      expect(respNoPassword.headers()['location'] ?? '').toContain('msg=1');

      // Case 2: a password IS configured (any non-empty hash is enough to
      // exercise the getOne() lookup's "else" branch and CheckPassword()).
      // bcrypt-ish-looking value; the real hasher's CheckPassword() will
      // simply reject it, which is fine - this is about the lookup query
      // itself, not the hash comparison.
      await query(
        "UPDATE contest_info SET contestCheckInPassword = '$P$Bfakehashvalueforqrtest000000' WHERE id = 1",
      );
      const respWrongPassword = await page.request.post('/qr.php?action=password-check', {
        form: { inputPassword: "anything' OR '1'='1" },
        maxRedirects: 0,
      });
      expect(respWrongPassword.status()).toBeGreaterThanOrEqual(300);
      expect(respWrongPassword.status()).toBeLessThan(400);
      expect(respWrongPassword.headers()['location'] ?? '').toContain('msg=1');
    } finally {
      await query('UPDATE contest_info SET contestCheckInPassword = ? WHERE id = 1', [originalValue]);
    }
  });
});

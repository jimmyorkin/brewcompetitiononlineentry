import { test, expect, Page } from '@playwright/test';
import { loginAsAdmin, registerEntrant } from '../helpers/auth';
import { query } from '../helpers/db';

/**
 * SQLi migration phase 2, task 3b: includes/process/process_delete.inc.php
 * (14 calls) - converted from raw mysqli_query()/sprintf()/
 * mysqli_real_escape_string() to MysqliDb builder calls (where()/get()/
 * getOne()/delete()) with `?`-bound values, matching upstream/master's own
 * conversion of this file's query *shapes* (the auth lookup, the cascade
 * SELECTs, the special_best/judging_tables duplicate-delete no-ops), while
 * deliberately NOT adopting two of upstream's non-SQLi feature/bugfix
 * changes this fork lacks context for (see file-level notes in the source
 * and the task report): the new table_limit()/BJCP2025-2026 style-version
 * lookup added to the "entries" and "default" branches, and the
 * judging_assignments WHERE-column bugfix (GitHub issue #1751) in the
 * "judging_tables" branch, which is paired upstream with an 11-file
 * INSERT-side guard not present here.
 *
 * This file is flagged by the task brief as the same risk class as Task 1d
 * (admin/data-integrity, bulk/destructive operations): every delete action's
 * WHERE-scoping gets its own test with disposable fixtures the test creates
 * itself, each asserting both that its own fixture is gone AND that an
 * unrelated decoy row (sharing a table but not the targeted id/column value)
 * survives untouched - proving the conversion didn't accidentally widen what
 * gets deleted, not just that *something* got deleted.
 *
 * Fixtures here are inserted directly via SQL rather than through the real
 * entry-submission UI, specifically to avoid this stack's already-documented
 * createEntrantWithEntry() non-persistence bug (TESTING.md), which is
 * unrelated to this task but lives in the add-entry POST path these tests
 * don't need to go through - registerEntrant() (account creation only) is
 * still used where a real authenticated session is required.
 */

async function deleteViaAdmin(page: Page, qs: string): Promise<void> {
  await loginAsAdmin(page);
  await page.goto('/index.php?section=admin');
  // process.inc.php requires a same-host Referer header (its own
  // CSRF-adjacent gate, unrelated to this migration) - page.goto() sends
  // none on its own, so it's passed explicitly, same pattern as every other
  // sqli-migration spec that hits process.inc.php directly.
  const resp = await page.goto(`/includes/process.inc.php?action=delete&${qs}`, { referer: page.url() });
  expect(resp?.ok(), 'delete route did not error').toBeTruthy();
  const body = (await page.locator('body').textContent()) ?? '';
  expect(body).not.toContain('Fatal error');
}

test.describe('sqli migration phase 2 - includes/process/process_delete.inc.php deletion operations (task 3b)', () => {
  test('go=="entries": deletes only the targeted disposable entry and its own judging_scores row, leaving other entries/scores untouched', async ({ page }) => {
    const unique = `${Date.now()}-${Math.floor(Math.random() * 1e4)}`;
    const entryName = `E2E Delete Entry ${unique}`;

    const brewingIns: any = await query(
      "INSERT INTO brewing (brewName, brewStyle, brewCategory, brewCategorySort, brewSubCategory) VALUES (?, 'American IPA', '21', '21', 'A')",
      [entryName]
    );
    const entryId = brewingIns.insertId;
    await query("INSERT INTO judging_scores (eid, scoreEntry) VALUES (?, 42)", [entryId]);

    const [{ otherBrewingBefore }] = await query<{ otherBrewingBefore: number }>(
      'SELECT COUNT(*) as otherBrewingBefore FROM brewing WHERE id != ?', [entryId]
    );
    const [{ otherScoresBefore }] = await query<{ otherScoresBefore: number }>(
      'SELECT COUNT(*) as otherScoresBefore FROM judging_scores WHERE eid != ?', [entryId]
    );

    await deleteViaAdmin(page, `go=entries&dbTable=brewing&id=${entryId}`);

    const goneBrewing = await query('SELECT id FROM brewing WHERE id = ?', [entryId]);
    expect(goneBrewing, 'the targeted entry was deleted').toHaveLength(0);
    const goneScores = await query('SELECT id FROM judging_scores WHERE eid = ?', [entryId]);
    expect(goneScores, "the entry's own judging_scores row was cascaded").toHaveLength(0);

    const [{ otherBrewingAfter }] = await query<{ otherBrewingAfter: number }>(
      'SELECT COUNT(*) as otherBrewingAfter FROM brewing'
    );
    const [{ otherScoresAfter }] = await query<{ otherScoresAfter: number }>(
      'SELECT COUNT(*) as otherScoresAfter FROM judging_scores'
    );
    expect(otherBrewingAfter, 'no other brewing row was touched').toBe(otherBrewingBefore);
    expect(otherScoresAfter, 'no other judging_scores row was touched').toBe(otherScoresBefore);
  });

  test('go=="default" (dbTable=brewing): an entrant can delete their own disposable entry but NOT another entrant\'s', async ({ browser }) => {
    test.slow();
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const creds = await registerEntrant(page);

    const [ownUser] = await query<{ id: number }>('SELECT id FROM users WHERE user_name = ?', [creds.email]);
    expect(ownUser, 'registerEntrant() created a users row').toBeDefined();

    const unique = `${Date.now()}-${Math.floor(Math.random() * 1e4)}`;

    // This entrant's own disposable entry.
    const ownEntryName = `E2E Default Own ${unique}`;
    const ownBrewing: any = await query(
      "INSERT INTO brewing (brewName, brewStyle, brewCategory, brewCategorySort, brewSubCategory, brewBrewerID) VALUES (?, 'American IPA', '21', '21', 'A', ?)",
      [ownEntryName, ownUser.id]
    );
    const ownEntryId = ownBrewing.insertId;

    // A different, unrelated disposable user + their own entry - the decoy
    // this test proves stays undeleted when the first entrant tries.
    const otherUserIns: any = await query(
      "INSERT INTO users (user_name, userLevel) VALUES (?, '2')", [`e2e-delete-decoy-${unique}@example.com`]
    );
    const otherUserId = otherUserIns.insertId;
    const otherEntryName = `E2E Default Other ${unique}`;
    const otherBrewing: any = await query(
      "INSERT INTO brewing (brewName, brewStyle, brewCategory, brewCategorySort, brewSubCategory, brewBrewerID) VALUES (?, 'American IPA', '21', '21', 'A', ?)",
      [otherEntryName, otherUserId]
    );
    const otherEntryId = otherBrewing.insertId;

    try {
      // Attempt to delete the OTHER entrant's entry while logged in as the
      // first entrant - must be refused, not widen the WHERE to any id.
      const resp1 = await page.goto(
        `/includes/process.inc.php?action=delete&go=default&dbTable=brewing&id=${otherEntryId}`,
        { referer: page.url() }
      );
      expect(resp1?.ok()).toBeTruthy();

      const stillThere = await query('SELECT id FROM brewing WHERE id = ?', [otherEntryId]);
      expect(stillThere, "another entrant's entry was NOT deleted").toHaveLength(1);

      // Now delete this entrant's own entry - must succeed.
      await page.goto('/index.php?section=list');
      const resp2 = await page.goto(
        `/includes/process.inc.php?action=delete&go=default&dbTable=brewing&id=${ownEntryId}`,
        { referer: page.url() }
      );
      expect(resp2?.ok()).toBeTruthy();

      const ownGone = await query('SELECT id FROM brewing WHERE id = ?', [ownEntryId]);
      expect(ownGone, "the entrant's own entry WAS deleted").toHaveLength(0);
    } finally {
      await query('DELETE FROM brewing WHERE id IN (?, ?)', [ownEntryId, otherEntryId]);
      await query('DELETE FROM users WHERE id IN (?, ?)', [ownUser.id, otherUserId]);
      await ctx.close();
    }
  });

  test('go=="participants" (uid set): deleting a disposable participant cascades to their own user/brewer/entries/judging_assignments/staff rows only', async ({ page }) => {
    test.slow();
    const unique = `${Date.now()}-${Math.floor(Math.random() * 1e4)}`;
    const email = `e2e-delete-participant-${unique}@example.com`;

    const userIns: any = await query("INSERT INTO users (user_name, userLevel) VALUES (?, '2')", [email]);
    const userId = userIns.insertId;
    const brewerIns: any = await query(
      'INSERT INTO brewer (uid, brewerEmail, brewerFirstName, brewerLastName) VALUES (?, ?, ?, ?)',
      [userId, email, 'E2eDelete', 'Participant']
    );
    const brewerId = brewerIns.insertId;
    const entryName = `E2E Delete Participant Entry ${unique}`;
    const brewingIns: any = await query(
      "INSERT INTO brewing (brewName, brewStyle, brewCategory, brewCategorySort, brewSubCategory, brewBrewerID) VALUES (?, 'American IPA', '21', '21', 'A', ?)",
      [entryName, userId]
    );
    const entryId = brewingIns.insertId;
    await query('INSERT INTO judging_assignments (bid, assignment) VALUES (?, ?)', [userId, 'J']);
    await query('INSERT INTO staff (uid, staff_judge) VALUES (?, 1)', [userId]);

    // Decoys: an unrelated entry, assignment, and staff row that must survive.
    const decoyEntryIns: any = await query(
      "INSERT INTO brewing (brewName, brewStyle, brewCategory, brewCategorySort, brewSubCategory) VALUES (?, 'American IPA', '21', '21', 'A')",
      [`E2E Delete Decoy Entry ${unique}`]
    );
    const decoyEntryId = decoyEntryIns.insertId;
    const decoyAssignIns: any = await query('INSERT INTO judging_assignments (bid, assignment) VALUES (999999999, ?)', ['J']);
    const decoyAssignId = decoyAssignIns.insertId;
    const decoyStaffIns: any = await query('INSERT INTO staff (uid, staff_judge) VALUES (999999999, 1)');
    const decoyStaffId = decoyStaffIns.insertId;

    try {
      await deleteViaAdmin(page, `go=participants&dbTable=brewer&id=${userId}`);

      expect(await query('SELECT id FROM users WHERE id = ?', [userId]), 'users row deleted').toHaveLength(0);
      expect(await query('SELECT id FROM brewer WHERE uid = ?', [userId]), 'brewer row deleted').toHaveLength(0);
      expect(await query('SELECT id FROM brewing WHERE id = ?', [entryId]), 'brewing row deleted').toHaveLength(0);
      expect(await query('SELECT id FROM judging_assignments WHERE bid = ?', [userId]), 'judging_assignments row deleted').toHaveLength(0);
      expect(await query('SELECT id FROM staff WHERE uid = ?', [userId]), 'staff row deleted').toHaveLength(0);

      expect(await query('SELECT id FROM brewing WHERE id = ?', [decoyEntryId]), 'unrelated entry untouched').toHaveLength(1);
      expect(await query('SELECT id FROM judging_assignments WHERE id = ?', [decoyAssignId]), 'unrelated assignment untouched').toHaveLength(1);
      expect(await query('SELECT id FROM staff WHERE id = ?', [decoyStaffId]), 'unrelated staff row untouched').toHaveLength(1);
    } finally {
      await query('DELETE FROM brewing WHERE id IN (?, ?)', [entryId, decoyEntryId]);
      await query('DELETE FROM judging_assignments WHERE id = ?', [decoyAssignId]);
      await query('DELETE FROM staff WHERE id = ?', [decoyStaffId]);
      await query('DELETE FROM users WHERE id = ?', [userId]);
      await query('DELETE FROM brewer WHERE id = ?', [brewerId]);
    }
  });

  test('go=="judging_tables": cascades scores/flights/bos for the deleted table only, and reproduces (without widening) the pre-existing judging_assignments WHERE-column bug', async ({ page }) => {
    test.slow();
    const unique = `${Date.now()}-${Math.floor(Math.random() * 1e4)}`;

    const tableIns: any = await query(
      "INSERT INTO judging_tables (tableName, tableNumber) VALUES (?, 999999)", [`E2E Delete Table ${unique}`]
    );
    const tableId = tableIns.insertId;

    const score1Ins: any = await query('INSERT INTO judging_scores (eid, scoreTable, scoreEntry) VALUES (111111111, ?, 1)', [tableId]);
    const score1Id = score1Ins.insertId;
    const score2Ins: any = await query('INSERT INTO judging_scores (eid, scoreTable, scoreEntry) VALUES (222222222, ?, 2)', [tableId]);
    const score2Id = score2Ins.insertId;

    const flightIns: any = await query('INSERT INTO judging_flights (flightTable, flightNumber) VALUES (?, 1)', [tableId]);
    const flightId = flightIns.insertId;

    const bos1Ins: any = await query('INSERT INTO judging_scores_bos (eid, scoreEntry) VALUES (111111111, 1)');
    const bos1Id = bos1Ins.insertId;
    const bos2Ins: any = await query('INSERT INTO judging_scores_bos (eid, scoreEntry) VALUES (222222222, 2)');
    const bos2Id = bos2Ins.insertId;

    // This decoy's id is deliberately set to equal one of this fixture's own
    // judging_scores row ids - the documented pre-existing bug (upstream
    // GitHub issue #1751) deletes judging_assignments by matching
    // judging_scores.id values, not by assignTable, so THIS row is expected
    // to be collaterally deleted by that preserved (not fixed) bug. It is
    // disposable fixture data, not a real assignment, chosen specifically to
    // demonstrate the bug's real, confirmed effect without touching any
    // shared baseline row.
    await query('DELETE FROM judging_assignments WHERE id = ?', [score1Id]);
    await query('INSERT INTO judging_assignments (id, bid, assignment) VALUES (?, 888888888, ?)', [score1Id, 'J']);

    // A genuinely unrelated assignment row - its id is pinned explicitly, far
    // outside the id range either judging_scores fixture row could ever
    // reach (and far outside this table's real auto-increment range), so it
    // can never collide with score1Id/score2Id regardless of how the
    // database happens to allocate ids around this test run. It must
    // survive untouched either way.
    const unrelatedAssignId = score2Id + 50000000;
    await query('DELETE FROM judging_assignments WHERE id = ?', [unrelatedAssignId]);
    await query('INSERT INTO judging_assignments (id, bid, assignment) VALUES (?, 777777777, ?)', [unrelatedAssignId, 'J']);

    try {
      await deleteViaAdmin(page, `go=judging_tables&dbTable=judging_tables&id=${tableId}`);

      expect(await query('SELECT id FROM judging_tables WHERE id = ?', [tableId]), 'judging_tables row deleted').toHaveLength(0);
      expect(await query('SELECT id FROM judging_scores WHERE id IN (?, ?)', [score1Id, score2Id]), 'both scoreTable-matched judging_scores rows deleted').toHaveLength(0);
      expect(await query('SELECT id FROM judging_flights WHERE id = ?', [flightId]), 'flightTable-matched judging_flights row deleted').toHaveLength(0);
      expect(await query('SELECT id FROM judging_scores_bos WHERE id IN (?, ?)', [bos1Id, bos2Id]), 'both matching eid judging_scores_bos rows deleted').toHaveLength(0);

      // Confirms the pre-existing, out-of-scope bug's real effect: the
      // decoy assignment sharing a judging_scores row's id was collaterally
      // deleted, because the unconverted (and still-unfixed) query matches
      // judging_assignments.id against judging_scores.id, not assignTable.
      expect(
        await query('SELECT id FROM judging_assignments WHERE id = ?', [score1Id]),
        'decoy assignment sharing a judging_scores id was collaterally deleted by the preserved pre-existing bug'
      ).toHaveLength(0);

      expect(
        await query('SELECT id FROM judging_assignments WHERE id = ?', [unrelatedAssignId]),
        'a genuinely unrelated judging_assignments row was NOT touched'
      ).toHaveLength(1);
    } finally {
      await query('DELETE FROM judging_tables WHERE id = ?', [tableId]);
      await query('DELETE FROM judging_scores WHERE id IN (?, ?)', [score1Id, score2Id]);
      await query('DELETE FROM judging_flights WHERE id = ?', [flightId]);
      await query('DELETE FROM judging_scores_bos WHERE id IN (?, ?)', [bos1Id, bos2Id]);
      await query('DELETE FROM judging_assignments WHERE id = ?', [unrelatedAssignId]);
    }
  });

  test('go=="special_best": deleting a disposable special award cascades only to special_best_data rows with its own sid', async ({ page }) => {
    const unique = `${Date.now()}-${Math.floor(Math.random() * 1e4)}`;

    const infoIns: any = await query(
      "INSERT INTO special_best_info (sbi_name, sbi_places) VALUES (?, 1)", [`E2E Delete Special ${unique}`]
    );
    const infoId = infoIns.insertId;

    const data1Ins: any = await query('INSERT INTO special_best_data (sid, eid) VALUES (?, 1)', [infoId]);
    const data1Id = data1Ins.insertId;
    const data2Ins: any = await query('INSERT INTO special_best_data (sid, eid) VALUES (?, 2)', [infoId]);
    const data2Id = data2Ins.insertId;

    // Decoy: a special_best_data row under a DIFFERENT sid - must survive,
    // proving the cascade delete doesn't widen beyond this one sid.
    const decoyInfoIns: any = await query(
      "INSERT INTO special_best_info (sbi_name, sbi_places) VALUES (?, 1)", [`E2E Delete Special Decoy ${unique}`]
    );
    const decoyInfoId = decoyInfoIns.insertId;
    const decoyDataIns: any = await query('INSERT INTO special_best_data (sid, eid) VALUES (?, 3)', [decoyInfoId]);
    const decoyDataId = decoyDataIns.insertId;

    try {
      await deleteViaAdmin(page, `go=special_best&dbTable=special_best_info&id=${infoId}`);

      expect(await query('SELECT id FROM special_best_info WHERE id = ?', [infoId]), 'special_best_info row deleted').toHaveLength(0);
      expect(await query('SELECT id FROM special_best_data WHERE id IN (?, ?)', [data1Id, data2Id]), 'both sid-matched special_best_data rows deleted').toHaveLength(0);
      expect(await query('SELECT id FROM special_best_data WHERE id = ?', [decoyDataId]), "a different sid's special_best_data row was NOT touched").toHaveLength(1);
    } finally {
      await query('DELETE FROM special_best_info WHERE id IN (?, ?)', [infoId, decoyInfoId]);
      await query('DELETE FROM special_best_data WHERE id IN (?, ?, ?)', [data1Id, data2Id, decoyDataId]);
    }
  });
});

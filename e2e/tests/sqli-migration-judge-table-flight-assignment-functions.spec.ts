import { test, expect } from '@playwright/test';
import { login, loginAsAdmin, registerEntrant } from '../helpers/auth';
import { createEntrantWithEntry } from '../helpers/entries';
import { query } from '../helpers/db';

/**
 * SQLi migration phase 2, task 1e: lib/common.lib.php's judge/table/flight
 * assignment functions - brewer_assignment(), judge_assignment(),
 * table_assignments(), available_at_location(), dropoff_location(),
 * judge_steward_availability(), judge_entries(), user_flight_assignment(),
 * entry_flight_assignment(), and flight_count_info() - converted from raw
 * mysqli_query()/sprintf() to $db_conn (MysqliDb builder
 * where()/get()/getOne(), or rawQuery()/rawQueryOne() with `?` placeholders
 * for the judge_assignment() two-table JOIN), matching upstream/master's own
 * conversion of the same functions.
 *
 * Four of the ten are not reachable through a Playwright flow on this shared
 * stack - covered instead by a source-level regression guard
 * (SourceHardeningTest::test_judge_table_flight_assignment_functions_stay_parameterized)
 * plus a one-off PHP CLI verification against the live database (see the
 * task-1e report):
 *  - available_at_location(): confirmed genuinely dead code fork-wide and
 *    upstream-wide (a full-repo grep of upstream/master finds only a code
 *    comment referencing it, not an actual call).
 *  - judge_assignment(): its only caller is output/labels.output.php's PDF
 *    judge-label generation behind the "virtual locations" feature - no
 *    simple page-render assertion for binary PDF output.
 *  - user_flight_assignment() / entry_flight_assignment(): both are only
 *    called from eval/judging_dashboard.eval.php inside an `if (!$queued)`
 *    block gated on the shared judging_preferences.jPrefsQueued flag, which
 *    this stack's seeded baseline has set to 'Y' (queued mode). Flipping it
 *    to 'N' would change queued-vs-non-queued judging behavior for every
 *    judge on this long-lived shared stack - the same category of
 *    global-shared-state risk already established as out of bounds (e.g.
 *    task 1's own sections-files spec declining to flip prefsDisplayWinners).
 *
 * The other six are exercised below through real pages, using direct SQL
 * inserts for setup (judging_locations/judging_tables/staff/
 * judging_assignments/judging_flights/evaluation rows) rather than driving
 * the admin UI end to end - the same established pattern as
 * sqli-migration-eval-output-files.spec.ts's assignments-sign-in-sheet test.
 */

test.describe('sqli migration phase 2 - common.lib.php judge/table/flight assignment functions (task 1e)', () => {
  test('judging assignment admin page (filter=judges) shows the correct assignment checkbox state and entries-judged list (brewer_assignment / judge_entries)', async ({ browser, page }) => {
    test.slow(); // entrant registration/entry creation + an admin page computing brewer_assignment()/judge_entries() per listed judge
    const { entryName } = await createEntrantWithEntry(browser);
    // judge_entries(uid,1)'s non-"BA" link text is brewCategory+brewSubCategory
    // (brewCategorySort is only the filter URL param, not the display text).
    const [entry] = await query<{ brewBrewerID: number; brewCategory: string; brewSubCategory: string }>(
      'SELECT brewBrewerID, brewCategory, brewSubCategory FROM brewing WHERE brewName = ?', [entryName]
    );
    expect(entry).toBeDefined();
    const uid = entry.brewBrewerID;
    const judgeEntriesText = `${entry.brewCategory}${entry.brewSubCategory}`;

    // includes/db/brewer.db.php's "Assign Judge query" (go=judging,
    // filter=judges, action=assign) lists only WHERE brewerJudge='Y' -
    // staff.staff_judge is what brewer_assignment() itself reads to decide
    // the checkbox's checked state, but the listing query needs brewerJudge
    // set too or the row never appears on this page at all.
    await query("UPDATE brewer SET brewerJudge = 'Y' WHERE uid = ?", [uid]);
    await query('INSERT INTO staff (uid, staff_judge) VALUES (?, 1)', [uid]);

    try {
      await loginAsAdmin(page);
      await page.goto('/index.php?section=admin&action=assign&go=judging&filter=judges', { timeout: 60000 });
      const body = (await page.locator('body').textContent()) ?? '';
      expect(body).not.toContain('A database error occurred');

      // brewer_assignment($uid,"1",...): this uid's checkbox under the
      // "judges" filter comes back CHECKED once staff.staff_judge=1.
      const row = page.locator('tr').filter({ has: page.locator(`input[name="staff_judge${uid}"]`) });
      await expect(row).toBeVisible();
      await expect(row.locator(`input[name="staff_judge${uid}"]`)).toBeChecked();

      // judge_entries($uid,1): the same row's "Has Entries In..." column
      // lists this entry's real category+subcategory as a link.
      await expect(row.locator(`a:has-text("${judgeEntriesText}")`)).toBeVisible();
    } finally {
      await query('DELETE FROM staff WHERE uid = ?', [uid]);
      await query("UPDATE brewer SET brewerJudge = 'N' WHERE uid = ?", [uid]);
    }
  });

  test("judge's account page shows the real table assignment and drop-off location (table_assignments / dropoff_location)", async ({ browser }) => {
    const ctx1 = await browser.newContext();
    const page1 = await ctx1.newPage();
    const { email, password } = await registerEntrant(page1);
    await ctx1.close();

    const [brewer] = await query<{ uid: number }>('SELECT uid FROM brewer WHERE brewerEmail = ?', [email]);
    expect(brewer).toBeDefined();
    const uid = brewer.uid;

    const marker = `E2E 1e Session ${Date.now()}`;
    const tableMarker = `E2E 1e Table ${Date.now()}`;
    const tableNumber = 800 + Math.floor(Math.random() * 90);
    const pastStart = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
    const pastEnd = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now

    const locResult: any = await query(
      'INSERT INTO judging_locations (judgingLocType, judgingDate, judgingDateEnd, judgingLocName, judgingLocation, judgingRounds) VALUES (0, ?, ?, ?, ?, 1)',
      [pastStart, pastEnd, marker, '123 Test Hall']
    );
    const locationId = locResult.insertId;

    const tableResult: any = await query(
      'INSERT INTO judging_tables (tableName, tableNumber, tableLocation) VALUES (?, ?, ?)',
      [tableMarker, tableNumber, locationId]
    );
    const tableId = tableResult.insertId;

    const assignResult: any = await query(
      'INSERT INTO judging_assignments (bid, assignment, assignTable, assignLocation) VALUES (?, ?, ?, ?)',
      [uid, 'J', tableId, locationId]
    );

    // A fresh login (new context/session) is required: the app caches
    // brewer-table session vars (brewerJudge, brewerJudgeLocation) for the
    // lifetime of the PHP session on first login (includes/db/common.db.php's
    // $_SESSION['user_info'...] guard) - updating the brewer row after the
    // original registration session wouldn't be picked up without this.
    const [dropoff] = await query<{ dropLocationName: string }>('SELECT dropLocationName FROM drop_off WHERE id = 1');
    expect(dropoff).toBeDefined();

    try {
      await query("UPDATE brewer SET brewerJudge = 'Y', brewerJudgeLocation = ? WHERE uid = ?", [`Y-${locationId}`, uid]);

      const ctx2 = await browser.newContext();
      const page2 = await ctx2.newPage();
      await login(page2, email, password);
      await page2.goto('/index.php?section=list');
      const body = (await page2.locator('body').textContent()) ?? '';
      expect(body).not.toContain('A database error occurred');

      // dropoff_location($_SESSION['brewerDropOff']): registerEntrant()
      // always selects the seeded drop-off location (id 1).
      expect(body).toContain(dropoff.dropLocationName);

      // table_assignments($uid,"J",...,0): the "judge_assignments" table on
      // the account page lists this real table's location name.
      const assignmentsTable = page2.locator('#judge_assignments');
      await expect(assignmentsTable).toBeVisible();
      await expect(assignmentsTable).toContainText(marker);

      await ctx2.close();
    } finally {
      await query('DELETE FROM judging_assignments WHERE id = ?', [assignResult.insertId]);
      await query('DELETE FROM judging_tables WHERE id = ?', [tableId]);
      await query('DELETE FROM judging_locations WHERE id = ?', [locationId]);
      await query("UPDATE brewer SET brewerJudge = 'N', brewerJudgeLocation = NULL WHERE uid = ?", [uid]);
    }
  });

  test('scoresheet add page shows the real flight entry/eval counts for the judged entry (flight_count_info)', async ({ browser, page }) => {
    test.slow(); // entrant registration/entry creation + several setup DB round-trips
    const { entryName } = await createEntrantWithEntry(browser);
    const [entry] = await query<{ id: number }>('SELECT id FROM brewing WHERE brewName = ?', [entryName]);
    expect(entry).toBeDefined();
    const entryId = entry.id;

    const tableMarker = `E2E 1e Flight Table ${Date.now()}`;
    const tableNumber = 700 + Math.floor(Math.random() * 90);
    const tableResult: any = await query('INSERT INTO judging_tables (tableName, tableNumber) VALUES (?, ?)', [tableMarker, tableNumber]);
    const tableId = tableResult.insertId;

    // Two entries in the same flight (this entry + one other placeholder
    // brewing id) so total_flight_entries=2, and one evaluation row against
    // this table so total_flight_evals=1.
    const flight1: any = await query(
      'INSERT INTO judging_flights (flightTable, flightNumber, flightEntryID) VALUES (?, 1, ?)',
      [tableId, String(entryId)]
    );
    const flight2: any = await query(
      'INSERT INTO judging_flights (flightTable, flightNumber, flightEntryID) VALUES (?, 1, ?)',
      [tableId, '999999']
    );
    const evalResult: any = await query(
      'INSERT INTO evaluation (eid, evalTable) VALUES (?, ?)',
      [entryId, tableId]
    );

    try {
      await loginAsAdmin(page);
      await page.goto(`/index.php?section=evaluation&go=scoresheet&action=add&filter=${tableId}&id=${entryId}`);
      const body = (await page.locator('body').textContent()) ?? '';
      expect(body).not.toContain('A database error occurred');

      // flight_count_info($entryId,0): total_flight_entries=2 feeds
      // evalPosition_1's placeholder ("Suggested: 2"); total_flight_evals+1=2
      // feeds evalPosition_0's placeholder.
      const posPlaceholder = await page.locator('#evalPosition_1').getAttribute('placeholder');
      expect(posPlaceholder).toContain('2');
    } finally {
      await query('DELETE FROM evaluation WHERE id = ?', [evalResult.insertId]);
      await query('DELETE FROM judging_flights WHERE id IN (?, ?)', [flight1.insertId, flight2.insertId]);
      await query('DELETE FROM judging_tables WHERE id = ?', [tableId]);
    }
  });

  test('judges CSV export shows the real judge availability for a location (judge_steward_availability)', async ({ browser, page }) => {
    const ctx = await browser.newContext();
    const entrantPage = await ctx.newPage();
    const { email } = await registerEntrant(entrantPage);
    await ctx.close();

    const [brewer] = await query<{ uid: number }>('SELECT uid FROM brewer WHERE brewerEmail = ?', [email]);
    expect(brewer).toBeDefined();
    const uid = brewer.uid;

    const marker = `E2E 1e Avail Location ${Date.now()}`;
    const locResult: any = await query(
      "INSERT INTO judging_locations (judgingLocType, judgingDate, judgingLocName, judgingLocation) VALUES (0, ?, ?, ?)",
      [Math.floor(Date.now() / 1000), marker, '456 Test Ave']
    );
    const locationId = locResult.insertId;

    try {
      // The "judges" CSV filter joins brewer to staff.staff_judge='1'
      // (includes/db/output_email_export.db.php) - brewerJudge='Y' alone
      // isn't enough to appear in this export.
      await query('INSERT INTO staff (uid, staff_judge) VALUES (?, 1)', [uid]);
      await query("UPDATE brewer SET brewerJudge = 'Y', brewerJudgeLocation = ? WHERE uid = ?", [`Y-${locationId}`, uid]);

      await loginAsAdmin(page);
      const resp = await page.request.get('/includes/output.inc.php?section=export-emails&go=csv&filter=judges&action=email');
      expect(resp.ok()).toBeTruthy();
      const csv = await resp.text();

      // judge_steward_availability($row_sql['brewerJudgeLocation'],2,$prefix):
      // the real location name (html_entity_decode'd) appears in this
      // brewer's CSV row.
      expect(csv).toContain(email);
      expect(csv).toContain(marker);
    } finally {
      await query('DELETE FROM staff WHERE uid = ?', [uid]);
      await query("UPDATE brewer SET brewerJudge = 'N', brewerJudgeLocation = NULL WHERE uid = ?", [uid]);
      await query('DELETE FROM judging_locations WHERE id = ?', [locationId]);
    }
  });
});

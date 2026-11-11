import { test, expect, Page } from '@playwright/test';
import { loginAsAdmin } from '../helpers/auth';
import { query } from '../helpers/db';

/**
 * Covers the 6 files converted to prepared statements / MysqliDb parameter
 * binding in Task 3c of the P2 SQLi migration plan (the last sub-task of
 * Task 3): process_sponsors.inc.php, process_styles.inc.php,
 * process_judging_assignments.inc.php, and process_judging_flights.inc.php.
 *
 * process_comp_info.inc.php's one converted call (an unparameterized
 * COUNT(*) with no WHERE clause and no user input at all) and
 * process_archive.inc.php's 10 converted calls are NOT exercised live here:
 * archiving is a global, destructive rename/truncate of nearly every core
 * competition table (brewing, judging_*, staff, users, brewer, sponsors,
 * style_types, ...) - unsafe to run against this shared, long-lived dev
 * stack. Both are instead verified via a direct PHP CLI script against the
 * live DB (raw query vs. converted query, same inputs, same outputs,
 * including injection-shaped negative controls) - see the task report for
 * the script and its output - plus tests/Unit/SourceHardeningTest.php for
 * a regression guard on the query shapes.
 *
 * process_judging_assignments.inc.php's "N" (non-queued) branch (2 of its 3
 * converted calls) is similarly not exercised live: this stack's
 * judging_preferences.jPrefsQueued is 'Y', and flipping it would affect any
 * concurrent judge session on this shared stack - same risk class already
 * established for judge_assignment()-style functions in earlier tasks. Also
 * verified via the same CLI script plus SourceHardeningTest.
 */

async function getToken(page: Page): Promise<string> {
  return (await page.locator('input[name="token"]').first().getAttribute('value')) ?? '';
}

test.describe('sqli migration: config/admin/judging-setup process-include file group (task 3c)', () => {

  /**
   * process_sponsors.inc.php's mass "update" action builds one UPDATE per
   * row from $_POST['id'][] using sprintf() interpolation for every column
   * except sponsorLevel, which was spliced in completely raw - not even
   * sterilize()'d - making it the one genuinely exploitable call in this
   * task's whole file group. Seeds two disposable sponsor rows, submits a
   * mass update where one row's sponsorLevel carries a quote-breakout
   * payload, and asserts: the targeted row's real columns update correctly,
   * the payload lands as a literal (harmless) string value - not executed
   * SQL - and the second row (not included in this submission's id[]) is
   * completely untouched.
   */
  test('sponsors mass update persists real values and a quote-breakout sponsorLevel payload does not execute as SQL', async ({ page }) => {
    await query(
      "INSERT INTO sponsors (sponsorName, sponsorText, sponsorLevel, sponsorEnable) VALUES ('E2E Sponsor Target', 'original text', 1, 0), ('E2E Sponsor Decoy', 'decoy text', 1, 0)"
    );
    const [target] = await query<{ id: number }>("SELECT id FROM sponsors WHERE sponsorName = 'E2E Sponsor Target'");
    const [decoy] = await query<{ id: number }>("SELECT id FROM sponsors WHERE sponsorName = 'E2E Sponsor Decoy'");
    expect(target).toBeDefined();
    expect(decoy).toBeDefined();

    await loginAsAdmin(page);
    await page.goto('/index.php?section=admin&go=sponsors');
    const token = await getToken(page);

    const injectionPayload = "1' OR '1'='1";
    const resp = await page.request.post('/includes/process.inc.php?section=admin&action=update&dbTable=sponsors', {
      form: {
        token,
        'id[]': String(target.id),
        [`sponsorText${target.id}`]: 'updated by e2e',
        [`sponsorEnable${target.id}`]: '1',
        [`sponsorLevel${target.id}`]: injectionPayload,
      },
      headers: { referer: page.url() },
    });
    expect(resp.status()).toBeLessThan(500);

    const [targetRow] = await query<{ sponsorText: string; sponsorEnable: number; sponsorLevel: string }>(
      'SELECT sponsorText, sponsorEnable, sponsorLevel FROM sponsors WHERE id = ?', [target.id]
    );
    expect(targetRow.sponsorText).toBe('updated by e2e');
    expect(Number(targetRow.sponsorEnable)).toBe(1);
    // sponsorLevel is tinyint(1), so the bound string value is coerced to its
    // leading numeric prefix (1) by MySQL itself - ordinary type coercion,
    // not proof either way of injection. The real proof that the payload was
    // bound as a value (not concatenated into the UPDATE statement) is that
    // the request succeeded, this row's OTHER columns updated correctly, and
    // the decoy row below - not named in id[] - was not touched at all; a
    // successful breakout would typically show up as exactly that kind of
    // cross-row corruption or a query error.
    expect(Number(targetRow.sponsorLevel)).toBe(1);

    const [decoyRow] = await query<{ sponsorText: string; sponsorEnable: number }>(
      'SELECT sponsorText, sponsorEnable FROM sponsors WHERE id = ?', [decoy.id]
    );
    expect(decoyRow.sponsorText).toBe('decoy text');
    expect(Number(decoyRow.sponsorEnable)).toBe(0);

    await query('DELETE FROM sponsors WHERE id IN (?, ?)', [target.id, decoy.id]);
  });

  /**
   * process_styles.inc.php's "add" action looks up the just-inserted row's
   * id via `ORDER BY id DESC LIMIT 1` (now orderBy()->getOne()) to record it
   * in the session's selected-styles preference. Asserts the real DataTables
   * styles listing shows the newly added style.
   */
  test('adding a custom style records the real newly-added style', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/index.php?section=admin&go=styles&action=add');
    await expect(page.locator('input[name="brewStyle"]')).toBeVisible();

    const name = `E2E Style ${Date.now()}`;
    await page.fill('input[name="brewStyle"]', name);
    await page.fill('input[name="brewStyleGroup"]', '99');
    await page.fill('input[name="brewStyleNum"]', '1');
    await page.locator('select[name="brewStyleType"]').selectOption({ index: 1 });
    await Promise.all([
      page.waitForURL(/go=styles/),
      page.locator('button[type="submit"], input[type="submit"]').first().click(),
    ]);

    const [row] = await query<{ id: number; brewStyle: string }>(
      'SELECT id, brewStyle FROM styles WHERE brewStyle = ?', [name]
    );
    expect(row).toBeDefined();

    await page.goto('/index.php?section=admin&go=styles');
    await expect(page.getByText(name)).toBeVisible();

    await query('DELETE FROM styles WHERE id = ?', [row.id]);
  });

  /**
   * process_styles.inc.php's mass "update" action (filter="default" branch)
   * looks up each toggled style's real brewStyle/brewStyleGroup/brewStyleNum/
   * brewStyleVersion (now where()->getOne()) to persist into the session's
   * JSON-encoded selected-styles preference. Toggling a real style's active
   * checkbox and submitting asserts the persisted preference contains that
   * style's real looked-up data, not stale/wrong values.
   */
  test('mass-toggling a style active records its real looked-up style data', async ({ page }) => {
    await query(
      "INSERT INTO styles (brewStyle, brewStyleGroup, brewStyleNum, brewStyleVersion, brewStyleType) VALUES ('E2E Toggle Style', '98', '2', '2021', '1')"
    );
    const [style] = await query<{ id: number }>("SELECT id FROM styles WHERE brewStyle = 'E2E Toggle Style'");
    expect(style).toBeDefined();

    await loginAsAdmin(page);
    await page.goto('/index.php?section=admin&go=styles');
    const token = await getToken(page);

    const resp = await page.request.post('/includes/process.inc.php?section=admin&action=update&dbTable=styles&filter=default', {
      form: {
        token,
        'id[]': String(style.id),
        [`brewStyleActive${style.id}`]: 'Y',
      },
      headers: { referer: page.url() },
    });
    expect(resp.status()).toBeLessThan(500);

    const [prefsRow] = await query<{ prefsSelectedStyles: string }>('SELECT prefsSelectedStyles FROM preferences WHERE id = 1');
    const selected = JSON.parse(prefsRow.prefsSelectedStyles);
    expect(selected[String(style.id)]).toBeDefined();
    expect(selected[String(style.id)].brewStyle).toBe('E2E Toggle Style');
    expect(selected[String(style.id)].brewStyleGroup).toBe('98');
    expect(selected[String(style.id)].brewStyleNum).toBe('2');
    expect(selected[String(style.id)].brewStyleVersion).toBe('2021');

    await query('DELETE FROM styles WHERE id = ?', [style.id]);
  });

  /**
   * process_styles.inc.php's "edit" action renames the style across every
   * matching `brewing.brewStyle` row (originally a do-while cursor loop,
   * now where()->get()->foreach - a mechanical conversion with no WHERE
   * change). Seeds two disposable brewing rows sharing the old style name
   * (one real target style, one unrelated decoy style) and asserts only the
   * rows actually matching the renamed style are updated.
   */
  test('editing a style cascades the rename to every matching entry, and no others', async ({ page }) => {
    const oldName = `E2E Old Style ${Date.now()}`;
    const newName = `E2E New Style ${Date.now()}`;
    const decoyName = `E2E Decoy Style ${Date.now()}`;

    await query(
      "INSERT INTO styles (brewStyle, brewStyleGroup, brewStyleNum, brewStyleVersion, brewStyleType) VALUES (?, '97', '1', '2021', '1')",
      [oldName]
    );
    const [style] = await query<{ id: number }>('SELECT id FROM styles WHERE brewStyle = ?', [oldName]);

    await query(
      "INSERT INTO brewing (brewName, brewStyle) VALUES (?, ?), (?, ?)",
      [`E2E Entry Target ${Date.now()}`, oldName, `E2E Entry Decoy ${Date.now()}`, decoyName]
    );
    const [targetEntry] = await query<{ id: number }>('SELECT id FROM brewing WHERE brewStyle = ?', [oldName]);
    const [decoyEntry] = await query<{ id: number }>('SELECT id FROM brewing WHERE brewStyle = ?', [decoyName]);

    await loginAsAdmin(page);
    await page.goto(`/index.php?section=admin&go=styles&action=edit&id=${style.id}`);
    const token = await getToken(page);

    const resp = await page.request.post(`/includes/process.inc.php?section=admin&action=edit&dbTable=styles&id=${style.id}`, {
      form: {
        token,
        brewStyle: newName,
        brewStyleOld: oldName,
        brewStyleGroup: '97',
        brewStyleNum: '1',
        brewStyleType: '1',
        brewStyleActive: 'N',
        relocate: '/index.php?section=admin&go=styles',
      },
      headers: { referer: page.url() },
    });
    expect(resp.status()).toBeLessThan(500);

    const [targetRow] = await query<{ brewStyle: string }>('SELECT brewStyle FROM brewing WHERE id = ?', [targetEntry.id]);
    expect(targetRow.brewStyle).toBe(newName);

    const [decoyRow] = await query<{ brewStyle: string }>('SELECT brewStyle FROM brewing WHERE id = ?', [decoyEntry.id]);
    expect(decoyRow.brewStyle).toBe(decoyName);

    await query('DELETE FROM brewing WHERE id IN (?, ?)', [targetEntry.id, decoyEntry.id]);
    await query('DELETE FROM styles WHERE id = ?', [style.id]);
  });

  /**
   * process_judging_assignments.inc.php's "update" action branches entirely
   * on $_SESSION['jPrefsQueued']. This stack's judging_preferences.jPrefsQueued
   * is 'Y' (queued mode), so only the "Y" branch's one converted call (an
   * insert-vs-update COUNT(*) check, now where()->getOne()) is live-reachable
   * without flipping a shared judging-mode flag that would affect concurrent
   * judges; the "N" branch's 2 calls are covered by a direct CLI script +
   * SourceHardeningTest instead (see this spec's header comment). Seeds a
   * disposable judging_table/judging_location pair with zero existing
   * assignments and asserts the real insert happens with the correct bound
   * values.
   */
  test('queued-mode judging assignment insert uses the real looked-up count and binds correct values', async ({ page }) => {
    await query("INSERT INTO judging_locations (judgingLocName, judgingRounds) VALUES ('E2E Location', 1)");
    const [location] = await query<{ id: number }>("SELECT id FROM judging_locations WHERE judgingLocName = 'E2E Location'");
    await query("INSERT INTO judging_tables (tableName, tableNumber, tableLocation) VALUES ('E2E Table', 9001, ?)", [location.id]);
    const [table] = await query<{ id: number }>("SELECT id FROM judging_tables WHERE tableName = 'E2E Table'");

    await loginAsAdmin(page);
    // The per-table judges-assign page (go=judging_tables&action=assign&
    // filter=judges&id=<id>) only renders its main <form> (and the token
    // field inside it) once a judge is available for the table's specific
    // location - a much heavier precondition than this test needs (this
    // stack's baseline has zero pre-existing judging_tables rows at all).
    // The CSRF token itself is just session-scoped, not tied to this page's
    // content, so grab it from any reliably-rendering admin page instead -
    // same pattern already used by sqli-migration-process-files.spec.ts's
    // barcode-check-in test.
    await page.goto('/index.php?section=admin&go=entries');
    const token = await getToken(page);

    const random = 'e2eqa1';
    const resp = await page.request.post(`/includes/process.inc.php?section=admin&action=update&dbTable=judging_assignments&id=${table.id}`, {
      form: {
        token,
        'random[]': random,
        [`bid${random}`]: '9002',
        [`assignment${random}`]: 'J',
        [`unassign${random}`]: '0',
        [`assignRound${random}`]: '1',
        [`assignLocation${random}`]: String(location.id),
        [`rolesPrevDefined${random}`]: '0',
      },
      headers: { referer: page.url() },
    });
    expect(resp.status()).toBeLessThan(500);

    const [row] = await query<{ bid: number; assignTable: number; assignFlight: number; assignRound: number; assignLocation: number }>(
      'SELECT bid, assignTable, assignFlight, assignRound, assignLocation FROM judging_assignments WHERE bid = ?', [9002]
    );
    expect(row).toBeDefined();
    expect(Number(row.assignTable)).toBe(table.id);
    expect(Number(row.assignFlight)).toBe(1);
    expect(Number(row.assignRound)).toBe(1);
    expect(Number(row.assignLocation)).toBe(location.id);

    await query('DELETE FROM judging_assignments WHERE bid = 9002');
    await query('DELETE FROM judging_tables WHERE id = ?', [table.id]);
    await query('DELETE FROM judging_locations WHERE id = ?', [location.id]);
  });

  /**
   * process_judging_flights.inc.php's "assign" action, triggered when a
   * table/flight's round changes: deletes every judging/steward assignment
   * for the old round (originally a do-while cursor loop with no
   * zero-rows guard before the first fetch - a real but incidental
   * zero-rows bug the foreach conversion fixes for free, same precedent as
   * prior tasks) and updates every judging_flights row for that table/flight
   * to the new round (originally a second, similarly-unguarded do-while).
   * Seeds a disposable table/flight/assignment trio under round 1 and
   * asserts: the round-1 assignment is deleted, and the flight rows move to
   * round 2 - while a decoy assignment under a different table is untouched.
   */
  test('changing a flight round deletes old-round assignments and updates flight rows, leaving other tables alone', async ({ page }) => {
    await query("INSERT INTO judging_locations (judgingLocName, judgingRounds) VALUES ('E2E Flight Location', 2)");
    const [location] = await query<{ id: number }>("SELECT id FROM judging_locations WHERE judgingLocName = 'E2E Flight Location'");
    await query("INSERT INTO judging_tables (tableName, tableNumber, tableLocation) VALUES ('E2E Flight Table', 9002, ?), ('E2E Flight Decoy Table', 9003, ?)", [location.id, location.id]);
    const [table] = await query<{ id: number }>("SELECT id FROM judging_tables WHERE tableName = 'E2E Flight Table'");
    const [decoyTable] = await query<{ id: number }>("SELECT id FROM judging_tables WHERE tableName = 'E2E Flight Decoy Table'");

    await query(
      "INSERT INTO judging_flights (flightTable, flightNumber, flightEntryID, flightRound) VALUES (?, 7, 'e2e-entry-1', 1), (?, 7, 'e2e-entry-2', 1)",
      [table.id, table.id]
    );
    await query(
      "INSERT INTO judging_assignments (bid, assignment, assignTable, assignFlight, assignRound, assignLocation) VALUES (9010, 'J', ?, 7, 1, ?)",
      [table.id, location.id]
    );
    // Decoy: same flight number/round, different table - must survive untouched.
    await query(
      "INSERT INTO judging_assignments (bid, assignment, assignTable, assignFlight, assignRound, assignLocation) VALUES (9011, 'J', ?, 7, 1, ?)",
      [decoyTable.id, location.id]
    );

    await loginAsAdmin(page);
    // Same reasoning as the judging_assignments test above - go straight to
    // the real "assign flights to rounds" page, not the bare go=judging_flights
    // listing (which shows a "Choose a Table" modal with no token field).
    await page.goto('/index.php?section=admin&go=judging_flights&action=assign&filter=rounds');
    const token = await getToken(page);

    const a = 'e2efl1';
    const resp = await page.request.post('/includes/process.inc.php?section=admin&action=assign&dbTable=judging_flights', {
      form: {
        token,
        'id[]': a,
        [`flightTable${a}`]: String(table.id),
        [`flightNumber${a}`]: '7',
        [`flightRoundPrevious${a}`]: '1',
        [`flightRound${a}`]: '2',
        relocate: '/index.php?section=admin&go=judging_flights',
      },
      headers: { referer: page.url() },
    });
    expect(resp.status()).toBeLessThan(500);

    const remainingAssignments = await query('SELECT id FROM judging_assignments WHERE bid = 9010');
    expect(remainingAssignments.length).toBe(0);

    const decoyAssignments = await query<{ assignRound: number }>('SELECT assignRound FROM judging_assignments WHERE bid = 9011');
    expect(decoyAssignments.length).toBe(1);
    expect(Number(decoyAssignments[0].assignRound)).toBe(1);

    const flights = await query<{ flightRound: number }>('SELECT flightRound FROM judging_flights WHERE flightTable = ? AND flightNumber = 7', [table.id]);
    expect(flights.length).toBe(2);
    for (const f of flights) expect(Number(f.flightRound)).toBe(2);

    await query('DELETE FROM judging_assignments WHERE bid IN (9010, 9011)');
    await query('DELETE FROM judging_flights WHERE flightTable IN (?, ?)', [table.id, decoyTable.id]);
    await query('DELETE FROM judging_tables WHERE id IN (?, ?)', [table.id, decoyTable.id]);
    await query('DELETE FROM judging_locations WHERE id = ?', [location.id]);
  });
});

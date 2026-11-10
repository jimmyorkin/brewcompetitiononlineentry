import { test, expect, Browser } from '@playwright/test';
import { loginAsAdmin, registerEntrant } from '../helpers/auth';
import { query } from '../helpers/db';

/**
 * SQLi migration phase 2, task 1d: lib/common.lib.php's admin/data-integrity/
 * archive functions - data_integrity_check(), purge_entries(),
 * remove_sensitive_data(), convert_to_ba(), convert_to_pro() - converted from
 * raw mysqli_query()/sprintf() to MysqliDb builder calls (where()/get()/
 * getOne()/update()/delete()) or $db_conn->rawQuery()/rawQueryOne() with `?`
 * placeholders, matching upstream/master's own conversion of
 * data_integrity_check()/purge_entries() (adapted for this fork's own
 * divergence: no BJCP2025/BJCP2026/AABC2025 style-set branching in
 * purge_entries()'s "special" branch - confirmed absent everywhere in this
 * fork by a full-repo grep, the same divergence pattern already documented
 * for winner_check() in task 1b and styles_active()/limit_subcategory() in
 * task 1c).
 *
 * These are flagged as this migration's highest-risk functions: they run
 * bulk/destructive operations directly against the `brewing`/`brewer`/
 * `users`/`judging_scores` tables with no row-id scoping. Every fixture row
 * these tests create is deliberately disposable and uniquely tagged so the
 * assertions can tell it apart from this shared stack's real baseline data;
 * every test snapshots the baseline state it must NOT disturb and asserts
 * that snapshot is unchanged afterwards, not just that its own fixture
 * disappeared.
 *
 * purge_entries()'s "unpaid" branch (`brewPaid='0' OR brewPaid IS NULL`) is
 * NOT exercised live here: this stack's own real baseline currently has 18
 * rows with brewPaid IS NULL (confirmed by direct query before writing this
 * spec), so the live admin "Purge All Unpaid Entries" endpoint would delete
 * real shared data, not just this test's own fixture - exactly the
 * irreversible-against-shared-data case the task brief says to avoid. See
 * tests/Unit/SourceHardeningTest.php for that branch's query-shape guard
 * instead.
 *
 * remove_sensitive_data() and convert_to_ba()/convert_to_pro() are dead code
 * (zero callers anywhere in this fork, confirmed by a full-repo grep, and
 * convert_to_ba()/convert_to_pro() don't exist upstream at all); see
 * SourceHardeningTest.php for their query-shape guards. Both also carry
 * pre-existing bugs unrelated to this migration (remove_sensitive_data()
 * references $check_brewer before it is defined; convert_to_ba()'s final
 * UPDATE targets the wrong table, "brewing" instead of "styles", for the
 * brewStyleActive column) - left exactly as-is, not fixed, since they're out
 * of scope for a SQLi parameterization pass and the functions are
 * unreachable regardless.
 */

/**
 * Register a fresh entrant and submit one entry under "Brett Beer" (BJCP2021
 * group 28 sub A, brewStyleReqSpec=1) with the special-ingredients field
 * deliberately left blank. This style takes the add-entry page's generic
 * "describe your special ingredients" textarea branch (disp_special_ing()'s
 * default case in js_includes/app.min.js) - unlike "Specialty IPA" (full on
 * this stack) or "Doppelbock"/"Weizenbock" (route through a different,
 * radio-button-based required field - darkLightColor - that client-side
 * blocks submission even with #brewInfo's own `required` stripped, so they
 * don't reach the server code this spec needs to exercise).
 * process_brewing.inc.php's check_special_ingredients() branch then sets
 * brewConfirmed='0' on save, which is exactly what
 * purge_entries("unconfirmed", ...) and purge_entries("special", ...) both
 * look for - so one fixture entry exercises both of the two purge_entries()
 * branches this spec can safely run live (see the file header for why
 * "unpaid" is excluded).
 */
async function createUnconfirmedSpecialEntry(browser: Browser): Promise<{ entryName: string; id: number }> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await registerEntrant(page);

  await page.goto('/index.php?section=list');
  await page.getByRole('link', { name: /add.*entry/i }).first().click();
  await expect(page.locator('input[name="brewName"]')).toBeVisible();

  const entryName = `E2E DIC Special ${Date.now()}-${Math.floor(Math.random() * 1e4)}`;
  await page.fill('input[name="brewName"]', entryName);

  // Select "Brett Beer" by visible text, then strip the client-side
  // `required` attribute the page's own JS adds to #brewInfo for this style
  // (disp_special_ing()/require_visible() in js_includes/app.min.js) - we
  // want to exercise the real server-side blank-brewInfo handling, not the
  // (working-as-intended) client-side validation that normally guards it.
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
  await ctx.close();

  const [row] = await query<{ id: number }>('SELECT id FROM brewing WHERE brewName = ?', [entryName]);
  expect(row, 'the disposable entry was actually inserted').toBeDefined();
  return { entryName, id: row.id };
}

test.describe('sqli migration phase 2 - common.lib.php admin/data-integrity functions (task 1d)', () => {
  test('purge_entries() "unconfirmed" + "special" branches delete only this test\'s own disposable entry (admin "Purge All Unconfirmed Entries")', async ({ browser, page }) => {
    test.slow();
    const { entryName, id } = await createUnconfirmedSpecialEntry(browser);

    const [fixture] = await query<{ brewConfirmed: string | null; brewInfo: string | null }>(
      'SELECT brewConfirmed, brewInfo FROM brewing WHERE id = ?', [id]
    );
    // Confirms the fixture actually landed in the state this spec needs
    // before trusting any assertion that follows: brewConfirmed must be the
    // string purge_entries("unconfirmed",...) matches on, and brewInfo must
    // be genuinely blank so purge_entries("special",...) also matches it.
    expect(String(fixture.brewConfirmed)).toBe('0');
    expect(fixture.brewInfo ?? '').toBe('');

    const [{ otherRowsBefore }] = await query<{ otherRowsBefore: number }>(
      'SELECT COUNT(*) as otherRowsBefore FROM brewing WHERE id != ?', [id]
    );

    await loginAsAdmin(page);
    await page.goto('/index.php?section=admin&go=entries');
    // Same href admin/entries.admin.php's "Purge All Unconfirmed Entries"
    // link uses (action=purge&go=unconfirmed), navigated to directly to
    // bypass its JS confirm() modal - this exercises the exact same
    // data_cleanup.inc.php route the real button does. process.inc.php
    // requires a same-host Referer header (its own CSRF-adjacent gate,
    // unrelated to this migration) - page.goto() sends none on its own, so
    // it's passed explicitly from the admin page navigated to just above.
    await page.goto('/includes/process.inc.php?action=purge&go=unconfirmed', { referer: page.url() });

    const [gone] = await query<{ id: number }>('SELECT id FROM brewing WHERE id = ?', [id]);
    expect(gone, 'purge_entries() deleted this test\'s own unconfirmed/special fixture').toBeUndefined();

    const [{ otherRowsAfter }] = await query<{ otherRowsAfter: number }>(
      'SELECT COUNT(*) as otherRowsAfter FROM brewing'
    );
    expect(otherRowsAfter, 'no shared baseline row was touched by this purge').toBe(otherRowsBefore);
  });

  test('data_integrity_check() corrects/cleans only disposable fixture rows and leaves shared baseline rows untouched', async ({ page }) => {
    test.slow();
    const unique = `${Date.now()}-${Math.floor(Math.random() * 1e4)}`;
    const dupEid = 900000; // well outside any real entry id range on this stack

    // --- Baseline snapshot: must be unchanged after the run ---
    const [{ baselineJudgingScoreRows }] = await query<{ baselineJudgingScoreRows: number }>(
      'SELECT COUNT(*) as baselineJudgingScoreRows FROM judging_scores WHERE eid != ?', [dupEid]
    );
    const [{ baselineDupEids }] = await query<{ baselineDupEids: number }>(
      `SELECT COUNT(*) as baselineDupEids FROM (
         SELECT eid FROM judging_scores WHERE eid != ? GROUP BY eid HAVING COUNT(*) > 1
       ) d`, [dupEid]
    );
    expect(baselineDupEids, 'sanity check: no pre-existing duplicate eid on this stack to confuse the assertion below').toBe(0);

    // Fixture ids, declared up-front so the `finally` block below can always
    // clean up, even if a later INSERT in this setup throws partway through.
    let mismatchUserId: number | undefined, mismatchBrewerId: number | undefined, mismatchBrewingId: number | undefined;
    let orphanUserId: number | undefined, orphanBrewingId: number | undefined;
    let blankBrewingId: number | undefined, blankBrewerId: number | undefined;

    try {
      // --- Fixture 1: uid/email mismatch correction ---
      // A brewer row whose brewerEmail matches a real users.user_name but
      // whose uid points at the wrong id. data_integrity_check() should fix
      // brewer.uid to the correct users.id.
      //
      // It should *not* repoint the matching brewing.brewBrewerID here, even
      // though that's the comment above the code's own intent: the lookup
      // query selects the column as "brewerLastname" (lowercase n, no AS
      // alias) but then reads it back via $row_brewer['brewerLastName']
      // (capital N) - a second, independent pre-existing bug beyond the
      // already-known "both WHERE args use brewerLastName" one, confirmed
      // present byte-for-byte in upstream/master too. PHP's suppressed
      // E_NOTICE makes that key access silently NULL, so the real emitted
      // query is "WHERE brewBrewerLastName='' AND brewBrewerFirstName=''" -
      // it can only ever match a brewing row whose names are BOTH already
      // blank, never the mismatched brewer's actual name. This fixture's
      // brewing row therefore intentionally has a real (non-blank) name, to
      // assert this bug's real, upstream-matched behavior is preserved
      // as-is by the conversion, not "fixed" along the way.
      const mismatchEmail = `e2e-dic-mismatch-${unique}@example.com`;
      const mismatchLastName = `E2eDicMismatchLast${unique}`;
      const mismatchUser: any = await query(
        "INSERT INTO users (user_name, userLevel) VALUES (?, '2')", [mismatchEmail]
      );
      mismatchUserId = mismatchUser.insertId;
      const mismatchBrewer: any = await query(
        'INSERT INTO brewer (uid, brewerEmail, brewerFirstName, brewerLastName) VALUES (9999999, ?, ?, ?)',
        [mismatchEmail, 'E2eDicMismatchFirst', mismatchLastName]
      );
      mismatchBrewerId = mismatchBrewer.insertId;
      const mismatchEntryName = `E2E DIC Mismatch Entry ${unique}`;
      const mismatchBrewing: any = await query(
        `INSERT INTO brewing (brewName, brewStyle, brewCategory, brewCategorySort, brewSubCategory, brewBrewerID, brewBrewerFirstName, brewBrewerLastName)
         VALUES (?, 'American IPA', '21', '21', 'A', 9999999, ?, ?)`,
        [mismatchEntryName, mismatchLastName, mismatchLastName]
      );
      mismatchBrewingId = mismatchBrewing.insertId;

      // --- Fixture 2: orphan user (no matching brewer row at all) ---
      // Should get the user row deleted, and any brewing row pointing at it
      // (via brewBrewerID) deleted too.
      const orphanEmail = `e2e-dic-orphan-${unique}@example.com`;
      const orphanUser: any = await query(
        "INSERT INTO users (user_name, userLevel) VALUES (?, '2')", [orphanEmail]
      );
      orphanUserId = orphanUser.insertId;
      const orphanEntryName = `E2E DIC Orphan Entry ${unique}`;
      const orphanBrewing: any = await query(
        `INSERT INTO brewing (brewName, brewStyle, brewCategory, brewCategorySort, brewSubCategory, brewBrewerID)
         VALUES (?, 'American IPA', '21', '21', 'A', ?)`,
        [orphanEntryName, orphanUserId]
      );
      orphanBrewingId = orphanBrewing.insertId;

      // --- Fixture 3: fully-blank brewing row ---
      const blankEntryName = `E2E DIC Blank Entry ${unique}`;
      const blankBrewing: any = await query(
        `INSERT INTO brewing (brewName, brewStyle, brewCategory, brewCategorySort, brewBrewerID) VALUES (?, NULL, NULL, NULL, NULL)`,
        [blankEntryName]
      );
      blankBrewingId = blankBrewing.insertId;

      // --- Fixture 4: fully-blank brewer row ---
      const blankBrewerEmail = `e2e-dic-blank-brewer-${unique}@example.com`;
      const blankBrewer: any = await query(
        'INSERT INTO brewer (brewerEmail, brewerFirstName, brewerLastName) VALUES (?, NULL, NULL)',
        [blankBrewerEmail]
      );
      blankBrewerId = blankBrewer.insertId;

      // --- Fixture 5: duplicate judging_scores rows under one disposable eid ---
      await query('INSERT INTO judging_scores (eid, scoreEntry) VALUES (?, 30)', [dupEid]);
      await query('INSERT INTO judging_scores (eid, scoreEntry) VALUES (?, 31)', [dupEid]);
      await query('INSERT INTO judging_scores (eid, scoreEntry) VALUES (?, 32)', [dupEid]);

      await loginAsAdmin(page);
      await page.goto('/index.php?section=admin');
      // "User initiated triggering of data integrity check"
      // (includes/data_cleanup.inc.php, action=="cleanup") - no admin UI
      // link currently wires to this route, but it is live, reachable code
      // (also invoked for real from output/export.output.php and
      // bootstrap.php's own once-a-day auto-check), so hitting it directly
      // exercises the real production code path. process.inc.php requires a
      // same-host Referer header (its own CSRF-adjacent gate, unrelated to
      // this migration) - page.goto() sends none on its own, so it's passed
      // explicitly from the admin page navigated to just above.
      const resp = await page.goto('/includes/process.inc.php?action=cleanup&go=entries', { referer: page.url() });
      expect(resp?.ok(), 'data_integrity_check() route did not error').toBeTruthy();
      const body = (await page.locator('body').textContent()) ?? '';
      expect(body).not.toContain('Fatal error');

      // Fixture 1: uid corrected on the brewer row. The brewing row's
      // brewBrewerID is NOT touched - see the fixture-1 comment above for
      // why that's the real, upstream-matched (buggy) behavior being
      // preserved, not a conversion defect.
      const [mismatchBrewerRow] = await query<{ uid: number }>('SELECT uid FROM brewer WHERE id = ?', [mismatchBrewerId]);
      expect(mismatchBrewerRow.uid, 'brewer.uid corrected to the matching user id').toBe(mismatchUserId);
      const [mismatchBrewingRow] = await query<{ brewBrewerID: string }>('SELECT brewBrewerID FROM brewing WHERE id = ?', [mismatchBrewingId]);
      expect(String(mismatchBrewingRow.brewBrewerID), 'brewing.brewBrewerID left alone (pre-existing key-case bug, upstream-matched)').toBe('9999999');

      // Fixture 2: orphan user + its brewing row both deleted.
      const [orphanUserRow] = await query('SELECT id FROM users WHERE id = ?', [orphanUserId]);
      expect(orphanUserRow, 'orphan user row deleted').toBeUndefined();
      const [orphanBrewingRow] = await query('SELECT id FROM brewing WHERE id = ?', [orphanBrewingId]);
      expect(orphanBrewingRow, 'orphan brewing row deleted').toBeUndefined();

      // Fixture 3: blank brewing row deleted.
      const [blankBrewingRow] = await query('SELECT id FROM brewing WHERE id = ?', [blankBrewingId]);
      expect(blankBrewingRow, 'blank brewing row deleted').toBeUndefined();

      // Fixture 4: blank brewer row deleted.
      const [blankBrewerRow] = await query('SELECT id FROM brewer WHERE id = ?', [blankBrewerId]);
      expect(blankBrewerRow, 'blank brewer row deleted').toBeUndefined();

      // Fixture 5: collapsed from 3 rows to exactly 1 for this eid.
      const dupRows = await query<{ id: number }>('SELECT id FROM judging_scores WHERE eid = ?', [dupEid]);
      expect(dupRows.length, 'duplicate judging_scores rows collapsed to exactly one').toBe(1);

      // Baseline: no pre-existing (non-fixture) judging_scores row was
      // touched, and no new duplicate was introduced among them.
      const [{ afterJudgingScoreRows }] = await query<{ afterJudgingScoreRows: number }>(
        'SELECT COUNT(*) as afterJudgingScoreRows FROM judging_scores WHERE eid != ?', [dupEid]
      );
      expect(afterJudgingScoreRows, 'shared baseline judging_scores rows untouched').toBe(baselineJudgingScoreRows);
      const [{ afterDupEids }] = await query<{ afterDupEids: number }>(
        `SELECT COUNT(*) as afterDupEids FROM (
           SELECT eid FROM judging_scores WHERE eid != ? GROUP BY eid HAVING COUNT(*) > 1
         ) d`, [dupEid]
      );
      expect(afterDupEids, 'no shared baseline eid became duplicated').toBe(0);
    } finally {
      // Best-effort cleanup of anything the function didn't already remove
      // (e.g. if an assertion above failed before the function ran, or an
      // INSERT above threw partway through setup, or the function's own
      // behavior changed), so a re-run starts clean. Ids default to a
      // nonexistent -1 when their INSERT never ran.
      await query('DELETE FROM judging_scores WHERE eid = ?', [dupEid]);
      await query('DELETE FROM brewing WHERE id IN (?, ?, ?)', [mismatchBrewingId ?? -1, orphanBrewingId ?? -1, blankBrewingId ?? -1]);
      await query('DELETE FROM brewer WHERE id IN (?, ?)', [mismatchBrewerId ?? -1, blankBrewerId ?? -1]);
      await query('DELETE FROM users WHERE id IN (?, ?)', [mismatchUserId ?? -1, orphanUserId ?? -1]);
    }
  });
});

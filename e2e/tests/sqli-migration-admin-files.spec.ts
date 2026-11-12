import { test, expect } from '@playwright/test';
import { loginAsAdmin, registerEntrant } from '../helpers/auth';
import { chooseStyle } from '../helpers/entries';
import { query } from '../helpers/db';

/**
 * P1 SQLi migration phase 1, task 4 (admin file group):
 *
 * - admin/competition_info.admin.php: the step4 "first brewer"/"contest info
 *   row count" lookups converted from raw mysqli_query + sprintf to
 *   $db_conn->getOne() (MysqliDb builder - no raw SQL string survives for
 *   either query).
 * - admin/archive.admin.php: the "results recorded" count query converted to
 *   $db_conn->getOne() with a table_exists() guard, matching upstream.
 * - admin/judging_assign.admin.php: five raw mysqli_query() calls converted
 *   to $db_conn (builder where()/get()/getOne(), or rawQuery() with bound
 *   `?` parameters for the one query that joins two tables). Two of the five
 *   - the co-brewer and industry-affiliation lookups - can return many rows;
 *   this file was explicitly flagged as the one most likely to do so (the
 *   judge/table assignment screen), so the regression to guard against is a
 *   conversion that silently narrowed a multi-row fetch down to one row
 *   (e.g. using getOne()/get($table, 1) instead of get()).
 */

test.describe('sqli migration - admin file group (task 4)', () => {
  test('judging-assign co-brewer list reflects every received entry under the table\'s style, not just the first', async ({ browser, page }) => {
    test.slow(); // several registrations/entries/navigations in one test
    // Three independent entrants, the same style, each with a distinct,
    // uniquely-markered co-brewer name. query_co_brewers (admin/judging_assign.admin.php)
    // filters on brewCategorySort/brewSubCategory (the style's group/num) and
    // brewReceived - all three rows must come back for the summary line to
    // list all three names.
    const marker = `E2ECoBrewer${Date.now()}`;
    const coBrewers = [0, 1, 2].map(i => `${marker}-${i}`);
    const entryNames: string[] = [];
    let styleName = '';

    for (let i = 0; i < coBrewers.length; i++) {
      const ctx = await browser.newContext();
      const p = await ctx.newPage();
      await registerEntrant(p);
      await p.goto('/index.php?section=list');
      await p.getByRole('link', { name: /add.*entry/i }).first().click();
      await expect(p.locator('input[name="brewName"]')).toBeVisible();

      const entryName = `E2E CoBrewer Entry ${Date.now()}-${i}`;
      await p.fill('input[name="brewName"]', entryName);
      // chooseStyle() isn't guaranteed to pick the same option on every page
      // load (its regex can match several options, and style listing order
      // isn't guaranteed) - each entry picks independently here, and the
      // three are forced into the same brewCategorySort/brewSubCategory
      // group via a direct DB update below instead of fighting the client-side
      // select picker across separate browser contexts.
      const style = await chooseStyle(p);
      if (i === 0) styleName = style.name;
      await p.fill('input[name="brewCoBrewer"]', coBrewers[i]);
      await p.locator('form[name="form1"] button[type="submit"]').first().click();

      await ctx.close();
      entryNames.push(entryName);
    }

    // Align all three entries on entry 0's actual style group/subcategory -
    // this is what query_co_brewers (admin/judging_assign.admin.php) filters
    // on, and is the one thing the UI's style picker won't reliably repeat
    // across three independent browser contexts.
    const [{ brewCategorySort, brewSubCategory }] = await query<{ brewCategorySort: string; brewSubCategory: string }>(
      'SELECT brewCategorySort, brewSubCategory FROM brewing WHERE brewCoBrewer LIKE ?', [`${coBrewers[0]}%`]
    );
    for (let i = 1; i < coBrewers.length; i++) {
      await query(
        'UPDATE brewing SET brewCategorySort = ?, brewSubCategory = ? WHERE brewCoBrewer LIKE ?',
        [brewCategorySort, brewSubCategory, `${coBrewers[i]}%`]
      );
    }

    await loginAsAdmin(page);

    // Mark each entry received - query_co_brewers only counts brewReceived='1'
    // rows while jPrefsTablePlanning=0 (the fixture default). This long-lived
    // shared stack accumulates entries across runs, and the entries table is
    // a paginated DataTable (sDom includes 'f' for the filter box), so a new
    // entry isn't guaranteed to be on the first page - filter to it by name
    // instead of searching the raw DOM for a <tr>.
    await page.goto('/index.php?section=admin&go=entries');
    for (const name of entryNames) {
      await page.locator('.dataTables_filter input').first().fill(name);
      const row = page.locator('#sortable tbody tr', { hasText: name }).first();
      await expect(row).toBeVisible();
      await Promise.all([
        page.waitForResponse(r => r.url().includes('/ajax/')),
        row.locator('input[name^="brewReceived"]').first().check(),
      ]);
    }

    // The co-brewer summary line is only built while iterating the
    // judge/steward pool, so at least one judge must exist.
    await page.goto('/index.php?section=admin&go=judge&action=register&view=quick');
    await expect(page.locator('input[name="user_name"]')).toBeVisible();
    await page.fill('input[name="user_name"]', `e2e-judge-${Date.now()}@example.com`);
    await page.fill('input[name="brewerFirstName"]', 'E2eJudge');
    await page.fill('input[name="brewerLastName"]', 'Tester');
    await Promise.all([
      page.waitForNavigation(),
      page.locator('#form-submit-button').click(),
    ]);

    // Find the table assigned to this style, or create one (a style can
    // belong to only one table, so a prior run on this shared stack may
    // already own it) - same reuse-or-create pattern as admin-journey.spec.ts.
    await page.goto('/index.php?section=admin&go=judging_tables&action=add');
    const styleRow = page.locator('tr', { hasText: styleName }).first();
    await expect(styleRow).toBeVisible();
    let tableId: string | undefined;

    if (await styleRow.locator('input[name="tableStyles[]"]').first().isEnabled()) {
      const tableName = `E2E CoBrewer Table ${Date.now()}`;
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
      tableId = editHref?.match(/id=(\d+)/)?.[1];
    } else {
      const assignedHref = await styleRow
        .locator('a[href*="go=judging_tables"][href*="action=edit"]')
        .first()
        .getAttribute('href');
      tableId = assignedHref?.match(/id=(\d+)/)?.[1];
    }
    expect(tableId, 'judging table id for the entries\' style').toBeTruthy();

    await page.goto(`/index.php?section=admin&go=judging_tables&action=assign&filter=judges&id=${tableId}`);
    const summary = await page.locator('.well.small').first().innerText();

    // Exact count, not just presence: a conversion that silently dropped all
    // but the first row would still show coBrewers[0] but not the others.
    const occurrences = summary.split(marker).length - 1;
    expect(occurrences, 'all three co-brewer rows listed, not just the first').toBe(coBrewers.length);
    for (const cb of coBrewers) {
      expect(summary, `co-brewer "${cb}" listed`).toContain(cb);
    }
  });

  // NOTE: this does NOT exercise admin/competition_info.admin.php's converted
  // queries. Those live inside `if ($section == "step4")` (lines ~11-38),
  // which only runs mid first-time setup (setup.php?section=step4, gated on
  // bcoem_sys.setup == 0 in includes/db/setup.db.php) - unreachable here,
  // since this shared stack is already fully set up (bcoem_sys.setup == 1,
  // which redirects setup.php straight to index.php) and $setup_free_access
  // is FALSE (flipping either on the shared stack would be disruptive to
  // other work, same reason task 2 couldn't run setup.php/update.php
  // end-to-end here either). This test instead exercises the ordinary
  // admin&go=contest_info path, which renders contestName from
  // $row_contest_info - a different, unconverted variable, not
  // $row_brewer/$row_comp_info. It's left as a general smoke check that the
  // file still renders outside step4; the step4 conversion itself is
  // guarded by tests/Unit/SourceHardeningTest.php
  // (test_competition_info_step4_lookups_stay_parameterized) and was
  // verified end-to-end by hand against real data on a throwaway, isolated
  // Docker project - see the task-4 report for that procedure and its
  // output.
  test('competition info admin page renders the ordinary (non-step4) settings form', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/index.php?section=admin&go=contest_info');
    await expect(page.locator('input[name="contestName"]')).toBeVisible();
    await expect(page.locator('input[name="contestName"]')).not.toHaveValue('');
  });

  test('archive admin page loads without error after the results-recorded query conversion', async ({ page }) => {
    // admin/archive.admin.php's "action=edit" branch (editing an existing
    // archive) runs the converted table_exists()-guarded getOne() query. The
    // default (list) view exercises the same file end-to-end without error.
    await loginAsAdmin(page);
    await page.goto('/index.php?section=admin&go=archive');
    await expect(page.locator('body')).toContainText(/Archive/i);
  });
});

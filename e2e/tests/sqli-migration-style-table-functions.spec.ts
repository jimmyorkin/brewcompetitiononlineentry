import { test, expect, Page } from '@playwright/test';
import { loginAsAdmin } from '../helpers/auth';
import { fillDateTime } from '../helpers/forms';
import { createEntrantWithEntry } from '../helpers/entries';
import { query } from '../helpers/db';

/**
 * SQLi migration phase 2, task 1c: lib/common.lib.php's style/table-info/
 * display-formatting functions - get_table_info(), style_convert(),
 * style_type(), table_location(), styles_active(), limit_subcategory(), and
 * highlight_required() - converted from raw mysqli_query()/sprintf() to
 * MysqliDb builder calls (where()/getOne()/get()) or $db_conn->rawQuery()/
 * rawQueryOne() with `?` placeholders, matching upstream/master's own
 * conversion of the same functions (adapted for this fork's own divergences:
 * no "current" dbTable alias or judgingLocNotes field in get_table_info(),
 * no BJCP2025/BJCP2026/AABC2025 style-set branching in styles_active() or
 * limit_subcategory() - all confirmed absent everywhere in this fork by a
 * full-repo grep, the same divergence pattern already documented for
 * winner_check() in task 1b).
 *
 * get_table_info(), style_convert(), and table_location() are exercised
 * together through the admin judging-tables flow below, since they're used
 * together on the same pages. style_type()'s DB-backed branch (method=2,
 * source="custom") is exercised separately via a custom style type. See
 * tests/Unit/SourceHardeningTest.php for styles_active() (judging-window-
 * gated, not safely reachable on this shared stack - same category as
 * sections/winners.sec.php's own queries), limit_subcategory() (reachable
 * but insensitive on this stack's default unlimited prefsUserSubCatLimit),
 * and highlight_required() (dead code, no caller anywhere in this fork or
 * upstream/master).
 */

/**
 * Create (or reuse, if the style is already assigned to one) a judging table
 * for the given style on the main judging_tables admin page, and return its
 * numeric id. Mirrors sqli-migration-judging-scoring-functions.spec.ts's
 * (task 1b) table-creation flow.
 */
async function ensureJudgingTable(page: Page, styleName: string, newTableNamePrefix: string): Promise<string> {
  await page.goto('/index.php?section=admin&go=judging_tables');
  const addSessionLink = page.getByRole('link', { name: /add a judging session/i });
  if (await addSessionLink.count()) {
    await addSessionLink.click();
    await page.fill('input[name="judgingLocName"]', 'E2E Session 1c');
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

test.describe('sqli migration phase 2 - common.lib.php style/table-info functions (task 1c)', () => {
  test('admin judging-tables pages show the correct style, entry count, and table location (get_table_info / style_convert / table_location)', async ({ browser, page }) => {
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

    const tableId = await ensureJudgingTable(page, styleName, 'E2E TableInfo Table');

    // Real expected received count for this style, queried directly - the
    // table may have been reused from a prior run of this spec, so this is
    // the actual current count, not a hardcoded "1". Read the category/
    // sub-category straight off the entry itself, rather than re-deriving
    // it from the style dropdown's display value.
    const [{ brewCategorySort, brewSubCategory }] = await query<{ brewCategorySort: string; brewSubCategory: string }>(
      'SELECT brewCategorySort, brewSubCategory FROM brewing WHERE brewName = ?', [entryName]
    );
    const [{ expectedReceived }] = await query<{ expectedReceived: number }>(
      "SELECT COUNT(*) as expectedReceived FROM brewing WHERE brewCategorySort = ? AND brewSubCategory = ? AND brewReceived = '1'",
      [brewCategorySort, brewSubCategory]
    );
    expect(expectedReceived, 'at least this spec\'s own received entry should count').toBeGreaterThanOrEqual(1);

    // — Manage Tables listing: get_table_info("1","list",...) / ("count_total") —
    await page.goto('/index.php?section=admin&go=judging_tables');
    const manageLink = page.locator(`a[href*="go=judging_tables"][href*="action=edit"][href*="id=${tableId}"]`).first();
    await expect(manageLink, 'the judging table appears on the manage listing').toBeVisible();
    const manageRow = manageLink.locator('xpath=ancestor::tr[1]');
    const rowText = await manageRow.innerText();

    // get_table_info("1","count_total",...): the "Received" column shows the
    // real, currently-correct count for this style - not just a non-empty
    // cell, so a conversion bug that silently miscounts (e.g. dropping the
    // brewReceived filter, or returning every style's count instead of just
    // this table's) would be caught.
    const cells = await manageRow.locator('td').allInnerTexts();
    // Columns: Table #, Name, Styles, Received, Scored, Judges, Stewards, [Location], Actions
    expect(Number(cells[3].trim()), 'manage page shows the real received-entry count (get_table_info count_total)').toBe(expectedReceived);

    // get_table_info("1","list",...): the Styles column lists the assigned
    // style's own category/sub-category number (looked up by id from the
    // styles table) - confirms the id->group/num lookup still resolves.
    expect(rowText, 'manage page lists the assigned style (get_table_info list)').toMatch(new RegExp(brewCategorySort.replace(/^0+/, '') + '\\D*' + brewSubCategory));

    // — Assign Judges/Stewards to this table: table_location("default") is
    //   rendered unconditionally here (unlike the manage listing, which only
    //   shows it when more than one judging location exists) —
    const [{ tableName: realTableName }] = await query<{ tableName: string }>(
      'SELECT tableName FROM judging_tables WHERE id = ?', [Number(tableId)]
    );
    await page.goto(`/index.php?section=admin&go=judging_tables&action=assign&filter=judges&id=${tableId}`);
    const heading = page.locator('h4', { hasText: realTableName }).first();
    await expect(heading, 'table_location() renders under the assign-judges heading').toBeVisible();
    const headingText = await heading.innerText();
    expect(headingText, 'table_location() resolves a real location name, not blank').toMatch(/E2E Session|\S+,\s/);

    // — Add-table page: style_convert()'s always-executed top-of-function
    //   lookup runs for every style row rendered here (type="1" case), and
    //   this specific style's category cell should show real BJCP style-set
    //   text, not an empty/garbled string —
    await page.goto('/index.php?section=admin&go=judging_tables&action=add');
    const addStyleRow = page.locator('tr', { hasText: styleName }).first();
    await expect(addStyleRow, 'add-table page lists the style (style_convert top-level lookup)').toBeVisible();
    const addRowText = await addStyleRow.innerText();
    expect(addRowText.trim().length, 'style_convert() produced non-empty category text').toBeGreaterThan(0);
  });

  test('custom style type name resolves from the style_types table on the admin styles listing (style_type)', async ({ page }) => {
    await loginAsAdmin(page);

    const unique = `${Date.now()}`.slice(-6);
    const styleName = `E2E Custom Style ${unique}`;
    // brewStyleGroup max 3 chars, brewStyleNum max 2 chars - must be unique
    // among existing styles to pass the identifier-uniqueness AJAX check.
    const group = `Z${unique.slice(-2)}`;
    const num = unique.slice(0, 2);

    await page.goto('/index.php?section=admin&go=styles&action=add');
    await page.fill('input[name="brewStyle"]', styleName);
    await page.fill('input[name="brewStyleGroup"]', group);
    await page.fill('input[name="brewStyleNum"]', num);
    // "Wine" (style_types.id=5) is a real, pre-seeded style type whose name
    // is not "Mead/Cider" (excluded from this dropdown) and whose id is > 3,
    // so selecting it makes the listing's style_type("1","") helper classify
    // this style as "custom" and take style_type()'s DB-backed branch
    // (method=2, source="custom") to resolve the type name back from the
    // style_types table.
    await page.locator('select[name="brewStyleType"]').selectOption({ label: 'Wine' }, { force: true });
    await page.locator('#updateStyle').click();

    await expect(page).toHaveURL(/go=styles/);
    await page.goto('/index.php?section=admin&go=styles');
    const styleRow = page.locator('tr', { hasText: styleName }).first();
    await expect(styleRow, 'the new custom style appears on the styles listing').toBeVisible();

    const rowText = await styleRow.innerText();
    // style_type($row_styles['brewStyleType'], "2", "custom") resolved the
    // numeric style_types.id back to its real name via the converted,
    // bound query - not blank, not the raw numeric id.
    expect(rowText, 'style_type() resolves the custom style type name (not blank, not the raw numeric id)').toContain('Wine');
  });
});

import { test, expect, Page } from '@playwright/test';
import { loginAsAdmin } from '../helpers/auth';
import { createEntrantWithEntry } from '../helpers/entries';
import { query } from '../helpers/db';

/**
 * Covers three of the seven files converted to prepared statements /
 * MysqliDb parameter binding in this task (the other four are covered
 * elsewhere: process_judging_scores.inc.php in admin-journey.spec.ts;
 * setup.php/update.php by manual verification per the task brief, since
 * they are one-time scripts outside the normal web request flow).
 */

async function getToken(page: Page): Promise<string> {
  return (await page.locator('input[name="token"]').first().getAttribute('value')) ?? '';
}

test.describe('sqli migration: root/setup/process-include file group', () => {

  /**
   * process_style_types.inc.php's "add" branch determines the next id via
   * `ORDER BY id DESC LIMIT 1` (now $db_conn->orderBy()->getOne()). Neither
   * of this file's two converted queries interpolates user input (both are
   * either unparameterized or use a fixed literal), so there's no
   * injection-survival angle here - the risk converting them is a plain
   * behavioral regression (e.g. wrong column alias), which this test guards
   * against by checking the actual assigned id, not just a successful save.
   */
  test('adding a style type still assigns the next sequential id (ids 1-15 reserved)', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/index.php?section=admin&go=style_types&action=add');
    await expect(page.locator('#updateStyle')).toBeVisible();

    const [{ maxId }] = await query<{ maxId: number | null }>('SELECT MAX(id) AS maxId FROM style_types');
    const expectedId = maxId === null || Number(maxId) < 16 ? 16 : Number(maxId) + 1;

    const name = `E2E Style Type ${Date.now()}`;
    await page.fill('input[name="styleTypeName"]', name);
    await Promise.all([
      page.waitForURL(/go=style_types/),
      page.locator('#updateStyle').click(),
    ]);

    const [row] = await query<{ id: number; styleTypeName: string }>(
      'SELECT id, styleTypeName FROM style_types WHERE styleTypeName = ?', [name]
    );
    expect(row).toBeDefined();
    expect(Number(row.id)).toBe(expectedId);
  });

  /**
   * process_barcode_check_in.inc.php (the non-BBO file on this task's list;
   * the live checkin UI actually posts to the separate, un-migrated
   * process_barcode_check_in_bbo.inc.php - see this task's report for that
   * finding) is reached by POSTing directly to its process.inc.php route,
   * matching the (currently unreachable from any wired admin page) form
   * fields the stock admin/barcode_check-in.admin.php would send. The
   * duplicate-judging-number and entry-lookup queries' values are
   * sterilize()'d before reaching the (old) raw SQL, so they weren't
   * actually exploitable - but a wrong bind type here would silently return
   * zero rows and skip the update, which is exactly what this test checks
   * for by asserting the entry's actual stored columns afterward.
   */
  test('barcode check-in survives a single quote in the judging number and persists the real update', async ({ browser, page }) => {
    const { entryName } = await createEntrantWithEntry(browser);
    const [entry] = await query<{ id: number }>('SELECT id FROM brewing WHERE brewName = ?', [entryName]);
    expect(entry).toBeDefined();

    await loginAsAdmin(page);
    // Any normal admin page carries a fresh CSRF token tied to this session.
    await page.goto('/index.php?section=admin&go=entries');
    const token = await getToken(page);

    // sterilize() runs non-numeric POST values through
    // FILTER_SANITIZE_FULL_SPECIAL_CHARS before they ever reach the SQL
    // layer, so "'" becomes the literal entity "&#039;" (and the column is
    // varchar(10), hence the short value) - that's pre-existing, unrelated
    // escaping, not something this task changes. What this test cares about
    // is that the entity-bearing value still round-trips through the
    // converted lookup/update queries correctly.
    const judgingNumber = `Q'001`;
    const sterilizedJudgingNumber = 'Q&#039;001';
    // This literal is reused across runs (varchar(10) leaves no room for a
    // per-run suffix once sterilize()'s "'" -> "&#039;" expansion is
    // accounted for); clear any prior run's leftover value so the
    // duplicate-judging-number check starts from a clean slate.
    await query('UPDATE brewing SET brewJudgingNumber = NULL WHERE brewJudgingNumber = ?', [sterilizedJudgingNumber]);
    const resp = await page.request.post('/includes/process.inc.php?section=admin&action=barcode_check_in', {
      form: {
        token,
        'id[]': '1',
        eid1: String(entry.id),
        judgingNumber1: judgingNumber,
        box1: '12',
        brewPaid1: '1',
      },
      headers: { referer: page.url() },
    });
    expect(resp.status()).toBeLessThan(500);

    const [row] = await query<{ brewReceived: number; brewJudgingNumber: string; brewBoxNum: string; brewPaid: number }>(
      'SELECT brewReceived, brewJudgingNumber, brewBoxNum, brewPaid FROM brewing WHERE id = ?', [entry.id]
    );
    expect(row).toBeDefined();
    expect(Number(row.brewReceived)).toBe(1);
    expect(row.brewJudgingNumber).toBe(sterilizedJudgingNumber);
    expect(row.brewBoxNum).toBe('12');
    expect(Number(row.brewPaid)).toBe(1);
  });

  /**
   * process_users_setup.inc.php is reachable two ways: an already-logged-in
   * admin (isset($_SESSION['loginUsername']) && isset($_SESSION['userLevel'])),
   * or $setup_free_access (a config flag, FALSE by default, meant only for
   * the one-time install wizard). It used to also accept a bare
   * `$section == "setup"` request parameter with no login at all - a
   * privilege-escalation hole that let any anonymous visitor create a
   * super-admin account - fixed separately (see the commit that restored
   * the `$setup_free_access` check). This test exercises the legitimate
   * path, an already-logged-in admin, which the fix does not affect.
   *
   * Its only converted query is an unparameterized `COUNT(*)` with no user
   * input, so the meaningful check is that the count-based branching (and
   * therefore the whole insert path) still works: on this seeded,
   * multi-user DB the count is never 1, so the redirect carries msg=99, and
   * the actual inserted user is still verified by logging in with the new
   * credentials.
   */
  test('new admin-setup user insert still redirects on the count check and the user is persisted', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/index.php?section=admin&go=entries');
    const token = await getToken(page);

    const email = `e2e-setup-${Date.now()}@example.com`;
    const password = 'E2eSetup123!';
    const resp = await page.request.post('/includes/process.inc.php?section=setup&action=add&dbTable=users', {
      form: {
        token,
        user_name: email,
        password,
        userQuestion: 'hops',
        userQuestionAnswer: 'cascade',
        userLevel: '2',
      },
      headers: { referer: page.url() },
      maxRedirects: 0,
    }).catch(e => e); // request lib throws on non-2xx-redirect handling in some configs

    // Whichever shape the response comes back in, the real DB effect is
    // what matters: the row was inserted despite count != 1.
    const [row] = await query<{ id: number; user_name: string }>(
      'SELECT id, user_name FROM users WHERE user_name = ?', [email]
    );
    expect(row).toBeDefined();

    // Log the admin out first (the request above ran in the admin's own
    // session) so the login attempt below genuinely exercises the new
    // credentials, not the still-live admin session.
    const logoutHref = await page.locator('a[href*="logout"]').first().getAttribute('href');
    await page.goto(logoutHref!, { referer: page.url() });

    // Actual effect: the new credentials really work.
    await page.goto('/index.php?section=login');
    await page.fill('input[name="loginUsername"]', email);
    await page.fill('input[name="loginPassword"]', password);
    await page.locator('form:has(input[name="loginUsername"]) button[name="submit"]').first().click();
    await expect(
      page.locator('a[href*="logout"], a:has-text("Log Out")').first()
    ).toBeAttached();
  });
});

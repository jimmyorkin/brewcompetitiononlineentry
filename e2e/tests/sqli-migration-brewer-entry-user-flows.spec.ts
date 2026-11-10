import { test, expect, Page } from '@playwright/test';
import { login, loginAsAdmin } from '../helpers/auth';
import { chooseStyle, createEntrantWithEntry } from '../helpers/entries';
import { query } from '../helpers/db';

/**
 * SQLi migration phase 2, task 3a: includes/process/process_brewer.inc.php
 * (12 calls), includes/process/process_brewing.inc.php (7 calls),
 * includes/process/process_users.inc.php (6 calls), and
 * includes/process/process_users_register.inc.php (5 calls) - converted from
 * raw mysqli_query()/sprintf() to MysqliDb builder calls (where()/get()/
 * getOne()), matching upstream/master's own conversion of these exact files
 * (upstream has converted every one of these 30 call sites too; the
 * conversions here follow its where()/getOne()/get() shape, minus unrelated
 * upstream feature work this fork lacks - see the task report for the full
 * per-call mapping).
 *
 * These are procedural action-handler files (no function-level units,
 * included directly by includes/process.inc.php's dispatcher), so each test
 * drives a real HTTP action dispatch (the actual rendered form, or an
 * authenticated POST built from the same field names the real form sends)
 * rather than calling a PHP function directly.
 */

async function getSessionToken(page: Page): Promise<string> {
  const token = await page.evaluate(() => {
    const el = document.querySelector('input[name="token"]') as HTMLInputElement | null;
    return el?.value ?? '';
  });
  expect(token, 'page carries a CSRF token to reuse for a raw POST').not.toBe('');
  return token;
}

test.describe('sqli migration phase 2 - includes/process core brewer/entry/user flows (task 3a)', () => {
  test("process_users_register.inc.php's registration action creates matching users/brewer/staff rows, including the brewerJudge==Y lookup, and survives a quote in the security answer", async ({ page }) => {
    test.slow();

    const email = `e2e-3a-register-${Date.now()}@example.com`;
    const password = 'E2eTest123!';
    const securityAnswer = `O'Hops`; // single quote - must survive through hash_question, not a WHERE value, but exercises the full insert path

    // go=judge (not go=entrant - that entry point force-hides the judge
    // radio entirely, per sections/register.sec.php's $judge_hidden logic)
    // is what makes process_users_register.inc.php run its brewerJudge=="Y"
    // branch (query_brewer: SELECT id FROM brewer WHERE uid = ?), on top of
    // the query_userCheck/query_user/query_stray calls every registration
    // already exercises. The "Yes" radio defaults to checked for this entry
    // point, so no explicit click is needed.
    await page.goto('/index.php?section=register&go=judge');
    const form = page.locator('form#submit-form');
    await form.locator('input[name="user_name"]').fill(email);
    await form.locator('input[name="user_name2"]').fill(email);
    await form.locator('input[name="password"]').fill(password);
    await form.locator('input[name="userQuestionAnswer"]').fill(securityAnswer);
    await form.locator('input[name="brewerFirstName"]').fill('E2e');
    await form.locator('input[name="brewerLastName"]').fill("O'Brewer");
    await form.locator('select[name="brewerCountry"]').selectOption('United States', { force: true });
    await form.locator('input[name="brewerAddress"]').fill('1 Test Street');
    await form.locator('input[name="brewerCity"]').fill('Testville');
    await form.locator('select[name="brewerStateUS"]').selectOption('TX', { force: true });
    await form.locator('input[name="brewerZip"]').fill('75001');
    await form.locator('input[name="brewerPhone1"]').fill('555-555-0101');
    await form.locator('select[name="brewerDropOff"]').selectOption('1', { force: true });
    await form.locator('button#form-submit-button').click();

    // A successful judge registration redirects to the judge account/info
    // page (section=brewer&go=account&psort=judge) rather than the default
    // ?section=list - confirms the query_brewer lookup resolved a real row
    // id and the redirect used it, not just that the row insert succeeded.
    await page.waitForURL(/section=brewer.*psort=judge/, { timeout: 15000 });

    const [userRow] = await query<{ id: number; userLevel: number }>(
      'SELECT id, userLevel FROM users WHERE user_name = ?', [email]
    );
    expect(userRow, 'users row was created for the new registrant').toBeTruthy();
    expect(Number(userRow.userLevel)).toBe(2);

    const [brewerRow] = await query<{ uid: number; brewerFirstName: string; brewerLastName: string; brewerJudge: string }>(
      'SELECT uid, brewerFirstName, brewerLastName, brewerJudge FROM brewer WHERE uid = ?', [userRow.id]
    );
    expect(brewerRow, 'brewer row was created and uid matches the users row id (query_user\'s lookup fed it correctly)').toBeTruthy();
    expect(brewerRow.brewerLastName).toBe("O'Brewer");
    expect(brewerRow.brewerJudge).toBe('Y');

    const [staffRow] = await query<{ uid: number; staff_judge: number }>(
      'SELECT uid, staff_judge FROM staff WHERE uid = ?', [userRow.id]
    );
    expect(staffRow, 'staff row was created via the query_stray count-then-insert path').toBeTruthy();
  });

  test("process_brewing.inc.php's add action (entrant self-add, then admin add-for-brewer) resolves the correct style/brewer/new-id lookups", async ({ page, browser }) => {
    test.slow();

    // Entrant self-add: exercises query_user (session user lookup),
    // query_style_name (style resolution), and query_brew_id (new-id lookup
    // for the "default" id case) - the three calls that fire unconditionally
    // on every add.
    const entry = await createEntrantWithEntry(browser);
    const [brewingRow] = await query<{ id: number; brewStyle: string; brewBrewerID: number }>(
      'SELECT id, brewStyle, brewBrewerID FROM brewing WHERE brewName = ?', [entry.entryName]
    );
    expect(brewingRow, 'entrant\'s own add-entry POST persisted a real row').toBeTruthy();
    expect(brewingRow.brewStyle, 'query_style_name resolved the style name for the chosen style group/num').toBe(entry.styleName);

    const [{ uid: entrantUid }] = await query<{ uid: number }>(
      'SELECT uid FROM brewer WHERE uid = ?', [brewingRow.brewBrewerID]
    );
    expect(Number(entrantUid)).toBe(Number(brewingRow.brewBrewerID));

    // Admin add-for-brewer: exercises the userLevel<=1 query_brewer lookup
    // (SELECT * FROM brewer WHERE uid = ?) that only fires for an admin
    // adding on another brewer's behalf.
    await loginAsAdmin(page);
    await page.goto(`/index.php?section=brew&go=entries&action=add&filter=${entrantUid}`);
    await expect(page.locator('input[name="brewName"]')).toBeVisible();

    const adminEntryName = `E2E Admin Add ${Date.now()}`;
    await page.fill('input[name="brewName"]', adminEntryName);
    await chooseStyle(page);
    await page.locator('form[name="form1"] button[type="submit"]').first().click();
    await page.waitForLoadState('networkidle');

    const [adminEntryRow] = await query<{ brewBrewerID: number }>(
      'SELECT brewBrewerID FROM brewing WHERE brewName = ?', [adminEntryName]
    );
    expect(adminEntryRow, 'admin\'s add-for-brewer POST persisted a real row').toBeTruthy();
    expect(Number(adminEntryRow.brewBrewerID), 'query_brewer\'s lookup resolved and stored the targeted brewer\'s own uid').toBe(Number(entrantUid));
  });

  test("process_brewer.inc.php's admin judge-assignment update and edit actions survive a quote in the brewer's address and correctly add/remove judge/table assignments", async ({ page, browser }) => {
    test.slow();

    // Only a registered brewer account is needed here (no entry) - register
    // directly rather than via createEntrantWithEntry(), which additionally
    // drives the known-flaky add-entry submit this test doesn't need.
    const regCtx = await browser.newContext();
    const regPage = await regCtx.newPage();
    const regEmail = `e2e-3a-brewer-${Date.now()}@example.com`;
    await regPage.goto('/index.php?section=register&go=entrant');
    const regForm = regPage.locator('form#submit-form');
    await regForm.locator('input[name="user_name"]').fill(regEmail);
    await regForm.locator('input[name="user_name2"]').fill(regEmail);
    await regForm.locator('input[name="password"]').fill('E2eTest123!');
    await regForm.locator('input[name="userQuestionAnswer"]').fill('hops');
    await regForm.locator('input[name="brewerFirstName"]').fill('E2e');
    await regForm.locator('input[name="brewerLastName"]').fill('Judge');
    await regForm.locator('select[name="brewerCountry"]').selectOption('United States', { force: true });
    await regForm.locator('input[name="brewerAddress"]').fill('1 Test Street');
    await regForm.locator('input[name="brewerCity"]').fill('Testville');
    await regForm.locator('select[name="brewerStateUS"]').selectOption('TX', { force: true });
    await regForm.locator('input[name="brewerZip"]').fill('75001');
    await regForm.locator('input[name="brewerPhone1"]').fill('555-555-0103');
    await regForm.locator('select[name="brewerDropOff"]').selectOption('1', { force: true });
    await regForm.locator('button#form-submit-button').click();
    await expect(regPage.locator('a[href*="logout"], a:has-text("Log Out")').first()).toBeAttached();
    const [{ uid: entrantUid }] = await query<{ uid: number }>(
      'SELECT id as uid FROM users WHERE user_name = ?', [regEmail]
    );
    await regCtx.close();

    await loginAsAdmin(page);

    // Admin judge-assignment "update" action (filter=judges): exercises
    // query_staff (count check) and, on the un-assign pass below,
    // query_assign (SELECT id FROM judging_assignments WHERE bid=? AND
    // assignment='J'). Driven as a raw POST built from the exact field
    // names process_brewer.inc.php's "update"/filter=="judges" branch reads
    // (admin/non-judging_locations.admin.php's own Assign Judges form posts
    // this same shape).
    await page.goto('/index.php?section=admin&go=entries');
    const token = await getSessionToken(page);

    const assignResp = await page.request.post('/includes/process.inc.php?action=update&dbTable=brewer&filter=judges', {
      form: { token, 'uid[]': String(entrantUid), [`staff_judge${entrantUid}`]: '1' },
      headers: { referer: page.url() },
    });
    expect([200, 302]).toContain(assignResp.status());

    const [staffAfterAssign] = await query<{ staff_judge: number }>(
      'SELECT staff_judge FROM staff WHERE uid = ?', [entrantUid]
    );
    expect(staffAfterAssign?.staff_judge, 'query_staff found no existing row and the insert path set staff_judge=1').toBe(1);

    // Un-assign: staff_judge{uid} is now absent from the POST, which fires
    // query_assign's SELECT + the per-row delete loop. A fresh token is
    // required here - includes/constants_post_lang.inc.php regenerates
    // $_SESSION['token'] on every page load, and page.request.post()
    // auto-follows the first POST's 302 redirect (a GET), which silently
    // rotates the token and would otherwise fail this second POST's CSRF
    // check (still returning a redirect, but never reaching the update).
    await page.goto('/index.php?section=admin&go=entries');
    const token2 = await getSessionToken(page);
    const unassignResp = await page.request.post('/includes/process.inc.php?action=update&dbTable=brewer&filter=judges', {
      form: { token: token2, 'uid[]': String(entrantUid) },
      headers: { referer: page.url() },
    });
    expect([200, 302]).toContain(unassignResp.status());

    const [staffAfterUnassign] = await query<{ staff_judge: number }>(
      'SELECT staff_judge FROM staff WHERE uid = ?', [entrantUid]
    );
    expect(staffAfterUnassign?.staff_judge, 'query_staff\'s re-check found the existing row and cleared staff_judge').toBe(0);

    // Admin edit action (dbTable=brewer): exercises query_staff_assign and
    // query_table_assign's cleanup SELECTs for the brewerJudge=="N" branch,
    // and stores a quote in brewerAddress verbatim through the same
    // $db_conn->update() call used throughout this action (already
    // parameter-bound before this task - the SELECTs above it are what
    // task 3a converted). Driven as a raw POST (not the bootstrap-validated
    // UI form) with the exact minimal field set
    // includes/process/process_brewer_info.inc.php reads without an isset()
    // guard, built from reading that file directly. The brewer table's own
    // `id` (not `uid`/the users-table id used for the judges POST above) is
    // what the "id" query param and the final ->where('id', $id)->update()
    // key off - using the wrong one would silently update zero or the wrong
    // row, so this is fetched explicitly rather than reusing entrantUid.
    const [{ id: brewerRowId }] = await query<{ id: number }>(
      'SELECT id FROM brewer WHERE uid = ?', [entrantUid]
    );
    await page.goto('/index.php?section=admin&go=entries');
    const editToken = await getSessionToken(page);
    const quotedAddress = `123 O'Malley Ave`;
    const editResp = await page.request.post(`/includes/process.inc.php?action=edit&dbTable=brewer&id=${brewerRowId}`, {
      form: {
        token: editToken,
        uid: String(entrantUid),
        brewerFirstName: 'E2e',
        brewerLastName: 'Judge',
        brewerAddress: quotedAddress,
        brewerCity: 'Testville',
        brewerStateUS: 'TX',
        brewerZip: '75001',
        brewerCountry: 'United States',
        brewerEmail: regEmail,
        brewerJudge: 'N',
        brewerSteward: 'N',
      },
      headers: { referer: page.url() },
    });
    expect([200, 302]).toContain(editResp.status());

    const [brewerRow] = await query<{ brewerAddress: string }>(
      'SELECT brewerAddress FROM brewer WHERE uid = ?', [entrantUid]
    );
    // HTMLPurifier (always applied to this field, pre-existing/unrelated to
    // this task) HTML-entity-encodes the apostrophe on the way in - the
    // meaningful proof here is that it reached storage as *some* non-error
    // value at all (the SELECTs ahead of it in the same action didn't choke
    // on the quote), not the exact byte sequence.
    expect(brewerRow?.brewerAddress, 'the quote in brewerAddress survived the edit action\'s query_staff_assign/query_table_assign cleanup path without a SQL error').toBe("123 O&#039;Malley Ave");
  });

  test("process_users.inc.php's self password-change and username-change actions survive end to end", async ({ page, browser }) => {
    test.slow();

    const email = `e2e-3a-userspw-${Date.now()}@example.com`;
    const password = 'E2eTest123!';

    const ctx = await browser.newContext();
    const entrantPage = await ctx.newPage();
    await entrantPage.goto('/index.php?section=register&go=entrant');
    const form = entrantPage.locator('form#submit-form');
    await form.locator('input[name="user_name"]').fill(email);
    await form.locator('input[name="user_name2"]').fill(email);
    await form.locator('input[name="password"]').fill(password);
    await form.locator('input[name="userQuestionAnswer"]').fill('hops');
    await form.locator('input[name="brewerFirstName"]').fill('E2e');
    await form.locator('input[name="brewerLastName"]').fill('Userflow');
    await form.locator('select[name="brewerCountry"]').selectOption('United States', { force: true });
    await form.locator('input[name="brewerAddress"]').fill('1 Test Street');
    await form.locator('input[name="brewerCity"]').fill('Testville');
    await form.locator('select[name="brewerStateUS"]').selectOption('TX', { force: true });
    await form.locator('input[name="brewerZip"]').fill('75001');
    await form.locator('input[name="brewerPhone1"]').fill('555-555-0102');
    await form.locator('select[name="brewerDropOff"]').selectOption('1', { force: true });
    await form.locator('button#form-submit-button').click();
    await expect(entrantPage.locator('a[href*="logout"], a:has-text("Log Out")').first()).toBeAttached();

    const [{ id: userId }] = await query<{ id: number }>('SELECT id FROM users WHERE user_name = ?', [email]);

    // Self password change (go=password, dbTable=users): exercises
    // query_userPass (SELECT password FROM users WHERE id=?).
    const newPassword = 'E2eTest456!';
    await entrantPage.goto(`/index.php?section=user&action=password&filter=default&id=${userId}`);
    await entrantPage.locator('input[name="passwordOld"]').fill(password);
    await entrantPage.locator('input[name="password"]').fill(newPassword);
    await entrantPage.locator('#submit-form button[type="submit"]').click();
    await entrantPage.waitForURL(/msg=4/, { timeout: 15000 });

    await ctx.close();

    // Prove the new password actually took effect (query_userPass's
    // CheckPassword() succeeded against the freshly-fetched hash and the
    // subsequent update() stored the new one) by logging in with it fresh.
    const verifyCtx = await browser.newContext();
    const verifyPage = await verifyCtx.newPage();
    await login(verifyPage, email, newPassword);
    const [{ id: sameUserId }] = await query<{ id: number }>('SELECT id FROM users WHERE user_name = ?', [email]);
    expect(sameUserId).toBe(userId);
    await verifyCtx.close();

    // Username change (go=username, dbTable=users): exercises
    // query_brewerCheck and query_userCheck (both SELECTs that gate the
    // update), plus query_login's re-authentication SELECT on success.
    const newEmail = `e2e-3a-userspw-changed-${Date.now()}@example.com`;
    const changeCtx = await browser.newContext();
    const changePage = await changeCtx.newPage();
    await login(changePage, email, newPassword);
    await changePage.goto(`/index.php?section=user&action=username&filter=default&id=${userId}`);
    await changePage.locator('input[name="user_name"]').fill(newEmail);
    await changePage.locator('input[name="sure"]').check({ force: true });
    await changePage.locator('#submit-form button[type="submit"]').click();
    await changePage.waitForURL(/section=list/, { timeout: 15000 });
    await changeCtx.close();

    const [afterRow] = await query<{ user_name: string }>('SELECT user_name FROM users WHERE id = ?', [userId]);
    expect(afterRow.user_name, 'query_userCheck found no conflicting row and the update() applied the new username').toBe(newEmail);

    const [brewerAfter] = await query<{ brewerEmail: string }>('SELECT brewerEmail FROM brewer WHERE uid = ?', [userId]);
    expect(brewerAfter.brewerEmail, 'the brewer table\'s email was kept in sync, matched via query_brewerCheck\'s old-email lookup').toBe(newEmail);
  });
});

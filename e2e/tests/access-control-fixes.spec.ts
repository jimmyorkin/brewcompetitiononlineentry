import { test, expect, Page } from '@playwright/test';
import { query } from '../helpers/db';
import { login, loginAsAdmin, registerEntrant, ADMIN } from '../helpers/auth';

/**
 * Three access-control bugs found (and deliberately left unfixed, as
 * out-of-scope) while landing the P2 SQLi migration's task 3a
 * (sqli-migration-brewer-entry-user-flows.spec.ts's header comment):
 *
 * 1. includes/process/process_users_register.inc.php inserted
 *    'userLevel' => sterilize($_POST['userLevel']) straight from the request
 *    body with no check that the requester is an authenticated admin - any
 *    anonymous visitor could self-register as a userLevel=0 (super admin)
 *    account by tampering with the registration form's hidden userLevel
 *    field (or posting directly, as these tests do).
 * 2. includes/process/process_users.inc.php's go=="change_user_password"
 *    branch had no userLevel gate at all - any logged-in user, including a
 *    plain entrant, could reset ANY other user's password by posting a
 *    different id.
 * 3. includes/process/process_users.inc.php's go=="username" branch had no
 *    ownership/admin check - any logged-in user could change ANY other
 *    user's username/email by posting a different id.
 *
 * Each fix restores upstream's existing guard shape exactly (verified
 * against upstream/master):
 * 1. Only use $_POST['userLevel'] when the session is an authenticated admin
 *    (isset($_SESSION['loginUsername']) && isset($_SESSION['userLevel']) &&
 *    $_SESSION['userLevel'] <= 1); otherwise hardcode "2" (entrant).
 * 2. Add ($_SESSION['userLevel'] <= 1) to the go=="change_user_password" gate.
 * 3. Add ((($filter=="admin") && ($_SESSION['userLevel'] <= 1)) ||
 *    (($filter!="admin") && ($id == $_SESSION['user_id']))) to the
 *    go=="username" gate.
 *
 * Every test here drives a raw POST to includes/process.inc.php built from
 * the same field names the real forms send (not the browser-rendered form,
 * which for registration hardcodes userLevel=2 - these tests model an
 * attacker who tampers with the request directly, e.g. via dev tools or a
 * proxy, exactly as the original findings did), with disposable fixtures
 * created and torn down within each test.
 */

async function getToken(page: Page): Promise<string> {
  const token = await page.locator('input[name="token"]').first().inputValue();
  expect(token).toBeTruthy();
  return token;
}

/** Full field set process_users_register.inc.php/process_brewer_info.inc.php need for a clean insert. */
function registrationFields(email: string, token: string, userLevel: string, extra: Record<string, string> = {}) {
  return {
    token,
    user_name: email,
    user_name2: email,
    password: 'E2eTest123!',
    userQuestion: 'Randomly generated.',
    userQuestionAnswer: 'hops',
    brewerFirstName: 'E2e',
    brewerLastName: 'AccessControl',
    brewerCountry: 'United States',
    brewerAddress: '1 Test Street',
    brewerCity: 'Testville',
    brewerStateUS: 'TX',
    brewerZip: '75001',
    brewerPhone1: '555-555-0100',
    brewerDropOff: '1',
    userLevel,
    ...extra,
  };
}

test.describe('access-control-fixes: process_users_register.inc.php / process_users.inc.php', () => {

  test('an anonymous visitor cannot self-register with an elevated userLevel', async ({ page, baseURL }) => {
    await page.goto('/index.php?section=register&go=entrant');
    const token = await getToken(page);

    const email = `access-control-anon-${Date.now()}@example.com`;

    await page.request.post('/includes/process.inc.php?action=add&dbTable=users&section=register&go=entrant&view=default', {
      headers: { referer: `${baseURL}/index.php?section=register&go=entrant` },
      form: registrationFields(email, token, '0'),
    });

    const rows = await query<{ id: number; userLevel: string }>(
      'SELECT id, userLevel FROM users WHERE user_name = ?', [email]
    );
    expect(rows).toHaveLength(1);
    // The attack must be blocked: the account must be created at the
    // standard entrant level (2), never the requested super-admin level (0).
    // userLevel is a char(1) column, so compare as a string.
    expect(rows[0].userLevel).toBe('2');

    // Clean up the disposable account this test created.
    await query('DELETE FROM brewer WHERE uid = ?', [rows[0].id]);
    await query('DELETE FROM staff WHERE uid = ?', [rows[0].id]);
    await query('DELETE FROM users WHERE id = ?', [rows[0].id]);
  });

  test('an authenticated admin can register a participant with an explicit userLevel', async ({ page, baseURL }) => {
    await loginAsAdmin(page);
    // The admin "quick add judge" page (?view=quick) hides nearly every
    // field behind fixed hidden inputs, leaving only user_name to fill -
    // the same real admin registration route as task 3a's own spec.
    await page.goto('/index.php?section=admin&go=judge&action=register&view=quick');
    const token = await getToken(page);

    const email = `access-control-admin-reg-${Date.now()}@example.com`;

    await page.request.post(
      '/includes/process.inc.php?action=add&dbTable=users&section=register&go=judge&filter=admin&view=quick',
      {
        headers: { referer: `${baseURL}/index.php?section=admin&go=judge&action=register&view=quick` },
        form: {
          token,
          user_name: email,
          user_name2: email,
          password: 'bcoem',
          userQuestion: 'Randomly generated.',
          userQuestionAnswer: 'whatever',
          brewerJudgeWaiver: 'Y',
          brewerAddress: '1234 Main Street',
          brewerCity: 'Anytown',
          brewerState: 'CO',
          brewerZip: '80000',
          brewerCountry: 'United States',
          brewerPhone1: '1234567890',
          // The legitimate path: an authenticated admin may still choose a
          // non-default userLevel explicitly.
          userLevel: '1',
        },
      }
    );

    const rows = await query<{ id: number; userLevel: string }>(
      'SELECT id, userLevel FROM users WHERE user_name = ?', [email]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].userLevel).toBe('1');

    await query('DELETE FROM brewer WHERE uid = ?', [rows[0].id]);
    await query('DELETE FROM staff WHERE uid = ?', [rows[0].id]);
    await query('DELETE FROM users WHERE id = ?', [rows[0].id]);
  });

  test("a non-admin entrant cannot change another user's password via change_user_password", async ({ page, browser, baseURL }) => {
    const victimCtx = await browser.newContext();
    const victimPage = await victimCtx.newPage();
    const victim = await registerEntrant(victimPage);
    const [{ id: victimId, password: victimHashBefore }] = await query<{ id: number; password: string }>(
      'SELECT id, password FROM users WHERE user_name = ?', [victim.email]
    );
    await victimCtx.close();

    const attackerCtx = await browser.newContext();
    const attackerPage = await attackerCtx.newPage();
    const attacker = await registerEntrant(attackerPage);
    // Any ordinary logged-in page carries a fresh CSRF token tied to this session.
    await attackerPage.goto('/index.php?section=brew&go=entry&action=add');
    const token = await getToken(attackerPage);

    await attackerPage.request.post(
      `/includes/process.inc.php?section=admin&go=change_user_password&action=edit&dbTable=users&id=${victimId}`,
      {
        headers: { referer: `${baseURL}/index.php?section=brew&go=entry&action=add` },
        form: { token, userEdit: '1', password: 'HackedByAttacker1!' },
      }
    );
    await attackerCtx.close();

    const [{ password: victimHashAfter }] = await query<{ password: string }>(
      'SELECT password FROM users WHERE id = ?', [victimId]
    );
    // The attack must be blocked: a non-admin entrant's POST must not change
    // another user's password hash at all.
    expect(victimHashAfter).toBe(victimHashBefore);

    const [{ id: attackerId }] = await query<{ id: number }>('SELECT id FROM users WHERE user_name = ?', [attacker.email]);
    await query('DELETE FROM brewer WHERE uid IN (?, ?)', [victimId, attackerId]);
    await query('DELETE FROM staff WHERE uid IN (?, ?)', [victimId, attackerId]);
    await query('DELETE FROM users WHERE id IN (?, ?)', [victimId, attackerId]);
  });

  test('an admin can change any participant\'s password via change_user_password', async ({ page, browser, baseURL }) => {
    const targetCtx = await browser.newContext();
    const targetPage = await targetCtx.newPage();
    const target = await registerEntrant(targetPage);
    const [{ id: targetId }] = await query<{ id: number }>('SELECT id FROM users WHERE user_name = ?', [target.email]);
    await targetCtx.close();

    await loginAsAdmin(page);
    // The real admin UI link (admin/participants.admin.php's build_action_link
    // call) navigates here with dbTable=default, not dbTable=users - that
    // param is for db_tables.inc.php's archive-table switching and produces
    // a bogus "brewer_" table name for any other value. Only the POST target
    // (process.inc.php's routing) needs dbTable=users.
    await page.goto(`/index.php?section=admin&go=change_user_password&action=edit&dbTable=default&id=${targetId}`);
    const token = await getToken(page);

    const newPassword = 'AdminReset123!';
    await page.request.post(
      `/includes/process.inc.php?section=admin&go=change_user_password&action=edit&dbTable=users&id=${targetId}`,
      {
        headers: { referer: `${baseURL}/index.php?section=admin&go=change_user_password&action=edit&dbTable=default&id=${targetId}` },
        form: { token, userEdit: '1', password: newPassword },
      }
    );

    // Prove it actually took effect by logging in with the new password.
    const verifyCtx = await browser.newContext();
    const verifyPage = await verifyCtx.newPage();
    await login(verifyPage, target.email, newPassword);
    await verifyCtx.close();

    await query('DELETE FROM brewer WHERE uid = ?', [targetId]);
    await query('DELETE FROM staff WHERE uid = ?', [targetId]);
    await query('DELETE FROM users WHERE id = ?', [targetId]);
  });

  test("a non-admin entrant cannot change another user's username", async ({ page, browser, baseURL }) => {
    const victimCtx = await browser.newContext();
    const victimPage = await victimCtx.newPage();
    const victim = await registerEntrant(victimPage);
    const [{ id: victimId, user_name: victimNameBefore }] = await query<{ id: number; user_name: string }>(
      'SELECT id, user_name FROM users WHERE user_name = ?', [victim.email]
    );
    await victimCtx.close();

    const attackerCtx = await browser.newContext();
    const attackerPage = await attackerCtx.newPage();
    const attacker = await registerEntrant(attackerPage);
    await attackerPage.goto('/index.php?section=brew&go=entry&action=add');
    const token = await getToken(attackerPage);

    const stolenName = `pwned-${Date.now()}@example.com`;
    await attackerPage.request.post(
      `/includes/process.inc.php?section=user&go=username&action=edit&dbTable=users&filter=default&id=${victimId}`,
      {
        headers: { referer: `${baseURL}/index.php?section=brew&go=entry&action=add` },
        form: {
          token,
          userEdit: '1',
          user_name_old: victim.email,
          user_name: stolenName,
          sure: 'Y',
        },
      }
    );
    await attackerCtx.close();

    const [{ user_name: victimNameAfter }] = await query<{ user_name: string }>(
      'SELECT user_name FROM users WHERE id = ?', [victimId]
    );
    // The attack must be blocked: a non-owner, non-admin POST must not
    // change another user's username/email.
    expect(victimNameAfter).toBe(victimNameBefore);

    const [{ id: attackerId }] = await query<{ id: number }>('SELECT id FROM users WHERE user_name = ?', [attacker.email]);
    await query('DELETE FROM brewer WHERE uid IN (?, ?)', [victimId, attackerId]);
    await query('DELETE FROM staff WHERE uid IN (?, ?)', [victimId, attackerId]);
    await query('DELETE FROM users WHERE id IN (?, ?)', [victimId, attackerId]);
  });

  test('a user can change their own username', async ({ page, browser, baseURL }) => {
    const ctx = await browser.newContext();
    const entrantPage = await ctx.newPage();
    const entrant = await registerEntrant(entrantPage);
    const [{ id: userId }] = await query<{ id: number }>('SELECT id FROM users WHERE user_name = ?', [entrant.email]);

    await entrantPage.goto(`/index.php?section=user&action=username&filter=default&id=${userId}`);
    const token = await getToken(entrantPage);

    const newEmail = `access-control-self-${Date.now()}@example.com`;
    await entrantPage.request.post(
      `/includes/process.inc.php?section=user&go=username&action=edit&dbTable=users&filter=default&id=${userId}`,
      {
        headers: { referer: `${baseURL}/index.php?section=user&action=username&filter=default&id=${userId}` },
        form: {
          token,
          userEdit: '1',
          user_name_old: entrant.email,
          user_name: newEmail,
          sure: 'Y',
        },
      }
    );
    await ctx.close();

    const [{ user_name: userNameAfter }] = await query<{ user_name: string }>(
      'SELECT user_name FROM users WHERE id = ?', [userId]
    );
    expect(userNameAfter).toBe(newEmail);

    await query('DELETE FROM brewer WHERE uid = ?', [userId]);
    await query('DELETE FROM staff WHERE uid = ?', [userId]);
    await query('DELETE FROM users WHERE id = ?', [userId]);
  });

  test("an admin can change another participant's username", async ({ page, browser, baseURL }) => {
    const targetCtx = await browser.newContext();
    const targetPage = await targetCtx.newPage();
    const target = await registerEntrant(targetPage);
    const [{ id: targetId }] = await query<{ id: number }>('SELECT id FROM users WHERE user_name = ?', [target.email]);
    await targetCtx.close();

    await loginAsAdmin(page);
    const [{ id: adminId }] = await query<{ id: number }>('SELECT id FROM users WHERE user_name = ?', [ADMIN.email]);
    await page.goto(`/index.php?section=user&action=username&filter=admin&id=${targetId}`);
    const token = await getToken(page);

    const newEmail = `access-control-admin-change-${Date.now()}@example.com`;
    await page.request.post(
      `/includes/process.inc.php?section=user&go=username&action=edit&dbTable=users&filter=admin&id=${targetId}`,
      {
        headers: { referer: `${baseURL}/index.php?section=user&action=username&filter=admin&id=${targetId}` },
        form: {
          token,
          userEdit: '1',
          user_name_old: target.email,
          user_name: newEmail,
          sure: 'Y',
          relocate: `${baseURL}/index.php?section=admin&go=participants`,
        },
      }
    );

    // Confirm the admin's own session/account (id used only for the
    // targetId != adminId sanity check below) was not itself touched.
    expect(targetId).not.toBe(adminId);

    const [{ user_name: userNameAfter }] = await query<{ user_name: string }>(
      'SELECT user_name FROM users WHERE id = ?', [targetId]
    );
    expect(userNameAfter).toBe(newEmail);

    await query('DELETE FROM brewer WHERE uid = ?', [targetId]);
    await query('DELETE FROM staff WHERE uid = ?', [targetId]);
    await query('DELETE FROM users WHERE id = ?', [targetId]);
  });
});

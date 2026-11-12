import { test, expect } from '@playwright/test';
import { query } from '../helpers/db';
import { registerEntrant } from '../helpers/auth';

/**
 * includes/process/process_users_setup.inc.php gates admin-user creation on
 * (logged in) OR ($section == "setup"). Upstream (and this app's own
 * $setup_free_access config flag, which the condition is meant to mirror)
 * gates it on $setup_free_access instead — a config value, not a request
 * parameter. On this branch the gate checks the request's own `section`
 * value, which the requester controls, so any anonymous visitor who has
 * loaded one ordinary page (for a session + CSRF token) can create a
 * userLevel=0 (super admin) account without ever logging in.
 */
test('an anonymous visitor cannot create an admin user via section=setup', async ({ page, baseURL }) => {
  // Load an ordinary anonymous page to get a session + CSRF token, exactly
  // as any real visitor would.
  await page.goto('/index.php?section=register&go=entrant');
  const token = await page.locator('input[name="token"]').first().inputValue();
  expect(token).toBeTruthy();

  const email = `bypass-${Date.now()}@example.com`;

  const resp = await page.request.post('/includes/process.inc.php?section=setup&action=add&dbTable=users', {
    headers: { referer: baseURL! },
    form: {
      token,
      user_name: email,
      password: 'Sup3rSecret!',
      userLevel: '0',
      userQuestion: 'Randomly generated.',
      userQuestionAnswer: 'whatever',
    },
  });

  // Whatever the app does at the HTTP layer, the row must not exist.
  const rows = await query('SELECT userLevel FROM users WHERE user_name = ?', [email]);
  expect(rows).toHaveLength(0);
});

/**
 * Finding C1: the gate's "already logged in" half (restored by the fix
 * above) only checked isset($_SESSION['loginUsername']) &&
 * isset($_SESSION['userLevel']) - true for ANY logged-in user, including a
 * self-registered entrant (userLevel 2). Nothing downstream checks the
 * POSTed userLevel before the insert, so a logged-in entrant could still
 * create a live super-admin (userLevel=0) account. The fix requires the
 * acting session's own userLevel to be 0 (super admin) for this path,
 * matching the pattern process_users.inc.php already uses for its
 * section=="admin" add-user branch ($_SESSION['userLevel'] <= 1).
 */
test('a logged-in entrant cannot escalate to super admin via section=setup', async ({ page, baseURL }) => {
  await registerEntrant(page);
  // Any ordinary logged-in entrant page carries a fresh CSRF token tied to
  // this session; the entry-add form is one such page.
  await page.goto('/index.php?section=list');
  await page.getByRole('link', { name: /add.*entry/i }).first().click();
  const token = await page.locator('input[name="token"]').first().inputValue();
  expect(token).toBeTruthy();

  const email = `entrant-escalate-${Date.now()}@example.com`;

  await page.request.post('/includes/process.inc.php?section=setup&action=add&dbTable=users', {
    headers: { referer: page.url() },
    form: {
      token,
      user_name: email,
      password: 'Sup3rSecret!',
      userLevel: '0',
      userQuestion: 'Randomly generated.',
      userQuestionAnswer: 'whatever',
    },
  });

  // Whatever the app does at the HTTP layer, no super-admin row must exist.
  const rows = await query('SELECT userLevel FROM users WHERE user_name = ? AND userLevel = 0', [email]);
  expect(rows).toHaveLength(0);
});

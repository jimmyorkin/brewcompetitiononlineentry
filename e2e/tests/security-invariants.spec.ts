import { test, expect } from '@playwright/test';
import { ADMIN, login, loginAsAdmin, registerEntrant } from '../helpers/auth';

/**
 * Authorization invariants from the design spec (Section 5). Invariants that
 * already hold are plain tests and MUST stay green forever. Invariants that
 * current code violates are `test.fixme` — Phase 1 removes the annotation as
 * each security fix lands, turning these into its acceptance tests.
 */

test('anonymous user cannot reach the admin section', async ({ page }) => {
  await page.goto('/index.php?section=admin');
  // index.php redirects anonymous admin hits to ?msg=0 (login prompt).
  await expect(page).toHaveURL(/msg=0/);
  await expect(page.locator('a[href*="go=judging_tables"]')).toHaveCount(0);
});

test('anonymous user cannot reach account pages', async ({ page }) => {
  await page.goto('/index.php?section=list');
  // index.php redirects anonymous account-page hits to ?msg=99.
  await expect(page).toHaveURL(/msg=99/);
});

test('entrant cannot reach the admin section', async ({ page }) => {
  await registerEntrant(page);
  await page.goto('/index.php?section=admin');
  // index.php redirects userLevel > 1 (entrant) admin hits to ?msg=4.
  await expect(page).toHaveURL(/msg=4/);
  await expect(page.locator('a[href*="go=judging_tables"]')).toHaveCount(0);
});

test('pdf download denies an anonymous request', async ({ page }) => {
  // handle.php's not-logged-in guard redirects any direct hit to 403.php,
  // which the app's routing resolves to the section=403 error page.
  const resp = await page.goto(
    '/handle.php?section=pdf-download&id=' + encodeURIComponent('../../../../etc/passwd'));
  expect(resp?.url()).toMatch(/403\.php|section=403/);
});

// P1-SEC-005: fixed — handle.php now restricts $id to a safe character set
// (no separators, no "..") and independently confirms the resolved realpath()
// still falls inside USER_DOCS before reading anything.
test('pdf download rejects path traversal for a logged-in user', async ({ page }) => {
  await registerEntrant(page); // endpoint requires any authenticated session
  const resp = await page.request.get(
    '/handle.php?section=pdf-download&id=' + encodeURIComponent('../../../../etc/passwd'));
  expect([400, 403, 404]).toContain(resp.status());
});

test('pdf download rejects a bare ".." id', async ({ page }) => {
  await registerEntrant(page);
  const resp = await page.request.get('/handle.php?section=pdf-download&id=..');
  expect([400, 403, 404]).toContain(resp.status());
});

test('pdf download rejects backslash traversal', async ({ page }) => {
  await registerEntrant(page);
  const resp = await page.request.get(
    '/handle.php?section=pdf-download&id=' + encodeURIComponent('..\\..\\windows\\win.ini'));
  expect([400, 403, 404]).toContain(resp.status());
});

test('save endpoint rejects an anonymous write', async ({ page }) => {
  // ajax/save.ajax.php must not persist anything for an unauthenticated caller.
  const resp = await page.request.get('/ajax/save.ajax.php');
  const body = await resp.text();
  // It returns a rejection envelope (status 9, no query executed) rather than
  // a saved/success payload.
  expect(body).not.toMatch(/"status":\s*"?0"?/);
  expect(body).not.toMatch(/success|saved/i);
});

// P1-SEC-002 / critical auth-bypass: the login POST's "section=update" branch
// (a leftover 1.3.0.0 migration path) used to compute the real password check
// and then unconditionally overwrite it to success — any existing username +
// ANY password logged in as that user, no injection required. Fixed by
// parameterizing the lookup and removing the `$check = 1` override.
test('login rejects a wrong password via the legacy section=update bypass path', async ({ page }) => {
  await page.goto('/index.php?section=register&go=entrant');
  // 2.7 names the CSRF field "token" (3.x renamed it user_session_token). The
  // update path is *not* in process.inc.php's token-bypass list, so it is required.
  const token = await page.locator('form#submit-form input[name="token"]').inputValue();

  const resp = await page.request.post('/includes/process.inc.php?section=update&action=login', {
    headers: { referer: page.url() },
    form: {
      loginUsername: ADMIN.email,
      loginPassword: 'definitely-not-the-real-password',
      token,
    },
  });
  // The invariant is "not authenticated": before the fix this redirected to
  // update.php (logged in). A rejection is msg=11 on 3.x, section=login&msg=1 on 2.7.
  expect(resp.url()).not.toMatch(/update\.php/);
  expect(resp.url()).toMatch(/msg=11?(&|$)/);
});

// P1-SEC-001: the seeded admin's stored hash is legacy-scheme (phpass over
// md5(password)) — this proves the legacy-scheme fallback still authenticates
// correctly post-fix, not just that a wrong password is rejected.
test('the seeded admin (legacy-scheme hash) can still log in with the correct password', async ({ page }) => {
  await loginAsAdmin(page);
});

// P1-SEC-001 round-trip: a freshly registered entrant's password is hashed
// with the new scheme (no md5 pre-hash) — proves the write path and the
// read path (login) agree on the same scheme.
test('a freshly registered entrant can log out and log back in (new-scheme hash round-trips)', async ({ page }) => {
  const { email, password } = await registerEntrant(page);
  // The Log Out link sits in a collapsed nav menu (not clickable), so follow its
  // href directly — with the Referer a real click would send: process.inc.php
  // rejects referer-less requests (msg=98) without logging out.
  const logoutHref = await page.locator('a[href*="logout"]').first().getAttribute('href');
  await page.goto(logoutHref!, { referer: page.url() });
  await login(page, email, password);
});

// P1-SEC-006: session fixation — the session id must change on login, not
// just the authentication state within the same session.
test('login regenerates the session id (prevents fixation)', async ({ page }) => {
  await page.goto('/index.php');
  const cookiesBefore = await page.context().cookies();
  // The app names its session cookie md5(installation_id) — deterministic
  // per install but not hardcoded here; there is exactly one cookie for a
  // fresh anonymous context.
  const sessionCookieName = cookiesBefore[0]?.name;
  expect(sessionCookieName).toBeTruthy();
  const before = cookiesBefore[0]?.value;

  await loginAsAdmin(page);

  const cookiesAfter = await page.context().cookies();
  const after = cookiesAfter.find(c => c.name === sessionCookieName)?.value;
  expect(after).toBeDefined();
  expect(after).not.toBe(before);
});

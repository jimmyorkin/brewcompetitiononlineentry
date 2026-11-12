import { test, expect } from '@playwright/test';

// P1: sections/login.sec.php built its "verify security question" lookup
// query with sprintf() straight from $_POST['loginUsername'] (or the
// `username` URL param), unauthenticated, no escaping at all - the same
// class of bug already fixed in includes/logincheck.inc.php and
// includes/forgot_password.inc.php (see forgot-password-sqli.spec.ts, which
// deliberately routes around this exact query to isolate its own
// assertion).
//
// The real UI reaches this query via the "forgot password" flow's second
// step: the email-only form on ?action=forgot&go=password POSTs
// loginUsername to ?section=login&go=verify&action=forgot, which renders
// login.sec.php directly (not through process.inc.php) with that POST value.
test('login verify-security-question lookup survives a single quote/OR payload', async ({ page }) => {
  const resp = await page.request.post('/index.php?section=login&go=verify&action=forgot', {
    form: {
      loginUsername: "nobody' OR '1'='1",
    },
  });
  const body = await resp.text();

  // Unknown username -> the "no email address in the system matches"
  // warning, not a match against some unrelated real account (which an
  // OR-based injection against the unparameterized query would produce by
  // returning the first row in the table, e.g. the seeded baseline admin).
  expect(body).toContain('There is no email address in the system that matches the one you entered.');
  expect(body).not.toContain('Your security question is...');
});

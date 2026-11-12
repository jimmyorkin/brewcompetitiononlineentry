import { test, expect } from '@playwright/test';

// P1: includes/forgot_password.inc.php built its lookup query with sprintf()
// straight from $_POST['loginUsername'], unauthenticated, no escaping at all.
//
// The real forgot-password UI reaches this endpoint only via a two-step flow
// (an email field on ?action=forgot, then a security-question form whose
// hidden loginUsername field is populated by an intermediate, out-of-scope
// query in sections/login.sec.php). That intermediate query is itself
// unescaped and would confound a UI-driven test of this specific file: an
// OR-based payload matches a real row there too, before ever reaching the
// code under test. So this test talks to the
// includes/process.inc.php?section=forgot&action=forgot endpoint directly
// (same pattern as the P1-SEC-002 test in security-invariants.spec.ts),
// isolating the assertion to $query_forgot in forgot_password.inc.php.
test('forgot-password lookup survives a single quote in the username', async ({ page }) => {
  // Establish a session/referer-eligible context first; process.inc.php
  // rejects requests without a matching same-origin referer (msg=98).
  await page.goto('/index.php?section=login&go=password&action=forgot');

  const resp = await page.request.post('/includes/process.inc.php?section=forgot&action=forgot', {
    headers: { referer: page.url() },
    form: {
      loginUsername: "nobody' OR '1'='1",
      userQuestionAnswer: 'wrong-answer',
    },
  });

  // Unknown username -> msg=1 ("no such account"), not a 500 and not a
  // successful match against some unrelated real account (which an
  // OR-based injection against the unparameterized query would produce).
  expect(resp.url()).toMatch(/msg=1(&|$)/);
});

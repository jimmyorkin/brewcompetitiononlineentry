import { Page, expect } from '@playwright/test';

/** Seeded by sql/bcoem_baseline_2.7.X.sql (userLevel 0 = super admin). */
export const ADMIN = {
  email: 'user.baseline@brewingcompetitions.com',
  password: 'bcoem',
};

/**
 * Log in through the standalone login page (?section=login). The 2.7 UI has
 * no login modal: the nav "Log In" link goes to a page whose form posts to
 * process.inc.php?section=login&action=login.
 */
export async function login(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/index.php?section=login');
  await page.fill('input[name="loginUsername"]', email);
  await page.fill('input[name="loginPassword"]', password);
  await page.locator('form:has(input[name="loginUsername"]) button[name="submit"]').first().click();
  // Any logged-in state carries a log-out link in the nav. It may sit inside
  // a collapsed menu, so assert presence in the DOM, not visibility.
  await expect(
    page.locator('a[href*="logout"], a:has-text("Log Out")').first()
  ).toBeAttached();
}

export async function loginAsAdmin(page: Page): Promise<void> {
  await login(page, ADMIN.email, ADMIN.password);
}

export interface EntrantCreds { email: string; password: string; }

/**
 * Register a fresh entrant through the real public form
 * (?section=register&go=entrant). Requires prefsCAPTCHA=0 — pinned by
 * docker/03-e2e-fixtures.sql (see that file's header for the why).
 * A successful registration logs the new user in.
 */
export async function registerEntrant(page: Page): Promise<EntrantCreds> {
  const email = `e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
  const password = 'E2eTest123!';

  await page.goto('/index.php?section=register&go=entrant');
  // The page also carries the nav login form, so scope to the registration form.
  const form = page.locator('form#submit-form');
  await form.locator('input[name="user_name"]').fill(email);
  await form.locator('input[name="user_name2"]').fill(email);   // email confirmation
  await form.locator('input[name="password"]').fill(password);  // no password-confirm field in 2.7
  // Security question radios: the first is pre-checked; just answer it.
  await form.locator('input[name="userQuestionAnswer"]').fill('hops');
  await form.locator('input[name="brewerFirstName"]').fill('E2e');
  await form.locator('input[name="brewerLastName"]').fill('Entrant');
  // bootstrap-select widgets: the native <select> is hidden but remains the
  // submitted control, so set it directly with force. Option values are the
  // country name / state code / drop-off id.
  await form.locator('select[name="brewerCountry"]').selectOption('United States', { force: true });
  await form.locator('input[name="brewerAddress"]').fill('1 Test Street');
  await form.locator('input[name="brewerCity"]').fill('Testville');
  await form.locator('select[name="brewerStateUS"]').selectOption('TX', { force: true });
  await form.locator('input[name="brewerZip"]').fill('75001');
  await form.locator('input[name="brewerPhone1"]').fill('555-555-0100');
  // Seeded drop-off location (value "1"); "Shipping Entries" is 0.
  await form.locator('select[name="brewerDropOff"]').selectOption('1', { force: true });
  await form.locator('button#form-submit-button').click();

  await expect(
    page.locator('a[href*="logout"], a:has-text("Log Out")').first()
  ).toBeAttached();
  return { email, password };
}

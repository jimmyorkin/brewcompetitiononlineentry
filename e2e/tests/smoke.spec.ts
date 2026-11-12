import { test, expect } from '@playwright/test';
import { loginAsAdmin, registerEntrant } from '../helpers/auth';

test('home page renders the competition site', async ({ page }) => {
  const resp = await page.goto('/index.php');
  expect(resp?.status()).toBe(200);
  await expect(page).toHaveTitle(/Brew Competition Online Entry/);
});

test('login modal opens and renders its form fields', async ({ page }) => {
  await page.goto('/index.php');
  // The nav "Log In" trigger is <a href="#" role="button" data-toggle="modal"
  // data-target="#loginModal">, so it is a *button* to the accessibility tree
  // (a second plain link goes to the standalone ?section=login page). The
  // modal's fields exist in the DOM but are hidden until opened.
  await page.getByRole('button', { name: 'Log In', exact: true }).click();
  await expect(page.locator('input[name="loginUsername"]')).toBeVisible();
  await expect(page.locator('input[name="loginPassword"]')).toBeVisible();
});

test('seeded admin can log in and reach the dashboard', async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto('/index.php?section=admin');
  await expect(page).toHaveURL(/section=admin/);
});

test('a fresh entrant can register and lands logged in', async ({ page }) => {
  await registerEntrant(page);
});

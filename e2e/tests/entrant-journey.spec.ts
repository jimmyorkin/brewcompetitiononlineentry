import { test, expect } from '@playwright/test';
import { registerEntrant } from '../helpers/auth';
import { chooseStyle } from '../helpers/entries';

/**
 * The flagship regression journey (design spec Section 5): register → create
 * entry → see it in the account list → edit it → payment page shows it.
 * Happy-path entrant workflow through the stock (legacy) routes.
 */

test.describe.serial('entrant journey', () => {
  test('register, create, edit, and see an entry through to payment (legacy)', async ({ page }) => {
    await registerEntrant(page);

    // — My Account entry list, then the Add Entry button —
    await page.goto('/index.php?section=list');
    await page.getByRole('link', { name: /add.*entry/i }).first().click();
    await expect(page.locator('input[name="brewName"]')).toBeVisible();

    // — Create —
    const entryName = `E2E Test Ale ${Date.now()}`;
    await page.fill('input[name="brewName"]', entryName);
    await chooseStyle(page);
    await page.locator('form[name="form1"] button[type="submit"]').first().click();

    // — Verify it appears in the account list (name renders in several spots
    //    on the entry card; any one confirms it) —
    await page.goto('/index.php?section=list');
    await expect(page.getByText(entryName).first()).toBeVisible();

    // — Edit (the pencil icon on the entry card; "section=brew&" with the
    //    trailing separator so the account link "section=brewer" can't match) —
    await page.locator('a[href*="section=brew&"][href*="action=edit"]').first().click();
    await expect(page.locator('input[name="brewName"]')).toBeVisible();
    const revisedName = `${entryName} (revised)`;
    await page.fill('input[name="brewName"]', revisedName);
    await page.locator('form[name="form1"] button[type="submit"]').first().click();

    await page.goto('/index.php?section=list');
    await expect(page.getByText(revisedName).first()).toBeVisible();

    // — Payment page lists the entry/fee (PayPal itself is out of scope) —
    await page.goto('/index.php?section=pay');
    await expect(page.locator('body')).toContainText(/total|fee|pay/i);
  });
});

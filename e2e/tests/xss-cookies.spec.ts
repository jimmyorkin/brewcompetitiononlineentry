import { test, expect } from '@playwright/test';

/**
 * P1-SEC-003: the register and contact forms refill their fields from cookies
 * (set after a failed submit). Cookie values are attacker-controlled, so they
 * must be HTML-escaped when echoed back into the page.
 *
 * Each test plants a payload that would inject an element with a known id if it
 * were echoed raw, then checks (a) no such element exists and (b) the field's
 * value is the payload verbatim, i.e. it was escaped, not silently dropped.
 */

const INJECTED = 'cookie-xss';
const ATTR_PAYLOAD = `"><img id="${INJECTED}" src="x">`;
const TEXTAREA_PAYLOAD = `</textarea><img id="${INJECTED}" src="x">`;

async function plant(context: import('@playwright/test').BrowserContext, baseURL: string, cookies: Record<string, string>) {
  await context.addCookies(
    Object.entries(cookies).map(([name, value]) => ({ name, value: encodeURIComponent(value), url: baseURL })),
  );
}

test.describe('cookie values are escaped when echoed into forms', () => {
  test('register form text inputs', async ({ page, context, baseURL }) => {
    await plant(context, baseURL!, {
      brewerFirstName: ATTR_PAYLOAD,
      brewerLastName: ATTR_PAYLOAD,
      brewerAddress: ATTR_PAYLOAD,
      brewerCity: ATTR_PAYLOAD,
      brewerZip: ATTR_PAYLOAD,
      user_name: ATTR_PAYLOAD,
      userQuestionAnswer: ATTR_PAYLOAD,
    });
    await page.goto('/index.php?section=register&go=entrant&msg=3');

    await expect(page.locator(`#${INJECTED}`)).toHaveCount(0);
    for (const id of ['brewerFirstName', 'brewerAddress', 'brewerCity', 'brewerZip', 'user_name', 'userQuestionAnswer']) {
      await expect(page.locator(`form#submit-form #${id}`)).toHaveValue(ATTR_PAYLOAD);
    }
  });

  test('register form security question radio', async ({ page, context, baseURL }) => {
    await plant(context, baseURL!, { userQuestion: ATTR_PAYLOAD });
    await page.goto('/index.php?section=register&go=entrant&msg=3');

    await expect(page.locator(`#${INJECTED}`)).toHaveCount(0);
    expect(await page.locator('input[name="userQuestion"]').evaluateAll(els => els.map(e => (e as HTMLInputElement).value)))
      .toContain(ATTR_PAYLOAD);
  });

  test('contact form fields and message textarea', async ({ page, context, baseURL }) => {
    await plant(context, baseURL!, {
      from_name: ATTR_PAYLOAD,
      from_email: ATTR_PAYLOAD,
      subject: ATTR_PAYLOAD,
      message: TEXTAREA_PAYLOAD,
    });
    await page.goto('/index.php?section=contact&msg=2');

    await expect(page.locator(`#${INJECTED}`)).toHaveCount(0);
    await expect(page.locator('#from-name')).toHaveValue(ATTR_PAYLOAD);
    await expect(page.locator('#subject')).toHaveValue(ATTR_PAYLOAD);
    await expect(page.locator('#message')).toHaveValue(TEXTAREA_PAYLOAD);
  });
});

import { Page } from '@playwright/test';

/**
 * Enter a value into one of 2.7's datetime-picker text inputs (e.g.
 * judgingDate). The picker pre-fills "now" and treats Playwright's fill() as
 * an append, then snaps back to today on blur - so a plain fill() silently
 * saves TODAY, which flips $judging_started and closes entry for every other
 * test sharing the DB. Select-all and type instead.
 */
export async function fillDateTime(page: Page, name: string, value: string): Promise<void> {
  const input = page.locator(`input[name="${name}"]`);
  await input.click();
  await input.press('ControlOrMeta+a');
  await input.pressSequentially(value);
}

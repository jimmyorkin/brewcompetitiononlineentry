import { Browser, Page, expect } from '@playwright/test';
import { registerEntrant } from './auth';

export const FULL_MSG = 'The Medal category is full.';                      // msg=13
export const ENTRANT_TABLE_MSG = 'Entrant entry count in table is full.';   // msg=bbo3
export const TOO_SOON_MSG = 'Entering too soon after previous add. Entry rate is 1 per 60 seconds.'; // msg=bbo4

let seq = 0;
/** Unique entry name; the "BBO " prefix is what purgeBboTestEntries() matches. */
export const bboName = (tag: string) => `BBO ${tag} ${Date.now()}-${seq++}`;

/**
 * Submit the add-entry form for one style. `styleValue` is the option value
 * ("26-A", "21-A": group-num, no zero padding). With force=true the option's
 * `disabled` flag (set by Bluebonnet's patch when the table is full) is removed
 * first, so the SERVER-side check is exercised, not just the form's UI guard.
 * With force=true it also submits the form directly, skipping the disabled button
 * and the 60s countdown modal. Returns the URL the app redirected to.
 */
export async function submitEntry(page: Page, styleValue: string, name: string, force = false): Promise<string> {
  await page.goto('/index.php?section=brew&go=entry&action=add');
  await expect(page.locator('input[name="brewName"]')).toBeVisible();
  await page.fill('input[name="brewName"]', name);
  await page.evaluate(([value, forceIt]) => {
    const sel = document.querySelector<HTMLSelectElement>('select[name="brewStyle"]')!;
    const opt = Array.from(sel.options).find(o => o.value === value);
    if (!opt) throw new Error(`style option ${value} not found`);
    if (forceIt) opt.disabled = false;
    sel.value = value;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  }, [styleValue, force] as const);
  if (force) {
    // Bypass client-side guards (disabled submit, countdown modal covering the form)
    // so the SERVER check is what answers. HTMLFormElement.prototype.submit is used
    // because the button is named "submit", which shadows form.submit().
    await page.evaluate(() => HTMLFormElement.prototype.submit.call(document.querySelector('form[name="form1"]')));
  } else {
    await page.locator('form[name="form1"] button[type="submit"]').first().click();
  }
  await page.waitForURL(/section=list/);
  return page.url();
}

/** Fresh entrant + one entry in `styleValue`, in a throwaway context. */
export async function entrantWithEntry(browser: Browser, styleValue: string, name: string): Promise<void> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await registerEntrant(page);
  const url = await submitEntry(page, styleValue, name);
  expect(url).not.toMatch(/msg=(13|bbo\d)/);
  await ctx.close();
}

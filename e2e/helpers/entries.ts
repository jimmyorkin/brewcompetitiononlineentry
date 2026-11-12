import { Browser, Page, expect } from '@playwright/test';
import { registerEntrant } from './auth';

export interface StyleChoice { value: string; label: string; name: string; }
export interface CreatedEntry { entryName: string; styleId: string; styleLabel: string; styleName: string; }

/**
 * Pick a style on the brew form. The style <select> is a Tom Select widget
 * whose native control stays the submitted form element; options are built
 * from the styles table (value = styles.id) and specialty styles require
 * extra info fields, so choose a plain IPA/ale-family option by text.
 */
export async function chooseStyle(page: Page): Promise<StyleChoice> {
  return page.evaluate(() => {
    const sel = document.querySelector<HTMLSelectElement>('select[name="brewStyle"]');
    if (!sel) throw new Error('brewStyle select not found');
    const opt = Array.from(sel.options).find(
      o => !o.disabled && o.value !== '' && /IPA|Pale Ale|Amber|Lager/i.test(o.text)
    ) ?? Array.from(sel.options).find(o => !o.disabled && o.value !== '');
    if (!opt) throw new Error('no selectable style option');
    sel.value = opt.value;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    const label = opt.text.trim();
    // Option text is "{styleCode} {style name}[ suit-symbols]", e.g.
    // "21A American IPA ♦". The bare name is what admin pages display.
    const name = label.replace(/^\S+\s+/, '').replace(/\s*[♠♦♣♥].*$/, '').trim();
    return { value: opt.value, label, name };
  });
}

/**
 * In a throwaway browser context: register a fresh entrant and create one
 * entry. Returns the entry name and the style id it was entered under
 * (which matches the tableStyles[] checkbox values on the admin
 * judging-tables form). The context is closed before returning.
 */
export async function createEntrantWithEntry(browser: Browser): Promise<CreatedEntry> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await registerEntrant(page);

  await page.goto('/index.php?section=list');
  await page.getByRole('link', { name: /add.*entry/i }).first().click();
  await expect(page.locator('input[name="brewName"]')).toBeVisible();

  const entryName = `E2E Entry ${Date.now()}-${Math.floor(Math.random() * 1e4)}`;
  await page.fill('input[name="brewName"]', entryName);
  const style = await chooseStyle(page);
  await page.locator('form[name="form1"] button[type="submit"]').first().click();

  await page.goto('/index.php?section=list');
  await expect(page.getByText(entryName).first()).toBeVisible();
  await ctx.close();
  return { entryName, styleId: style.value, styleLabel: style.label, styleName: style.name };
}

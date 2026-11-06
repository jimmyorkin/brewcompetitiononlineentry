import { test, expect } from '@playwright/test';
import { registerEntrant, loginAsAdmin } from '../helpers/auth';
import { chooseStyle } from '../helpers/entries';
import { query } from '../helpers/db';

/**
 * SQLi migration phase 2, task 1a: lib/common.lib.php's financial/fee-total
 * functions - total_fees(), total_fees_paid(), total_not_paid_brewer(),
 * total_entries_brewer(), total_paid_received(), total_paid(), and
 * total_nopay_received() - converted from raw mysqli_query()/sprintf() to
 * MysqliDb builder calls (where()/get()/getOne()) or $db_conn->rawQueryOne()
 * with `?` placeholders, matching upstream/master's own conversion of the
 * same 7 functions byte-for-byte (including upstream's N+1-query batching
 * for total_fees()/total_fees_paid()'s "default" bid/filter branches).
 *
 * These are fee-total calculations read throughout entry/admin pages, so
 * the risk isn't injection alone - a wrong total is a silent, high-visibility
 * regression. Each test below asserts an actual computed total against a
 * known baseline, not just that the page renders.
 */

async function addEntry(page: import('@playwright/test').Page, name: string): Promise<void> {
  await page.goto('/index.php?section=list');
  await page.getByRole('link', { name: /add.*entry/i }).first().click();
  await expect(page.locator('input[name="brewName"]')).toBeVisible();
  await page.fill('input[name="brewName"]', name);
  await chooseStyle(page);
  await page.locator('form[name="form1"] button[type="submit"]').first().click();
}

test.describe('sqli migration phase 2 - common.lib.php financial/fee functions (task 1a)', () => {
  test('pay page and sidebar show the correct fee total, amount due, and unpaid count for two confirmed entries, one paid (total_fees / total_fees_paid / total_not_paid_brewer)', async ({ page }) => {
    test.slow();

    const [{ contestEntryFee }] = await query<{ contestEntryFee: number }>(
      'SELECT contestEntryFee FROM contest_info WHERE id = 1'
    );
    const fee = Number(contestEntryFee);

    await registerEntrant(page);

    const nameA = `E2E Fee Entry A ${Date.now()}`;
    const nameB = `E2E Fee Entry B ${Date.now()}`;
    await addEntry(page, nameA);
    await addEntry(page, nameB);

    // Both entries are created with the form's default brewConfirmed=1
    // hidden field - total_fees()/total_not_paid_brewer() only count
    // brewConfirmed='1' rows, so both are in scope without any extra setup.
    // Mark exactly one of the two paid directly in the DB: this is a pure
    // counting-function test (not a payment-flow test), and PayPal is out
    // of scope for this branch of the UI.
    await query('UPDATE brewing SET brewPaid = \'1\' WHERE brewName = ?', [nameA]);

    const expectedTotalFees = (fee * 2).toFixed(2);
    const expectedAmountDue = (fee * 1).toFixed(2); // total_fees - total_fees_paid
    const expectedUnpaidCount = '1'; // total_not_paid_brewer: 2 confirmed - 1 paid

    await page.goto('/index.php?section=pay');

    // total_fees() / total_fees_paid(): the lead paragraph states the total
    // entry fees and, since one of two entries remains unpaid, the amount
    // still due - both are formatted via number_format(…, 2).
    const payBody = await page.locator('body').innerText();
    expect(payBody, 'pay page shows the correct total entry fees (total_fees)').toContain(expectedTotalFees);
    expect(payBody, 'pay page shows the correct amount still due (total_fees - total_fees_paid)').toContain(expectedAmountDue);

    // total_not_paid_brewer(): the account-summary sidebar (shown on
    // section=list and section=pay for a logged-in entrant) lists the count
    // of confirmed-but-unpaid entries.
    const sidebarText = (await page.locator('.bcoem-sidebar-panel').allInnerTexts()).join(' | ');
    expect(sidebarText, 'sidebar shows the correct total entry fees (total_fees)').toContain(expectedTotalFees);
    expect(sidebarText, 'sidebar shows the correct unpaid-confirmed-entries count (total_not_paid_brewer)').toContain(expectedUnpaidCount);
  });

  test('judging-scores admin page denominator grows by exactly one when an entry becomes paid+received (total_paid_received)', async ({ browser, page }) => {
    // includes/db/entries.db.php calls total_paid_received("",0) on every
    // page load (the $go=="" branch, no WHERE at all) without incident, but
    // the branch worth a behavioural assertion is admin/judging_scores.admin.php's
    // $go=="judging_scores" call, which adds "WHERE brewPaid='1' AND brewReceived='1'"
    // and renders the count directly: "Scores have been entered for X of Y
    // entries marked as paid and received." This is a shared, long-lived
    // stack, so assert a delta (+1), not an absolute count.
    test.slow();
    const ctx = await browser.newContext();
    const entrantPage = await ctx.newPage();
    await registerEntrant(entrantPage);
    const entryName = `E2E PaidReceived Entry ${Date.now()}`;
    await addEntry(entrantPage, entryName);
    await ctx.close();

    await loginAsAdmin(page);
    await page.goto('/index.php?section=admin&go=judging_scores');
    const before = await page.locator('#score-entered-status-default').innerText();
    const beforeTotal = Number(before.match(/of (\d+) entries/)?.[1]);
    expect(Number.isFinite(beforeTotal), 'could parse the "of N entries" denominator').toBe(true);

    await query('UPDATE brewing SET brewPaid = \'1\', brewReceived = \'1\' WHERE brewName = ?', [entryName]);

    await page.goto('/index.php?section=admin&go=judging_scores');
    const after = await page.locator('#score-entered-status-default').innerText();
    const afterTotal = Number(after.match(/of (\d+) entries/)?.[1]);

    expect(afterTotal, 'paid+received denominator grew by exactly one entry').toBe(beforeTotal + 1);
  });

  test('entries admin page "Received Entries" count grows by exactly one when an entry is received but unpaid (total_nopay_received)', async ({ browser, page }) => {
    // admin/entries.admin.php's sidebar shows total_nopay_received("entries","default",comp_id),
    // which counts brewPaid='0' AND brewReceived='1' rows site-wide. Assert
    // a delta for the same shared-stack reason as above. The breakdown lives
    // in the "Entry Status" modal (hidden until opened via its button), not
    // inline on the page.
    test.slow();
    const ctx = await browser.newContext();
    const entrantPage = await ctx.newPage();
    await registerEntrant(entrantPage);
    const entryName = `E2E ReceivedUnpaid Entry ${Date.now()}`;
    await addEntry(entrantPage, entryName);
    await ctx.close();

    await loginAsAdmin(page);
    await page.goto('/index.php?section=admin&go=entries');
    await page.locator('button[data-target="#entryStatusModal"]').click();
    const receivedEntriesPanel = page.locator('#entryStatusModal .bcoem-sidebar-panel', { hasText: 'Received Entries' });
    await expect(receivedEntriesPanel).toBeVisible();
    const beforeText = await receivedEntriesPanel.innerText();
    const before = Number(beforeText.match(/(\d+)/)?.[1]);
    expect(Number.isFinite(before), 'could parse the "Received Entries" count').toBe(true);

    // brewPaid defaults to NULL on a fresh entrant-created entry (not '0'),
    // and total_nopay_received()'s WHERE brewPaid='0' doesn't match NULL in
    // MySQL - set it explicitly, matching how a real "received, unpaid"
    // entry ends up in this state in production.
    await query('UPDATE brewing SET brewPaid = \'0\', brewReceived = \'1\' WHERE brewName = ?', [entryName]);

    await page.goto('/index.php?section=admin&go=entries');
    await page.locator('button[data-target="#entryStatusModal"]').click();
    const receivedEntriesPanelAfter = page.locator('#entryStatusModal .bcoem-sidebar-panel', { hasText: 'Received Entries' });
    await expect(receivedEntriesPanelAfter).toBeVisible();
    const afterText = await receivedEntriesPanelAfter.innerText();
    const after = Number(afterText.match(/(\d+)/)?.[1]);

    expect(after, 'received-but-unpaid count grew by exactly one entry').toBe(before + 1);
  });
});

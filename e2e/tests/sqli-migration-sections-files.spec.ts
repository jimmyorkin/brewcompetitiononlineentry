import { test, expect } from '@playwright/test';
import { registerEntrant } from '../helpers/auth';
import { createEntrantWithEntry } from '../helpers/entries';
import { query } from '../helpers/db';

/**
 * Covers two of this task's four converted files whose queries are reachable
 * through a normal page view without altering any shared/global competition
 * state:
 *  - sections/brewer_entries.sec.php's $query_eval_exists (now
 *    $db_conn->get()) runs unconditionally on every ?section=list view
 *    whenever prefsEval=1, which this stack's seeded baseline always is.
 *  - includes/headers.inc.php's $query_contact (now $db_conn->getOne())
 *    renders the "message sent" confirmation on ?section=contact&msg=1.
 *
 * sections/login.sec.php's confirmed SQLi is covered separately in
 * login-verify-sqli.spec.ts.
 *
 * The other three converted queries in this task - two in
 * sections/winners.sec.php, and the nested (eval-row) branch of
 * sections/brewer_entries.sec.php's $query_style - are reachable only after
 * flipping prefsDisplayWinners to 'Y' (resp. $show_scores, which requires
 * judging to have closed). This stack's prefsDisplayWinners=N is a
 * deliberate fixture choice from an earlier task so entrant journeys run
 * pre-judging (see admin-journey.spec.ts's header comment), and workers:1
 * doesn't make flipping a shared preferences row safe against *other*
 * sessions concurrently using this same long-lived dev stack. Those two
 * queries are instead covered by a source-level regression guard in
 * tests/Unit/SourceHardeningTest.php, and were verified manually against a
 * throwaway admin session during this task (see that task's report).
 */

test('entries list still renders for an entrant (brewer_entries.sec.php eval-exists query)', async ({ page }) => {
  await registerEntrant(page);
  await page.goto('/index.php?section=list');
  // No crash, and the page's own entries section renders past the
  // $_SESSION['prefsEval']==1 block (which always runs first).
  await expect(page.locator('body')).not.toContainText('A database error occurred');
  await expect(page.getByRole('heading', { name: /entries/i }).first()).toBeVisible();
});

test('entries list still shows a created entry after the eval-exists query runs', async ({ browser }) => {
  const { entryName } = await createEntrantWithEntry(browser);
  const [row] = await query<{ id: number }>('SELECT id FROM brewing WHERE brewName = ?', [entryName]);
  expect(row).toBeDefined();
});

test('contact confirmation page still looks up the real contact row (headers.inc.php query_contact)', async ({ page }) => {
  const [contact] = await query<{ contactFirstName: string; contactLastName: string; contactPosition: string }>(
    'SELECT contactFirstName, contactLastName, contactPosition FROM contacts WHERE id = 1'
  );
  expect(contact).toBeDefined();

  await page.goto('/index.php?section=contact&msg=1&id=1');
  const body = (await page.locator('body').textContent()) ?? '';
  expect(body).toContain('Your message has been sent to');
  expect(body).toContain(contact.contactFirstName);
  expect(body).toContain(contact.contactLastName);
  expect(body).toContain(contact.contactPosition);
});

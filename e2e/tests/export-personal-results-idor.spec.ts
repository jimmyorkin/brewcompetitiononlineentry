import { test, expect, Page, Browser } from '@playwright/test';
import { query } from '../helpers/db';
import { loginAsAdmin, registerEntrant, EntrantCreds } from '../helpers/auth';

/**
 * Task 4 of docs/superpowers/plans/2026-11-12-access-control-fixes.md.
 *
 * output/export.output.php's "export-personal-results" branch gated only on
 * isset($_SESSION['loginUsername']) && ($id != "default") - any logged-in
 * user, including a plain entrant (userLevel 2), could download any OTHER
 * entrant's personal competition-results CSV (name, club, email, per-entry
 * categories/scores/placements) just by changing the id URL parameter.
 * Live-reproduced before fixing: entrant A's GET of
 * ?section=export-personal-results&id=<B's uid> returned a CSV attachment
 * carrying B's last name, email and entry data.
 *
 * Upstream (verified against upstream/master's output/export.output.php,
 * its line 4062) has an additional ownership/admin clause this fork lacked:
 *   && (($admin_role) || ($id == $_SESSION['user_id']))
 * Both halves exist in this fork with upstream's exact semantics -
 * $admin_role is defined in this same file (userLevel <= 1) and
 * $_SESSION['user_id'] is set at login (includes/db/common.db.php) - so the
 * fix adopts upstream's clause verbatim.
 *
 * The id this branch consumes is the brewer's uid (= users.id): the query
 * binds it to brewing.brewBrewerID / judging_scores.bid / brewer.uid, and
 * upstream's guard compares it to $_SESSION['user_id']. Each test registers
 * disposable entrants through the real registration flow and seeds one
 * brewing + judging_scores row so the export emits distinguishable personal
 * data; cleanup runs in afterEach hooks (not per-test finally blocks), which
 * Playwright still runs when a test body times out.
 */

interface Victim {
  creds: EntrantCreds;
  uid: number;
  entryId: number;
  scoreId: number;
  marker: string;
}

/** Rows each test registers/creates, torn down in afterEach. */
let createdUserIds: number[] = [];
let createdEntryIds: number[] = [];
let createdScoreIds: number[] = [];

async function userIdFor(email: string): Promise<number> {
  const rows = await query<{ id: number }>('SELECT id FROM users WHERE user_name = ?', [email]);
  expect(rows, `registered account ${email} has a users row`).toHaveLength(1);
  createdUserIds.push(rows[0].id);
  return rows[0].id;
}

/**
 * Register a fresh entrant in its own context and give them one entry plus a
 * judging-scores row so their personal-results CSV carries identifiable data
 * (their name/email from the brewer join, plus a unique brewStyle marker).
 */
async function makeVictim(browser: Browser, tag: string): Promise<Victim> {
  const ctx = await browser.newContext();
  const pg = await ctx.newPage();
  const creds = await registerEntrant(pg);
  await ctx.close();

  const uid = await userIdFor(creds.email);
  const marker = `Task4 IDOR ${tag} ${Date.now()}`;
  const insertEntry: any = await query(
    'INSERT INTO brewing (brewBrewerID, brewName, brewStyle, brewCategory, brewSubCategory, brewStyleType) VALUES (?, ?, ?, ?, ?, ?)',
    [uid, marker, marker, '21', 'A', 1],
  );
  const entryId = insertEntry.insertId;
  createdEntryIds.push(entryId);
  const insertScore: any = await query(
    'INSERT INTO judging_scores (eid, bid, scoreEntry, scorePlace) VALUES (?, ?, ?, ?)',
    [entryId, uid, '85', '1'],
  );
  createdScoreIds.push(insertScore.insertId);

  return { creds, uid, entryId, scoreId: insertScore.insertId, marker };
}

function exportUrl(id: number | string): string {
  return `/includes/output.inc.php?section=export-personal-results&id=${id}`;
}

test.describe('export-personal-results IDOR (output/export.output.php)', () => {
  test.afterEach(async () => {
    for (const id of createdScoreIds) await query('DELETE FROM judging_scores WHERE id = ?', [id]);
    for (const id of createdEntryIds) await query('DELETE FROM brewing WHERE id = ?', [id]);
    for (const id of createdUserIds) {
      await query('DELETE FROM brewer WHERE uid = ?', [id]);
      await query('DELETE FROM staff WHERE uid = ?', [id]);
      await query('DELETE FROM users WHERE id = ?', [id]);
    }
    createdUserIds = [];
    createdEntryIds = [];
    createdScoreIds = [];
  });

  test("a logged-in entrant cannot export another entrant's personal results", async ({ page, browser }) => {
    const victim = await makeVictim(browser, 'attack');

    // Attacker: a completely unrelated, freshly registered entrant.
    const attacker = await registerEntrant(page);
    await userIdFor(attacker.email); // tracked for cleanup
    const response = await page.request.get(exportUrl(victim.uid));

    expect(response.status()).toBeLessThan(500);
    const body = await response.text();
    // The attack must be blocked: no CSV attachment of the victim's results,
    // none of the victim's personal data in the response.
    expect(body, "victim's email must not leak to another entrant").not.toContain(victim.creds.email);
    expect(body, "victim's entry data must not leak to another entrant").not.toContain(victim.marker);
    expect(response.headers()['content-disposition'] ?? '').not.toContain('.csv');
    expect(body).toContain('Not allowed.');
  });

  test('an entrant can export their own personal results', async ({ page, browser }) => {
    const own = await makeVictim(browser, 'own');

    // Log the same account in on this test's page and export its own id.
    await page.goto('/index.php?section=login');
    await page.fill('input[name="loginUsername"]', own.creds.email);
    await page.fill('input[name="loginPassword"]', own.creds.password);
    await page.locator('form:has(input[name="loginUsername"]) button[name="submit"]').first().click();
    await expect(page.locator('a[href*="logout"], a:has-text("Log Out")').first()).toBeAttached();

    const response = await page.request.get(exportUrl(own.uid));
    expect(response.status()).toBeLessThan(500);
    expect(response.headers()['content-disposition'] ?? '').toContain('.csv');
    const body = await response.text();
    expect(body, 'own export still returns own entry data').toContain('21A');
    expect(body, 'own export still returns own email').toContain(own.creds.email);
  });

  test("an admin can export any entrant's personal results", async ({ page, browser }) => {
    const victim = await makeVictim(browser, 'admin');

    await loginAsAdmin(page);
    const response = await page.request.get(exportUrl(victim.uid));
    expect(response.status()).toBeLessThan(500);
    expect(response.headers()['content-disposition'] ?? '').toContain('.csv');
    const body = await response.text();
    expect(body, "admin export still returns the entrant's entry data").toContain('21A');
    expect(body, "admin export still returns the entrant's email").toContain(victim.creds.email);
  });
});

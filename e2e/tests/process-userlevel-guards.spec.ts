import { test, expect, Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { query } from '../helpers/db';
import { loginAsAdmin, registerEntrant } from '../helpers/auth';

/**
 * Task 3 of docs/superpowers/plans/2026-11-12-access-control-fixes.md.
 *
 * includes/process.inc.php's delete_scoresheets, generate_judging_numbers,
 * and convert_bjcp action branches had zero userLevel check and no outer
 * dispatch-level guard either - any authenticated non-admin (userLevel 2,
 * e.g. a registered entrant) could trigger any of the three. Live-reproduced
 * before fixing: a registered entrant's POST to
 * action=generate_judging_numbers&sort=identical rewrote brewJudgingNumber
 * for all 57 rows in the live `brewing` table (confirmed via direct DB
 * query, then fully restored from a snapshot taken before the attack,
 * 0 mismatches after restore); the same entrant's POST to
 * action=convert_bjcp also reached the success redirect
 * (msg=25) instead of being blocked, confirmed via the response's raw
 * Location header (maxRedirects: 0) with no DB mutation (the live
 * preferences.prefsStyleSet is already "BJCP2021", so convert_bjcp's own
 * internal BJCP2008/BJCP2015 conditions don't additionally touch style
 * data regardless of the missing guard).
 *
 * Upstream has an explicit guard on all three (verified against
 * upstream/master's includes/process.inc.php, lines 215/245/281 there):
 *   if ((!isset($_SESSION['userLevel'])) || ($_SESSION['userLevel'] > 1)) {
 *     header("Location: ".$base_url."403.php");
 *     exit();
 *   }
 *
 * generate_judging_numbers has no table-name parameter - it always targets
 * the live `brewing` table - so its tests snapshot/restore that table's
 * (id, brewJudgingNumber) pairs rather than using a disposable table.
 * `sort=identical` is used throughout for determinism (brewJudgingNumber
 * becomes a deterministic zero-padded id, so the restore is an exact,
 * verifiable round-trip). delete_scoresheets' tests use their own
 * TASK3-DISPOSABLE-*.pdf fixtures written directly into user_docs/ (that
 * directory held only a non-matching readme.txt beforehand, so there is no
 * real scoresheet data to collide with). convert_bjcp's tests assert the
 * raw redirect target (403.php vs the success URL) rather than a DB change,
 * since the live preferences row's BJCP version means the action's own
 * conversion logic is a no-op either way - the guard is what's under test.
 */

async function getToken(page: Page): Promise<string> {
  const token = await page.locator('input[name="token"]').first().inputValue();
  expect(token).toBeTruthy();
  return token;
}

async function entrantToken(page: Page): Promise<string> {
  await registerEntrant(page);
  await page.goto('/index.php?section=contact');
  return getToken(page);
}

// ---------------------------------------------------------------------------
// generate_judging_numbers
// ---------------------------------------------------------------------------

interface BrewingRow { id: number; brewJudgingNumber: string | null; }

async function snapshotBrewing(): Promise<BrewingRow[]> {
  return query<BrewingRow>('SELECT id, brewJudgingNumber FROM brewing ORDER BY id');
}

async function restoreBrewing(snapshot: BrewingRow[]): Promise<void> {
  for (const row of snapshot) {
    await query('UPDATE brewing SET brewJudgingNumber = ? WHERE id = ?', [row.brewJudgingNumber, row.id]);
  }
}

test.describe('generate_judging_numbers userLevel guard', () => {
  // The restore runs in afterEach, not a per-test finally: Playwright abandons
  // a timed-out test body mid-await (its finally never runs) but still runs
  // afterEach hooks, so the live brewing table gets restored even on timeout.
  let snapshot: BrewingRow[] | null = null;

  test.beforeEach(async () => {
    snapshot = await snapshotBrewing();
  });

  test.afterEach(async () => {
    if (snapshot) {
      await restoreBrewing(snapshot);
      snapshot = null;
    }
  });

  test('a non-admin cannot regenerate judging numbers', async ({ page }) => {
    const before = snapshot!;
    const token = await entrantToken(page);

    await page.request.post('/includes/process.inc.php?section=admin&action=generate_judging_numbers&sort=identical', {
      headers: { referer: page.url() },
      form: { token },
    });

    const after = await snapshotBrewing();
    expect(after).toEqual(before);
  });

  test('a logged-in admin can regenerate judging numbers', async ({ page }) => {
    const before = snapshot!;
    await loginAsAdmin(page);
    await page.goto('/index.php?section=admin&go=styles');
    const token = await getToken(page);

    await page.request.post('/includes/process.inc.php?section=admin&action=generate_judging_numbers&sort=identical', {
      headers: { referer: page.url() },
      form: { token },
    });

    const after = await snapshotBrewing();
    expect(after.map(r => r.brewJudgingNumber)).toEqual(
      before.map(r => String(r.id).padStart(6, '0'))
    );
  });
});

// ---------------------------------------------------------------------------
// delete_scoresheets
// ---------------------------------------------------------------------------

const USER_DOCS = path.resolve(__dirname, '../../user_docs');

/** A minimal PDF that libmagic/mime_content_type recognizes as application/pdf. */
const MINIMAL_PDF = '%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF';

function makeFixturePdf(tag: string): string {
  const name = `TASK3-DISPOSABLE-${tag}-${Date.now()}.pdf`;
  const full = path.join(USER_DOCS, name);
  fs.writeFileSync(full, MINIMAL_PDF);
  return full;
}

test.describe('delete_scoresheets userLevel guard', () => {
  // Fixture removal runs in afterEach (not a per-test finally) so it survives
  // Playwright test-body timeouts, same reasoning as the brewing restore above.
  let fixture: string | null = null;

  test.afterEach(() => {
    if (fixture) {
      fs.rmSync(fixture, { force: true });
      fixture = null;
    }
  });

  test('a non-admin cannot delete scoresheets', async ({ page }) => {
    fixture = makeFixturePdf('attack');
    const token = await entrantToken(page);

    await page.request.post('/includes/process.inc.php?section=admin&action=delete_scoresheets', {
      headers: { referer: page.url() },
      form: { token },
    });

    expect(fs.existsSync(fixture)).toBe(true);
  });

  test('a logged-in admin can delete scoresheets', async ({ page }) => {
    fixture = makeFixturePdf('admin');
    await loginAsAdmin(page);
    await page.goto('/index.php?section=admin&go=styles');
    const token = await getToken(page);

    await page.request.post('/includes/process.inc.php?section=admin&action=delete_scoresheets', {
      headers: { referer: page.url() },
      form: { token },
    });

    expect(fs.existsSync(fixture)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// convert_bjcp
// ---------------------------------------------------------------------------

test.describe('convert_bjcp userLevel guard', () => {
  test('a non-admin cannot trigger a BJCP style conversion', async ({ page }) => {
    const token = await entrantToken(page);

    const resp = await page.request.post('/includes/process.inc.php?section=admin&action=convert_bjcp', {
      headers: { referer: page.url() },
      form: { token },
      maxRedirects: 0,
    });

    expect(resp.status()).toBe(302);
    expect(resp.headers()['location']).toContain('403.php');
  });

  test('a logged-in admin can trigger a BJCP style conversion', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/index.php?section=admin&go=styles');
    const token = await getToken(page);

    const resp = await page.request.post('/includes/process.inc.php?section=admin&action=convert_bjcp', {
      headers: { referer: page.url() },
      form: { token },
      maxRedirects: 0,
    });

    expect(resp.status()).toBe(302);
    expect(resp.headers()['location']).not.toContain('403.php');
  });
});

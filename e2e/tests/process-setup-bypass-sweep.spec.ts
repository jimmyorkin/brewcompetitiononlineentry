import { test, expect, Page } from '@playwright/test';
import { query } from '../helpers/db';
import { loginAsAdmin } from '../helpers/auth';

/**
 * Task 2 of docs/superpowers/plans/2026-11-12-access-control-fixes.md.
 *
 * Seven includes/process/*.inc.php files gated writes on:
 *   (logged in && userLevel check) || ($section == "setup")
 * $section is the request's own `section` GET/POST parameter - fully
 * attacker-controlled. Any anonymous visitor who has loaded one ordinary
 * page first (for a session + CSRF token, both handed out unconditionally)
 * can POST section=setup and bypass the login/userLevel check entirely.
 *
 * This exact pattern was already fixed once, in
 * includes/process/process_users_setup.inc.php (commit f4e84fc9), by
 * replacing the `$section == "setup"` clause with the real
 * `$setup_free_access` config flag (FALSE by default in site/config.php) -
 * but that fix was never swept to these 7 siblings:
 *   process_comp_info.inc.php, process_styles.inc.php, process_brewer.inc.php,
 *   process_judging_locations.inc.php, process_drop_off.inc.php,
 *   process_judging_preferences.inc.php, process_prefs.inc.php
 *
 * Each block below proves (a) the anonymous section=setup bypass is blocked
 * and (b) the legitimate logged-in-admin path for the same file still
 * works. Fixtures/mutations are disposable or saved-and-restored within the
 * test itself; nothing here depends on or permanently alters the shared
 * stack's baseline config.
 */

async function getToken(page: Page): Promise<string> {
  const token = await page.locator('input[name="token"]').first().inputValue();
  expect(token).toBeTruthy();
  return token;
}

async function anonymousToken(page: Page): Promise<string> {
  await page.goto('/index.php?section=register&go=entrant');
  return getToken(page);
}

// ---------------------------------------------------------------------------
// process_comp_info.inc.php (dbTable=contest_info)
// ---------------------------------------------------------------------------

test.describe('process_comp_info.inc.php setup bypass', () => {
  test('an anonymous visitor cannot edit contest info via section=setup', async ({ page }) => {
    const token = await anonymousToken(page);
    const before = (await query<{ contestCheckInPassword: string | null }>(
      'SELECT contestCheckInPassword FROM contest_info WHERE id=1'
    ))[0];

    await page.request.post('/includes/process.inc.php?section=setup&action=edit&dbTable=contest_info&go=qr&id=1', {
      headers: { referer: page.url() },
      form: { token, contestCheckInPassword: 'TASK2-ATTACK-SHOULD-NOT-APPLY' },
    });

    const after = (await query<{ contestCheckInPassword: string | null }>(
      'SELECT contestCheckInPassword FROM contest_info WHERE id=1'
    ))[0];
    expect(after.contestCheckInPassword).toBe(before.contestCheckInPassword);
  });

  test('a logged-in admin can edit contest info', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/index.php?section=admin&go=contest_info');
    const token = await getToken(page);

    const before = (await query<{ contestCheckInPassword: string | null }>(
      'SELECT contestCheckInPassword FROM contest_info WHERE id=1'
    ))[0];

    try {
      await page.request.post('/includes/process.inc.php?section=admin&action=edit&dbTable=contest_info&go=qr&id=1', {
        headers: { referer: page.url() },
        form: { token, contestCheckInPassword: 'TASK2-LEGIT-ADMIN-PW' },
      });

      const after = (await query<{ contestCheckInPassword: string | null }>(
        'SELECT contestCheckInPassword FROM contest_info WHERE id=1'
      ))[0];
      expect(after.contestCheckInPassword).not.toBe(before.contestCheckInPassword);
    } finally {
      await query('UPDATE contest_info SET contestCheckInPassword=? WHERE id=1', [before.contestCheckInPassword]);
    }
  });
});

// ---------------------------------------------------------------------------
// process_judging_locations.inc.php (dbTable=judging_locations)
// ---------------------------------------------------------------------------

test.describe('process_judging_locations.inc.php setup bypass', () => {
  test('an anonymous visitor cannot add a judging location via section=setup', async ({ page }) => {
    const token = await anonymousToken(page);
    const name = `TASK2-ATTACK-LOC-${Date.now()}`;

    await page.request.post('/includes/process.inc.php?section=setup&action=add&dbTable=judging_locations', {
      headers: { referer: page.url() },
      form: { token, judgingDate: '2026-12-01', judgingLocName: name, judgingLocation: 'Nowhere', judgingLocType: '0' },
    });

    const rows = await query('SELECT id FROM judging_locations WHERE judgingLocName = ?', [name]);
    expect(rows).toHaveLength(0);
  });

  test('a logged-in admin can add a judging location', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/index.php?section=admin&go=judging');
    const token = await getToken(page);
    const name = `TASK2-LEGIT-LOC-${Date.now()}`;

    try {
      await page.request.post('/includes/process.inc.php?section=admin&action=add&dbTable=judging_locations', {
        headers: { referer: page.url() },
        form: { token, judgingDate: '2026-12-01', judgingLocName: name, judgingLocation: 'Somewhere', judgingLocType: '0', relocate: '/index.php?section=admin&go=judginglocations' },
      });

      const rows = await query<{ id: number }>('SELECT id FROM judging_locations WHERE judgingLocName = ?', [name]);
      expect(rows).toHaveLength(1);
    } finally {
      await query('DELETE FROM judging_locations WHERE judgingLocName = ?', [name]);
    }
  });
});

// ---------------------------------------------------------------------------
// process_styles.inc.php (dbTable=styles)
// ---------------------------------------------------------------------------

test.describe('process_styles.inc.php setup bypass', () => {
  test('an anonymous visitor cannot add a style via section=setup', async ({ page }) => {
    const token = await anonymousToken(page);
    const name = `TASK2-ATTACK-STYLE-${Date.now()}`;

    await page.request.post('/includes/process.inc.php?section=setup&action=add&dbTable=styles', {
      headers: { referer: page.url() },
      form: { token, brewStyle: name, brewStyleActive: 'N', brewStyleOwn: 'custom' },
    });

    const rows = await query('SELECT id FROM styles WHERE brewStyle = ?', [name]);
    expect(rows).toHaveLength(0);
  });

  test('a logged-in admin can add a style', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/index.php?section=admin&go=styles');
    const token = await getToken(page);
    const name = `TASK2-LEGIT-STYLE-${Date.now()}`;

    try {
      await page.request.post('/includes/process.inc.php?section=admin&action=add&dbTable=styles', {
        headers: { referer: page.url() },
        form: { token, brewStyle: name, brewStyleActive: 'N', brewStyleOwn: 'custom', relocate: '/index.php?section=admin&go=styles' },
      });

      const rows = await query<{ id: number }>('SELECT id FROM styles WHERE brewStyle = ?', [name]);
      expect(rows).toHaveLength(1);
    } finally {
      await query('DELETE FROM styles WHERE brewStyle = ?', [name]);
    }
  });
});

// ---------------------------------------------------------------------------
// process_drop_off.inc.php (dbTable=drop_off)
// ---------------------------------------------------------------------------

test.describe('process_drop_off.inc.php setup bypass', () => {
  test('an anonymous visitor cannot add a drop-off location via section=setup', async ({ page }) => {
    const token = await anonymousToken(page);
    const name = `TASK2-ATTACK-DROPOFF-${Date.now()}`;

    await page.request.post('/includes/process.inc.php?section=setup&action=add&dbTable=drop_off&go=add', {
      headers: { referer: page.url() },
      form: { token, dropLocationName: name, dropLocation: 'Nowhere', dropLocationPhone: '555-0100', dropLocationWebsite: '', dropLocationNotes: '' },
    });

    const rows = await query('SELECT id FROM drop_off WHERE dropLocationName = ?', [name]);
    expect(rows).toHaveLength(0);
  });

  test('a logged-in admin can add a drop-off location', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/index.php?section=admin&go=dropoff&action=add');
    const token = await getToken(page);
    const name = `TASK2-LEGIT-DROPOFF-${Date.now()}`;

    try {
      await page.request.post('/includes/process.inc.php?section=admin&action=add&dbTable=drop_off&go=add', {
        headers: { referer: page.url() },
        form: { token, dropLocationName: name, dropLocation: 'Somewhere', dropLocationPhone: '555-0100', dropLocationWebsite: '', dropLocationNotes: '' },
      });

      const rows = await query<{ id: number }>('SELECT id FROM drop_off WHERE dropLocationName = ?', [name]);
      expect(rows).toHaveLength(1);
    } finally {
      await query('DELETE FROM drop_off WHERE dropLocationName = ?', [name]);
    }
  });
});

// ---------------------------------------------------------------------------
// process_judging_preferences.inc.php (dbTable=judging_preferences)
// ---------------------------------------------------------------------------

test.describe('process_judging_preferences.inc.php setup bypass', () => {
  test('an anonymous visitor cannot edit judging preferences via section=setup', async ({ page }) => {
    const token = await anonymousToken(page);
    const before = (await query<{ jPrefsMaxBOS: number }>(
      'SELECT jPrefsMaxBOS FROM judging_preferences WHERE id=1'
    ))[0];

    await page.request.post('/includes/process.inc.php?section=setup&action=edit&dbTable=judging_preferences&id=1', {
      headers: { referer: page.url() },
      form: { token, jPrefsMaxBOS: String(Number(before.jPrefsMaxBOS) + 1) },
    });

    const after = (await query<{ jPrefsMaxBOS: number }>(
      'SELECT jPrefsMaxBOS FROM judging_preferences WHERE id=1'
    ))[0];
    expect(after.jPrefsMaxBOS).toBe(before.jPrefsMaxBOS);
  });

  test('a logged-in admin can edit judging preferences', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/index.php?section=admin&go=judging_preferences');
    const token = await getToken(page);

    const before = (await query<{ jPrefsMaxBOS: number }>(
      'SELECT jPrefsMaxBOS FROM judging_preferences WHERE id=1'
    ))[0];
    const newValue = Number(before.jPrefsMaxBOS) + 1;

    try {
      await page.request.post('/includes/process.inc.php?section=admin&action=edit&dbTable=judging_preferences&id=1', {
        headers: { referer: page.url() },
        form: { token, jPrefsMaxBOS: String(newValue), relocate: '/index.php?section=admin&go=judgingpreferences' },
      });

      const after = (await query<{ jPrefsMaxBOS: number }>(
        'SELECT jPrefsMaxBOS FROM judging_preferences WHERE id=1'
      ))[0];
      expect(after.jPrefsMaxBOS).toBe(newValue);
    } finally {
      await query('UPDATE judging_preferences SET jPrefsMaxBOS=? WHERE id=1', [before.jPrefsMaxBOS]);
    }
  });
});

// ---------------------------------------------------------------------------
// process_prefs.inc.php (dbTable=preferences)
// ---------------------------------------------------------------------------

/** Full field set process_prefs.inc.php's $data array reads via sterilize($_POST[...]) with no isset guard. */
function prefsFields(token: string, row: Record<string, unknown>, overrides: Record<string, string> = {}) {
  const base: Record<string, string> = {
    token,
    id: '1',
    prefsTemp: String(row.prefsTemp ?? ''),
    prefsWeight1: String(row.prefsWeight1 ?? ''),
    prefsWeight2: String(row.prefsWeight2 ?? ''),
    prefsLiquid1: String(row.prefsLiquid1 ?? ''),
    prefsLiquid2: String(row.prefsLiquid2 ?? ''),
    prefsPaypal: String(row.prefsPaypal ?? ''),
    prefsPaypalAccount: String(row.prefsPaypalAccount ?? ''),
    prefsPaypalIPN: String(row.prefsPaypalIPN ?? '0'),
    prefsCurrency: String(row.prefsCurrency ?? ''),
    prefsCash: String(row.prefsCash ?? ''),
    prefsCheck: String(row.prefsCheck ?? ''),
    prefsCheckPayee: String(row.prefsCheckPayee ?? ''),
    prefsTransFee: String(row.prefsTransFee ?? ''),
    prefsSponsors: String(row.prefsSponsors ?? ''),
    prefsSponsorLogos: String(row.prefsSponsorLogos ?? ''),
    prefsDisplayWinners: String(row.prefsDisplayWinners ?? ''),
    prefsWinnerMethod: String(row.prefsWinnerMethod ?? ''),
    prefsDisplaySpecial: String(row.prefsDisplaySpecial ?? ''),
    prefsShowBestBrewer: String(row.prefsShowBestBrewer ?? ''),
    prefsShowBestClub: String(row.prefsShowBestClub ?? ''),
    prefsFirstPlacePts: String(row.prefsFirstPlacePts ?? ''),
    prefsSecondPlacePts: String(row.prefsSecondPlacePts ?? ''),
    prefsThirdPlacePts: String(row.prefsThirdPlacePts ?? ''),
    prefsFourthPlacePts: String(row.prefsFourthPlacePts ?? ''),
    prefsHMPts: String(row.prefsHMPts ?? ''),
    prefsTieBreakRule1: String(row.prefsTieBreakRule1 ?? ''),
    prefsTieBreakRule2: String(row.prefsTieBreakRule2 ?? ''),
    prefsTieBreakRule3: String(row.prefsTieBreakRule3 ?? ''),
    prefsTieBreakRule4: String(row.prefsTieBreakRule4 ?? ''),
    prefsTieBreakRule5: String(row.prefsTieBreakRule5 ?? ''),
    prefsTieBreakRule6: String(row.prefsTieBreakRule6 ?? ''),
    prefsEntryForm: String(row.prefsEntryForm ?? ''),
    prefsRecordLimit: String(row.prefsRecordLimit ?? ''),
    prefsRecordPaging: String(row.prefsRecordPaging ?? ''),
    prefsProEdition: String(row.prefsProEdition ?? ''),
    prefsTheme: String(row.prefsTheme ?? ''),
    prefsDateFormat: String(row.prefsDateFormat ?? ''),
    prefsContact: String(row.prefsContact ?? ''),
    prefsTimeZone: String(row.prefsTimeZone ?? ''),
    prefsEntryLimit: String(row.prefsEntryLimit ?? ''),
    prefsTimeFormat: String(row.prefsTimeFormat ?? ''),
    prefsUserEntryLimit: String(row.prefsUserEntryLimit ?? ''),
    prefsUserSubCatLimit: String(row.prefsUserSubCatLimit ?? ''),
    prefsUSCLExLimit: String(row.prefsUSCLExLimit ?? ''),
    prefsPayToPrint: String(row.prefsPayToPrint ?? ''),
    prefsUseMods: String(row.prefsUseMods ?? ''),
    prefsSEF: String(row.prefsSEF ?? ''),
    prefsSpecialCharLimit: String(row.prefsSpecialCharLimit ?? ''),
    prefsStyleSet: String(row.prefsStyleSet ?? ''),
    prefsAutoPurge: String(row.prefsAutoPurge ?? ''),
    prefsEntryLimitPaid: String(row.prefsEntryLimitPaid ?? ''),
    prefsEmailRegConfirm: String(row.prefsEmailRegConfirm ?? ''),
    prefsLanguage: String(row.prefsLanguage ?? ''),
    prefsSpecific: String(row.prefsSpecific ?? ''),
    prefsDropOff: String(row.prefsDropOff ?? ''),
    prefsShipping: String(row.prefsShipping ?? ''),
    prefsBestUseBOS: String(row.prefsBestUseBOS ?? ''),
    prefsEval: String(row.prefsEval ?? ''),
    prefsScoringCOA: String(row.prefsScoringCOA ?? ''),
  };
  return { ...base, ...overrides };
}

test.describe('process_prefs.inc.php setup bypass', () => {
  test('an anonymous visitor cannot edit site preferences via section=setup', async ({ page }) => {
    const token = await anonymousToken(page);
    const before = (await query<Record<string, unknown>>('SELECT * FROM preferences WHERE id=1'))[0];
    const flipped = before.prefsContact === 'Y' ? 'N' : 'Y';

    await page.request.post('/includes/process.inc.php?section=setup&action=edit&dbTable=preferences&id=1', {
      headers: { referer: page.url() },
      form: prefsFields(token, before, { prefsContact: flipped }),
    });

    const after = (await query<{ prefsContact: string }>('SELECT prefsContact FROM preferences WHERE id=1'))[0];
    expect(after.prefsContact).toBe(before.prefsContact);
  });

  test('a logged-in admin can edit site preferences', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/index.php?section=admin&go=preferences');
    const token = await getToken(page);

    const before = (await query<Record<string, unknown>>('SELECT * FROM preferences WHERE id=1'))[0];
    const flipped = before.prefsContact === 'Y' ? 'N' : 'Y';

    try {
      await page.request.post('/includes/process.inc.php?section=admin&action=edit&dbTable=preferences&id=1', {
        headers: { referer: page.url() },
        form: prefsFields(token, before, { prefsContact: flipped, relocate: '/index.php?section=admin&go=preferences' }),
      });

      const after = (await query<{ prefsContact: string }>('SELECT prefsContact FROM preferences WHERE id=1'))[0];
      expect(after.prefsContact).toBe(flipped);
    } finally {
      await query('UPDATE preferences SET prefsContact=? WHERE id=1', [before.prefsContact]);
    }
  });
});

// ---------------------------------------------------------------------------
// process_brewer.inc.php (dbTable=brewer)
// ---------------------------------------------------------------------------

test.describe('process_brewer.inc.php setup bypass', () => {
  test('an anonymous visitor cannot write staff assignments via section=setup', async ({ page }) => {
    const token = await anonymousToken(page);
    const uid = `99999${Date.now()}`.slice(0, 9);

    await page.request.post('/includes/process.inc.php?section=setup&action=update&dbTable=brewer&filter=judges', {
      headers: { referer: page.url() },
      form: { token, 'uid[]': uid, [`staff_judge${uid}`]: '1' },
    });

    const rows = await query('SELECT id FROM staff WHERE uid = ?', [uid]);
    expect(rows).toHaveLength(0);
  });

  test('a logged-in admin can write staff assignments', async ({ page }) => {
    await loginAsAdmin(page);
    // The CSRF token is tied to the session, not to a specific page, so any
    // page with a form carries a usable one; the staff-assignment page
    // (go=judging&action=assign&filter=staff) is comparatively heavy to
    // render, so use the lighter styles admin page just to fetch the token.
    await page.goto('/index.php?section=admin&go=styles');
    const token = await getToken(page);
    const uid = `88888${Date.now()}`.slice(0, 9);

    try {
      await page.request.post('/includes/process.inc.php?section=admin&action=update&dbTable=brewer&filter=judges', {
        headers: { referer: page.url() },
        form: { token, 'uid[]': uid, [`staff_judge${uid}`]: '1', relocate: '/index.php?section=admin&go=judges' },
      });

      const rows = await query<{ id: number }>('SELECT id FROM staff WHERE uid = ?', [uid]);
      expect(rows).toHaveLength(1);
    } finally {
      await query('DELETE FROM staff WHERE uid = ?', [uid]);
    }
  });
});

-- ---------------------------------------------------------------------------
-- E2E test fixtures (Docker-local ONLY — never ship to a real deployment).
--
-- Applied by docker-entrypoint-initdb.d on every FRESH database volume, after
-- 01-baseline.sql (schema + fixture data) and 02-open-registration.sql
-- (deadline/version patches). Ordering comes from the filename prefix.
-- Changes here take effect only after a reseed:
--     docker compose down -v && docker compose up -d
--
-- CAPTCHA-off flag
-- ----------------
-- What:  `prefsCAPTCHA` (tinyint) in `preferences`. When 1, the
--        public registration form (sections/register.sec.php:1035) embeds
--        Google reCAPTCHA/hCaptcha, and process_users_register.inc.php:31-36
--        rejects any registration POST lacking a captcha response token
--        (redirect carries msg=4).
-- Why 0: the Playwright suite registers throwaway entrants through the real
--        form (e2e/helpers/auth.ts registerEntrant()). A third-party captcha
--        cannot — and should not — be solved by automation, so the flag must
--        be off for the e2e and write-load-test harnesses to exercise the
--        registration flow.
-- Scope: the 3.2.X baseline seed already ships prefsCAPTCHA = 0; this UPDATE
--        pins that deterministically so a future baseline change can't
--        silently break the e2e suite. It affects only this Docker instance's
--        database. Production installs configure CAPTCHA in the admin UI
--        (Site Preferences), which writes this same column.
-- Re-enable locally: set prefsCAPTCHA = 1 in Site Preferences (or via SQL)
--        and log out/in — preferences are cached in $_SESSION at login.
-- ---------------------------------------------------------------------------

-- Winners-display-off flag
-- ------------------------
-- What:  `prefsDisplayWinners` ('Y'/'N') in `preferences`, plus the
--        `prefsWinnerDelay` timestamp. When 'Y' and the delay has passed
--        (includes/constants.inc.php:531-536), every logged-in user is put in
--        "scores mode" ($show_scores = TRUE): the account page shows results
--        and HIDES the entire entry-management UI (Add Entry / Entries / Pay
--        buttons, pub/list.pub.php:25-32).
-- Why N: the baseline fixture is a post-competition snapshot — its
--        prefsWinnerDelay (2023-11-02) has long passed. The e2e journeys need
--        the pre-judging state where entrants can still create/edit/pay for
--        entries, so winners display must be off. 02-open-registration.sql
--        already reopens the entry deadlines; this closes the other half.
-- Scope: Docker-local only, same as above. Real competitions toggle this in
--        Site Preferences when they're ready to publish results.
-- ---------------------------------------------------------------------------

USE bcoem;

UPDATE preferences SET prefsCAPTCHA = 0, prefsDisplayWinners = 'N';

-- Bluebonnet runs in Central time. site/config.php pins the DB session to
-- -06:00, and the app stamps brewUpdated from PHP time in the competition's
-- timezone pref. The baseline ships -7 (Mountain): that 1h skew makes
-- mods/bbo-delete-unpaids.php see every brand-new entry as >1h old and
-- logically delete it on the next page load. Keep the pref aligned with config.php.
UPDATE preferences SET prefsTimeZone = -6;

# Testing guide

How to run the automated tests for this branch, and how to add more.

There are two test suites in this project, and **they live on different branches**:

| Suite | What it tests | Where it lives | Runs against this branch? |
| --- | --- | --- | --- |
| **Playwright e2e** | The real app through a browser: registration, entries, admin, security, Bluebonnet rules | `e2e/` on `bluebonnet-testing` | **Yes** |
| **PHPUnit** | PHP library functions in `lib/common.lib.php` | `tests/` (Unit tier only; database tiers are on `testing-baseline`) | **Unit tier only** (see [PHPUnit](#phpunit-suite)) |

If you only want to know "did I break anything on the 2.7 / Bluebonnet code?", run the Playwright suite. It takes about 4.5 minutes.

**SQLi migration, Phase 1: done.** The `forgot_password.inc.php` finding plus the 21 files whose raw SQL was ≥90% similar to upstream's own prepared-statement conversion are fixed, each with a test. Along the way this also fixed a confirmed SQLi in `sections/login.sec.php` and an unrelated, pre-existing privilege-escalation bug. The remaining work, per the design doc's similarity table (`docs/superpowers/specs/2026-11-05-sqli-migration-design.md`), is tracked as a future phase, not yet broken into tasks: 44 files/336 calls at 70-90% similarity to upstream, 69 files/331 calls below 70% similarity, and 8 Bluebonnet-only files/31 calls with no upstream reference to port from at all.

**Fixed.** `includes/process/process_barcode_check_in_bbo.inc.php` — the file actually wired to the live, admin-gated check-in UI (`index.php`'s check-in route) — built every query with `sprintf()` from unsterilized `$_POST['eid'<n>]`/`$_POST['tableNumber'<n>]`/`$_POST['box'<n>]`, no escaping at all; Phase 1's task 2 had converted a different, dead-code file (`process_barcode_check_in.inc.php`, no `_bbo` suffix) that the file-similarity audit picked instead. Now parameterized (table/column names stay interpolated, only values bound). Tests: `e2e/tests/barcode-checkin-sqli.spec.ts`.

---

## 1. Playwright e2e suite

### What you need

- Docker with Compose v2 (`docker compose`)
- Node 20 or newer
- Free ports for the web and database containers. The defaults are 8080 and 3306. The examples below use **8082 and 3307** so they don't clash with another BCOE&M stack. Pick any free pair.

### Run it

From the repo root:

```bash
# 1. Start the app and database (first run builds the image and seeds the DB)
WEB_PORT=8082 DB_PORT=3307 docker compose up -d --build

# 2. Install the test dependencies (first time only)
cd e2e
npm install
npx playwright install chromium

# 3. Run everything
DB_PORT=3307 BASE_URL=http://localhost:8082 npx playwright test

OR

# 4. Run visible browser with one test at a time
DB_PORT=3307 BASE_URL=http://localhost:8082 npx playwright test --headed --workders=1
```

The suite waits for the app to be genuinely ready, so it is safe to start it right after `docker compose up`. After first-run seeding the database restarts once, and `global-setup.ts` polls for up to two minutes until the registration page renders.

The two environment variables:

- `BASE_URL`: where the app is. Defaults to `http://localhost:8080`.
- `DB_PORT` (and `DB_HOST`): used by specs that talk to MariaDB directly, for example to backdate an entry's timestamp. Defaults to 3306.

Expected result on a healthy checkout: **50 passed, 1 skipped, about 5.5 minutes** (on an otherwise-idle host; see the [Troubleshooting](#troubleshooting) row on `createEntrantWithEntry()` flakiness if a full run shows more failures than that under heavy host/stack load). The skipped test is a known gap (see [Known gaps](#known-gaps)).

### Useful variations

```bash
npx playwright test tests/smoke.spec.ts        # one spec file
npx playwright test -g "path traversal"        # tests whose title matches
npx playwright test --headed                   # watch the browser
npx playwright test --headed --workers=1       # watch the browser test at a time
npx playwright test --debug                    # step through with the inspector
npx playwright test --reporter=list            # one line per test
npx playwright show-report                     # open the HTML report from the last run (run from e2e/)
npx playwright show-trace test-results/<dir>/trace.zip   # replay a failure
```

All `npx playwright` commands must be run from the `e2e/` folder, because that is where `playwright.config.ts` lives and where the report is written (`e2e/playwright-report`). Running `show-report` from the repo root fails with "No report found". The HTML report is only written by the default reporter, so a run with `--reporter=list` alone doesn't refresh it; use `--reporter=list,html` to get both.

Failures save a screenshot and a trace under `e2e/test-results/` (gitignored). The trace is the fastest way to see what the page looked like when a test broke.

### The specs

| Spec | Covers |
| --- | --- |
| `smoke.spec.ts` | App serves, login modal, admin login, entrant registration |
| `entrant-journey.spec.ts` | Register, create an entry, edit it, reach the payment page |
| `admin-journey.spec.ts` | Entries list, build a judging table, record a score; the full-page judging-scores submit (`process_judging_scores.inc.php`) survives a single quote in the eid field (P1 SQLi migration phase 1) |
| `security-invariants.spec.ts` | Anonymous and entrant users can't reach admin or account pages, PDF download rejects path traversal, the legacy login bypass is closed, the session id changes on login |
| `xss-cookies.spec.ts` | Cookie values refilled into the register and contact forms are HTML-escaped (P1-SEC-003) |
| `bluebonnet-rules.spec.ts` | Bluebonnet-only rules: 4 entries per table, 1 per entrant per table, 60 seconds between entries, unpaid entries deleted after 1 hour |
| `forgot-password-sqli.spec.ts` | The unauthenticated forgot-password lookup survives a single-quote/OR-based injection payload instead of matching an unrelated real account (P1 SQLi migration phase 1) |
| `sqli-migration-process-files.spec.ts` | `process_style_types.inc.php`'s next-id assignment, `process_barcode_check_in.inc.php`'s check-in surviving a single quote in the judging number, and `process_users_setup.inc.php`'s user-count branching all still work after converting to prepared statements / MysqliDb binding (P1 SQLi migration phase 1; `setup.php`/`update.php` from the same task are one-time scripts verified manually instead - see that task's report). The last test exercises the legitimate (logged-in-admin) path into `process_users_setup.inc.php`, not the `setup-auth-bypass.spec.ts` path below. |
| `setup-auth-bypass.spec.ts` | An anonymous visitor cannot create a `userLevel=0` (super admin) account via `section=setup` - closes a privilege-escalation hole found while verifying the SQLi migration (not SQLi itself; the gate had regressed from the real `$setup_free_access` config flag to the request's own `section` parameter) |
| `login-verify-sqli.spec.ts` | `sections/login.sec.php`'s "verify security question" lookup (the forgot-password flow's second step) survives a single-quote/OR-based injection payload instead of matching an unrelated real account - a real, separately-confirmed SQLi, same class as `forgot-password-sqli.spec.ts` (P1 SQLi migration phase 1, task 3) |
| `sqli-migration-sections-files.spec.ts` | `sections/brewer_entries.sec.php`'s eval-exists lookup and `includes/headers.inc.php`'s contact-confirmation lookup still return correct data after converting to `$db_conn` parameter binding (P1 SQLi migration phase 1, task 3). Three other converted queries from the same task - two in `sections/winners.sec.php`, and the eval-row branch of `brewer_entries.sec.php`'s style lookup - aren't reachable without flipping shared `prefsDisplayWinners`/judging-window state on this long-lived dev stack; see that spec's header comment and `tests/Unit/SourceHardeningTest.php` for how those are covered instead. |
| `sqli-migration-admin-files.spec.ts` | `admin/archive.admin.php`'s results-recorded count and `admin/judging_assign.admin.php`'s five converted queries still return correct data after converting to `$db_conn` (MysqliDb builder / `rawQuery()` with bound parameters) (P1 SQLi migration phase 1, task 4). The judging-assign co-brewer test asserts an exact row *count* across three entries, not just presence - this file was flagged as the one most likely to return multiple rows, so the regression it guards against is a conversion that silently narrows a multi-row fetch to one row. `admin/competition_info.admin.php`'s step4 brewer/contest-info lookups are NOT exercised by this spec - that branch only runs during first-time setup, which is unreachable on this already-set-up shared stack; the spec's own header comment explains this, and that conversion is instead guarded by `tests/Unit/SourceHardeningTest.php` plus manual verification on a throwaway stack (see the task-4 report). |
| `sqli-migration-eval-output-files.spec.ts` | `output/bos_mat.output.php`'s `check_table_name()` lookup (converted to a `mysqli_prepare()` statement) and mini-bos table listing (converted to `$db_conn->get()`), and `output/assignments.output.php`'s sign-in-sheet judge/steward lookup (converted to `$db_conn->rawQuery()` with `?` placeholders) all still return correct data (P1 SQLi migration phase 1, task 5). Fixing the assignments test caught a real bug the conversion introduced: `rawQuery()` throws if its bound-params array is empty but the query has no `?` placeholders (happens here when `SINGLE` is off), fixed by passing `null` instead of an empty array. The other five files in this task's group - `eval/scoresheet.eval.php`, `eval/judging_not_assigned.eval.php`, `eval/judging_dashboard.eval.php`, `includes/db/output_entries_export_winner.db.php`, and `includes/convert/convert_bjcp_2021.inc.php` - render only behind an active judge/table-assignment session, several frames deep in the export flow, or are a one-time destructive conversion tool respectively; see `tests/Unit/SourceHardeningTest.php` and the task-5 report for how those are covered instead. |
| `barcode-checkin-sqli.spec.ts` | `includes/process/process_barcode_check_in_bbo.inc.php` - the live, admin-gated barcode check-in handler - survives a single-quote/OR-based injection payload in the entry number instead of logging corrupted data, and still correctly recognizes a real entry by its own id after the fix (regression safety). This is the real live file Phase 1's task 2 missed in favor of a dead-code lookalike with the same name minus `_bbo` (see the memory note this fix resolves). |
| `sqli-migration-financial-functions.spec.ts` | `lib/common.lib.php`'s 7 financial/fee-total functions (`total_fees`, `total_fees_paid`, `total_not_paid_brewer`, `total_paid_received`, `total_nopay_received`) converted to `$db_conn` (MysqliDb builder / `rawQueryOne()` with bound parameters), matching `upstream/master`'s own byte-for-byte conversion of the same functions, including its N+1-query batching for `total_fees()`/`total_fees_paid()`'s "default" bid/filter branches (P2 SQLi migration, task 1a). Asserts actual computed totals (pay page fee/amount-due, sidebar unpaid count, admin "paid+received" and "received" counts), not just page rendering - these are read throughout entry/admin pages, so a wrong total would be a silent regression. `total_entries_brewer()` and `total_paid()` are genuinely dead code (no caller anywhere in the app). `total_paid_received()`'s `$id > 0` branch (via `best_brewer_points()`, reachable from `awards.php` and `sections/bestbrewer.sec.php`'s Best Brewer/Best Club scoring) and its `$archive` branch (via `output/export.output.php`'s circuit export) are reachable in production but not safely e2e-testable on this shared stack - the former needs the same `prefsDisplayWinners`/judging-window state flip the `winners.sec.php` guard below can't do either, and the latter needs a real archive, which relocates the competition's live tables. `total_nopay_received()`'s `$id > 0` branch has no caller at all. See `tests/Unit/SourceHardeningTest.php` for the source guards and the task-1a report for direct-DB-script verification of all of these branches, including injection-shaped `$id`/`$archive` values. |
| `sqli-migration-judging-scoring-functions.spec.ts` | `lib/common.lib.php`'s judging/scoring/winner-determination functions - `winner_check()`, `score_count()`, `score_check()`, `minibos_check()`, `check_judging_flights()`, `check_judging_numbers()` - converted to `$db_conn` (MysqliDb builder / `rawQueryOne()` with bound parameters), matching `upstream/master`'s own conversion (P2 SQLi migration, task 1b). The first test asserts `admin/judging_tables.admin.php`'s "Add/Edit Scores" link flips from `action=add` to `action=edit` once any score exists for a table (`score_count()`); the second records a score, mini-BOS flag, and 1st place for a judged entry and asserts the admin-only "Participant Summary" page (`includes/output.inc.php?section=summary` - not gated by `prefsDisplayWinners`, unlike the public winners page) shows the correct score, mini-BOS icon, and `"1st: <table name>"` place text (`score_check()`/`minibos_check()`/`winner_check()`). Both tests target input fields by the judged entry's own numeric id rather than `.first()`, since the add-scores page lists every received entry sharing a style regardless of table or scored-state, and this shared stack accumulates same-style entries across repeated test runs. `check_judging_flights()` and `check_judging_numbers()` have no caller anywhere in this fork or `upstream/master` (confirmed by a full-repo and upstream grep); they're covered by `tests/Unit/SourceHardeningTest.php` instead - see that file for a note on a pre-existing, unrelated bug (`check_judging_flights()`'s raw version referenced an undefined `$query_flights` variable) that the conversion incidentally fixed. |
| `sqli-migration-style-table-functions.spec.ts` | `lib/common.lib.php`'s style/table-info/display-formatting functions - `get_table_info()`, `style_convert()`, `style_type()`, `table_location()`, `styles_active()`, `limit_subcategory()`, `highlight_required()` - converted to `$db_conn` (MysqliDb builder / `rawQuery()`/`rawQueryOne()` with bound parameters), matching `upstream/master`'s own conversion (P2 SQLi migration, task 1c; the largest sub-task at 36 calls across 7 functions). The first test receives an entry, assigns its style to a judging table, and asserts the admin "Manage Tables" listing shows the *exact*, directly-queried received-entry count (`get_table_info("count_total")`) and the assigned style's real category/sub-category (`get_table_info("list")`), that the "Assign Judges" page resolves a real, non-blank location string (`table_location("default")`), and that the "Add Table" page renders non-empty category text for the style (`style_convert()`'s always-executed top-of-function lookup). The second test creates a custom style under an existing non-"Mead/Cider" style type (e.g. "Wine") and asserts the styles listing resolves that type's real name back from the `style_types` table (`style_type()` method=2/source="custom"). `styles_active()` (judging-window-gated, same unreachable category as `sections/winners.sec.php`'s own queries) and `limit_subcategory()` (reachable from the brew entry form, but insensitive on this stack's default unlimited `prefsUserSubCatLimit`) are covered by `tests/Unit/SourceHardeningTest.php` plus a direct PHP CLI verification against the live database with injection-shaped values instead - see that file and the task-1c report. `highlight_required()` has no caller anywhere in this fork or `upstream/master` (it isn't even present upstream) - genuinely dead code, guarded by `tests/Unit/SourceHardeningTest.php` only. |

### Starting from a clean database

Tests create unique users on every run, so back-to-back runs don't collide and you normally don't need to reset. To start completely fresh:

```bash
WEB_PORT=8082 DB_PORT=3307 docker compose down -v
WEB_PORT=8082 DB_PORT=3307 docker compose up -d --build
```

`down -v` **deletes the database volume**. Only do this on a stack that holds nothing you care about. The database is rebuilt from the files below, which run in order on first start:

| File | Purpose |
| --- | --- |
| `sql/bcoem_baseline_2.7.X.sql`, via `docker/01-baseline.sh` | Base schema and seed data (the script strips the table prefix to match production) |
| `docker/02-open-registration.sql` | Moves the baseline's 2023 deadlines into the future so entry and registration are open |
| `docker/03-e2e-fixtures.sql` | Turns off CAPTCHA so tests can register users, and pins the competition timezone to Central |
| `docker/04-schema-catchup.sql` | Brings the stale baseline up to the schema the code expects |
| `docker/05-bluebonnet-schema.sql` | Bluebonnet layer: `brewing` becomes a view over `brewing_bbo_real`, plus `bbo_tables` and `barcode_log` |

Two things to know about that seed data:

- `bbo_tables` is a **synthetic** layout (one table per BJCP category group). The real Bluebonnet table layout isn't in the repo.
- The timezone matters. `config.php` sets `SET time_zone = '-06:00'`. If the fixture's timezone differs, the 1-hour unpaid-delete rule removes every new entry immediately.

### Adding a test

1. **Pick a spec file.** Add to an existing one if the topic fits, or create `e2e/tests/<topic>.spec.ts`. Files are picked up automatically.
2. **Reuse the helpers** in `e2e/helpers/` rather than driving forms by hand:

   | Helper | Use it to |
   | --- | --- |
   | `auth.ts`: `loginAsAdmin(page)`, `login(page, email, pw)`, `registerEntrant(page)` | Get a logged-in admin, or a brand-new entrant (returns their credentials) |
   | `entries.ts`: `createEntrantWithEntry(browser)`, `chooseStyle(page)` | Create an entrant with one entry in a throwaway browser context |
   | `bluebonnet.ts`: `submitEntry(page, style, name, force?)`, `entrantWithEntry(...)`, `bboName(tag)` | Add Bluebonnet entries. `force = true` removes the disabled flag so you test the **server** check, not only the form |
   | `db.ts`: `query(sql)`, `backdateEntries(name, minutes)`, `purgeBboTestEntries()` | Read or adjust the database directly, for time-based rules |
   | `forms.ts`: `fillDateTime(page, name, value)` | Fill the 2.7 datetime pickers (plain `fill()` silently saves today's date) |

3. **Write the test.** The smallest useful example:

   ```ts
   import { test, expect } from '@playwright/test';
   import { loginAsAdmin } from '../helpers/auth';

   test('admin can open the entries page', async ({ page }) => {
     await loginAsAdmin(page);
     await page.goto('/index.php?section=admin&go=entries');
     await expect(page.locator('body')).toContainText('Entries');
   });
   ```

4. **Run just your test** with `npx playwright test -g "admin can open"`, then run the whole suite once before committing.

### Conventions and gotchas

- **One worker, in file order.** Tests share one seeded database, so `playwright.config.ts` sets `workers: 1` and `fullyParallel: false`. Don't turn parallelism on.
- **Use real UI paths.** Register and log in through the actual forms. That keeps tests honest about what a user can do.
- **Name test data so you can clean it up.** Bluebonnet specs prefix entry names with `BBO ` (via `bboName()`), and `purgeBboTestEntries()` deletes them before and after each test.
- **Test the server, not just the form.** For a rule that the page also enforces in JavaScript, add a case that bypasses the front end (see `submitEntry(..., force = true)`). A disabled button proves nothing about the server.
- **Mind the 30-second default timeout.** A test that registers several users can exceed it. Raise it for that one test with `test.setTimeout(60_000)`, as the table-cap test does.
- **Record known bugs as `test.fixme`.** Write the test as it should behave, mark it `fixme` with a comment explaining the gap, and flip it to a normal test when the bug is fixed.
- **Redirect messages carry the result.** Many app actions finish with `msg=<code>` in the URL (for example `msg=1` added, `msg=13` medal category full, `msg=bbo3` entrant already has an entry at this table). Assert on the code and on the visible text.

### Known gaps

- `bluebonnet-rules.spec.ts` has one `fixme`: the server accepts an add with no style. Only the literal `0-A` placeholder is rejected.
- Results from the most recent recorded run are in [`e2e/RESULTS-2026-11-02.md`](e2e/RESULTS-2026-11-02.md).

### Troubleshooting

| Symptom | Likely cause and fix |
| --- | --- |
| `App at http://... not ready after 120s` | Containers still starting, or the wrong `BASE_URL`/ports. Check `docker compose ps` (the db should say `healthy`) and `docker compose logs web`. |
| `ECONNREFUSED` from a DB-backed spec | `DB_PORT` doesn't match the port you started the stack on. |
| Every new entry vanishes immediately | The competition timezone and PHP's `SET time_zone` have drifted apart. Reseed with `down -v` then `up`. |
| Registration tests fail on a CAPTCHA | `docker/03-e2e-fixtures.sql` didn't run. The DB volume pre-dates it, so reseed with `down -v`. |
| Port already allocated | Another stack is using it. Choose different `WEB_PORT` and `DB_PORT` values and pass the same ones to the test command. |
| A full-suite run shows a handful of unrelated failures, all `createEntrantWithEntry()` timeouts (register/add-entry never shows up on `section=list`, or the add-entry submit button never becomes stable/clickable) | Pre-existing, non-deterministic flakiness on this shared, long-lived stack - **not** tied to any specific code change. Confirmed 2026-11 while landing P2 SQLi migration task 1b: reproduced on a clean baseline commit (`f254f6bb`) with none of that task's code present (3 of 4 tests in a targeted re-run failed identically), and a later clean full-suite run with the same code showed zero of these failures. A full-suite run has also, separately, shown `security-invariants.spec.ts`'s login tests (`:78`/`:101`) time out at 30s only to pass instantly (1-2s) when re-run alone - same category of intermittent slowness under a long sustained run, not a real regression. Reproduced again while landing task 1c: a ~2-hour full-suite run under heavy host load (load average ~14, dozens of stray Node/Chromium processes left from earlier runs) showed this failure in `sqli-migration-style-table-functions.spec.ts` and nine other, completely unrelated specs simultaneously, while `vendor/bin/phpunit` stayed 230/230 throughout; the new spec's affected test then passed cleanly in two isolated reruns once host load was lower. If you see this, re-run just the affected spec(s) in isolation before assuming your change broke something, and check host load (`top -l 1`)/stray test processes, not just the Docker stack's own health. |

---

## PHPUnit suite

**Status: the Unit tier is ported; Integration and Approval are not.**

```bash
composer install          # first time only
vendor/bin/phpunit        # Unit tier: 230 tests, 5 skipped, no database needed
```

The suite was written for the 3.x code on the `testing-baseline` branch and adapted to 2.7. How it was adapted, which tests are skipped because of 2.7 bugs, and which were deleted is in [tests/README.md](tests/README.md). Four of the bugs the port exposed have been fixed on this branch; see tests/README.md for the rest.

`testing-baseline` also has two database tiers that are **not** on this branch yet:

| Tier | Needs a database? | Covers |
| --- | --- | --- |
| Integration | Yes | Fee totals, table info, brewer info, best-brewer points, token verification. Each test rolls back its transaction |
| Approval | Yes | Output compared with committed snapshots |

A trial run against the Bluebonnet test database failed because those tests hardcode the `baseline_` table prefix (the Bluebonnet DB is unprefixed, and an empty `BCOEM_DB_PREFIX` is treated as unset), and because the 2.7 schema differs from 3.x. Porting them is open work.

**Don't share a database between PHPUnit's database tiers and Playwright.** The e2e suite commits real rows, and the fee-total integration tests sum across every row. Reseed (`docker compose down -v && up -d`) between them, or use separate stacks.

### Adding a unit test

1. Add a method to the matching file in `tests/Unit/`, or create `tests/Unit/<Topic>Test.php` (class `<Topic>Test extends PHPUnit\Framework\TestCase`).
2. Call the `lib/common.lib.php` function directly. The bootstrap has already loaded it.
3. If the test exposes a 2.7 bug, write the expectation you want and add `$this->markTestSkipped('2.7 bug: ...')` as the first line, then list it in `tests/README.md`.
4. Run `vendor/bin/phpunit`.

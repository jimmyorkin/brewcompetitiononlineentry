# PHPUnit tests (Unit tier)

Ported from the `testing-baseline` branch (written for 3.x) and adapted to the
2.7 code on this branch. Only the Unit tier is here; the Integration and
Approval tiers still need the database prefix and schema work described in
[TESTING.md](../TESTING.md#phpunit-suite).

```bash
composer install            # first time only
vendor/bin/phpunit          # 226 tests, 5 skipped, no database needed
```

`tests/bootstrap.php` defines the path constants and stubs, then loads
`lib/common.lib.php`, so no database or `site/config.php` is needed.

## How the port treated differences between 3.x and 2.7

| Situation | What the test does |
| --- | --- |
| 2.7 behaves differently but not wrongly | The test pins 2.7's behaviour, with a comment. Examples: `in_string()` returns `NULL` (not `FALSE`) on no match; `search_array()` returns a list of matches; `currency_info()` has 28 currencies. |
| 2.7 has a bug that 3.x fixed | The test keeps the correct expectation and is **skipped** with the reason. Remove the skip when the fix is backported. |
| The function doesn't exist in 2.7 | The test was **deleted**. |

### Skipped tests

| Tests | Why |
| --- | --- |
| 5 | Skipped on `testing-baseline` (they need a database, or call functions commented out of the library) |

### Bugs fixed on this branch

Four bugs the ported tests exposed were fixed in `lib/common.lib.php`, and one 3.x
feature was added to `lib/date_time.lib.php`, using the code from `testing-baseline`
(bug fixes from commit `ebb35e55`). The matching skips were removed:

- `designations('')` returned `'<br />'`; it now returns `''`.
- `random_generator()` returned strings of the wrong length; it now builds exactly `$digits` characters with `random_int()`. Method 3 was dropped (no caller uses it; callers use methods 1 and 2).
- `readable_number()` used `>` instead of `>=`, so 100 and 1000 were mis-rendered.
- `display_array_content()` ignored all but its last `rtrim()`, leaving a trailing `', '`.
- `getTimeZoneDateTime()` gained the `'year'` return format (3.x feature; nothing in 2.7 calls it yet). Only that case was added; 3.x's wider rewrite of the function (empty-timestamp guard, no global timezone change) was deliberately not backported.

### Deleted tests (functions not in 2.7)

`create_bs_alert()` and `create_bs_popover()` (18 tests; 3.x Bootstrap 5
helpers), `simpleEncrypt()`/`simpleDecrypt()` (2), and
`password_verify_legacy()`/`password_needs_legacy_upgrade()` (8). 2.7 checks
passwords with phpass directly in `includes/logincheck.inc.php`; that path is
covered by the Playwright security specs.

### Known noise

Two benign PHP warnings are printed (`get_timezone()` with an invalid offset,
and `search_array()` when nothing matches). They are the code's behaviour, not
test failures; `failOnWarning` is intentionally off.

## Source-level guards

`tests/Unit/SourceHardeningTest.php` reads PHP source as text to stop two fixed
hardening issues coming back: raw `$_COOKIE` values echoed into HTML (register,
contact and first-run setup forms), and `includes/process.inc.php` forcing
`display_errors` on. They are coarse by design. The browser-level cookie test is
`e2e/tests/xss-cookies.spec.ts`; the setup form is only reachable during first-run
setup, so it is covered by the source guard alone.

It also guards `lib/common.lib.php`'s `total_entries_brewer()` and `total_paid()`
(P2 SQLi migration, task 1a) - both are dead code (no caller anywhere in the
app), so there is no page to exercise them through. Their conversion to
`$db_conn->where()/getOne()` was verified directly against this stack's live
database via the PHP CLI inside the web container instead - see the task-1a
report for that script and its output.

It also guards `total_paid_received()`'s `$id>0` and `$archive` branches
(same task). Unlike the two functions above, these branches are **not** dead
code - `best_brewer_points()` calls the `$id>0` form with a real brewer uid
(reachable from `awards.php` and `sections/bestbrewer.sec.php`), and
`output/export.output.php`'s circuit export calls the `$archive` form with a
request-derived archive suffix. Both are source-guarded rather than
e2e-tested because reaching them safely on this shared stack would mean
flipping `prefsDisplayWinners`/judging-window state (same constraint as the
`winners.sec.php` guard above) or creating a real archive, which relocates
the competition's live tables - the same class of destructive one-time
operation `convert_bjcp_2021.inc.php` is guarded for. Query shape and
injection-safety for both branches were verified directly against this
stack's live database via the PHP CLI inside the web container - see the
task-1a report.

It also guards `lib/common.lib.php`'s `check_judging_flights()` and
`check_judging_numbers()` (P2 SQLi migration, task 1b) - both converted to
`$db_conn->where()/getOne()`, matching `upstream/master`'s own conversion
byte-for-byte. Like `total_entries_brewer()`/`total_paid()` above, both are
dead code: a full-repo grep (and a check of `upstream/master`) found no
caller anywhere for either function. `check_judging_flights()`'s conversion
also incidentally fixed a pre-existing, migration-unrelated bug: its raw
version referenced an undefined `$query_flights` variable in its third
query (should have been `$query_check_flights`); since the function has no
caller this never surfaced, and the builder conversion removes the stray
reference entirely. The guard asserts this too. Task 1b's other four
functions - `winner_check()`, `score_count()`, `score_check()`, and
`minibos_check()` - are reachable in production and are covered by
`e2e/tests/sqli-migration-judging-scoring-functions.spec.ts` instead.

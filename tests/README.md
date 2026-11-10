# PHPUnit tests (Unit tier)

Ported from the `testing-baseline` branch (written for 3.x) and adapted to the
2.7 code on this branch. Only the Unit tier is here; the Integration and
Approval tiers still need the database prefix and schema work described in
[TESTING.md](../TESTING.md#phpunit-suite).

```bash
composer install            # first time only
vendor/bin/phpunit          # 234 tests, 5 skipped, no database needed
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

It also guards `lib/common.lib.php`'s `get_table_info()`, `style_convert()`,
`style_type()`, and `table_location()` (P2 SQLi migration, task 1c) - the
branches not reachable from the admin judging-tables pages that
`e2e/tests/sqli-migration-style-table-functions.spec.ts` exercises (e.g.
`get_table_info()`'s `"basic"`/`"styles"`/`"count_scores"`/
`"count_single_table"` methods, and `style_convert()`'s cases 6-9, which
render only in CSV export, judging-flights admin, or pullsheet output). All
four functions' converted query shapes were also verified directly against
this stack's live database via the PHP CLI inside the web container, with
injection-shaped id/style/archive values - see the task-1c report.

It also guards `styles_active()` (same task) - its three callers are all
gated behind this shared stack's winners-display/judging-window state
(same unreachable category as the `winners.sec.php` guard and
`total_paid_received()`'s `$id>0` branch above), or sit deep inside a
judging-window-gated export branch. Covered by this source guard plus the
same direct PHP CLI verification.

It also guards `limit_subcategory()` (same task) - reachable from the brew
entry form's style dropdown (`sections/brew.sec.php`), but this fork's
default, unset `prefsUserSubCatLimit` makes the page's enabled/disabled
style option insensitive to the function's actual return value for any
realistically-sized test dataset, so a page-renders check alone wouldn't
catch a conversion bug that silently miscounts. Covered by this source guard
plus the same direct PHP CLI verification (normal and injection-shaped
`$style`/`$uid` values).

It also guards `highlight_required()` (same task) - genuinely dead code, no
caller anywhere in this fork, and no counterpart at all in `upstream/master`
(confirmed by a full-repo grep of both), consistent with its own
`// Unused. 2.6.0.` comment.

It also guards `purge_entries()`'s `"unpaid"` branch (P2 SQLi migration,
task 1d). Unlike `"unconfirmed"`/`"special"` (covered live by
`e2e/tests/sqli-migration-admin-data-integrity-functions.spec.ts`), this
branch is reachable but not safely e2e-testable on this shared stack: its
real baseline currently has 18 rows with `brewPaid IS NULL`, which the live
admin "Purge All Unpaid Entries" endpoint would delete.

It also documents and guards a deliberate divergence from `upstream/master`'s
own conversion in `data_integrity_check()` (same task): the duplicate-
`judging_scores`-row cleanup uses `$db_conn->get()` (no row limit) for its
per-`eid` row count, not upstream's `getOne()`. `getOne()` applies an
implicit `LIMIT 1`, so `$db_conn->count` after it is always 0 or 1 - it can
never satisfy the `"> 1"` duplicate check that follows, silently disabling
the cleanup entirely. This looks like a functional regression upstream's own
migration introduced (confirmed by reading `MysqliDb::get()`/`getOne()`/
`_dynamicBindResults()`'s LIMIT-1 behavior directly), not a pre-existing bug
predating any SQLi conversion, so it was not carried over.

It also guards `convert_to_ba()`, `convert_to_pro()`, and
`remove_sensitive_data()` (same task) - all three genuinely dead code (no
caller anywhere in this fork, and none of the three exist in
`upstream/master` at all, confirmed by a full-repo and upstream grep).
`convert_to_ba()` and `remove_sensitive_data()` also carry pre-existing bugs
left exactly as-is (not this migration's job to fix unreachable dead code's
unrelated bugs): `convert_to_ba()`'s final `UPDATE` targets `"brewing"`, not
`"styles"`, for the `brewStyleActive` column, which doesn't exist on
`"brewing"`; `remove_sensitive_data()` references the undefined
`$club_array`. `remove_sensitive_data()` additionally used to reference a
second query's raw `mysqli_result` one query too early, in its first loop's
own `do-while` continuation check - converting that cursor-style loop to
MysqliDb's array-returning `get()`/`foreach` (the builder has no
cursor-fetch equivalent to preserve the exact crash point) incidentally
makes that first loop run to completion instead of erroring immediately on
it. The function remains just as unreachable and still fatally broken
overall (now via the still-present, still-unfixed `$club_array` bug
instead), so this is documented as a known, unavoidable consequence of the
conversion mechanism rather than a behavior change worth preserving
bug-for-bug.

It also guards `lib/common.lib.php`'s `available_at_location()`,
`judge_assignment()`, `user_flight_assignment()`, and
`entry_flight_assignment()` (P2 SQLi migration, task 1e) - all four
converted to `$db_conn` (MysqliDb builder `where()`/`get()`/`getOne()`, or
`rawQueryOne()` with `?` placeholders for `judge_assignment()`'s two-table
JOIN), matching `upstream/master`'s own conversion byte-for-byte.
`available_at_location()` is genuinely dead code: a full-repo grep finds no
caller anywhere in this fork, and in `upstream/master` the only hit outside
its own definition is a code comment in `lib/admin.lib.php`, not an actual
call. The other three are reachable in production but not safely
e2e-testable on this shared stack: `judge_assignment()`'s only caller is
`output/labels.output.php`'s PDF judge-label generation behind the "virtual
locations" feature (binary PDF output, not worth standing up for one query);
`user_flight_assignment()`/`entry_flight_assignment()` are only called from
`eval/judging_dashboard.eval.php` inside an `if (!$queued)` block gated on
the shared `judging_preferences.jPrefsQueued` flag, which this stack's
seeded baseline has set to `'Y'` - flipping it to `'N'` would change
queued-vs-non-queued judging behavior for every judge on this long-lived
shared stack, the same category of global-shared-state risk as the
`winners.sec.php`/`prefsDisplayWinners` guard above. All four were verified
directly against this stack's live database via a one-off PHP CLI script
run inside the web container: each converted query runs without a SQL
error, and an injection-shaped bound value (`"1' OR '1'='1"`) returns no
row rather than widening the match to every row. The task's other six
functions - `brewer_assignment()`, `table_assignments()`,
`dropoff_location()`, `judge_steward_availability()`, `judge_entries()`,
and `flight_count_info()` - are reachable in production and are covered by
`e2e/tests/sqli-migration-judge-table-flight-assignment-functions.spec.ts`
instead.

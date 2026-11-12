# PHPUnit tests (Unit tier)

Ported from the `testing-baseline` branch (written for 3.x) and adapted to the
2.7 code on this branch. Only the Unit tier is here; the Integration and
Approval tiers still need the database prefix and schema work described in
[TESTING.md](../TESTING.md#phpunit-suite).

```bash
composer install            # first time only
vendor/bin/phpunit          # 223 tests, 5 skipped, no database needed
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

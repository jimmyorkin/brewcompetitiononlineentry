# SQLi migration on `bluebonnet-testing` — design

## Intent and why

`bluebonnet-testing` (Jimmy's 2.7.2.1 fork) has about 751 raw `mysqli_query()`
calls across ~150 files, most built with `sprintf()` string interpolation.
Four P1 items are already fixed on this branch (login bypass, login SQLi,
session fixation, path traversal), plus cookie XSS and a forced
`display_errors`. Upstream 3.x closed the broader SQLi exposure (`P1-SEC-002`)
by converting to the `MysqliDb` query builder (commit `a8092f18`). This
project asks: how much of that conversion can be carried over to 2.7, and in
what order should the rest be done.

A 2026-11-05 audit (diffing every 2.7 file with raw SQL against its upstream
counterpart) found the fix does not drop in cleanly for most of the
codebase — upstream's conversion rewrote the surrounding code, not just the
queries:

| Similarity to upstream | Files | Raw calls | What this means |
| --- | --- | --- | --- |
| ≥90% (near-identical) | 21 | 53 | Upstream's fix should port with light adaptation |
| 70–90% | 44 | 336 | Same shape, diverged enough to need real review per file |
| <70% | 69 | 331 | Diverged too far to treat as a port; needs its own fix |
| Not in upstream (2.7/Bluebonnet-only) | 8 | 31 | No upstream fix to reference at all |

The `MysqliDb.php` library (v2.9.3) is already vendored and unused in 2.7 —
`grep` finds zero `$db->` call sites. Nothing needs installing.

While auditing which files mix raw request input into SQL, found a new,
separate finding: `includes/forgot_password.inc.php:18` builds
`SELECT * FROM %s WHERE user_name = '%s'` with `sprintf()` straight from
`$_POST['loginUsername']`, no `sterilize()`, no escaping — on an
unauthenticated endpoint. Same bug shape as the login SQLi already fixed in
`includes/logincheck.inc.php`. This is addressed first, on its own, before
the broader migration.

## Goals

- Close the forgot_password SQLi (separate, highest-severity item).
- Port the ~53 near-identical-to-upstream raw queries (21 files) onto
  prepared statements, using upstream's own conversion as the reference.
- Leave the 70% and below tiers, and the Bluebonnet-only files, as a tracked
  follow-on scope — not detailed here, because each needs its own read of
  the file to know what the fix even is; attempting to pre-specify them now
  would be guessing.
- Every fix ships with a test that fails before and passes after, following
  the pattern already used for the cookie XSS and `display_errors` fixes
  (`e2e/tests/xss-cookies.spec.ts`, `tests/Unit/SourceHardeningTest.php`).

## Non-goals / anti-goals

- Not a full MysqliDb query-builder conversion of the whole app in one pass.
- Not a rewrite of files whose logic has diverged from upstream — those get
  their own fix, not upstream's patch.
- Not scope for the PHPUnit Integration/Approval tiers (tracked separately in
  memory as `project-bluebonnet-open-issues`).
- A fix landing here must not change a query's result shape for any existing
  caller — this is a security fix, not a refactor, and behavior changes are
  a failure even if "more correct."

## Constraints

- No PR to Jimmy's upstream repo from this work without the user's explicit
  go-ahead; commit and push directly to `origin/bluebonnet-testing`, the
  established pattern for this engagement.
- A query that interpolates a *table name* (via `$prefix.table`) must keep
  doing so — only values go through parameter binding. Table/column
  identifiers can't be bound as `?` parameters in MySQLi prepared statements.
- Every bug-fix commit updates `tests/README.md` / `TESTING.md` counts and
  the `project-bluebonnet-open-issues` memory, same as prior commits on this
  branch (`3687c91e`, `d51ff7fd`).
- Run the full Playwright suite (`e2e/`) and `vendor/bin/phpunit` before
  calling any task done — not just the new test for that task — since a
  parameter-binding mistake in one query can silently return 0 rows for an
  unrelated caller.

## What's decided here (file groups for the near-identical tier)

Grouped by directory, so files that get touched together in review stay
together:

1. **Root/setup/update:** `setup.php`, `update.php`
2. **Process includes:** `includes/process/process_style_types.inc.php`,
   `includes/process/process_archive_hosted.inc.php`,
   `includes/process/process_judging_scores.inc.php`,
   `includes/process/process_barcode_check_in.inc.php`,
   `includes/process/process_users_setup.inc.php`
3. **Sections:** `sections/winners.sec.php`, `sections/brewer_entries.sec.php`,
   `sections/login.sec.php`, `includes/headers.inc.php`
4. **Admin:** `admin/judging_assign.admin.php`,
   `admin/competition_info.admin.php`, `admin/archive.admin.php`
5. **Eval/output/db:** `eval/scoresheet.eval.php`,
   `eval/judging_not_assigned.eval.php`, `eval/judging_dashboard.eval.php`,
   `output/bos_mat.output.php`, `output/assignments.output.php`,
   `includes/db/output_entries_export_winner.db.php`,
   `includes/convert/convert_bjcp_2021.inc.php`

## Left to the implementer

- The exact mechanical conversion for each file: diff it against
  `upstream/master` and apply the matching hunk, adapting names/variables
  that have drifted (the plan doesn't repeat upstream's patch text).
- Which bind type (`s`/`i`/`d`) each parameter needs — read from the column's
  use, not guessed.
- Whether a given query is reachable by an e2e test vs needs a unit test
  with a seeded DB vs (for `setup.php`/`update.php`, one-time scripts) only
  a manual verification step, documented in the task.

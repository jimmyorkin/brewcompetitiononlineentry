# SQLi migration, Phase 2 (mid-similarity tier) — design

## Intent and why

Phase 1 (`docs/superpowers/specs/2026-11-05-sqli-migration-design.md`,
`docs/superpowers/plans/2026-11-05-sqli-migration-phase1.md`) converted every
file on `bluebonnet-testing` whose raw SQL was ≥90% similar to its upstream
(3.x) counterpart — upstream's own prepared-statement conversion could be
ported with light adaptation. That left two harder tiers, re-measured fresh
on 2026-11-06 (the same diff-similarity method, re-run after Phase 1's own
changes and the two out-of-plan fixes that followed it):

| Tier | Files | Raw `mysqli_query()` calls |
| --- | --- | --- |
| 70–90% similar to upstream (this phase) | 44 | 336 |
| <70% similar to upstream (Phase 3, not detailed here) | 69 | 331 |
| No upstream file to reference at all | 7 | 21 |

This project is Phase 2: the 44 files in the middle tier. They're close
enough to upstream that its own conversion is still the right reference, but
diverged enough that each file needs its own diff-and-adapt, not a
copy-paste — the same judgment call Phase 1's tasks already made routinely
for its own tier.

## Goals

- Convert all 336 raw `mysqli_query()` calls in the 44 listed files to
  prepared statements or MysqliDb builder calls, following each file's own
  upstream diff as the reference, per the pattern established in Phase 1.
- Every fix ships with a test (e2e where reachable; a PHPUnit source guard
  plus a one-off manual check on a throwaway Docker project otherwise — the
  pattern Phase 1 settled on by Task 2's second attempt).
- Flag, don't silently fix, anything found outside this phase's 44-file list
  (new vulnerabilities in adjacent files, dead code, access-control issues) —
  same discipline Phase 1 held throughout.

## Non-goals / anti-goals

- Not Phase 3 (the 69 files below 70% similarity) or the 7 files with no
  upstream reference — each of those needs its own read before even a
  grouping can be trusted, and attempting to pre-scope them now would be
  guessing, the same reasoning Phase 1's design doc gave for excluding them.
- Not a refactor. A query's result shape must not change for any existing
  caller.
- `lib/common.lib.php` (130 of this phase's 336 calls, by far the largest
  single file) gets its own task rather than being grouped with anything
  else, given its size and its status as the most central, highest-traffic
  file in the legacy codebase.

## Constraints

- Same working-agreement constraints as Phase 1: no PR to Jimmy's upstream
  repo without explicit go-ahead; commit and push to `origin/bluebonnet-testing`
  directly; table/column identifiers stay interpolated, only values are
  bound; run the full suite before any task is called done; update
  `TESTING.md` / `tests/README.md` and the `project-bluebonnet-open-issues`
  memory as work lands, the same way every Phase 1 commit did.
- The shared Docker dev stack (`WEB_PORT=8082`/`DB_PORT=3307`) is long-lived
  and other work depends on it — never run a destructive command against it
  (this bit Phase 1 twice; both times the fix was to use a throwaway,
  separately-named Compose project instead).

## What's decided here (file groups for this phase)

1. **`lib/common.lib.php` alone** (130 calls) — large and central enough to
   warrant its own task rather than sharing one with anything else.
2. **Remaining libs/core request flow** (5 files, 35 calls): `lib/process.lib.php`,
   `lib/preflight.lib.php`, `includes/process.inc.php`, `site/bootstrap.php`,
   `includes/data_cleanup.inc.php`.
3. **`includes/process/*.inc.php`** (11 files, 66 calls): `process_archive.inc.php`,
   `process_brewer.inc.php`, `process_brewing.inc.php`, `process_comp_info.inc.php`,
   `process_delete.inc.php`, `process_judging_assignments.inc.php`,
   `process_judging_flights.inc.php`, `process_sponsors.inc.php`,
   `process_styles.inc.php`, `process_users.inc.php`,
   `process_users_register.inc.php`.
4. **`includes/db/*.db.php`** (9 files, 49 calls): `common.db.php`,
   `entries_by_style.db.php`, `organizations.db.php`, `output_assignments.db.php`,
   `output_bos_mat.db.php`, `output_labels.db.php`, `output_pullsheets_bos.db.php`,
   `output_pullsheets_entries.db.php`, `scores_bestbrewer.db.php`. (The first
   two of these — `output_assignments.db.php` and `output_bos_mat.db.php` —
   are the pair flagged in Phase 1's own ledger as a scope-boundary miss:
   included by two files Phase 1 touched, already noted in memory as
   `sterilize()`-protected but not parameterized. This task closes that gap.)
5. **Everything else** (18 files, 56 calls, mechanical — each file has 1-14
   calls): `output/export.output.php`, `output/labels.output.php`,
   `output/participant_summary.output.php`, `output/print.output.php`,
   `output/pullsheets.output.php`, `ajax/tables_mode.ajax.php`,
   `eval/install_eval_db.eval.php`, `awards.php`, `qr.php`,
   `setup/install_db.setup.php`, `sections/brew.sec.php`,
   `sections/default.sec.php`, `includes/debug/query_count_begin.debug.php`,
   `includes/debug/query_count_end.debug.php`,
   `includes/convert/convert_bjcp_2015.inc.php`, `admin/entries.admin.php`,
   `admin/judging_locations.admin.php`, `admin/style_types.admin.php`.

## Left to the implementer

- The exact mechanical conversion per file: diff against `upstream/master`,
  apply the matching hunk, adapt names/variables that have drifted.
- Bind types, multi-row vs single-row fetch shape, and whether a given query
  needs an e2e test, a source guard, or a manual throwaway-stack check — read
  from the file, not guessed, per Phase 1's established judgment calls.
- Whether `lib/common.lib.php`'s 130 calls (Task 1) need splitting into
  sub-steps within that one task; the file's diff against upstream should be
  read before committing to a sub-plan.

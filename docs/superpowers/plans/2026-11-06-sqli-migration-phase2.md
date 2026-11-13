# SQLi Migration (Phase 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the 44 files on `bluebonnet-testing` whose raw SQL is 70-90% similar to upstream's own prepared-statement conversion — 336 raw `mysqli_query()` calls — onto prepared statements or MysqliDb builder calls, following each file's own upstream diff.

**Architecture:** Same pattern Phase 1 established: `mysqli_prepare()` / `mysqli_stmt_bind_param()` / `mysqli_stmt_execute()` / `mysqli_stmt_get_result()`, or MysqliDb's `$db_conn->where()`/`->get()`/`->getOne()` builder, chosen per-file to match whichever style the file already leans toward. Table/column names stay interpolated from trusted sources (`$prefix`, fixed strings); only values become bound parameters.

**Tech Stack:** PHP 8.2 (mysqli), PHPUnit 10, Playwright, Docker/MariaDB dev stack.

**Spec:** `docs/superpowers/specs/2026-11-06-sqli-migration-phase2-design.md`

## Global Constraints

- No PR to Jimmy's upstream repo without the user's explicit go-ahead; commit and push to `origin/bluebonnet-testing` directly.
- Table/column identifiers are never bound as `?` parameters — only values are.
- A fix must not change any existing caller's result shape; this is a security fix, not a refactor.
- Never run a destructive command (`docker compose down`, `down -v`, etc.) against the shared, long-lived `bluebonnet-testing` Docker stack. For a query unreachable without disrupting that stack, use a separate throwaway Compose project (distinct name/ports), tear it down after, and add a `tests/Unit/SourceHardeningTest.php` guard as the permanent regression check.
- Run the full suite (`vendor/bin/phpunit` and the full Playwright suite from `e2e/`) before marking any task done, not just that task's own new tests.
- Every task updates `TESTING.md` / `tests/README.md`'s counts and the `project-bluebonnet-open-issues` memory to match.
- If a task finds something outside its own file list (a new vulnerability, dead code, an access-control gap), do not fix it — flag it in the report's CONCERNS field, per Phase 1's established discipline.

## Review Focus

- `lib/common.lib.php` (Task 1) is the single largest file in this phase (130 of 336 calls) and the most central file in the legacy codebase — a wrong bind type here has the widest possible blast radius of any file in this migration. Task 1's steps require listing every call site and grouping by function before converting, not converting top-to-bottom blind.
- `includes/process.inc.php` (Task 2) is the main request router included on every request; a mistake here doesn't fail one feature, it fails the app. Task 2's test must include a full-suite smoke check (the existing Playwright `smoke.spec.ts`), not just its own new test, before being called done.
- `includes/db/output_assignments.db.php` and `includes/db/output_bos_mat.db.php` (Task 4) currently protect request-derived values with `sterilize()`'s `addslashes()` only, which doesn't stop an unquoted-identifier or charset-based bypass — Task 4's test should specifically target the same kind of payload that defeated `sterilize()`-only protection elsewhere in this migration (a literal single quote), not just confirm the happy path still works.
- Task 5 batches 18 small, low-call-count files across many directories (per subagent-driven-development's "batch small same-shape work" guidance) — the risk is one of the 18 getting skipped in the shuffle. Task 5's steps require a per-file checklist in the report, not just an aggregate "done."
- A file in this tier may have diverged from upstream specifically *because* it already has some ad-hoc escaping (a local `addslashes()`, a hand-rolled quote check) that a blind upstream-diff port would remove. Every task's steps require checking for and preserving (or deliberately and visibly replacing) any such existing protection, not silently dropping it in favor of the "cleaner" upstream version.

---

## Task 1: `lib/common.lib.php`, split into six sub-tasks

**Split ruling (controller, after Task 1's implementer reported BLOCKED):** 130
calls span 53 distinct functions in a 5248-line, highest-traffic file — too
large and too varied in risk (fee totals, archive conversion, judge
assignment, misc lookups) to convert and test as one task with the rigor
this migration requires. Accepted the implementer's own proposed 6-way
split, grouped by functional area so each sub-task's e2e coverage overlaps
naturally and call counts stay in the ~12-36 range. Each sub-task below
follows the same step structure as every other task in this plan; they run
sequentially (never in parallel — same file), each against the HEAD the
previous one left.

**Files (all sub-tasks):** `lib/common.lib.php` (disjoint functions per
sub-task — see each sub-task's function list)
**Test (all sub-tasks):** new/extended files under `e2e/tests/` and/or
`tests/Unit/`

**Interfaces (all sub-tasks):**
- Consumes: the HEAD left by the previous sub-task in this list (1a before
  1b before 1c before 1d before 1e before 1f).
- Produces: none other tasks depend on.

### Task 1a: Financial / fee totals (7 functions, 25 calls)

`total_fees`, `total_fees_paid`, `total_not_paid_brewer`,
`total_entries_brewer`, `total_paid_received`, `total_paid`,
`total_nopay_received`

- [ ] **Step 1: Diff each function against `upstream/master`'s version** (`git diff --no-index <(git show upstream/master:lib/common.lib.php) lib/common.lib.php`, read the hunks for these 7 functions).
- [ ] **Step 2: Write the failing test(s) first** — these are fee-total calculations read throughout entry/admin pages; prefer an e2e test asserting an actual computed total over a source guard where the function is reachable.
- [ ] **Step 3: Run the new tests to verify they fail or are inconclusive against the current code.**
- [ ] **Step 4: Convert these 7 functions' queries**, per their upstream diffs, preserving any existing ad-hoc escaping's protective effect.
- [ ] **Step 5: Run the new tests to verify they pass.**
- [ ] **Step 6: Run the full suites, update docs, and commit**

```bash
git add lib/common.lib.php e2e/tests tests/Unit TESTING.md tests/README.md
git commit -m "SQLi migration Phase 2: common.lib.php financial/fee functions (1a)"
```

### Task 1b: Judging / scoring / winner determination (6 functions, 12 calls)

`winner_check`, `score_count`, `score_check`, `minibos_check`,
`check_judging_flights`, `check_judging_numbers`

- [ ] **Step 1: Diff each function against `upstream/master`'s version.**
- [ ] **Step 2: Write the failing test(s) first** — these determine competition results; an incorrect conversion could silently change who wins.
- [ ] **Step 3: Run the new tests to verify they fail or are inconclusive against the current code.**
- [ ] **Step 4: Convert these 6 functions' queries**, per their upstream diffs.
- [ ] **Step 5: Run the new tests to verify they pass.**
- [ ] **Step 6: Run the full suites, update docs, and commit**

```bash
git add lib/common.lib.php e2e/tests tests/Unit TESTING.md tests/README.md
git commit -m "SQLi migration Phase 2: common.lib.php judging/scoring functions (1b)"
```

### Task 1c: Style / table-info / display formatting (7 functions, 36 calls)

`get_table_info`, `style_convert`, `style_type`, `table_location`,
`styles_active`, `limit_subcategory`, `highlight_required`

This is the largest sub-task. If `get_table_info` (14 calls) or
`style_convert` (7 calls) prove unusually divergent from upstream once you
read them, you may split this sub-task further the same way Task 1 itself
was split — report BLOCKED with your reasoning rather than rushing it.

- [ ] **Step 1: Diff each function against `upstream/master`'s version.**
- [ ] **Step 2: Write the failing test(s) first.**
- [ ] **Step 3: Run the new tests to verify they fail or are inconclusive against the current code.**
- [ ] **Step 4: Convert these 7 functions' queries**, per their upstream diffs.
- [ ] **Step 5: Run the new tests to verify they pass.**
- [ ] **Step 6: Run the full suites, update docs, and commit**

```bash
git add lib/common.lib.php e2e/tests tests/Unit TESTING.md tests/README.md
git commit -m "SQLi migration Phase 2: common.lib.php style/table-info functions (1c)"
```

### Task 1d: Admin / data-integrity / archive conversion (5 functions, 26 calls)

`data_integrity_check`, `purge_entries`, `remove_sensitive_data`,
`convert_to_ba`, `convert_to_pro`

Highest-risk sub-task: these run bulk/destructive operations (purging,
anonymizing, converting records). Test on data you create for the test, not
shared fixture data, and never against the shared stack's real baseline rows.

- [ ] **Step 1: Diff each function against `upstream/master`'s version.**
- [ ] **Step 2: Write the failing test(s) first**, using disposable test data created within the test itself.
- [ ] **Step 3: Run the new tests to verify they fail or are inconclusive against the current code.**
- [ ] **Step 4: Convert these 5 functions' queries**, per their upstream diffs.
- [ ] **Step 5: Run the new tests to verify they pass.**
- [ ] **Step 6: Run the full suites, update docs, and commit**

```bash
git add lib/common.lib.php e2e/tests tests/Unit TESTING.md tests/README.md
git commit -m "SQLi migration Phase 2: common.lib.php admin/data-integrity functions (1d)"
```

### Task 1e: Judge / table / flight assignment (10 functions, 12 calls)

`judge_assignment`, `table_assignments`, `available_at_location`,
`dropoff_location`, `judge_steward_availability`, `judge_entries`,
`user_flight_assignment`, `entry_flight_assignment`, `flight_count_info`,
`brewer_assignment`

- [ ] **Step 1: Diff each function against `upstream/master`'s version.**
- [ ] **Step 2: Write the failing test(s) first.**
- [ ] **Step 3: Run the new tests to verify they fail or are inconclusive against the current code.**
- [ ] **Step 4: Convert these 10 functions' queries**, per their upstream diffs.
- [ ] **Step 5: Run the new tests to verify they pass.**
- [ ] **Step 6: Run the full suites, update docs, and commit**

```bash
git add lib/common.lib.php e2e/tests tests/Unit TESTING.md tests/README.md
git commit -m "SQLi migration Phase 2: common.lib.php judge/table/flight assignment functions (1e)"
```

### Task 1f: Misc single-call count/lookup utilities (18 functions, 19 calls)

`get_contact_count`, `get_entry_count`, `get_evaluation_count`,
`get_participant_count`, `entry_info`, `check_bos_loc`, `table_exists`,
`user_check`, `judging_location_info`, `verify_token`, `pro_am_check`,
`user_submitted_eval`, `eval_exits`, `entries_unconfirmed`,
`check_special_ingredients`, `entries_no_special`, `get_archive_count`,
`brewer_info`

Low risk, mechanical, one call each — batch these per
subagent-driven-development's "batch small same-shape work" guidance.

- [ ] **Step 1: Diff each function against `upstream/master`'s version. Keep a per-function checklist in the report** (18 functions is easy to under-count).
- [ ] **Step 2: Write the failing test(s) per function.**
- [ ] **Step 3: Run the new tests to verify they fail or are inconclusive against the current code.**
- [ ] **Step 4: Convert each function's query**, per its upstream diff, checking it off the Step 1 list.
- [ ] **Step 5: Run the new tests to verify they pass.**
- [ ] **Step 6: Run the full suites, update docs, and commit**

```bash
git add lib/common.lib.php e2e/tests tests/Unit TESTING.md tests/README.md
git commit -m "SQLi migration Phase 2: common.lib.php misc utility functions (1f)"
```

---

## Task 2: Remaining libs and the core request flow

**Files:**
- Modify: `lib/process.lib.php`, `lib/preflight.lib.php`, `includes/process.inc.php`, `site/bootstrap.php`, `includes/data_cleanup.inc.php`
- Test: add to `e2e/tests/` and/or `tests/Unit/`

**Interfaces:**
- Consumes: none from other tasks.
- Produces: none other tasks depend on.

- [ ] **Step 1: List every `mysqli_query(` call in each file and diff each against `upstream/master`.**

- [ ] **Step 2: Write the failing test(s).** For `includes/process.inc.php` specifically, also run the existing `e2e/tests/smoke.spec.ts` against the current (unconverted) code first, to have a documented before-state for comparison.

- [ ] **Step 3: Run the new tests to verify they fail or are inconclusive against the current code.**

- [ ] **Step 4: Convert each file's raw queries**, per its own upstream diff, preserving any existing ad-hoc escaping's protective effect.

- [ ] **Step 5: Run the new tests to verify they pass, AND re-run `smoke.spec.ts`** (per Review Focus: `process.inc.php` is the main router, so the whole app's smoke test is this task's acceptance bar, not just its own new test).

- [ ] **Step 6: Run the full suites, update docs, and commit**

```bash
git add lib/process.lib.php lib/preflight.lib.php includes/process.inc.php site/bootstrap.php includes/data_cleanup.inc.php e2e/tests tests/Unit TESTING.md tests/README.md
git commit -m "SQLi migration Phase 2: remaining libs and core request flow"
```

---

## Task 3: `includes/process/*.inc.php` group, split into three sub-tasks

Split 2026-11-10 after the first implementer reported BLOCKED: 11 procedural
action-handler files (no function-level units, each included directly by
`includes/process.inc.php`'s dispatcher) with 66 calls total is too large/uneven
for one pass, the same judgment call Task 1 made at 53 functions. Grouped by
risk tier/functional area; counts verified via grep, sum to 66, files disjoint
and complete across all three groups.

### Task 3a: Core brewer/entry/user flows (4 files, 30 calls)

**Files:**
- Modify: `includes/process/process_brewer.inc.php` (12 calls), `includes/process/process_brewing.inc.php` (7 calls), `includes/process/process_users.inc.php` (6 calls), `includes/process/process_users_register.inc.php` (5 calls)
- Test: add to `e2e/tests/`

Highest-risk group: brewer account management, entry submission (the exact
file the known `createEntrantWithEntry()` non-persistence bug's downstream
effect lands in — apply the DB-query + `docker logs` cross-check discipline
established in Task 2's review before waving off any related test failure),
user accounts, and public registration.

- [ ] **Step 1: List every `mysqli_query(` call in each file and diff each against `upstream/master`.**
- [ ] **Step 2: Write the failing test(s)**, one per converted query's observable effect, following Phase 1's naming convention.
- [ ] **Step 3: Run the new tests to verify they fail or are inconclusive against the current code.**
- [ ] **Step 4: Convert each file's raw queries**, per its own upstream diff.
- [ ] **Step 5: Run the new tests to verify they pass.**
- [ ] **Step 6: Run the full suites, update docs, and commit**

```bash
git add includes/process/process_brewer.inc.php includes/process/process_brewing.inc.php includes/process/process_users.inc.php includes/process/process_users_register.inc.php e2e/tests tests/Unit TESTING.md tests/README.md
git commit -m "SQLi migration Phase 2: includes/process core brewer/entry/user flows (3a)"
```

---

### Task 3b: Deletion/destructive operations (1 file, 14 calls)

**Files:**
- Modify: `includes/process/process_delete.inc.php` (14 calls)
- Test: add to `e2e/tests/`

Same risk class as Task 1d: deletion handlers. Tests must use disposable
fixtures created within the test, never shared/baseline rows; each delete
action's WHERE-scoping needs individual scrutiny to confirm no widening of
what gets deleted.

- [ ] **Step 1: List every `mysqli_query(` call and diff each against `upstream/master`.**
- [ ] **Step 2: Write the failing test(s)**, using disposable test data created within the test itself.
- [ ] **Step 3: Run the new tests to verify they fail or are inconclusive against the current code.**
- [ ] **Step 4: Convert the file's raw queries**, per its upstream diff.
- [ ] **Step 5: Run the new tests to verify they pass.**
- [ ] **Step 6: Run the full suites, update docs, and commit**

```bash
git add includes/process/process_delete.inc.php e2e/tests tests/Unit TESTING.md tests/README.md
git commit -m "SQLi migration Phase 2: includes/process deletion operations (3b)"
```

---

### Task 3c: Competition config/admin/judging-setup flows (6 files, 22 calls)

**Files:**
- Modify: `includes/process/process_archive.inc.php` (10 calls), `includes/process/process_comp_info.inc.php` (1 call), `includes/process/process_sponsors.inc.php` (1 call), `includes/process/process_styles.inc.php` (5 calls), `includes/process/process_judging_assignments.inc.php` (3 calls), `includes/process/process_judging_flights.inc.php` (2 calls)
- Test: add to `e2e/tests/`

Lower-risk, more mechanical admin/config action handlers — batchable like Task
1f, though `process_archive.inc.php` (10 calls) still needs its own diff-and-test
pass, not blind porting.

- [ ] **Step 1: List every `mysqli_query(` call in each file and diff each against `upstream/master`. Keep a per-file checklist in the report.**
- [ ] **Step 2: Write the failing test(s)** per converted query's observable effect.
- [ ] **Step 3: Run the new tests to verify they fail or are inconclusive against the current code.**
- [ ] **Step 4: Convert each file's raw queries**, per its own upstream diff, checking it off the Step 1 list.
- [ ] **Step 5: Run the new tests to verify they pass.**
- [ ] **Step 6: Run the full suites, update docs, and commit**

```bash
git add includes/process/process_archive.inc.php includes/process/process_comp_info.inc.php includes/process/process_sponsors.inc.php includes/process/process_styles.inc.php includes/process/process_judging_assignments.inc.php includes/process/process_judging_flights.inc.php e2e/tests tests/Unit TESTING.md tests/README.md
git commit -m "SQLi migration Phase 2: includes/process config/admin/judging-setup flows (3c)"
```

---

## Task 4: `includes/db/*.db.php` group

**Files:**
- Modify: `includes/db/common.db.php`, `includes/db/entries_by_style.db.php`, `includes/db/organizations.db.php`, `includes/db/output_assignments.db.php`, `includes/db/output_bos_mat.db.php`, `includes/db/output_labels.db.php`, `includes/db/output_pullsheets_bos.db.php`, `includes/db/output_pullsheets_entries.db.php`, `includes/db/scores_bestbrewer.db.php`
- Test: add to `e2e/tests/`

**Interfaces:**
- Consumes: none from other tasks.
- Produces: none other tasks depend on.

`output_assignments.db.php` and `output_bos_mat.db.php` are the pair already flagged in the `project-bluebonnet-open-issues` memory as `sterilize()`-protected but not parameterized — closing that gap is this task's most important deliverable, not an afterthought.

- [ ] **Step 1: List every `mysqli_query(` call in each file and diff each against `upstream/master`.**

- [ ] **Step 2: Write the failing test(s).** For `output_assignments.db.php` and `output_bos_mat.db.php`, the test must use a literal single-quote payload in the request-derived value (`$filter`/`$id`/`$location`/`$type`, per the memory note), not just a happy-path check — per Review Focus, prove the specific protection gap closes, not just that the query still runs.

- [ ] **Step 3: Run the new tests to verify they fail or are inconclusive against the current code.**

- [ ] **Step 4: Convert each file's raw queries**, per its own upstream diff.

- [ ] **Step 5: Run the new tests to verify they pass.**

- [ ] **Step 6: Run the full suites, update docs (including the memory correction removing the `output_assignments.db.php`/`output_bos_mat.db.php` note now that it's fixed), and commit**

```bash
git add includes/db/common.db.php includes/db/entries_by_style.db.php includes/db/organizations.db.php includes/db/output_assignments.db.php includes/db/output_bos_mat.db.php includes/db/output_labels.db.php includes/db/output_pullsheets_bos.db.php includes/db/output_pullsheets_entries.db.php includes/db/scores_bestbrewer.db.php e2e/tests TESTING.md tests/README.md
git commit -m "SQLi migration Phase 2: includes/db/*.db.php group"
```

---

## Task 5: Everything else (18 small files)

**Files:**
- Modify: `output/export.output.php`, `output/labels.output.php`, `output/participant_summary.output.php`, `output/print.output.php`, `output/pullsheets.output.php`, `ajax/tables_mode.ajax.php`, `eval/install_eval_db.eval.php`, `awards.php`, `qr.php`, `setup/install_db.setup.php`, `sections/brew.sec.php`, `sections/default.sec.php`, `includes/debug/query_count_begin.debug.php`, `includes/debug/query_count_end.debug.php`, `includes/convert/convert_bjcp_2015.inc.php`, `admin/entries.admin.php`, `admin/judging_locations.admin.php`, `admin/style_types.admin.php`
- Test: add to `e2e/tests/` and/or `tests/Unit/`

**Interfaces:**
- Consumes: none from other tasks.
- Produces: none other tasks depend on.

Each file has only 1-14 calls — mechanical conversions, but 18 files is easy to under-count. Keep a per-file checklist in the report.

- [ ] **Step 1: For each of the 18 files, list every `mysqli_query(` call and diff against `upstream/master`.** Record this as a table in the report (file, call count, upstream-diff summary) before converting anything — this is the checklist Review Focus asks for.

- [ ] **Step 2: Write the failing test(s)** per file, following Phase 1's established shapes (e2e where reachable, source guard otherwise).

- [ ] **Step 3: Run the new tests to verify they fail or are inconclusive against the current code.**

- [ ] **Step 4: Convert each file's raw queries**, per its own upstream diff, checking off each file in the Step 1 table as it's done.

- [ ] **Step 5: Run the new tests to verify they pass.**

- [ ] **Step 6: Run the full suites, update docs, and commit**

```bash
git add output/export.output.php output/labels.output.php output/participant_summary.output.php output/print.output.php output/pullsheets.output.php ajax/tables_mode.ajax.php eval/install_eval_db.eval.php awards.php qr.php setup/install_db.setup.php sections/brew.sec.php sections/default.sec.php includes/debug/query_count_begin.debug.php includes/debug/query_count_end.debug.php includes/convert/convert_bjcp_2015.inc.php admin/entries.admin.php admin/judging_locations.admin.php admin/style_types.admin.php e2e/tests tests/Unit TESTING.md tests/README.md
git commit -m "SQLi migration Phase 2: remaining 18 small files"
```

---

## Task 6: Whole-branch verification and memory update

**Files:**
- Modify: `TESTING.md`, `tests/README.md`

**Interfaces:**
- Consumes: every prior task's committed state.
- Produces: nothing (final task).

- [ ] **Step 1: Run the full suites against the existing shared stack** (`vendor/bin/phpunit` and the full Playwright suite from `e2e/` — do NOT tear down or rebuild the shared stack; Phase 1 twice caught plan text that suggested this and twice ruled against it). Record the final pass/fail/skip counts.

- [ ] **Step 2: Update `TESTING.md` and `tests/README.md`** with the final counts and a one-line note that Phase 2 of the SQLi migration (the 44 mid-similarity files) is done.

- [ ] **Step 3: Commit**

```bash
git add TESTING.md tests/README.md
git commit -m "SQLi migration Phase 2 complete: verify whole-branch suite"
```

- [ ] **Step 4: Update memory** (outside the repo, `project-bluebonnet-open-issues`): mark Phase 2 done with the final commit range, and note that Phase 3 (the 69 files below 70% similarity) and the 7 files with no upstream reference remain, not yet scoped into tasks.

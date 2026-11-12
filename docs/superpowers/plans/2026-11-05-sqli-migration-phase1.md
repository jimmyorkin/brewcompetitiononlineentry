# SQLi Migration (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the one unauthenticated raw-SQLi finding in `forgot_password.inc.php`, then port upstream's prepared-statement fix onto the 21 files on `bluebonnet-testing` whose raw SQL is still ≥90% similar to its upstream (3.x) counterpart.

**Architecture:** Each raw `mysqli_query($connection, sprintf(...))` call is replaced with `mysqli_prepare()` / `mysqli_stmt_bind_param()` / `mysqli_stmt_execute()` / `mysqli_stmt_get_result()`, matching the pattern already shipped in `includes/logincheck.inc.php` (commit `71d56b62`). Table/column names stay interpolated from trusted sources (`$prefix`, fixed strings); only values become bound parameters.

**Tech Stack:** PHP 8.2 (mysqli), PHPUnit 10 (Unit tier), Playwright (e2e), Docker/MariaDB dev stack.

**Spec:** `docs/superpowers/specs/2026-11-05-sqli-migration-design.md`

## Global Constraints

- No PR to Jimmy's upstream repo without the user's explicit go-ahead; commit and push to `origin/bluebonnet-testing` directly.
- Table/column identifiers are never bound as `?` parameters — only values are.
- A fix must not change any existing caller's result shape; this is a security fix, not a refactor.
- Run the full suite (`vendor/bin/phpunit` and the full Playwright suite from `e2e/`) before marking any task done, not just that task's own new test.
- Every task updates `tests/README.md` and/or `TESTING.md`'s counts to match.

## Review Focus

- A query whose table name is built with `sprintf("...%s...", $prefix."table", ...)` has the implementer try to bind the table name itself as a parameter, which silently breaks the query (MySQLi can't parameterize identifiers). Task 1's steps call this out explicitly; Tasks 2-6 inherit it as a constraint.
- A value's bind type (`"s"` vs `"i"` vs `"d"` in `mysqli_stmt_bind_param`) picked by guesswork rather than the column's actual type causes a query that runs without error but returns zero rows. Each task's test asserts a non-empty, correct result, not just "no SQL error."
- A query converted from `mysqli_fetch_assoc($result)` (single-row pattern) to `mysqli_stmt_get_result()` is then iterated with the old single-fetch code, silently dropping every row but the first for any query that returns more than one. Task 2 and Task 4 each touch at least one multi-row query; their tests assert on row *count*, not just presence.
- `setup.php` and `update.php` (Task 2) run outside the normal web request flow — no e2e path reaches them, so "converted, suite still green" is not evidence the fix works. Task 2 adds an explicit manual-verification step and records its result in the task's own commit message.
- A file with a `$method`/`$action`-switched query (e.g. `process_judging_scores.inc.php` in Task 3) has one branch converted and tested while a sibling branch, still built with raw `sprintf()`, is missed. Task 3's steps require listing every `mysqli_query(` call in the file before converting, not just the one the first test happens to exercise.

---

## Task 1: Fix the unauthenticated SQLi in `includes/forgot_password.inc.php`

**Files:**
- Modify: `includes/forgot_password.inc.php:18` (the `$query_forgot` lookup)
- Test: `e2e/tests/forgot-password-sqli.spec.ts` (new)

**Interfaces:**
- Consumes: the existing `/includes/process.inc.php?section=forgot&action=forgot` POST endpoint (unauthenticated, reachable per `includes/process.inc.php:86,175`); the forgot-password form rendered by `sections/login.sec.php` at `?section=login&go=password&action=forgot`.
- Produces: nothing other tasks depend on.

This is the only query in the file with **zero** protection (`$_POST['loginUsername']` goes straight into `sprintf()`); the file's other four queries already wrap the value in `sterilize()` and are left for the broader migration (tracked in the spec's non-goals), not this task.

- [ ] **Step 1: Write the failing e2e test**

```ts
import { test, expect } from '@playwright/test';

// P1: includes/forgot_password.inc.php built its lookup query with
// sprintf() straight from $_POST['loginUsername'], unauthenticated, no
// escaping at all. A single quote must not break the query or 500 the page.
test('forgot-password lookup survives a single quote in the username', async ({ page }) => {
  await page.goto('/index.php?section=login&go=password&action=forgot');
  await page.locator('input[name="loginUsername"]').fill("nobody' OR '1'='1");
  await page.locator('form[action*="action=forgot"] button[type="submit"], form[action*="action=forgot"] input[type="submit"]').first().click();
  // Unknown username -> msg=1 ("no such account"), not a 500 and not a
  // successful match.
  await expect(page).toHaveURL(/msg=1/);
});
```

- [ ] **Step 2: Run it to verify it fails (or at least doesn't yet prove the fix)**

Run (from `e2e/`): `DB_PORT=3307 BASE_URL=http://localhost:8082 npx playwright test tests/forgot-password-sqli.spec.ts`
Expected: fails, or passes for the wrong reason (confirm by temporarily reverting the quote in the payload to see the test still passes — the point is this test must fail once the fix is reverted, so check that first against the current, unfixed code it's red for the right reason).

- [ ] **Step 3: Parameterize `$query_forgot` in `includes/forgot_password.inc.php`**

Replace the `sprintf()`-built `$query_forgot` / `mysqli_query()` pair with `mysqli_prepare($connection, "SELECT * FROM $users_db_table WHERE user_name = ?")` / `mysqli_stmt_bind_param($stmt, "s", $username)` / `mysqli_stmt_execute($stmt)` / `mysqli_stmt_get_result($stmt)`, following the exact structure already used in `includes/logincheck.inc.php` (the `$stmt_login` blocks). `$users_db_table` stays interpolated (it's built from `$prefix`, not request input). Keep `$row_forgot` / `$totalRows_forgot` assigned the same way afterward so the rest of the file is untouched.

- [ ] **Step 4: Run the e2e test to verify it passes**

Run: `DB_PORT=3307 BASE_URL=http://localhost:8082 npx playwright test tests/forgot-password-sqli.spec.ts`
Expected: PASS

- [ ] **Step 5: Run the full suites**

Run: `vendor/bin/phpunit` (expect no change in counts) and the full Playwright suite from `e2e/` (expect no new failures; this touches the password-reset flow, so re-check `security-invariants.spec.ts` and `entrant-journey.spec.ts` pass).

- [ ] **Step 6: Update docs and commit**

Add a row to `tests/README.md`'s spec table (or `TESTING.md`'s, whichever lists e2e specs) for `forgot-password-sqli.spec.ts`.

```bash
git add includes/forgot_password.inc.php e2e/tests/forgot-password-sqli.spec.ts TESTING.md tests/README.md
git commit -m "Fix unauthenticated SQLi in forgot_password.inc.php"
```

---

## Task 2: Port the root, setup, and process-include file group

**Files:**
- Modify: `setup.php`, `update.php`, `includes/process/process_style_types.inc.php`, `includes/process/process_archive_hosted.inc.php`, `includes/process/process_judging_scores.inc.php`, `includes/process/process_barcode_check_in.inc.php`, `includes/process/process_users_setup.inc.php`
- Test: add to or create matching specs under `e2e/tests/` and/or `tests/Unit/` per file (see Step 1)

**Interfaces:**
- Consumes: none from other tasks.
- Produces: none other tasks depend on.

- [ ] **Step 1: For each file, list every `mysqli_query(` call site and diff the file against `upstream/master`**

Run per file: `git diff --no-index <(git show upstream/master:<path>) <path>` and `grep -n "mysqli_query(" <path>`. Note which upstream lines the diff shows now use `$db->` / prepared statements for each 2.7 raw call — that upstream hunk is the reference for Step 3. For `setup.php` and `update.php`, also note that neither is reachable by the e2e stack (first-run / one-time scripts) — these get a manual-verification step, not an automated test.

- [ ] **Step 2: Write the failing test(s)**

For `process_style_types.inc.php`, `process_archive_hosted.inc.php`, `process_judging_scores.inc.php`, `process_barcode_check_in.inc.php`, `process_users_setup.inc.php`: each is reached through an admin or entrant action already covered loosely by `admin-journey.spec.ts` / `entrant-journey.spec.ts` / `bluebonnet-rules.spec.ts`. Add one targeted test per file (new spec file or an added `test()` in the closest existing spec) that exercises the specific query being converted and asserts on its actual effect (a value saved, a row count, a redirect `msg=`), not just "page didn't 500." Name each test after the behavior, e.g. `test('style type lookup survives a single quote in the style name', ...)`.

- [ ] **Step 3: Run the new tests to verify they fail or are inconclusive against the current code**

Run: `DB_PORT=3307 BASE_URL=http://localhost:8082 npx playwright test -g "<each new test's title>"`

- [ ] **Step 4: Convert each file's raw queries to prepared statements, per its own upstream diff from Step 1**

Same binding pattern as Task 1. For `setup.php` / `update.php`, convert identically; there is no test to turn green, so proceed to Step 5's manual check instead of Step 6.

- [ ] **Step 5: Manually verify `setup.php` and `update.php`**

Run the setup wizard end to end against a fresh `docker compose down -v && up -d --build` stack (see `TESTING.md`'s reset instructions) and confirm it completes without error. For `update.php`, confirm it loads without a fatal error against the seeded baseline DB. Record what was checked and its result in this task's commit message (Step 7) — this is the task's evidence in place of a test.

- [ ] **Step 6: Run the new tests to verify they pass**

Run: `DB_PORT=3307 BASE_URL=http://localhost:8082 npx playwright test -g "<each new test's title>"`
Expected: PASS

- [ ] **Step 7: Run the full suites, update docs, and commit**

Run `vendor/bin/phpunit` and the full Playwright suite; update `tests/README.md` / `TESTING.md` for the new specs.

```bash
git add setup.php update.php includes/process/process_style_types.inc.php includes/process/process_archive_hosted.inc.php includes/process/process_judging_scores.inc.php includes/process/process_barcode_check_in.inc.php includes/process/process_users_setup.inc.php e2e/tests TESTING.md tests/README.md
git commit -m "Port upstream's prepared-statement fix: root/setup/process-include file group

Manually verified: setup wizard end-to-end on a fresh stack; update.php loads
without error. Neither has an automated test (one-time scripts, no e2e path)."
```

---

## Task 3: Port the sections file group

**Files:**
- Modify: `sections/winners.sec.php`, `sections/brewer_entries.sec.php`, `sections/login.sec.php`, `includes/headers.inc.php`
- Test: add to `e2e/tests/` per file

**Interfaces:**
- Consumes: none from other tasks.
- Produces: none other tasks depend on.

- [ ] **Step 1: List every `mysqli_query(` call in each file and diff each file against `upstream/master`**, same as Task 2 Step 1. For `process_judging_scores.inc.php`-style `$method`/`$action` switches, if any appear in this group (check `winners.sec.php`'s rendering mode switches in particular), list every branch's query, not just the default one.

- [ ] **Step 2: Write the failing e2e test(s)**, one per converted query's observable effect, following Task 2 Step 2's naming convention.

- [ ] **Step 3: Run the new tests to verify they fail or are inconclusive against the current code.**

- [ ] **Step 4: Convert each file's raw queries to prepared statements**, per its own upstream diff.

- [ ] **Step 5: Run the new tests to verify they pass.**

- [ ] **Step 6: Run the full suites, update docs, and commit**

```bash
git add sections/winners.sec.php sections/brewer_entries.sec.php sections/login.sec.php includes/headers.inc.php e2e/tests TESTING.md tests/README.md
git commit -m "Port upstream's prepared-statement fix: sections file group"
```

---

## Task 4: Port the admin file group

**Files:**
- Modify: `admin/judging_assign.admin.php`, `admin/competition_info.admin.php`, `admin/archive.admin.php`
- Test: add to `e2e/tests/admin-journey.spec.ts` or a new spec

**Interfaces:**
- Consumes: none from other tasks.
- Produces: none other tasks depend on.

- [ ] **Step 1: List every `mysqli_query(` call in each file and diff each against `upstream/master`.** `judging_assign.admin.php` is the one most likely to return multiple rows (judge/table assignment lists) — confirm from the diff whether upstream's conversion uses `mysqli_stmt_get_result()->fetch_all()` or a fetch loop, and match that shape, not a single-row pattern.

- [ ] **Step 2: Write the failing e2e test(s)**, with at least one asserting a *row count* (not just presence) for the multi-row query identified in Step 1.

- [ ] **Step 3: Run the new tests to verify they fail or are inconclusive against the current code.**

- [ ] **Step 4: Convert each file's raw queries to prepared statements**, per its own upstream diff.

- [ ] **Step 5: Run the new tests to verify they pass.**

- [ ] **Step 6: Run the full suites, update docs, and commit**

```bash
git add admin/judging_assign.admin.php admin/competition_info.admin.php admin/archive.admin.php e2e/tests TESTING.md tests/README.md
git commit -m "Port upstream's prepared-statement fix: admin file group"
```

---

## Task 5: Port the eval/output/db file group

**Files:**
- Modify: `eval/scoresheet.eval.php`, `eval/judging_not_assigned.eval.php`, `eval/judging_dashboard.eval.php`, `output/bos_mat.output.php`, `output/assignments.output.php`, `includes/db/output_entries_export_winner.db.php`, `includes/convert/convert_bjcp_2021.inc.php`
- Test: add to `e2e/tests/` per file, or a new `e2e/tests/eval-output-sqli.spec.ts` covering several at once

**Interfaces:**
- Consumes: none from other tasks.
- Produces: none other tasks depend on.

- [ ] **Step 1: List every `mysqli_query(` call in each file and diff each against `upstream/master`.**

- [ ] **Step 2: Write the failing test(s).** Several of these (`scoresheet.eval.php`, the `eval/` judging pages) render behind a judging/table-assignment flow the e2e suite doesn't currently reach standalone — if a test can't be written without first scaffolding that flow, write a PHPUnit Unit-tier test against the specific query-building logic instead (extract nothing; just call the file's relevant function if one exists, or note in the task that this file gets Task 2's manual-verification treatment and say so in the commit).

- [ ] **Step 3: Run the new tests to verify they fail or are inconclusive against the current code.**

- [ ] **Step 4: Convert each file's raw queries to prepared statements**, per its own upstream diff.

- [ ] **Step 5: Run the new tests to verify they pass.**

- [ ] **Step 6: Run the full suites, update docs, and commit**

```bash
git add eval/scoresheet.eval.php eval/judging_not_assigned.eval.php eval/judging_dashboard.eval.php output/bos_mat.output.php output/assignments.output.php includes/db/output_entries_export_winner.db.php includes/convert/convert_bjcp_2021.inc.php e2e/tests tests/Unit TESTING.md tests/README.md
git commit -m "Port upstream's prepared-statement fix: eval/output/db file group"
```

---

## Task 6: Whole-branch verification and open-issues update

**Files:**
- Modify: `TESTING.md`, `tests/README.md`

**Interfaces:**
- Consumes: every prior task's committed state.
- Produces: nothing (final task).

- [ ] **Step 1: Run the full suites one more time from a clean stack**

`docker compose down -v && WEB_PORT=8082 DB_PORT=3307 docker compose up -d --build`, then `vendor/bin/phpunit` and the full Playwright suite from `e2e/`. Record the final pass/fail/skip counts.

- [ ] **Step 2: Update `TESTING.md` and `tests/README.md`** with the final spec/test counts and a one-line note that Phase 1 of the SQLi migration (the 21 near-identical files plus the `forgot_password.inc.php` fix) is done.

- [ ] **Step 3: Commit**

```bash
git add TESTING.md tests/README.md
git commit -m "SQLi migration Phase 1 complete: verify whole-branch suite"
```

- [ ] **Step 4: Update memory** (outside the repo): mark the `forgot_password.inc.php` finding and the 21-file near-identical tier as done in `project-bluebonnet-open-issues`, with the final commit SHAs, and note that the 70-90% and <70% similarity tiers (380 files, 667 calls) remain as a future Phase 2/3, not yet scoped into tasks.

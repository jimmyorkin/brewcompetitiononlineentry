# Access-Control Fixes

All four findings below were discovered incidentally during the SQLi migration
(Phase 2, commits `5a0fd5d6`..`bdf33c04`) and deliberately left unfixed as
out-of-scope. Each is independently confirmed (implementer + reviewer, with
guard-chain tracing and/or a live exploit reproduction) — see
`project_bluebonnet_open_issues.md` and
`.superpowers/sdd/2026-11-06-sqli-migration-phase2/progress.md` for full
evidence trails. This plan fixes all four, each restoring upstream's existing
guard shape (no new design needed — upstream already has the fix; this fork
just never got it, or had it swept to only one file).

## Global Constraints

- Each fix restores a guard shape upstream already has. Do not invent new
  authorization logic — match upstream's existing check exactly, confirmed via
  `git show upstream/master:<path>` (plain redirect only, never piped through
  `2>&1 |`, which silently truncates files).
- Table/column identifiers interpolated from safe sources only; this plan adds
  no new SQL, only access-control checks — but if a fix touches a query by
  necessity, the same parameterization rules as Phase 2 apply.
- Every fix needs a test proving the vulnerability is closed (the attack no
  longer succeeds) AND a regression test proving the legitimate path still
  works (an admin/the resource's owner can still do the thing).
- Dev stack is shared and long-lived (web `http://localhost:8082`, db port
  `3307`). Never tear it down. If Docker hangs, stop and report, don't try to
  fix it.
- No PRs — commit and push directly to `bluebonnet-testing`, per standing
  working agreement.

## Review Focus

These are real, currently-exploitable security bugs on a shared dev stack.
Each task's reviewer must independently reproduce the exploit against the
*pre-fix* code (to confirm it's real) and confirm it's closed post-fix — not
just read the diff. Never leave a live elevated-privilege account or other
persistent artifact behind; clean up anything created during exploit testing
and confirm via a follow-up query.

---

## Task 1: Unauthenticated privilege escalation via public registration

**Files:**
- Modify: `includes/process/process_users_register.inc.php`, `includes/process/process_users.inc.php`
- Test: add to `e2e/tests/`

**The bugs** (all confirmed, see ledger Task 3a/3a-review entries):
1. `process_users_register.inc.php`'s public registration flow inserts
   `userLevel` straight from `$_POST`, with no check that the requester is an
   authenticated admin. Upstream: use `$_POST['userLevel']` only if the
   session is an authenticated admin (`$_SESSION['userLevel'] <= 1`), else
   hardcode `"2"` (entrant).
2. `process_users.inc.php`'s `go=="change_user_password"` branch has no
   `userLevel` gate at all. Upstream requires `$_SESSION['userLevel'] <= 1`.
3. `process_users.inc.php`'s `go=="username"` branch has no ownership/admin
   check. Upstream requires `(($filter=="admin") && ($_SESSION['userLevel']
   <= 1)) || (($filter!="admin") && ($id == $_SESSION['user_id']))`.

- [ ] **Step 1: Confirm each bug still reproduces** against current code (registration POST with `userLevel=0`; password-reset POST as a plain entrant against another account; username-change POST as a plain entrant against another account's id). Capture the before-state.
- [ ] **Step 2: Write failing tests** for all three — each must prove the attack currently succeeds, then (after the fix) prove it's blocked, AND prove the legitimate path (admin registering a judge; a user changing their own password/username; an admin changing anyone's) still works.
- [ ] **Step 3: Fix all three**, matching upstream's exact guard shape.
- [ ] **Step 4: Run the new tests to verify the attacks are blocked and legitimate paths still work.**
- [ ] **Step 5: Run the full suites, update docs, and commit.**

```bash
git add includes/process/process_users_register.inc.php includes/process/process_users.inc.php e2e/tests tests/Unit TESTING.md tests/README.md
git commit -m "Fix unauthenticated privilege escalation and missing ownership checks in process_users*.inc.php"
```

---

## Task 2: The 7-file unswept `$section=="setup"` bypass

**Files:**
- Modify: `includes/process/process_comp_info.inc.php`, `includes/process/process_styles.inc.php`, `includes/process/process_brewer.inc.php`, `includes/process/process_judging_locations.inc.php`, `includes/process/process_drop_off.inc.php`, `includes/process/process_judging_preferences.inc.php`, `includes/process/process_prefs.inc.php`
- Test: add to `e2e/tests/`

**The bug** (confirmed, see ledger Task 3c/3c-review entries): all 7 files gate
on `if ((isset($_SERVER['HTTP_REFERER'])) && (((isset($_SESSION['loginUsername']))
&& (userLevel check)) || ($section == "setup")))`. `$section` is fully
attacker-controlled (`sterilize()`'d but not value-restricted). An anonymous
visitor who's loaded one ordinary page (session + CSRF token handed out
unconditionally) can POST `section=setup` and bypass the login/admin check
entirely. This exact pattern was already fixed once, in
`includes/process/process_users_setup.inc.php`, by commit `f4e84fc9` —
replacing `$section == "setup"` with the real `$setup_free_access` config
flag (default `FALSE`) — but that fix was never swept to these 7 siblings.

- [ ] **Step 1: Confirm the bypass still reproduces** in at least 2-3 of the 7 files (anonymous POST with `section=setup` succeeds in modifying protected state). Capture the before-state.
- [ ] **Step 2: Write failing tests**, one per file (or a shared parametrized spec), each proving the bypass currently works, then (after the fix) that it's blocked, AND that the legitimate admin path still works.
- [ ] **Step 3: Fix all 7 files** the same way `f4e84fc9` fixed the original — replace `$section == "setup"` with `$setup_free_access` in each gate.
- [ ] **Step 4: Run the new tests to verify.**
- [ ] **Step 5: Run the full suites, update docs, and commit.**

```bash
git add includes/process/process_comp_info.inc.php includes/process/process_styles.inc.php includes/process/process_brewer.inc.php includes/process/process_judging_locations.inc.php includes/process/process_drop_off.inc.php includes/process/process_judging_preferences.inc.php includes/process/process_prefs.inc.php e2e/tests tests/Unit TESTING.md tests/README.md
git commit -m "Sweep the process_users_setup.inc.php unauthenticated-bypass fix to its 7 siblings"
```

---

## Task 3: Missing `userLevel` guards in `includes/process.inc.php`

**Files:**
- Modify: `includes/process.inc.php`
- Test: add to `e2e/tests/`

**The bug** (confirmed, see ledger Task 2/Task 2-review entries): the
`delete_scoresheets`, `generate_judging_numbers`, and `convert_bjcp` action
branches (lines ~186/211/238 as of Task 2's review) have zero `userLevel`
check and no outer dispatch-level guard either. Upstream has an explicit
`if ((!isset($_SESSION['userLevel'])) || ($_SESSION['userLevel'] > 1)) {
header("Location: 403.php"); exit(); }` guard on all three that this fork
lacks.

- [ ] **Step 1: Confirm the gap still reproduces** (an authenticated non-admin, e.g. userLevel 2, can successfully trigger at least one of the 3 actions). Capture the before-state.
- [ ] **Step 2: Write failing tests**, proving a non-admin can currently trigger each action, then (after the fix) can't, AND that an admin still can.
- [ ] **Step 3: Fix all 3**, adding upstream's exact guard.
- [ ] **Step 4: Run the new tests to verify.**
- [ ] **Step 5: Run the full suites, update docs, and commit.**

```bash
git add includes/process.inc.php e2e/tests tests/Unit TESTING.md tests/README.md
git commit -m "Add missing userLevel guards to delete_scoresheets/generate_judging_numbers/convert_bjcp"
```

---

## Task 4: IDOR in `output/export.output.php`

**Files:**
- Modify: `output/export.output.php`
- Test: add to `e2e/tests/`

**The bug** (confirmed, see ledger Task 5/Task 5-review entries): the
`export-personal-results` branch (line ~3328) gates only on
`isset($_SESSION['loginUsername'])` and `$id != "default"` — any logged-in
user can download any other entrant's personal-results CSV by changing `id`.
Upstream's equivalent line has an additional
`&& (($admin_role) || ($id == $_SESSION['user_id']))` clause this fork lacks.

- [ ] **Step 1: Confirm the gap still reproduces** (logged in as entrant A, request entrant B's export, confirm B's data comes back). Capture the before-state.
- [ ] **Step 2: Write a failing test**, proving the cross-account read currently succeeds, then (after the fix) fails, AND that a user exporting their own results, and an admin exporting anyone's, both still work.
- [ ] **Step 3: Fix it**, adding upstream's exact ownership/admin clause.
- [ ] **Step 4: Run the new test to verify.**
- [ ] **Step 5: Run the full suites, update docs, and commit.**

```bash
git add output/export.output.php e2e/tests tests/Unit TESTING.md tests/README.md
git commit -m "Fix IDOR in output/export.output.php's export-personal-results"
```

---

## Task 5: Whole-set verification and memory update

**Files:**
- Modify: `TESTING.md`, `tests/README.md`

- [ ] **Step 1: Run the full suites** against the existing shared stack (no teardown/rebuild). Record final counts.
- [ ] **Step 2: Update `TESTING.md`/`tests/README.md`** with final counts and a note that all 4 access-control findings from Phase 2 are now fixed.
- [ ] **Step 3: Commit.**

```bash
git add TESTING.md tests/README.md
git commit -m "Access-control fixes complete: verify whole-branch suite"
```

- [ ] **Step 4: Update external project memory** (`project_bluebonnet_open_issues.md`): mark all 4 findings FIXED with commit SHAs, remove them from "still open."

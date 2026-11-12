# BCOE&M end-to-end tests (Playwright)

> **Bluebonnet 2.7 branch.** Ported from `testing-baseline` and adapted to the
> 2.7.x UI. Run the stack on spare ports with
> `WEB_PORT=8082 DB_PORT=3307 docker compose up -d` and the suite with
> `DB_PORT=3307 BASE_URL=http://localhost:8082 npx playwright test`
> (`DB_PORT`/`DB_HOST` are for the specs that talk to MySQL directly - see
> `helpers/db.ts`). The DB is seeded from
> `sql/bcoem_baseline_2.7.X.sql` + `docker/02..04` (04 catches the stale baseline
> up to the schema the code expects). Differences from the 3.x suite: registration
> has `user_name2` (no `password-confirm`), selects are bootstrap-select, the
> login trigger is a `role=button` modal opener, and `process.inc.php` requires a
> `Referer`. The 2.7 code originally failed five security specs (login auth bypass, `handle.php`
path traversal x3, no session regeneration); those fixes were backported from 3.x
and the specs now run as plain tests.

**Bluebonnet schema.** The DB is unprefixed like production (`docker/01-baseline.sh`
strips the baseline's prefix) with `docker/05-bluebonnet-schema.sql` on top:
`brewing` is a view over `brewing_bbo_real` (logical deletes), plus `bbo_tables` and
`barcode_log`. `bbo_tables` is a **synthetic** seed (one table per BJCP category
group) - the real Bluebonnet table layout isn't in the repo. The competition
timezone is pinned to Central in `03-e2e-fixtures.sql` to match `config.php`'s
`SET time_zone = '-06:00'`; otherwise the 1-hour unpaid-delete mod removes every
new entry immediately. `global-setup.ts` waits for the app to really serve (the
DB restarts once after first-run init).

`tests/bluebonnet-rules.spec.ts` covers the Bluebonnet-only rules (4 entries per
table, 1 per entrant per table, 60s spacing, 1-hour unpaid delete) - each from
both the UI guard and the server check. One `fixme` records a known gap: the
server accepts an add with no style (only the literal `0-A` placeholder is
rejected).

Browser-driven regression tests for the critical entrant and admin journeys,
plus authorization invariants. These are the Phase 0 safety net the
modernization work (see `Docs/superpowers/specs/`) refactors behind.

> Full setup, run and add-a-test guide: [TESTING.md](../TESTING.md).

## Prerequisites

- Node 20+
- The Docker stack running: `docker compose up -d` (from the repo root)

## Run

```bash
cd e2e
npm install
npx playwright install chromium
npx playwright test              # all specs
npx playwright test --headed     # watch it run
npx playwright show-report       # open the last HTML report (run from e2e/)
```

- `BASE_URL` overrides the target (default `http://localhost:8080`).
- Single worker, serial journeys — they share one seeded database and must
  run in a deterministic order.

## Specs

| Spec | Covers |
| --- | --- |
| `tests/smoke.spec.ts` | App serves; login modal; admin login; entrant registration |
| `tests/entrant-journey.spec.ts` | Register → create entry → edit → payment page |
| `tests/admin-journey.spec.ts` | Entries list → check-in → judging session/table → score |
| `tests/security-invariants.spec.ts` | Authorization boundaries (one `fixme` = Phase 1 work) |

Helpers live in `helpers/`: `auth.ts` (login/registration against the real
public UI) and `entries.ts` (style selection, create-entrant-with-entry).

## Fresh database state

Journeys create unique users per run, so back-to-back runs don't collide and
no reseed is normally needed. To start completely clean:

```bash
docker compose down -v && docker compose up -d
```

The seed (`sql/bcoem_baseline_3.0.X.sql` + `docker/02-open-registration.sql` +
`docker/03-e2e-fixtures.sql`) makes the post-competition baseline behave like
a live, open competition — see the header of `docker/03-e2e-fixtures.sql` for
what each fixture flag does and why.

## PHPUnit

The Unit tier of the PHPUnit suite is ported to this branch (`tests/`); the
Integration and Approval tiers still live on `testing-baseline`. See
[TESTING.md](../TESTING.md#phpunit-suite).

If you do run it against a database this suite has used, reseed first
(`docker compose down -v && up -d`). The Playwright suite commits real
brewing/brewer rows, and the PHPUnit fee tests (`TotalFeesTest`) sum across all
rows, so they report inflated totals.

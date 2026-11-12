-- Docker-local convenience patch, applied after sql/bcoem_3.2.X.sql
-- on every fresh volume (docker-entrypoint-initdb.d runs *.sql in name order).
--
-- The baseline fixture's contest deadlines are fixed 2023 timestamps, so the
-- registration/entry window reads as closed against any "today" after that.
-- Push the deadlines out to keep the write-mode load test (and normal manual
-- testing) able to hit the registration and entry flows without needing to
-- log into the admin panel first.

USE bcoem;

UPDATE contest_info SET
  contestRegistrationDeadline = 1893456000, -- 2030-01-01
  contestEntryDeadline        = 1893456000,
  contestJudgeDeadline        = 1893456000,
  contestShippingDeadline     = 1893456000,
  contestDropoffDeadline      = 1893456000,
  contestEntryEditDeadline    = 1893456000
WHERE id = 1;

-- The baseline fixture seeds bcoem_sys.version as '3.0.1.0' (2026-03-01),
-- older than includes/current_version.inc.php's $current_version ('3.0.3.0',
-- 2026-06-16). lib/preflight.lib.php treats that mismatch as "needs update"
-- and site/bootstrap.php:62 responds by including the *entire*
-- update/run_update.php migration inline, on every session that doesn't yet
-- have $_SESSION['currentVersion'] set — with no lock/guard around it. Under
-- concurrent requests (e.g. this load test) that means many PHP processes
-- run the same hundreds of ALTER TABLE/UPDATE statements against the same
-- tables simultaneously, which piles up on MariaDB metadata locks and can
-- stall the entire site for minutes. Stamping the seed row as already
-- current avoids triggering that path for this fixture.
UPDATE bcoem_sys SET
  version = '2.7.1.0',
  version_date = '2024-10-28'
WHERE id = 1;

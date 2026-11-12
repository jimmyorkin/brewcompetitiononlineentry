-- Brings the committed 2.7.X baseline (stamped 2.7.0.0, but actually missing
-- changes from the 2.6.x-2.7.1 update steps) up to the schema this branch's
-- code expects. Mirrors the corresponding ALTERs in update/run_update.php;
-- without them pages 500 ("Unknown column '...' in 'INSERT INTO'/'SELECT'").
-- Derived mechanically: every ADD/CHANGE COLUMN in run_update.php (2.6.x -> 2.7.1)
-- checked against the baseline; only the missing ones are listed here.
-- Data-only steps (entry-form / deprecated-theme conversions) are no-ops: the
-- baseline already has prefsEntryForm=5, prefsTheme=default.

USE bcoem;

-- 2.6.x / 2.7.0
ALTER TABLE users       ADD userAdminObfuscate tinyint(1) NULL DEFAULT NULL;
ALTER TABLE preferences ADD prefsScoringCOA    tinyint(1) NULL DEFAULT NULL;
ALTER TABLE brewer      ADD brewerMHP          int(11)    NULL DEFAULT NULL;
ALTER TABLE brewing     ADD brewPackaging      VARCHAR(255) CHARACTER SET utf8 COLLATE utf8_general_ci NULL DEFAULT NULL COMMENT 'Allow entrants to specify packaging size.';
ALTER TABLE contest_info ADD contestWinnerLink VARCHAR(255) CHARACTER SET utf8 COLLATE utf8_general_ci NULL DEFAULT NULL;
ALTER TABLE brewer CHANGE brewerBreweryTTB brewerBreweryInfo TEXT NULL DEFAULT NULL COMMENT 'Store various info about the organization.';

-- 2.7.1
ALTER TABLE brewer
  CHANGE brewerAHA brewerAHA VARCHAR(255) CHARACTER SET utf8 COLLATE utf8_general_ci NULL DEFAULT NULL;
ALTER TABLE preferences
  ADD prefsUserEntryLimitDates MEDIUMTEXT NULL DEFAULT NULL AFTER prefsUSCLExLimit;
UPDATE styles SET brewStyleReqSpec = 1
WHERE brewStyleVersion = 'BJCP2021' AND brewStyleGroup = 'C2' AND brewStyleNum IN ('A','B','D','E');

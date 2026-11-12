-- Bluebonnet-specific schema layer (not in the stock BCOE&M baseline).
-- Reconstructed from how the code uses these objects plus bbo/BBO.sql; the
-- definitions of bbo_tables and barcode_log do not exist anywhere in the repo
-- (they live only in Bluebonnet's production DB), so their shape is inferred:
--   bbo_tables   includes/db/BBOtables.db.php, bbo/Audit*Sheets.php
--   barcode_log  includes/process/process_barcode_check_in_bbo.inc.php
-- Requires an UNPREFIXED schema (see 01-baseline.sh).

USE bcoem;

-- 1. `brewing` becomes a view over brewing_bbo_real so entries can be
--    "logically deleted" (bbo/BBO.sql, mods/bbo-delete-unpaids.php).
RENAME TABLE brewing TO brewing_bbo_real;

ALTER TABLE brewing_bbo_real
  ADD bboLogicallyDeleted      tinyint(1) NOT NULL DEFAULT 0,
  ADD bboLogicallyDeletedTime  timestamp NULL DEFAULT NULL,
  AUTO_INCREMENT = 1001;                      -- BBO.sql starts entry numbers at 1001

-- View exposes every stock column (derived, so it follows 04-schema-catchup),
-- hiding logically deleted rows. Single-table + WHERE => updatable view.
SET @cols = (SELECT GROUP_CONCAT(CONCAT('`', COLUMN_NAME, '`') ORDER BY ORDINAL_POSITION)
             FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = 'bcoem' AND TABLE_NAME = 'brewing_bbo_real'
               AND COLUMN_NAME NOT LIKE 'bbo%');
SET @sql = CONCAT('CREATE VIEW brewing AS SELECT ', @cols,
                  ' FROM brewing_bbo_real WHERE bboLogicallyDeleted = 0');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- 2. Judging tables: which table each style is judged at (drives the per-table
--    entry caps). SYNTHETIC seed: one table per BJCP 2021 category group, numbered
--    from 51 (Bluebonnet's real layout isn't in the repo). `style` is
--    brewCategory+brewSubCategory with no zero padding, e.g. '1A', '21B', 'C1A'.
CREATE TABLE bbo_tables (
  tableNumber int(11)      NOT NULL,
  style       varchar(10)  NOT NULL,
  tableName   varchar(255) DEFAULT NULL,
  PRIMARY KEY (style),
  KEY (tableNumber)
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO bbo_tables (tableNumber, style, tableName)
SELECT 50 + DENSE_RANK() OVER (ORDER BY brewStyleGroup),
       CONCAT(TRIM(LEADING '0' FROM brewStyleGroup), brewStyleNum),
       brewStyleCategory
FROM styles
WHERE brewStyleVersion = 'BJCP2021' AND brewStyleGroup <> '' AND brewStyleNum <> '';

-- 3. Barcode check-in audit log.
CREATE TABLE barcode_log (
  id        int(11)      NOT NULL AUTO_INCREMENT,
  user_name varchar(255) DEFAULT NULL,
  entrynum  varchar(255) DEFAULT NULL,
  errortext text,
  logged_at timestamp    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

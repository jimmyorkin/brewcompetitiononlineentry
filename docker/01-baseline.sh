#!/bin/bash
# Load the stock baseline with NO table prefix. Bluebonnet's code hardcodes
# unprefixed table names (`brewing`, `bbo_tables`, `barcode_log`), so production
# runs with $prefix = ''. The baseline's own header documents changing the prefix
# as a global find/replace; the prefix only ever appears as `baseline_<table>`.
set -euo pipefail
sed 's/`baseline_/`/g' /baseline/bcoem_baseline_2.7.X.sql \
  | mariadb -uroot -p"$MARIADB_ROOT_PASSWORD" "$MARIADB_DATABASE"

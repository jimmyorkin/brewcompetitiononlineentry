<?php
/**
 * Source-level regression guards for hardening fixes that can't be reached
 * through the browser suite.
 *
 * These read PHP source as text. They are deliberately coarse: they catch the
 * specific unsafe patterns that were fixed coming back, not every possible way
 * to write them. Behavioural coverage of the register and contact forms lives
 * in e2e/tests/xss-cookies.spec.ts.
 */

use PHPUnit\Framework\TestCase;

class SourceHardeningTest extends TestCase
{
    /** Files that refill form fields from $_COOKIE. */
    public static function cookieEchoFiles(): array
    {
        return [
            'register form'    => ['sections/register.sec.php'],
            'contact form'     => ['sections/contact.sec.php'],
            // Only shown during first-time setup, so e2e can't reach it.
            'setup admin user' => ['setup/admin_user.setup.php'],
        ];
    }

    /**
     * P1-SEC-003: a cookie value must never be echoed or concatenated into
     * HTML without htmlspecialchars().
     *
     * @dataProvider cookieEchoFiles
     */
    public function test_cookie_values_are_html_escaped_when_output(string $file): void
    {
        $source = file_get_contents(ROOT . $file);
        $this->assertNotFalse($source, "cannot read $file");

        // echo $_COOKIE['x'] with no htmlspecialchars( wrapper
        $this->assertSame(
            0,
            preg_match_all('/echo\s+\$_COOKIE\[/', $source, $m),
            "$file echoes a raw \$_COOKIE value"
        );

        // "...".$_COOKIE['x']."..." string building with no wrapper
        $this->assertSame(
            0,
            preg_match_all('/"\s*\.\s*\$_COOKIE\[[^\]]+\]\s*\./', $source, $m),
            "$file concatenates a raw \$_COOKIE value into HTML"
        );
    }

    /**
     * P1-SEC-004: process.inc.php must not switch on display_errors. (paths.php
     * sets it from DEBUG, but that line runs after this one, so anything that
     * fails before it would be shown to the user.)
     */
    public function test_process_endpoint_does_not_force_display_errors_on(): void
    {
        $source = file_get_contents(ROOT . 'includes/process.inc.php');
        $this->assertNotFalse($source);

        $this->assertSame(
            0,
            preg_match("/ini_set\(\s*['\"]display_errors['\"]\s*,\s*['\"]?(1|on|true)['\"]?\s*\)/i", $source),
            'includes/process.inc.php turns display_errors on'
        );
    }

    /**
     * SQLi migration phase 1, task 3: sections/winners.sec.php's two
     * mysqli_query() calls (style lookup and style-count) and
     * sections/brewer_entries.sec.php's eval-row style lookup were
     * converted to $db_conn->where()/getOne() parameter binding. None of
     * these three queries are reachable through the current e2e fixtures
     * without flipping prefsDisplayWinners / closing judging (unsafe against
     * other sessions sharing this dev stack - see
     * e2e/tests/sqli-migration-sections-files.spec.ts's header comment), so
     * this is a source-level regression guard rather than a behavioural
     * test: it fails if either file goes back to building a query string
     * with sprintf()/concatenation and a raw mysqli_query() call.
     */
    public function test_winners_and_brewer_entries_style_lookups_stay_parameterized(): void
    {
        $winners = file_get_contents(ROOT . 'sections/winners.sec.php');
        $this->assertNotFalse($winners);
        $this->assertSame(
            0,
            preg_match('/mysqli_query\(\$connection,\s*\$query_styl/', $winners),
            'sections/winners.sec.php has reverted to raw mysqli_query() for its style lookups'
        );
        $this->assertStringContainsString("\$db_conn->getOne(\$prefix.\"styles\"", $winners);
        $this->assertStringContainsString('$db_conn->getOne($brewing_db_table, "COUNT(*) as count")', $winners);

        $brewerEntries = file_get_contents(ROOT . 'sections/brewer_entries.sec.php');
        $this->assertNotFalse($brewerEntries);
        $this->assertSame(
            0,
            preg_match('/mysqli_query\(\$connection,\s*\$query_style\b/', $brewerEntries),
            'sections/brewer_entries.sec.php has reverted to raw mysqli_query() for its eval-row style lookup'
        );
        $this->assertStringContainsString('$db_conn->getOne($prefix."styles", "id,brewStyleType")', $brewerEntries);
    }

    /**
     * P1 SQLi migration phase 1, task 4: admin/competition_info.admin.php's
     * step4 "first brewer" / "contest-info row count" lookups were converted
     * from raw mysqli_query()/sprintf() to $db_conn->getOne(). The step4
     * branch only runs mid first-time setup (setup.php?section=step4, gated
     * on bcoem_sys.setup == 0), which is unreachable on the shared e2e stack
     * (already fully set up, and $setup_free_access is FALSE there) without
     * disrupting other work - see the task-4 report for a manual, throwaway
     * Docker-project verification that these two converted queries return
     * correct real data end to end. This is a source-level regression guard
     * for ordinary test runs rather than a behavioural test.
     */
    public function test_competition_info_step4_lookups_stay_parameterized(): void
    {
        $source = file_get_contents(ROOT . 'admin/competition_info.admin.php');
        $this->assertNotFalse($source);

        $this->assertSame(
            0,
            preg_match('/mysqli_query\(\$connection,\s*\$query_(brewer|comp_info)\b/', $source),
            'admin/competition_info.admin.php has reverted to raw mysqli_query() for its step4 lookups'
        );
        $this->assertStringContainsString(
            '$db_conn->getOne($prefix."brewer", "brewerFirstName,brewerLastName,brewerEmail")',
            $source
        );
        $this->assertStringContainsString(
            '$db_conn->getOne($prefix."contest_info", "COUNT(*) as \'count\'")',
            $source
        );
    }

    /**
     * P1 SQLi migration phase 1, task 5 (eval/output/db file group):
     * eval/scoresheet.eval.php, eval/judging_not_assigned.eval.php, and
     * eval/judging_dashboard.eval.php were converted from raw
     * mysqli_query()/sprintf() to $db_conn->where()/getOne() (scoresheet,
     * judging_dashboard) or mysqli_prepare()/mysqli_stmt_bind_param()
     * (judging_not_assigned - it needed a real multi-row result set for its
     * "do other judges' scores agree" comparison, which getOne()'s implicit
     * LIMIT 1 would have silently broken). All three render only behind an
     * active judge session with a real table assignment (the
     * eval/process.eval.php table-assignment gate) - not reachable as a
     * standalone request without assigning a real judge to a real table on
     * this shared dev stack. The query-building logic itself (and, for the
     * mysqli_prepare calls, that a crafted value is bound rather than
     * concatenated) was verified by running it directly against this
     * stack's live database via the PHP CLI inside the web container - see
     * the task-5 report for that script and its output.
     */
    public function test_scoresheet_and_judging_eval_files_stay_parameterized(): void
    {
        $scoresheet = file_get_contents(ROOT . 'eval/scoresheet.eval.php');
        $this->assertNotFalse($scoresheet);
        $this->assertSame(0, preg_match('/mysqli_query\(/', $scoresheet), 'eval/scoresheet.eval.php has reverted to raw mysqli_query()');
        $this->assertStringContainsString('$row_entry_info = $db_conn->getOne($prefix."brewing");', $scoresheet);
        $this->assertStringContainsString('$row_eval = $db_conn->getOne($eval_table);', $scoresheet);
        $this->assertStringContainsString('$row_style = $db_conn->getOne($prefix."styles");', $scoresheet);
        $this->assertStringContainsString('$row_flight_info = $db_conn->getOne($prefix."judging_flights", "flightTable");', $scoresheet);

        $judgingNotAssigned = file_get_contents(ROOT . 'eval/judging_not_assigned.eval.php');
        $this->assertNotFalse($judgingNotAssigned);
        $this->assertSame(0, preg_match('/mysqli_query\(/', $judgingNotAssigned), 'eval/judging_not_assigned.eval.php has reverted to raw mysqli_query()');
        $this->assertStringContainsString('mysqli_stmt_bind_param($stmt_entry, "s", $value[\'eid\'])', $judgingNotAssigned);
        $this->assertStringContainsString('mysqli_stmt_bind_param($stmt_evals, "s", $value[\'eid\'])', $judgingNotAssigned);

        $judgingDashboard = file_get_contents(ROOT . 'eval/judging_dashboard.eval.php');
        $this->assertNotFalse($judgingDashboard);
        $this->assertSame(0, preg_match('/mysqli_query\(/', $judgingDashboard), 'eval/judging_dashboard.eval.php has reverted to raw mysqli_query()');
        $this->assertStringContainsString('$row_style = $db_conn->getOne ($prefix."styles", "brewStyleType");', $judgingDashboard);
    }

    /**
     * P1 SQLi migration phase 1, task 5: includes/db/output_entries_export_winner.db.php's
     * five mysqli_query() calls (the by-table, by-category, and
     * by-sub-category winner score lookups, plus their nested table-name
     * lookups) were converted to $db_conn->rawQuery()/getOne() with `?`
     * placeholders. The file is included several frames deep inside
     * output/export.output.php's results-download flow (gated on a winner
     * method and a populated per-table entry loop already underway), so it
     * isn't reachable as a standalone request; the converted query shapes
     * were verified directly against this stack's live database via the PHP
     * CLI inside the web container, including a crafted value proving the
     * bound parameter isn't treated as SQL - see the task-5 report.
     */
    public function test_output_entries_export_winner_stays_parameterized(): void
    {
        $source = file_get_contents(ROOT . 'includes/db/output_entries_export_winner.db.php');
        $this->assertNotFalse($source);

        $this->assertSame(0, preg_match('/mysqli_query\(/', $source), 'includes/db/output_entries_export_winner.db.php has reverted to raw mysqli_query()');
        $this->assertSame(3, preg_match_all('/\$db_conn->rawQuery\(\$query_scores, \$params_scores\)/', $source));
        $this->assertSame(2, preg_match_all('/\$db_conn->getOne\(\$prefix\."judging_tables"\.\$archive_suffix, "tableName,tableNumber"\)/', $source));
    }

    /**
     * P1 SQLi migration phase 1, task 5: includes/convert/convert_bjcp_2021.inc.php's
     * five mysqli_query() calls were converted to $db_conn->where()/get()
     * (a byte-for-byte port of upstream's own conversion of the same file,
     * diffed against upstream/master). This is a one-time, competition-wide
     * *destructive* tool (rewrites every judge's likes/dislikes, every
     * table's style list, and every style's active flag, then changes
     * prefsStyleSet) - never safe to run against this shared stack's real
     * data, so it gets this source guard rather than an e2e test. Its
     * read-only query-building logic (the style-id and judge-likes lookups)
     * was verified directly against this stack's live database via the PHP
     * CLI inside the web container - see the task-5 report.
     */
    public function test_convert_bjcp_2021_stays_parameterized(): void
    {
        $source = file_get_contents(ROOT . 'includes/convert/convert_bjcp_2021.inc.php');
        $this->assertNotFalse($source);

        $this->assertSame(0, preg_match('/mysqli_query\(/', $source), 'includes/convert/convert_bjcp_2021.inc.php has reverted to raw mysqli_query()');
        $this->assertStringContainsString("\$db_conn->where('brewStyleVersion', array('BJCP2015','BJCP2021'), 'in');", $source);
        $this->assertStringContainsString('$rows_style_ids = $db_conn->get($styles_db_table, null, "id, brewStyleGroup, brewStyleNum, brewStyleVersion");', $source);
    }

    /**
     * P2 SQLi migration, task 1a (common.lib.php financial/fee functions):
     * total_entries_brewer() and total_paid() were converted from raw
     * mysqli_query()/sprintf() to $db_conn->where()/getOne(), matching
     * upstream/master's own conversion byte-for-byte. Neither function has
     * any caller anywhere in the app (confirmed by a full-repo grep), so
     * there is no page to exercise them through - this is a source guard
     * rather than a behavioural test. Their query shape was verified
     * directly against this stack's live database via the PHP CLI inside
     * the web container - see the task-1a report for that script and its
     * output.
     */
    public function test_dead_code_fee_functions_stay_parameterized(): void
    {
        $source = file_get_contents(ROOT . 'lib/common.lib.php');
        $this->assertNotFalse($source);

        $totalEntriesBrewer = $this->extractFunction($source, 'total_entries_brewer');
        $this->assertSame(0, preg_match('/mysqli_query\(/', $totalEntriesBrewer), 'total_entries_brewer() has reverted to raw mysqli_query()');
        $this->assertStringContainsString("\$db_conn->where('brewBrewerID', \$bid);", $totalEntriesBrewer);
        $this->assertStringContainsString('$db_conn->getOne($prefix."brewing", "COUNT(*) as \'count\'");', $totalEntriesBrewer);

        $totalPaid = $this->extractFunction($source, 'total_paid');
        $this->assertSame(0, preg_match('/mysqli_query\(/', $totalPaid), 'total_paid() has reverted to raw mysqli_query()');
        $this->assertStringContainsString("\$db_conn->where('brewPaid', '1');", $totalPaid);
        $this->assertStringContainsString('$db_conn->getOne($prefix."brewing", "COUNT(*) as \'count\'");', $totalPaid);
    }

    /**
     * P2 SQLi migration, task 1a (common.lib.php financial/fee functions):
     * total_paid_received()'s $id>0 branch and its $archive suffix branch
     * ARE reachable in production - a fix-loop correction after an
     * independent reviewer found the original task-1a report wrongly
     * classified both as dead/unreachable:
     *
     * - $id>0: lib/common.lib.php's best_brewer_points($bid, ...) calls
     *   total_paid_received("", $bid) with a real brewer uid. That function
     *   is called from awards.php (the public awards/results presentation)
     *   and sections/bestbrewer.sec.php (included from sections/default.sec.php,
     *   output/results.output.php, and output/export.output.php) - the
     *   Best Brewer / Best Club scoring feature.
     * - $archive: output/export.output.php's $tb=="circuit" branch calls
     *   total_paid_received("judging_scores", 0, $filter) with a
     *   request-derived $filter, for the archived-year circuit export
     *   (admin/archive.admin.php and admin/default.admin.php both link to
     *   this export with a real archive suffix in $filter).
     *
     * Neither is covered by a behavioural (Playwright) test, for the same
     * reason sections/winners.sec.php's queries are not (see
     * test_winners_and_brewer_entries_style_lookups_stay_parameterized
     * above): reaching best_brewer_points() requires flipping this shared,
     * long-lived stack's prefsDisplayWinners/judging-window state (both
     * awards.php and sections/default.sec.php's bestbrewer.sec.php include
     * are gated on it), and reaching the circuit export's $archive branch
     * requires an actual archive, which admin/archive.admin.php creates by
     * relocating the competition's live brewing/judging_scores/brewer
     * tables into archived, suffixed copies - the same class of
     * one-time/destructive operation that
     * test_convert_bjcp_2021_stays_parameterized above documents as unsafe
     * to run against this shared stack's real data. Both branches' query
     * shape and injection-safety (an injection-shaped $id still resolves to
     * the scoped, not full-table, count; an injection-shaped $archive
     * sanitizes to a safe identifier fragment instead of being concatenated
     * raw) were verified directly against this stack's live database via
     * the PHP CLI inside the web container - see the task-1a report for
     * that script and its output.
     */
    public function test_total_paid_received_id_and_archive_branches_stay_parameterized(): void
    {
        $source = file_get_contents(ROOT . 'lib/common.lib.php');
        $this->assertNotFalse($source);

        $totalPaidReceived = $this->extractFunction($source, 'total_paid_received');
        $this->assertSame(0, preg_match('/mysqli_query\(/', $totalPaidReceived), 'total_paid_received() has reverted to raw mysqli_query()');

        // $id>0 branch: bound `?` placeholder, not string-concatenated.
        $this->assertStringContainsString(
            '{ $query_entry_count .= " WHERE brewBrewerID=? AND brewPaid=\'1\' AND brewReceived=\'1\'"; $params_entry_count[] = $id; }',
            $totalPaidReceived
        );
        $this->assertStringContainsString('$db_conn->rawQueryOne($query_entry_count, $params_entry_count)', $totalPaidReceived);

        // $archive branch: sanitized to alphanumeric-only before use as a
        // table-name identifier suffix (never bound as a `?` value, since
        // identifiers can't be parameterized).
        $this->assertStringContainsString('preg_replace("/[^a-zA-Z0-9]+/", "", $archive)', $totalPaidReceived);
    }

    /**
     * P2 SQLi migration, task 1b (common.lib.php judging/scoring functions):
     * check_judging_flights() and check_judging_numbers() were converted
     * from raw mysqli_query()/sprintf() to $db_conn->where()/getOne(),
     * matching upstream/master's own conversion byte-for-byte. Neither
     * function has any caller anywhere in this fork or upstream/master
     * (confirmed by a full-repo grep for both names) - this is a source
     * guard rather than a behavioural test, same as task 1a's
     * total_entries_brewer()/total_paid() guard above.
     *
     * check_judging_flights() also had a pre-existing bug independent of
     * this migration: its third query referenced an undefined
     * `$query_flights` variable (instead of `$query_check_flights`), which
     * would emit a PHP warning and pass `null` to mysqli_query(). Since the
     * function has no caller, this never surfaced in production; converting
     * to the builder call (matching upstream, which never had this bug)
     * removes the stray variable reference entirely rather than preserving
     * it.
     */
    public function test_dead_code_judging_check_functions_stay_parameterized(): void
    {
        $source = file_get_contents(ROOT . 'lib/common.lib.php');
        $this->assertNotFalse($source);

        $checkJudgingNumbers = $this->extractFunction($source, 'check_judging_numbers');
        $this->assertSame(0, preg_match('/mysqli_query\(/', $checkJudgingNumbers), 'check_judging_numbers() has reverted to raw mysqli_query()');
        $this->assertStringContainsString("\$db_conn->where('brewJudgingNumber IS NULL');", $checkJudgingNumbers);
        $this->assertStringContainsString('$db_conn->getOne($prefix."brewing", "COUNT(*) as count");', $checkJudgingNumbers);

        $checkJudgingFlights = $this->extractFunction($source, 'check_judging_flights');
        $this->assertSame(0, preg_match('/mysqli_query\(/', $checkJudgingFlights), 'check_judging_flights() has reverted to raw mysqli_query()');
        $this->assertSame(0, preg_match('/\$query_flights\b/', $checkJudgingFlights), 'check_judging_flights() still references the undefined $query_flights variable');
        $this->assertStringContainsString('$db_conn->getOne($prefix."judging_tables", "COUNT(*) AS \'count\'");', $checkJudgingFlights);
        $this->assertStringContainsString("\$db_conn->where('brewReceived', '1');", $checkJudgingFlights);
        $this->assertStringContainsString('$db_conn->getOne($prefix."brewing", "COUNT(*) AS \'count\'");', $checkJudgingFlights);
        $this->assertStringContainsString('$db_conn->getOne($prefix."judging_flights", "COUNT(*) AS \'count\'");', $checkJudgingFlights);
    }

    /**
     * P2 SQLi migration, task 1c (common.lib.php style/table-info/display
     * formatting functions): get_table_info() (14 calls), style_convert()
     * (7 calls), style_type() (2 calls), and table_location() (2 calls) were
     * converted from raw mysqli_query()/sprintf() to $db_conn (MysqliDb
     * builder where()/getOne()/get(), or rawQuery()/rawQueryOne() with `?`
     * placeholders for the queries built from optional/variable fragments),
     * matching upstream/master's own conversion of the same functions. The
     * fork lacks upstream's later "current" dbTable alias in
     * get_table_info() and the extra judgingLocNotes field in its
     * "location" method's return (both confirmed absent everywhere in this
     * fork by a full-repo grep) - preserved as-is rather than backported,
     * since adding them would change this fork's existing result shape.
     *
     * Behavioural coverage lives in
     * e2e/tests/sqli-migration-style-table-functions.spec.ts (admin judging
     * tables page exercises get_table_info()'s count_total/list/assigned/
     * count/score_total branches, style_convert()'s always-executed
     * top-of-function lookup, and table_location()'s "default" method; the
     * custom-style-type flow exercises style_type()'s method=2/source=custom
     * branch). This guard catches a reversion to raw mysqli_query() plus the
     * specific query shapes for the branches not reachable from the pages
     * used in that spec (get_table_info()'s "basic"/"styles"/"count_scores"/
     * "count_single_table" methods, and style_convert()'s cases 6-9, which
     * render only in CSV export, judging-flights admin, and pullsheet output
     * contexts). All branches were also verified directly against this
     * stack's live database via the PHP CLI inside the web container with
     * injection-shaped id/style/archive values (no SQL error; a bound,
     * non-numeric injection string that would have widened the old raw
     * query to every row instead resolves - if at all - only via MySQL's
     * ordinary numeric-string coercion of the single bound value, never by
     * breaking out of the query) - see the task-1c report for that script
     * and its output.
     */
    public function test_get_table_info_style_convert_style_type_table_location_stay_parameterized(): void
    {
        $source = file_get_contents(ROOT . 'lib/common.lib.php');
        $this->assertNotFalse($source);

        $getTableInfo = $this->extractFunction($source, 'get_table_info');
        $this->assertSame(0, preg_match('/mysqli_query\(/', $getTableInfo), 'get_table_info() has reverted to raw mysqli_query()');
        $this->assertStringContainsString('$rows_table = (!empty($params_table)) ? $db_conn->rawQuery($query_table, $params_table) : $db_conn->rawQuery($query_table);', $getTableInfo);
        $this->assertStringContainsString("\$db_conn->where('id', \$input);\n\t\t\$row_judging_location = \$db_conn->getOne(\$prefix.\"judging_locations\");", $getTableInfo);
        $this->assertStringContainsString('$rows_table_info = $db_conn->get($judging_tables_db_table, null, "id,tableNumber,tableName,tableStyles");', $getTableInfo);
        $this->assertStringContainsString('$db_conn->getOne($styles_db_table, "brewStyleGroup,brewStyleNum");', $getTableInfo);
        $this->assertStringContainsString("\$db_conn->where('scoreTable', \$table_id);\n\t\t\$row_score_count = \$db_conn->getOne(\$judging_scores_db_table, \"COUNT(*) as 'count'\");", $getTableInfo);
        $this->assertStringContainsString("\$db_conn->where('scoreTable', \$input);\n\t\t\$row_score_count = \$db_conn->getOne(\$judging_scores_db_table, \"COUNT(*) as 'count'\");", $getTableInfo);
        // fork lacks upstream's "current" dbTable alias - confirmed by a
        // full-repo grep finding zero callers pass "current" anywhere.
        $this->assertSame(0, preg_match('/db_table == "current"/', $getTableInfo));

        $styleConvert = $this->extractFunction($source, 'style_convert');
        $this->assertSame(0, preg_match('/mysqli_query\(/', $styleConvert), 'style_convert() has reverted to raw mysqli_query()');
        $this->assertStringContainsString('$row_style = $db_conn->rawQueryOne($query_style, array($number, $style_set));', $styleConvert);
        $this->assertStringContainsString("\$db_conn->where('archiveSuffix', \$archive);\n\t\t\$row_archive_db = \$db_conn->getOne(\$prefix.\"archive\", \"archiveStyleSet\");", $styleConvert);
        $this->assertStringContainsString('$row_style = $db_conn->rawQueryOne($query_style, array($number[0], $number[1], $number[2]));', $styleConvert);

        $styleType = $this->extractFunction($source, 'style_type');
        $this->assertSame(0, preg_match('/mysqli_query\(/', $styleType), 'style_type() has reverted to raw mysqli_query()');
        $this->assertSame(2, substr_count($styleType, '$row_style_type = $db_conn->getOne($prefix."style_types", "styleTypeName");'), 'style_type() method=2/source=custom and method=3 should both use the same converted lookup');

        $tableLocation = $this->extractFunction($source, 'table_location');
        $this->assertSame(0, preg_match('/mysqli_query\(/', $tableLocation), 'table_location() has reverted to raw mysqli_query()');
        $this->assertStringContainsString('$row_table = $db_conn->getOne($prefix."judging_tables", "tableLocation");', $tableLocation);
        $this->assertStringContainsString('$rows_location = $db_conn->get($prefix."judging_locations");', $tableLocation);
    }

    /**
     * P2 SQLi migration, task 1c: styles_active() (4 calls) converted to
     * $db_conn builder/rawQuery() with `?` placeholders for the bound value
     * (style set / archive suffix), matching upstream/master's own
     * conversion (adapted for this fork's lack of upstream's later
     * BJCP2025/BJCP2026/AABC2025 style-set branching - confirmed absent
     * everywhere in this fork by a full-repo grep for those names, the same
     * divergence already documented for winner_check() in task 1b and
     * limit_subcategory() in this task).
     *
     * styles_active() has three callers, all gated behind this shared
     * stack's winners-display/judging-window state (sections/default.sec.php,
     * awards.php, includes/db/scores_bestbrewer.db.php) or deep in a
     * judging-window-gated export branch (output/export.output.php) - the
     * same category of state this stack can't safely flip that
     * sections/winners.sec.php's own queries and total_paid_received()'s
     * $id>0 branch are already documented as unable to reach in
     * tests/Unit/SourceHardeningTest.php and TESTING.md. Covered by this
     * source guard plus a direct PHP CLI verification against the live
     * database (all three methods return real, non-empty results; an
     * injection-shaped $archive produces no SQL error) - see the task-1c
     * report.
     *
     * The style_types_db.$archive table-name fragment in method 1 is a
     * table identifier, not a value, so it stays interpolated per this
     * migration's standing constraint (identifiers can't be bound as `?`).
     */
    public function test_styles_active_stays_parameterized(): void
    {
        $source = file_get_contents(ROOT . 'lib/common.lib.php');
        $this->assertNotFalse($source);

        $stylesActive = $this->extractFunction($source, 'styles_active');
        $this->assertSame(0, preg_match('/mysqli_query\(/', $stylesActive), 'styles_active() has reverted to raw mysqli_query()');
        $this->assertStringContainsString("\$db_conn->where('archiveSuffix', \$archive_suffix);\n\t\t\$row_archive_style_set = \$db_conn->getOne(\$prefix.\"archive\", \"archiveStyleSet\");", $stylesActive);
        $this->assertStringContainsString('$query_styles = "SELECT DISTINCT brewStyleGroup FROM ".$styles_db_table." WHERE (brewStyleVersion=? OR brewStyleOwn=\'custom\')";', $stylesActive);
        $this->assertStringContainsString('$rows_styles = $db_conn->rawQuery($query_styles, array($style_set));', $stylesActive);
        $this->assertStringContainsString('$row_style_types_active = $db_conn->rawQueryOne("SELECT COUNT(*) as \'count\' FROM ".$style_types_db.$archive." WHERE styleTypeBOS=\'Y\'");', $stylesActive);
        $this->assertStringContainsString('$query_styles = "SELECT brewStyleGroup,brewStyleNum,brewStyle FROM ".$styles_db_table." WHERE (brewStyleVersion=? OR brewStyleOwn=\'custom\')";', $stylesActive);
    }

    /**
     * P2 SQLi migration, task 1c: limit_subcategory() (3 calls) converted to
     * $db_conn->rawQueryOne() (style lookup, built from a fixed string plus
     * three bound values) and where()/getOne() (the BA vs. other brewing
     * count), matching upstream/master's own conversion (adapted for this
     * fork's lack of upstream's later BJCP2025/BJCP2026 style-set branching
     * and $_SESSION['style_set_no_numbering'] helper - confirmed absent
     * everywhere in this fork by a full-repo grep; this fork keeps its own
     * `$_SESSION['prefsStyleSet'] == "BA"` check and `[C,M,P]` regex
     * without upstream's added "L" case).
     *
     * Reachable from the brew entry form (sections/brew.sec.php, every
     * style option in the add/edit-entry dropdown) and exercised there by
     * e2e/tests/sqli-migration-style-table-functions.spec.ts, but this
     * fork's default prefsUserSubCatLimit (empty -> brew.sec.php substitutes
     * 99999) makes the page-visible enabled/disabled state insensitive to
     * the function's actual return value for any realistically-sized test
     * dataset, so that e2e assertion alone wouldn't catch a conversion bug
     * that silently miscounts. This guard plus a direct PHP CLI
     * verification against the live database (normal and injection-shaped
     * $style/$uid values; no SQL error, no scope-widening) close that gap -
     * see the task-1c report for that script and its output.
     */
    public function test_limit_subcategory_stays_parameterized(): void
    {
        $source = file_get_contents(ROOT . 'lib/common.lib.php');
        $this->assertNotFalse($source);

        $limitSubcategory = $this->extractFunction($source, 'limit_subcategory');
        $this->assertSame(0, preg_match('/mysqli_query\(/', $limitSubcategory), 'limit_subcategory() has reverted to raw mysqli_query()');
        $this->assertStringContainsString('$row_style = $db_conn->rawQueryOne($query_style, array($_SESSION[\'prefsStyleSet\'], $style_num, $style_break[1]));', $limitSubcategory);
        $this->assertStringContainsString("\$db_conn->where('brewBrewerID', \$uid);\n\t\t\$db_conn->where('brewSubCategory', \$style_break[1]);\n\t\t\$row_check = \$db_conn->getOne(\$prefix.\"brewing\", \"COUNT(*) as 'count'\");", $limitSubcategory);
        $this->assertStringContainsString("\$db_conn->where('brewBrewerID', \$uid);\n\t\t\$db_conn->where('brewCategorySort', \$style_num);\n\t\t\$db_conn->where('brewSubCategory', \$style_break[1]);", $limitSubcategory);
        // fork divergence: no upstream BJCP2025/2026 $chosen_style_set branching.
        $this->assertSame(0, preg_match('/chosen_style_set/', $limitSubcategory));
    }

    /**
     * P2 SQLi migration, task 1c: highlight_required() (4 calls) converted
     * to $db_conn->rawQueryOne() with `?` placeholders. This function has no
     * upstream/master counterpart at all (confirmed by a full upstream-tree
     * grep - it was removed or never ported upstream) and no caller
     * anywhere in this fork (confirmed by a full-repo grep beyond its own
     * definition), consistent with its own "// Unused. 2.6.0." comment -
     * genuinely dead code, same precedent as task 1a's
     * total_entries_brewer()/total_paid() and task 1b's
     * check_judging_flights()/check_judging_numbers() guards above.
     */
    public function test_highlight_required_dead_code_stays_parameterized(): void
    {
        $source = file_get_contents(ROOT . 'lib/common.lib.php');
        $this->assertNotFalse($source);

        $highlightRequired = $this->extractFunction($source, 'highlight_required');
        $this->assertSame(0, preg_match('/mysqli_query\(/', $highlightRequired), 'highlight_required() has reverted to raw mysqli_query()');
        $this->assertSame(4, substr_count($highlightRequired, '$db_conn->rawQueryOne($query_check, array($style_version,$explodies[1],$explodies[2]));'), 'all four highlight_required() branches should use the converted, bound query');
        $this->assertStringContainsString('"SELECT brewStyleSweet FROM ".$prefix."styles WHERE (brewStyleVersion=? OR brewStyleOwn=\'custom\') AND brewStyleGroup=? AND brewStyleNum=?"', $highlightRequired);
        $this->assertStringContainsString('"SELECT brewStyleReqSpec FROM ".$prefix."styles WHERE (brewStyleVersion=? OR brewStyleOwn=\'custom\') AND brewStyleGroup=? AND brewStyleNum=?"', $highlightRequired);
        $this->assertStringContainsString('"SELECT brewStyleCarb FROM ".$prefix."styles WHERE (brewStyleVersion=? OR brewStyleOwn=\'custom\') AND brewStyleGroup=? AND brewStyleNum=?"', $highlightRequired);
        $this->assertStringContainsString('"SELECT brewStyleStrength FROM ".$prefix."styles WHERE (brewStyleVersion=? OR brewStyleOwn=\'custom\') AND brewStyleGroup=? AND brewStyleNum=?"', $highlightRequired);
    }

    /**
     * P2 SQLi migration, task 1d: purge_entries()'s "unpaid" branch
     * (`brewPaid='0' OR brewPaid IS NULL`) converted to
     * $db_conn->where()/get(), matching upstream/master's own conversion.
     * Not exercised live by e2e/tests/sqli-migration-admin-data-integrity-functions.spec.ts:
     * this stack's own real baseline currently has 18 rows with
     * brewPaid IS NULL (confirmed by direct query), so running the live
     * admin "Purge All Unpaid Entries" endpoint would delete real shared
     * data, not just disposable test fixtures - the same
     * irreversible-against-shared-data case this migration's task brief
     * flags to avoid, not a dead-code case like the three guards below.
     */
    public function test_purge_entries_unpaid_branch_stays_parameterized(): void
    {
        $source = file_get_contents(ROOT . 'lib/common.lib.php');
        $this->assertNotFalse($source);

        $purgeEntries = $this->extractFunction($source, 'purge_entries');
        $this->assertSame(0, preg_match('/mysqli_query\(/', $purgeEntries), 'purge_entries() has reverted to raw mysqli_query()');
        $this->assertStringContainsString('$db_conn->where("(brewPaid=\'0\' OR brewPaid IS NULL)");', $purgeEntries);
    }

    /**
     * P2 SQLi migration, task 1d: data_integrity_check()'s duplicate-
     * judging_scores-row cleanup. Deliberately diverges from
     * upstream/master's own equivalent conversion: upstream uses
     * $db_conn->getOne() for the per-eid row *count* check
     * ($totalRows_duplicates = $db_conn->count), but getOne() applies an
     * implicit LIMIT 1, so $db_conn->count there is always 0 or 1 - it can
     * never satisfy upstream's own "> 1" duplicate check, silently
     * disabling this cleanup entirely. That's a functional regression
     * upstream's own migration appears to have introduced (confirmed by
     * reading MysqliDb's get()/getOne()/_dynamicBindResults() LIMIT-1
     * behavior directly), not a pre-existing bug predating any SQLi
     * conversion - so it is not preserved here. This fork instead uses
     * $db_conn->get() (no row limit) for that count, preserving the
     * original raw query's real behavior (an accurate per-eid row count)
     * while still fully parameterizing the query.
     */
    public function test_data_integrity_check_duplicate_judging_scores_count_uses_get_not_getone(): void
    {
        $source = file_get_contents(ROOT . 'lib/common.lib.php');
        $this->assertNotFalse($source);

        $dataIntegrityCheck = $this->extractFunction($source, 'data_integrity_check');
        $this->assertSame(0, preg_match('/mysqli_query\(/', $dataIntegrityCheck), 'data_integrity_check() has reverted to raw mysqli_query()');
        $this->assertStringContainsString('$rows_duplicates = $db_conn->get($prefix."judging_scores", null, "id");', $dataIntegrityCheck);
        $this->assertStringNotContainsString('$row_duplicates = $db_conn->getOne($prefix."judging_scores", "id");', $dataIntegrityCheck, 'the per-eid duplicate COUNT must not come from a LIMIT-1 getOne() call - it silently breaks the ">1" check (see test docblock)');
    }

    /**
     * P2 SQLi migration, task 1d: convert_to_ba(), convert_to_pro(), and
     * remove_sensitive_data() converted to MysqliDb builder calls
     * (where()/get()/getOne()/update()). All three are genuinely dead code:
     * zero callers anywhere in this fork (confirmed by a full-repo grep
     * beyond their own definitions) and none of the three exist in
     * upstream/master at all (confirmed by a full upstream-tree grep).
     * Not reachable through the e2e suite for that reason - same precedent
     * as task 1a's total_entries_brewer()/total_paid() and task 1c's
     * highlight_required() guards above.
     *
     * Both convert_to_ba() and remove_sensitive_data() also carry
     * pre-existing bugs unrelated to this migration, left exactly as-is
     * (not this migration's job to fix unreachable dead code's unrelated
     * bugs): convert_to_ba()'s final UPDATE targets "brewing", not
     * "styles", for the brewStyleActive column (which doesn't exist on
     * "brewing"); remove_sensitive_data() references the undefined
     * $club_array. remove_sensitive_data() additionally used to reference
     * $check_brewer (a second query's raw mysqli_result) one query too
     * early, in its first loop's own do-while continuation check - a
     * second, independent pre-existing bug. Converting that cursor-style
     * do-while to MysqliDb's array-returning get()/foreach (the builder has
     * no cursor-fetch equivalent to preserve the exact crash point)
     * incidentally makes the first loop run to completion instead of
     * erroring immediately on it; the function remains just as unreachable
     * and still fatally broken overall (now via the still-present,
     * still-unfixed $club_array bug instead), so this is a known,
     * deliberate consequence of the conversion mechanism, not a behavior
     * change worth preserving bug-for-bug.
     */
    public function test_dead_code_convert_and_remove_sensitive_data_functions_stay_parameterized(): void
    {
        $source = file_get_contents(ROOT . 'lib/common.lib.php');
        $this->assertNotFalse($source);

        $convertToBa = $this->extractFunction($source, 'convert_to_ba');
        $this->assertSame(0, preg_match('/mysqli_query\(/', $convertToBa), 'convert_to_ba() has reverted to raw mysqli_query()');
        $this->assertStringContainsString('$rows_check = $db_conn->get($prefix."brewing", null, "id, brewCategory, brewCategorySort, brewSubCategory, brewStyle, brewMead1, brewMead2, brewMead3, brewInfo");', $convertToBa);
        $this->assertStringContainsString("\$db_conn->where('brewStyleVersion', 'BA');\n\t\t\$db_conn->orderBy('RAND()', 'ASC');\n\t\t\$row_ba_random = \$db_conn->getOne(\$prefix.\"styles\");", $convertToBa);
        // Pre-existing bug, left as-is: targets "brewing", not "styles".
        $this->assertStringContainsString("\$db_conn->where ('brewStyleVersion', 'BA');\n\t\$result = \$db_conn->update (\$update_table, \$data);", $convertToBa);

        $convertToPro = $this->extractFunction($source, 'convert_to_pro');
        $this->assertSame(0, preg_match('/mysqli_query\(/', $convertToPro), 'convert_to_pro() has reverted to raw mysqli_query()');
        $this->assertStringContainsString('$rows_check = $db_conn->get($prefix."brewer", null, "id");', $convertToPro);
        $this->assertStringContainsString('$row_check_brewery = $db_conn->getOne($prefix."brewer", "COUNT(*) as \'count\'");', $convertToPro);

        $removeSensitiveData = $this->extractFunction($source, 'remove_sensitive_data');
        $this->assertSame(0, preg_match('/mysqli_query\(/', $removeSensitiveData), 'remove_sensitive_data() has reverted to raw mysqli_query()');
        $this->assertStringContainsString('$rows_check_user = $db_conn->get($prefix."users");', $removeSensitiveData);
        $this->assertStringContainsString('$rows_check_brewer = $db_conn->get($prefix."brewer");', $removeSensitiveData);
        $this->assertStringContainsString('$row_check_name = $db_conn->getOne($prefix."brewer", "COUNT(*) as \'count\'");', $removeSensitiveData);
        // Pre-existing bug, left as-is: $club_array is never defined.
        $this->assertStringContainsString('array_rand($club_array,1)', $removeSensitiveData);
    }

    /**
     * P2 SQLi migration, task 1e (common.lib.php judge/table/flight
     * assignment functions): available_at_location(), judge_assignment(),
     * user_flight_assignment(), and entry_flight_assignment() converted from
     * raw mysqli_query()/sprintf() to $db_conn (MysqliDb builder
     * where()/get()/getOne(), or rawQueryOne() with `?` placeholders for the
     * two-table JOIN), matching upstream/master's own conversion of the same
     * functions byte-for-byte.
     *
     * None of these four are reachable through a Playwright flow on this
     * shared stack without either state that doesn't exist (available_at_
     * location) or a global, shared setting that would change behavior for
     * every concurrent session (the other three):
     *  - available_at_location(): confirmed genuinely dead code by a
     *    full-repo grep - zero callers anywhere in this fork, and in
     *    upstream/master the only hit outside its own definition is a code
     *    comment in lib/admin.lib.php (not an actual call).
     *  - judge_assignment(): its only caller is output/labels.output.php's
     *    PDF judge-label generation, gated behind the "virtual locations"
     *    feature - binary PDF output with no simple page-render assertion,
     *    not worth standing up for this one query.
     *  - user_flight_assignment() / entry_flight_assignment(): both are only
     *    called from eval/judging_dashboard.eval.php inside an
     *    `if (!$queued)` block gated on the shared
     *    judging_preferences.jPrefsQueued flag. This stack's seeded baseline
     *    has jPrefsQueued='Y' (queued mode), so that block never executes;
     *    flipping it to 'N' would change queued-vs-non-queued judging
     *    behavior for every judge on this long-lived shared stack, the same
     *    category of global-shared-state risk already established as out of
     *    bounds (e.g. task 1's own sections-files spec declining to flip
     *    prefsDisplayWinners).
     *
     * All four were verified directly against this stack's live database via
     * a one-off PHP CLI script run inside the web container: each converted
     * query runs without a SQL error, and an injection-shaped bound value
     * (e.g. "1' OR '1'='1") returns no row rather than widening the match to
     * every row - see the task-1e report for that script and its output.
     */
    public function test_judge_table_flight_assignment_functions_stay_parameterized(): void
    {
        $source = file_get_contents(ROOT . 'lib/common.lib.php');
        $this->assertNotFalse($source);

        $availableAtLocation = $this->extractFunction($source, 'available_at_location');
        $this->assertSame(0, preg_match('/mysqli_query\(/', $availableAtLocation), 'available_at_location() has reverted to raw mysqli_query()');
        $this->assertStringContainsString("\$db_conn->where('brewerJudgeLocation IS NOT NULL');\n\t\t\$rows_available = \$db_conn->get(\$prefix.\"brewer\", null, \"brewerJudgeLocation\");", $availableAtLocation);
        $this->assertStringContainsString("\$db_conn->where('brewerStewardLocation IS NOT NULL');\n\t\t\$rows_available = \$db_conn->get(\$prefix.\"brewer\", null, \"brewerStewardLocation\");", $availableAtLocation);

        $judgeAssignment = $this->extractFunction($source, 'judge_assignment');
        $this->assertSame(0, preg_match('/mysqli_query\(/', $judgeAssignment), 'judge_assignment() has reverted to raw mysqli_query()');
        $this->assertStringContainsString('$row_judge_assignment = $db_conn->rawQueryOne($query_judge_assignment, array($uid, $loc_id));', $judgeAssignment);
        $this->assertStringContainsString('WHERE a.bid=? AND a.assignLocation=?', $judgeAssignment);

        $userFlightAssignment = $this->extractFunction($source, 'user_flight_assignment');
        $this->assertSame(0, preg_match('/mysqli_query\(/', $userFlightAssignment), 'user_flight_assignment() has reverted to raw mysqli_query()');
        $this->assertStringContainsString("\$db_conn->where('bid', \$uid);\n\t\$db_conn->where('assignTable', \$table_id);\n\t\$row_flight_assign = \$db_conn->getOne(\$prefix.\"judging_assignments\");", $userFlightAssignment);

        $entryFlightAssignment = $this->extractFunction($source, 'entry_flight_assignment');
        $this->assertSame(0, preg_match('/mysqli_query\(/', $entryFlightAssignment), 'entry_flight_assignment() has reverted to raw mysqli_query()');
        $this->assertStringContainsString("\$db_conn->where('flightEntryID', \$eid);\n\t\$db_conn->where('flightTable', \$table_id);\n\t\$row_flight_assign = \$db_conn->getOne(\$prefix.\"judging_flights\", \"flightNumber\");", $entryFlightAssignment);
    }

    /**
     * P2 SQLi migration, task 1f (common.lib.php misc single-call
     * count/lookup utility functions): user_check() converted from raw
     * mysqli_query()/sprintf() to $db_conn (MysqliDb builder where()/
     * getOne()), matching upstream/master's own conversion byte-for-byte.
     *
     * Genuinely dead code: a full-repo grep finds zero callers anywhere in
     * this fork, and the same is true in upstream/master (its only hits
     * outside its own definition are in tests/Unit/SecurityAndCryptoTest.php,
     * documenting it as "NOT pure: it opens a DB connection" - not an actual
     * call either). Converted anyway per scope, guarded here instead of by an
     * e2e test.
     */
    public function test_user_check_dead_code_stays_parameterized(): void
    {
        $source = file_get_contents(ROOT . 'lib/common.lib.php');
        $this->assertNotFalse($source);

        $userCheck = $this->extractFunction($source, 'user_check');
        $this->assertSame(0, preg_match('/mysqli_query\(/', $userCheck), 'user_check() has reverted to raw mysqli_query()');
        $this->assertStringContainsString("\$db_conn->where('user_name', \$user_name);\n\t\$row_userCheck = \$db_conn->getOne(\$prefix.\"users\");", $userCheck);
    }

    /**
     * P2 SQLi migration, task 1f: check_bos_loc() converted from raw
     * mysqli_query()/sprintf() (with the id interpolated directly into the
     * SQL string via double-quote variable interpolation, not even sprintf's
     * %s) to $db_conn (MysqliDb builder where()/getOne()), for consistency
     * with the rest of this migration.
     *
     * Not merely dead code but entirely commented out (wrapped in a `/ *
     * ... * /` block starting at the line above its own `function` keyword) -
     * confirmed by a full-repo grep: zero callers anywhere in this fork
     * (unsurprising, since PHP never parses commented-out code at all), and
     * the function doesn't exist in upstream/master under this name at all.
     * Converting the commented-out text has no runtime effect either way, but
     * keeps it consistent with the rest of this migration's style rather than
     * leaving a stale raw-SQL example lying around; guarded here since it can
     * never be exercised through any real request.
     */
    public function test_check_bos_loc_dead_commented_out_code_stays_parameterized(): void
    {
        $source = file_get_contents(ROOT . 'lib/common.lib.php');
        $this->assertNotFalse($source);

        $checkBosLoc = $this->extractFunction($source, 'check_bos_loc');
        $this->assertSame(0, preg_match('/mysqli_query\(/', $checkBosLoc), 'check_bos_loc() has reverted to raw mysqli_query()');
        $this->assertStringContainsString("\$db_conn->where('id', \$id);\n\t\$row_judging = \$db_conn->getOne(\$prefix.\"judging_locations\", \"judgingLocName,judgingDate\");", $checkBosLoc);
        // Still inside an unclosed comment block at the point the function
        // starts, i.e. never live PHP: the nearest preceding "/*" has no "*/"
        // between it and "function check_bos_loc(".
        $functionStart = strpos($source, 'function check_bos_loc(');
        $before = substr($source, 0, $functionStart);
        $lastCommentOpen = strrpos($before, '/*');
        $this->assertNotFalse($lastCommentOpen, 'check_bos_loc() is no longer preceded by any comment opener');
        $this->assertFalse(
            strpos(substr($source, $lastCommentOpen, $functionStart - $lastCommentOpen), '*/'),
            'check_bos_loc() is no longer inside the commented-out block (a "*/" now closes it before the function starts)'
        );
    }

    /**
     * Returns the source text of a single top-level function, from its
     * `function name(` line through the line containing the next top-level
     * `function ` declaration (exclusive). Good enough for the narrow,
     * well-formed functions this guard checks - not a general PHP parser.
     */
    private function extractFunction(string $source, string $name): string
    {
        $start = strpos($source, "function {$name}(");
        $this->assertNotFalse($start, "function {$name}() not found in source");
        $nextFunction = strpos($source, "\nfunction ", $start + 1);
        return $nextFunction === false ? substr($source, $start) : substr($source, $start, $nextFunction - $start);
    }
}

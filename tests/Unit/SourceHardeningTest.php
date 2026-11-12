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
}

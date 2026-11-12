<?php
/**
 * Characterization tests for HTML-generating utility functions in common.lib.php.
 *
 * These functions have no DB dependencies and return HTML strings.
 * We test structure and key attribute values rather than exact whitespace.
 */

use PHPUnit\Framework\TestCase;

class HtmlGeneratorsTest extends TestCase
{
    // ── style_number_const() ─────────────────────────────────
    // Method 1 and 2 are pure (no session). Method 0 reads $_SESSION.

    public function test_style_number_const_method1_pads_number(): void
    {
        // Method 1: returns raw category + separator + subcategory
        $result = style_number_const("01", "A", ".", 1);
        $this->assertSame("01.A", $result);
    }

    public function test_style_number_const_method2_ltrims_zeros(): void
    {
        // Method 2: ltrim leading zeros from category
        $result = style_number_const("01", "A", ".", 2);
        $this->assertSame("1.A", $result);
    }

    public function test_style_number_const_method3_default_ltrims_category(): void
    {
        // Method 3 (default): ltrim category, keep subcategory as-is
        $result = style_number_const("01", "A", ".", 3);
        $this->assertSame("1.A", $result);
    }

    public function test_style_number_const_method0_no_numbering_style_set_returns_empty_string(): void
    {
        // Method 0 returns "" when the active style set is flagged as unnumbered
        // (e.g. BA). Upstream keys this off $_SESSION['style_set_no_numbering'],
        // not off the style set's name.
        $_SESSION['prefsStyleSet'] = "BA";
        $_SESSION['style_set_no_numbering'] = true;
        $result = style_number_const("01", "A", ".", 0);
        $this->assertSame("", $result);
        unset($_SESSION['prefsStyleSet'], $_SESSION['style_set_no_numbering']);
    }

    public function test_style_number_const_method0_bjcp2021_ltrims(): void
    {
        $_SESSION['prefsStyleSet'] = "BJCP2021";
        $_SESSION['style_set_no_numbering'] = false;
        $result = style_number_const("01", "A", ".", 0);
        $this->assertSame("1.A", $result);
        unset($_SESSION['prefsStyleSet'], $_SESSION['style_set_no_numbering']);
    }

    public function test_style_number_const_method0_no_session_returns_empty(): void
    {
        unset($_SESSION['prefsStyleSet']);
        $result = style_number_const("01", "A", ".", 0);
        $this->assertSame("", $result);
    }

    // ── designations() ───────────────────────────────────────
    // Takes a comma-separated STRING of rank designations, not an array.
    // Returns HTML lines for any designation that differs from $display.

    public function test_designations_returns_string(): void
    {
        // $judge_array is a comma-delimited string; $display is what to exclude
        $result = designations("Certified,National", "Certified");
        $this->assertIsString($result);
    }

    public function test_designations_excludes_display_value(): void
    {
        $result = designations("Certified,National", "Certified");
        // "Certified" is the $display value and should be excluded
        $this->assertStringNotContainsString(">Certified<", $result);
        $this->assertStringContainsString("National", $result);
    }

    public function test_designations_empty_string_returns_empty(): void
    {
        // Empty-string guard added: trim($judge_array) === "" → return "" immediately.
        $result = designations("", "Certified");
        $this->assertSame("", $result);
    }

    // ── GetSQLValueString() ──────────────────────────────────
    // Characterization notes:
    //   "int"    → returns PHP int via intval()
    //   "double" → returns SQL-quoted string e.g. '3.14'  (NOT a float)
    //   "defined"→ returns the raw defined/not-defined value (NO extra quoting)
    //   "text"   → requires DB connection (mysqli_real_escape_string); skip here

    public function test_get_sql_value_string_type_int_casts_to_int(): void
    {
        $result = GetSQLValueString("42abc", "int");
        $this->assertSame(42, $result);
    }

    public function test_get_sql_value_string_type_int_empty_returns_null_string(): void
    {
        $result = GetSQLValueString("", "int");
        $this->assertSame("NULL", $result);
    }

    public function test_get_sql_value_string_type_double_returns_quoted_string(): void
    {
        // double type wraps in single quotes → "'3.14'" not the float 3.14
        $result = GetSQLValueString("3.14xyz", "double");
        $this->assertSame("'3.14'", $result);
    }

    public function test_get_sql_value_string_type_defined_with_value(): void
    {
        // "defined" returns the raw $theDefinedValue — no extra quoting added
        $result = GetSQLValueString("yes", "defined", "YES", "NO");
        $this->assertSame("YES", $result);
    }

    public function test_get_sql_value_string_type_defined_without_value(): void
    {
        $result = GetSQLValueString("", "defined", "YES", "NO");
        $this->assertSame("NO", $result);
    }
}

<?php
/**
 * Characterization tests for ordinal, number-formatting, and
 * ranking functions in common.lib.php.
 */

use PHPUnit\Framework\TestCase;

class OrdinalAndNumberFunctionsTest extends TestCase
{
    // ── addOrdinalNumberSuffix() ─────────────────────────────

    public function test_ordinal_1st(): void
    {
        $this->assertSame("1st", addOrdinalNumberSuffix(1));
    }

    public function test_ordinal_2nd(): void
    {
        $this->assertSame("2nd", addOrdinalNumberSuffix(2));
    }

    public function test_ordinal_3rd(): void
    {
        $this->assertSame("3rd", addOrdinalNumberSuffix(3));
    }

    public function test_ordinal_4th(): void
    {
        $this->assertSame("4th", addOrdinalNumberSuffix(4));
    }

    /** 11–13 are always "th" regardless of the last digit */
    public function test_ordinal_11th(): void
    {
        $this->assertSame("11th", addOrdinalNumberSuffix(11));
    }

    public function test_ordinal_12th(): void
    {
        $this->assertSame("12th", addOrdinalNumberSuffix(12));
    }

    public function test_ordinal_13th(): void
    {
        $this->assertSame("13th", addOrdinalNumberSuffix(13));
    }

    public function test_ordinal_21st(): void
    {
        $this->assertSame("21st", addOrdinalNumberSuffix(21));
    }

    public function test_ordinal_22nd(): void
    {
        $this->assertSame("22nd", addOrdinalNumberSuffix(22));
    }

    public function test_ordinal_23rd(): void
    {
        $this->assertSame("23rd", addOrdinalNumberSuffix(23));
    }

    public function test_ordinal_100th(): void
    {
        $this->assertSame("100th", addOrdinalNumberSuffix(100));
    }

    public function test_ordinal_111th(): void
    {
        $this->assertSame("111th", addOrdinalNumberSuffix(111));
    }

    public function test_ordinal_non_numeric_passthrough(): void
    {
        // Non-numeric values are returned unchanged
        $this->assertSame("abc", addOrdinalNumberSuffix("abc"));
        $this->assertSame("", addOrdinalNumberSuffix(""));
    }

    // ── number_pad() ─────────────────────────────────────────

    public function test_number_pad_single_digit_to_4(): void
    {
        $this->assertSame("0005", number_pad(5, 4));
    }

    public function test_number_pad_exact_width(): void
    {
        $this->assertSame("1234", number_pad(1234, 4));
    }

    public function test_number_pad_zero(): void
    {
        $this->assertSame("000", number_pad(0, 3));
    }

    public function test_number_pad_two_digits_to_three(): void
    {
        $this->assertSame("042", number_pad(42, 3));
    }

    // ── readable_number() ────────────────────────────────────

    public function test_readable_number_zero(): void
    {
        $this->assertSame("zero", readable_number(0));
    }

    public function test_readable_number_single_digit(): void
    {
        $this->assertSame("one", readable_number(1));
        $this->assertSame("nine", readable_number(9));
    }

    public function test_readable_number_teens(): void
    {
        $this->assertSame("eleven", readable_number(11));
        $this->assertSame("nineteen", readable_number(19));
    }

    public function test_readable_number_tens(): void
    {
        $this->assertSame("twenty ", readable_number(20));
        $this->assertSame("thirty one", readable_number(31));
    }

    public function test_readable_number_negative(): void
    {
        $this->assertSame("minus one", readable_number(-1));
    }

    // Both off-by-one bugs are now fixed:
    //   • ($a > 100)  → ($a >= 100)  so readable_number(100) = 'one hundred '
    //   • ($a > $p)   → ($a >= $p)   so readable_number(1000) = 'one thousand'

    public function test_readable_number_100_returns_one_hundred(): void
    {
        $this->assertSame('one hundred ', readable_number(100));
    }

    public function test_readable_number_101_works_correctly(): void
    {
        // 101 > 100 is TRUE so the hundreds branch fires: "one hundred and one"
        $this->assertSame('one hundred and one', readable_number(101));
    }

    public function test_readable_number_1000_returns_one_thousand(): void
    {
        // Fixed: ($a > $p) corrected to ($a >= $p) so 1000 hits the thousands branch.
        $this->assertSame('one thousand', readable_number(1000));
    }

    public function test_readable_number_1001_works_correctly(): void
    {
        // 1001 > 1000 is TRUE so the thousands branch fires correctly
        $this->assertSame('one thousand, one', readable_number(1001));
    }

    // ── place_heirarchy() [sic] ──────────────────────────────
    // Returns inverted sort weight: 1st place → 5, last → 1

    public function test_place_heirarchy_first(): void
    {
        $this->assertSame("5", place_heirarchy("1"));
    }

    public function test_place_heirarchy_second(): void
    {
        $this->assertSame("4", place_heirarchy("2"));
    }

    public function test_place_heirarchy_third(): void
    {
        $this->assertSame("3", place_heirarchy("3"));
    }

    public function test_place_heirarchy_fourth(): void
    {
        $this->assertSame("2", place_heirarchy("4"));
    }

    public function test_place_heirarchy_fifth(): void
    {
        $this->assertSame("1", place_heirarchy("5"));
    }

    // ── display_place() ──────────────────────────────────────
    // SKIPPED: display_place() calls require(CONFIG.'config.php') at the top
    // of the function, BEFORE the method switch, so even method 0
    // (which only calls addOrdinalNumberSuffix) triggers a DB connection.
    // All display_place tests belong in the Integration suite.

    public function test_display_place_method0_skipped(): void
    {
        $this->markTestSkipped(
            'display_place() calls require(config.php) before any method check. Move to Integration suite.'
        );
    }

    // ── bjcp_rank() ──────────────────────────────────────────

    public function test_bjcp_rank_method1_grand_master(): void
    {
        $this->assertSame("Level 6: Grand Master", bjcp_rank("Grand Master", "1"));
    }

    public function test_bjcp_rank_method1_master(): void
    {
        $this->assertSame("Level 5: Master", bjcp_rank("Master", "1"));
    }

    public function test_bjcp_rank_method1_national(): void
    {
        $this->assertSame("Level 4: National", bjcp_rank("National", "1"));
    }

    public function test_bjcp_rank_method1_certified(): void
    {
        $this->assertSame("Level 3: Certified", bjcp_rank("Certified", "1"));
    }

    public function test_bjcp_rank_method1_recognized(): void
    {
        $this->assertSame("Level 2: Recognized", bjcp_rank("Recognized", "1"));
    }

    public function test_bjcp_rank_method1_apprentice(): void
    {
        $this->assertSame("Level 1: Apprentice", bjcp_rank("Apprentice", "1"));
    }

    public function test_bjcp_rank_method1_experienced(): void
    {
        $this->assertSame("Level 0: Experienced", bjcp_rank("Experienced", "1"));
    }

    public function test_bjcp_rank_method1_none_shows_non_bjcp(): void
    {
        $this->assertSame("Level 0: Non-BJCP Judge", bjcp_rank("None", "1"));
    }

    public function test_bjcp_rank_method1_empty_shows_non_bjcp(): void
    {
        $this->assertSame("Level 0: Non-BJCP Judge", bjcp_rank("", "1"));
    }

    public function test_bjcp_rank_method1_provisional(): void
    {
        $this->assertSame("Level 1: Provisional", bjcp_rank("Provisional", "1"));
    }

    public function test_bjcp_rank_method1_mead_judge(): void
    {
        $this->assertSame("Level 3: Mead Judge", bjcp_rank("Mead Judge", "1"));
    }

    public function test_bjcp_rank_method2_certified(): void
    {
        $this->assertSame("BJCP Certified Judge", bjcp_rank("Certified", "2"));
    }

    public function test_bjcp_rank_method2_national(): void
    {
        $this->assertSame("BJCP National Judge", bjcp_rank("National", "2"));
    }

    public function test_bjcp_rank_method2_none_is_non_bjcp(): void
    {
        $this->assertSame("Non-BJCP Judge", bjcp_rank("None", "2"));
    }

    public function test_bjcp_rank_method2_experienced_is_non_bjcp(): void
    {
        $this->assertSame("Non-BJCP Judge", bjcp_rank("Experienced", "2"));
    }

    public function test_bjcp_rank_method2_professional_brewer_passthrough(): void
    {
        $this->assertSame("Professional Brewer", bjcp_rank("Professional Brewer", "2"));
    }

    public function test_bjcp_rank_method2_beer_sommelier_passthrough(): void
    {
        $this->assertSame("Beer Sommelier", bjcp_rank("Beer Sommelier", "2"));
    }

    // ── srm_color() ──────────────────────────────────────────

    public function test_srm_color_very_pale(): void
    {
        $this->assertSame("#f3f993", srm_color(1, "srm"));
    }

    public function test_srm_color_straw(): void
    {
        $this->assertSame("#f5f75c", srm_color(2, "srm"));
    }

    public function test_srm_color_dark_amber(): void
    {
        $this->assertSame("#985336", srm_color(16, "srm"));
    }

    public function test_srm_color_black(): void
    {
        $this->assertSame("#000000", srm_color(40, "srm"));
    }

    public function test_srm_color_below_range_returns_white(): void
    {
        $this->assertSame("#ffffff", srm_color(0, "srm"));
    }

    public function test_srm_color_ebc_method_converts_first(): void
    {
        // 20 EBC × 1.97 = 39.4 SRM → should map to the >31 black bucket
        $this->assertSame("#000000", srm_color(20, "ebc"));
    }

    // ── open_or_closed() ─────────────────────────────────────

    public function test_open_or_closed_before_window(): void
    {
        $now   = 1000;
        $open  = 2000;
        $close = 3000;
        $this->assertSame(0, open_or_closed($now, $open, $close));
    }

    public function test_open_or_closed_during_window(): void
    {
        $now   = 2500;
        $open  = 2000;
        $close = 3000;
        $this->assertSame(1, open_or_closed($now, $open, $close));
    }

    public function test_open_or_closed_at_open_boundary(): void
    {
        // Boundary: $now == $date1 → inside window (>=)
        $this->assertSame(1, open_or_closed(2000, 2000, 3000));
    }

    public function test_open_or_closed_after_window(): void
    {
        $now   = 4000;
        $open  = 2000;
        $close = 3000;
        $this->assertSame(2, open_or_closed($now, $open, $close));
    }

    // ── open_limit() ─────────────────────────────────────────

    public function test_open_limit_under_limit_returns_false(): void
    {
        $this->assertFalse(open_limit(5, 10, "1"));
    }

    public function test_open_limit_at_limit_returns_true(): void
    {
        $this->assertTrue(open_limit(10, 10, "1"));
    }

    public function test_open_limit_over_limit_returns_true(): void
    {
        $this->assertTrue(open_limit(11, 10, "1"));
    }

    public function test_open_limit_empty_limit_returns_false(): void
    {
        // Empty limit means no cap configured → always false
        $this->assertFalse(open_limit(100, "", "1"));
    }

    public function test_open_limit_registration_not_open_returns_false(): void
    {
        // Even if at cap, if registration_open != "1", return false
        $this->assertFalse(open_limit(10, 10, "0"));
    }
}

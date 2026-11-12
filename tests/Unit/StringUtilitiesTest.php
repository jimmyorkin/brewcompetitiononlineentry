<?php
/**
 * Characterization tests for string utility functions in common.lib.php.
 */

use PHPUnit\Framework\TestCase;

class StringUtilitiesTest extends TestCase
{
    // ── in_string() ──────────────────────────────────────────

    public function test_in_string_found(): void
    {
        $this->assertTrue(in_string("Hello World", "World"));
    }

    public function test_in_string_not_found(): void
    {
        // 2.7 returns NULL (not FALSE) when there is no match.
        $this->assertNotTrue(in_string("Hello World", "Goodbye"));
        $this->assertNull(in_string("Hello World", "Goodbye"));
    }

    public function test_in_string_empty_needle(): void
    {
        // strpos("Hello", "") returns 0 which is !== false
        $this->assertTrue(in_string("Hello", ""));
    }

    public function test_in_string_partial_match(): void
    {
        $this->assertTrue(in_string("brewcompetition", "brew"));
    }

    public function test_in_string_case_sensitive(): void
    {
        // in_string uses strpos (case-sensitive). No match → returns false.
        $this->assertNotTrue(in_string("Hello World", "hello"));
    }

    // ── normalizeClubs() ─────────────────────────────────────

    public function test_normalizeClubs_strips_spaces_and_lowercases(): void
    {
        $this->assertSame("homebrewers", normalizeClubs("Home Brewers"));
    }

    public function test_normalizeClubs_strips_special_characters(): void
    {
        $this->assertSame("stlouishomebrewers", normalizeClubs("St. Louis Home Brewers"));
    }

    public function test_normalizeClubs_strips_ampersand(): void
    {
        $this->assertSame("beerbarleywineclub", normalizeClubs("Beer & Barleywine Club"));
    }

    public function test_normalizeClubs_numbers_preserved(): void
    {
        $this->assertSame("brew42club", normalizeClubs("Brew 42 Club"));
    }

    public function test_normalizeClubs_already_normalized(): void
    {
        $this->assertSame("brewclub", normalizeClubs("brewclub"));
    }

    // ── clean_up_text() ──────────────────────────────────────

    public function test_clean_up_text_strips_newlines(): void
    {
        $result = clean_up_text("line one\nline two");
        $this->assertStringNotContainsString("\n", $result);
    }

    public function test_clean_up_text_strips_carriage_returns(): void
    {
        $result = clean_up_text("line one\r\nline two");
        $this->assertStringNotContainsString("\r", $result);
    }

    public function test_clean_up_text_plain_text_passthrough(): void
    {
        $this->assertSame("Hello World", clean_up_text("Hello World"));
    }

    public function test_clean_up_text_encodes_then_decodes_quotes(): void
    {
        // htmlspecialchars encodes, then htmlspecialchars_decode decodes back
        // Net result: single quotes survive intact
        $result = clean_up_text("it's a test");
        $this->assertSame("it's a test", $result);
    }

    // ── truncate_string() ────────────────────────────────────

    public function test_truncate_string_under_limit_returns_unchanged(): void
    {
        $this->assertSame("Short", truncate_string("Short", 100));
    }

    public function test_truncate_string_exact_limit_returns_unchanged(): void
    {
        $s = str_repeat("a", 50);
        $this->assertSame($s, truncate_string($s, 50));
    }

    public function test_truncate_string_truncates_at_break_character(): void
    {
        // Default break is ".", pad is "..."
        $result = truncate_string("This is a sentence. This is another.", 10);
        $this->assertSame("This is a sentence...", $result);
    }

    public function test_truncate_string_no_break_character_returns_full(): void
    {
        // If break char not found after limit, string returned as-is
        $result = truncate_string("This string has no period at all", 10);
        $this->assertSame("This string has no period at all", $result);
    }

    // ── remove_accents() ─────────────────────────────────────

    public function test_remove_accents_plain_ascii_passthrough(): void
    {
        $this->assertSame("Hello World", remove_accents("Hello World"));
    }

    public function test_remove_accents_converts_e_acute(): void
    {
        $this->assertSame("cafe", remove_accents("café"));
    }

    public function test_remove_accents_converts_umlaut(): void
    {
        // The function maps Ü to "Ue" (German transliteration convention), not bare "U"
        $this->assertSame("Ueber", remove_accents("Über"));
    }

    public function test_remove_accents_converts_ae_ligature(): void
    {
        // Æ maps to "Ae" in the character table (not "AE")
        $this->assertSame("Ae", remove_accents("Æ"));
    }

    public function test_remove_accents_mixed_string(): void
    {
        $result = remove_accents("naïve café");
        $this->assertSame("naive cafe", $result);
    }

    public function test_remove_accents_empty_string(): void
    {
        $this->assertSame("", remove_accents(""));
    }

    // ── scrub_filename() ─────────────────────────────────────

    public function test_scrub_filename_removes_ampersand(): void
    {
        // scrub_filename replaces & with "" (empty string), NOT a space
        $this->assertSame("foobar", scrub_filename("foo&bar"));
    }

    public function test_scrub_filename_removes_question_mark(): void
    {
        $this->assertSame("file", scrub_filename("file?"));
    }

    public function test_scrub_filename_removes_dollar_sign(): void
    {
        $this->assertSame("price", scrub_filename("price$"));
    }

    public function test_scrub_filename_removes_multiple_chars(): void
    {
        $result = scrub_filename('file&name?with=special%chars"and\'more$here*');
        $this->assertSame("filenamewithspecialcharsandmorehere", $result);
    }

    public function test_scrub_filename_clean_name_passthrough(): void
    {
        $this->assertSame("my-file-name", scrub_filename("my-file-name"));
    }

    // ── clean_filename() ─────────────────────────────────────

    public function test_clean_filename_spaces_become_dashes(): void
    {
        $this->assertSame("my-file.pdf", clean_filename("my file.pdf"));
    }

    public function test_clean_filename_underscores_become_dashes(): void
    {
        $this->assertSame("my-file.txt", clean_filename("my_file.txt"));
    }

    public function test_clean_filename_preserves_extension(): void
    {
        $result = clean_filename("Report 2025.docx");
        $this->assertStringEndsWith(".docx", $result);
    }

    public function test_clean_filename_strips_accents(): void
    {
        $result = clean_filename("café-résultats.pdf");
        $this->assertSame("cafe-resultats.pdf", $result);
    }

    public function test_clean_filename_collapses_multiple_dashes(): void
    {
        $result = clean_filename("my   file.txt");  // multiple spaces
        $this->assertSame("my-file.txt", $result);
    }

    // ── is_html() ────────────────────────────────────────────

    public function test_is_html_detects_tag(): void
    {
        $this->assertTrue(is_html("<p>Hello</p>"));
    }

    public function test_is_html_detects_self_closing_tag(): void
    {
        $this->assertTrue(is_html("<br>"));
    }

    public function test_is_html_plain_text_returns_false(): void
    {
        $this->assertFalse(is_html("Just plain text"));
    }

    public function test_is_html_empty_string_returns_false(): void
    {
        $this->assertFalse(is_html(""));
    }

    // ── check_exension() [sic] ───────────────────────────────

    public function test_check_extension_xml_returns_true(): void
    {
        $this->assertTrue(check_exension("xml"));
    }

    public function test_check_extension_jpg_returns_false(): void
    {
        $this->assertFalse(check_exension("jpg"));
    }

    public function test_check_extension_pdf_returns_false(): void
    {
        $this->assertFalse(check_exension("pdf"));
    }

    public function test_check_extension_empty_returns_false(): void
    {
        $this->assertFalse(check_exension(""));
    }

    public function test_check_extension_null_returns_false(): void
    {
        $this->assertFalse(check_exension(NULL));
    }

    // ── admin_relocate() ─────────────────────────────────────

    public function test_admin_relocate_admin_user_entries_no_list(): void
    {
        $this->assertSame("admin", admin_relocate(1, "entries", "http://example.com/admin"));
    }

    public function test_admin_relocate_admin_user_entries_with_list_in_referrer(): void
    {
        $this->assertSame("list", admin_relocate(1, "entries", "http://example.com/list"));
    }

    public function test_admin_relocate_non_entries_section(): void
    {
        $this->assertSame("list", admin_relocate(1, "brewer", "http://example.com/admin"));
    }

    public function test_admin_relocate_level2_user(): void
    {
        // Level 2 users always go to list
        $this->assertSame("list", admin_relocate(2, "entries", "http://example.com/admin"));
    }

    // ── search_array() ───────────────────────────────────────
    // 2.7 returns a LIST of matching rows (each match wrapped in an outer array).
    // Returns null when no match is found.

    public function test_search_array_finds_value(): void
    {
        $arr = [['id' => 1, 'name' => 'Alice'], ['id' => 2, 'name' => 'Bob']];
        $result = search_array($arr, 'name', 'Bob');
        $this->assertSame([['id' => 2, 'name' => 'Bob']], $result);
    }

    public function test_search_array_returns_null_when_not_found(): void
    {
        $arr = [['id' => 1, 'name' => 'Alice']];
        $result = search_array($arr, 'name', 'Charlie');
        $this->assertNull($result);
    }

    public function test_search_array_empty_array_returns_null(): void
    {
        $this->assertNull(search_array([], 'name', 'Alice'));
    }

    // ── display_array_content() ──────────────────────────────
    // Valid method values: "1" (no separator), "2" (", "), "3" (",").
    // Any other value → no separator appended.
    // Trailing separator is stripped via rtrim($a, ", ").

    public function test_display_array_content_method_empty_string_joins(): void
    {
        $result = display_array_content(['a', 'b', 'c'], '');
        $this->assertSame('abc', $result);
    }

    public function test_display_array_content_method3_comma_joins(): void
    {
        // Method "3" adds "," between elements; trailing "," is rtrimed by the last rtrim($a,",") call
        $result = display_array_content(['x', 'y'], '3');
        $this->assertSame('x,y', $result);
    }

    public function test_display_array_content_method2_strips_trailing_separator(): void
    {
        // Method "2" adds ", " after each element; trailing ", " is stripped by rtrim.
        $result = display_array_content(['a', 'b'], '2');
        $this->assertSame('a, b', $result);
    }
}

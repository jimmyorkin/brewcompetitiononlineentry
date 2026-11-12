<?php
/**
 * Characterization tests for URL-building and navigation functions
 * in common.lib.php that have no DB dependency.
 *
 * build_public_url() and build_admin_url() are pure string builders.
 * build_action_link(), build_output_link(), build_form_action() produce HTML.
 */

use PHPUnit\Framework\TestCase;

class UrlAndNavigationTest extends TestCase
{
    private string $base = "https://example.com/";

    protected function setUp(): void
    {
        // build_public_url() reads $_SESSION['prefsSEF'] without an isset() guard.
        // Default to empty string so the non-SEF branch is taken and PHP 8
        // undefined-index warnings are suppressed.
        $_SESSION['prefsSEF'] = '';
    }

    protected function tearDown(): void
    {
        unset($_SESSION['prefsSEF']);
    }

    // ── build_public_url() ───────────────────────────────────
    // NOTE: The $sef parameter in the function signature is UNUSED.
    // The function exclusively reads $_SESSION['prefsSEF'] == 'Y'.

    public function test_build_public_url_default_section(): void
    {
        $result = build_public_url("default", "default", "default", "default", false, $this->base);
        $this->assertStringContainsString("index.php", $result);
        $this->assertStringContainsString("section=default", $result);
    }

    public function test_build_public_url_brew_section(): void
    {
        $result = build_public_url("brew", "default", "default", "default", false, $this->base);
        $this->assertStringContainsString("section=brew", $result);
    }

    public function test_build_public_url_with_id(): void
    {
        $result = build_public_url("brew", "default", "edit", "42", false, $this->base);
        $this->assertStringContainsString("id=42", $result);
    }

    public function test_build_public_url_sef_session_changes_format(): void
    {
        // When $sef is falsy (false/""), $_SESSION['prefsSEF'] controls the format.
        $_SESSION['prefsSEF'] = 'Y';
        $sef = build_public_url("brew", "default", "default", "default", false, $this->base);

        $_SESSION['prefsSEF'] = '';
        $no_sef = build_public_url("brew", "default", "default", "default", false, $this->base);

        // SEF mode drops "index.php?section=" in favour of path segments
        $this->assertStringNotContainsString("index.php", $sef);
        $this->assertStringContainsString("index.php", $no_sef);
    }

    // ── build_admin_url() ────────────────────────────────────
    // SKIPPED: build_admin_url() is commented out in the source (lines 177-199).
    // These tests are preserved so they can be re-enabled once the function is
    // un-commented or replaced.

    public function test_build_admin_url_basic(): void
    {
        $this->markTestSkipped('build_admin_url() is commented out in common.lib.php (lines 177-199).');
    }

    public function test_build_admin_url_with_action(): void
    {
        $this->markTestSkipped('build_admin_url() is commented out in common.lib.php (lines 177-199).');
    }

    public function test_build_admin_url_contains_base(): void
    {
        $this->markTestSkipped('build_admin_url() is commented out in common.lib.php (lines 177-199).');
    }

    // ── build_action_link() ──────────────────────────────────

    public function test_build_action_link_returns_anchor_tag(): void
    {
        $result = build_action_link("fa-edit", $this->base, "admin", "entries", "edit", "default", "42", "brewing", "Edit Entry");
        $this->assertStringContainsString('<a ', $result);
        $this->assertStringContainsString('</a>', $result);
    }

    public function test_build_action_link_contains_icon(): void
    {
        $result = build_action_link("fa-edit", $this->base, "admin", "entries", "edit", "default", "42", "brewing", "Edit");
        $this->assertStringContainsString('fa-edit', $result);
    }

    public function test_build_action_link_contains_href_with_section(): void
    {
        $result = build_action_link("fa-trash", $this->base, "admin", "entries", "delete", "default", "5", "brewing", "Delete");
        $this->assertStringContainsString("section=admin", $result);
        $this->assertStringContainsString("id=5", $result);
    }

    // ── build_form_action() ──────────────────────────────────

    public function test_build_form_action_returns_form_element(): void
    {
        $result = build_form_action($this->base, "admin", "entries", "edit", "default", "42", "brewing", false);
        $this->assertStringContainsString('<form', $result);
    }

    public function test_build_form_action_includes_section_in_action(): void
    {
        $result = build_form_action($this->base, "brew", "default", "add", "default", "default", "brewing", false);
        $this->assertStringContainsString("section=brew", $result);
    }

    // ── prep_redirect_link() ─────────────────────────────────
    // Strips quotes; calls sterilize() and stripslashes().

    public function test_prep_redirect_link_strips_single_quotes(): void
    {
        $link   = "https://example.com/index.php?section=brew'";
        $result = prep_redirect_link($link);
        $this->assertStringNotContainsString("'", $result);
    }

    public function test_prep_redirect_link_strips_double_quotes(): void
    {
        $link   = 'https://example.com/index.php?section="admin"';
        $result = prep_redirect_link($link);
        $this->assertStringNotContainsString('"', $result);
    }

    public function test_prep_redirect_link_preserves_clean_url(): void
    {
        $link   = "https://example.com/index.php?section=default";
        $result = prep_redirect_link($link);
        $this->assertStringContainsString("section=default", $result);
    }

    // ── str_osplit() ─────────────────────────────────────────

    public function test_str_osplit_basic(): void
    {
        // str_osplit splits at the given byte offset
        $result = str_osplit("HelloWorld", 5);
        $this->assertIsArray($result);
        $this->assertSame("Hello", $result[0]);
        $this->assertSame("World", $result[1]);
    }

    public function test_str_osplit_offset_at_start(): void
    {
        $result = str_osplit("Hello", 0);
        $this->assertSame("", $result[0]);
        $this->assertSame("Hello", $result[1]);
    }
}

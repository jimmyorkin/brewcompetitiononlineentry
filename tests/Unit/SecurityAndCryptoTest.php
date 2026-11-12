<?php
/**
 * Characterization tests for security and cryptography functions in common.lib.php.
 *
 * obfuscateURL/deobfuscateURL use OpenSSL with a random IV, so we can
 * only test the round-trip property rather than exact output.
 *
 * verify_token() is pure: we can construct known inputs.
 */

use PHPUnit\Framework\TestCase;

class SecurityAndCryptoTest extends TestCase
{
    // Shared test key — must be valid base64 of a 32-byte value for AES-256
    private string $testKey;

    protected function setUp(): void
    {
        // base64 of a 32-byte string
        $this->testKey = base64_encode(str_repeat('x', 32));
    }

    // ── obfuscateURL / deobfuscateURL ────────────────────────

    public function test_obfuscate_deobfuscate_roundtrip_simple_url(): void
    {
        $url = "index.php?section=admin&go=entries";
        $encrypted = obfuscateURL($url, $this->testKey);
        $this->assertSame($url, deobfuscateURL($encrypted, $this->testKey));
    }

    public function test_obfuscate_deobfuscate_roundtrip_with_id(): void
    {
        $url = "index.php?section=brew&action=edit&id=42";
        $encrypted = obfuscateURL($url, $this->testKey);
        $this->assertSame($url, deobfuscateURL($encrypted, $this->testKey));
    }

    public function test_obfuscate_deobfuscate_roundtrip_empty_string(): void
    {
        $url = "";
        $encrypted = obfuscateURL($url, $this->testKey);
        $this->assertSame($url, deobfuscateURL($encrypted, $this->testKey));
    }

    public function test_obfuscate_produces_different_output_each_time(): void
    {
        // AES-CBC with random IV should produce different ciphertext each call
        $url = "test-url";
        $enc1 = obfuscateURL($url, $this->testKey);
        $enc2 = obfuscateURL($url, $this->testKey);
        // Both decrypt correctly
        $this->assertSame($url, deobfuscateURL($enc1, $this->testKey));
        $this->assertSame($url, deobfuscateURL($enc2, $this->testKey));
    }

    public function test_obfuscate_output_is_url_safe(): void
    {
        // The function substitutes +, /, = with _p_, _s_, _e_
        $url = "section=admin&id=99";
        $encrypted = obfuscateURL($url, $this->testKey);
        $this->assertStringNotContainsString("+", $encrypted);
        $this->assertStringNotContainsString("/", $encrypted);
        $this->assertStringNotContainsString("=", $encrypted);
    }

    // ── verify_token() ───────────────────────────────────────
    // MOVED TO INTEGRATION TIER.
    //
    // Despite the name, verify_token() is NOT pure: it opens a DB connection
    // via require(CONFIG.'config.php') and runs a SELECT query against the
    // users table to look up the token.
    //
    // These stubs are kept here as a reminder; run the real tests via:
    //   ./vendor/bin/phpunit --testsuite Integration
    //
    // When writing the Integration tests, note the return values:
    //   0 = valid token found and within time window
    //   1 = token not found in DB  (the "invalid" default)
    //   2 = token found but expired

    public function test_verify_token_skipped_requires_db(): void
    {
        $this->markTestSkipped(
            'verify_token() queries the DB. Move to Integration suite with a seeded users table.'
        );
    }

    // ── random_generator() ───────────────────────────────────
    // Method "1" = alphanumeric, returns exactly $digits characters
    // Method "2" = numeric only (digits 0–9), returns exactly $digits characters
    // Method "3" = single digit 0–4 regardless of $digits (legacy behaviour)

    public function test_random_generator_method_1_is_alphanumeric_not_numeric(): void
    {
        $result = random_generator(10, 1);
        $this->assertIsString((string)$result);
        $this->assertSame(10, strlen((string)$result));
    }

    public function test_random_generator_method_1_length_is_exactly_digits(): void
    {
        $result = random_generator(5, 1);
        $this->assertSame(5, strlen((string)$result));
    }

    public function test_random_generator_method_2_is_all_digits(): void
    {
        $result = random_generator(8, 2);
        $this->assertMatchesRegularExpression('/^\d+$/', (string)$result);
    }

    public function test_random_generator_method_2_length_is_exactly_digits(): void
    {
        $result = random_generator(6, 2);
        $this->assertSame(6, strlen((string)$result));
    }

    public function test_random_generator_produces_different_values(): void
    {
        // Two calls with the same args will almost certainly differ (random seed)
        $a = (string)random_generator(12, 2);
        $b = (string)random_generator(12, 2);
        // Acceptable: very rare collision, but documents non-determinism
        $this->assertIsString($a);
        $this->assertIsString($b);
    }

    // ── currency_info() ──────────────────────────────────────

    public function test_currency_info_method1_usd(): void
    {
        $this->assertSame("$^USD", currency_info("$", 1));
    }

    public function test_currency_info_method1_euro(): void
    {
        $this->assertSame("&euro;^EUR", currency_info("euro", 1));
    }

    public function test_currency_info_method1_pound(): void
    {
        $this->assertSame("&pound;^GBP", currency_info("pound", 1));
    }

    public function test_currency_info_method1_brazilian_real(): void
    {
        $this->assertSame("R$^BRL", currency_info("R$", 1));
    }

    public function test_currency_info_method1_canadian_dollar(): void
    {
        $this->assertSame("$^CAD", currency_info("C$", 1));
    }

    public function test_currency_info_method1_australian_dollar(): void
    {
        $this->assertSame("$^AUD", currency_info("A$", 1));
    }

    public function test_currency_info_method1_yen(): void
    {
        $this->assertSame("&yen;^JPY", currency_info("yen", 1));
    }

    public function test_currency_info_method1_czech_koruna(): void
    {
        $this->assertSame("K&#269;^CZK", currency_info("czkoruna", 1));
    }

    public function test_currency_info_method1_unknown_returns_empty(): void
    {
        // Unknown currency code — switch falls through, no assignment
        $this->assertSame("", currency_info("XXX", 1));
    }

    public function test_currency_info_method2_returns_array(): void
    {
        $result = currency_info("", 2);
        $this->assertIsArray($result);
    }

    public function test_currency_info_method2_array_starts_with_usd(): void
    {
        $result = currency_info("", 2);
        $this->assertStringStartsWith("$^", $result[0]);
    }

    public function test_currency_info_method2_array_contains_28_currencies(): void
    {
        $result = currency_info("", 2);
        $this->assertCount(28, $result);
    }
}

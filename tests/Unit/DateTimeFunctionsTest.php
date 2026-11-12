<?php
/**
 * Characterization tests for date/time functions in date_time.lib.php,
 * loaded via common.lib.php.
 */

use PHPUnit\Framework\TestCase;

class DateTimeFunctionsTest extends TestCase
{
    // ── get_timezone() ───────────────────────────────────────

    public function test_get_timezone_pacific_standard(): void
    {
        $this->assertSame("America/Los_Angeles", get_timezone(-8.000));
    }

    public function test_get_timezone_mountain_standard(): void
    {
        $this->assertSame("America/Denver", get_timezone(-7.000));
    }

    public function test_get_timezone_arizona_no_dst(): void
    {
        // Phoenix uses -7.001 to distinguish from Denver (no DST)
        $this->assertSame("America/Phoenix", get_timezone(-7.001));
    }

    public function test_get_timezone_central_standard(): void
    {
        $this->assertSame("America/Chicago", get_timezone(-6.000));
    }

    public function test_get_timezone_eastern_standard(): void
    {
        $this->assertSame("America/New_York", get_timezone(-5.000));
    }

    public function test_get_timezone_utc(): void
    {
        $this->assertSame("Europe/London", get_timezone(0.000));
    }

    public function test_get_timezone_central_european(): void
    {
        $this->assertSame("Europe/Paris", get_timezone(1.000));
    }

    public function test_get_timezone_tokyo(): void
    {
        $this->assertSame("Asia/Tokyo", get_timezone(9.000));
    }

    public function test_get_timezone_hawaii(): void
    {
        $this->assertSame("Pacific/Honolulu", get_timezone(-10.000));
    }

    public function test_get_timezone_newfoundland_half_hour(): void
    {
        $this->assertSame("America/St_Johns", get_timezone(-3.500));
    }

    public function test_get_timezone_invalid_offset_returns_null(): void
    {
        // An offset not in the table has no mapping → null
        $this->assertNull(get_timezone(99.000));
    }

    // ── greaterDate() ─────────────────────────────────────────

    public function test_greaterDate_start_is_later_returns_true(): void
    {
        $this->assertTrue(greaterDate("2025-12-31", "2025-01-01"));
    }

    public function test_greaterDate_start_is_earlier_returns_false(): void
    {
        $this->assertFalse(greaterDate("2025-01-01", "2025-12-31"));
    }

    public function test_greaterDate_same_date_returns_false(): void
    {
        $this->assertFalse(greaterDate("2025-06-15", "2025-06-15"));
    }

    // ── getTimeZoneDateTime() ────────────────────────────────
    // We use a fixed Unix timestamp (2025-01-15 12:00:00 UTC = 1736942400)
    // and known timezone offset to get deterministic output.

    private int $ts = 1736942400; // 2025-01-15 12:00:00 UTC (Wednesday)

    public function test_getTimeZoneDateTime_short_format_us(): void
    {
        // UTC offset 0 → Europe/London, date_format=1 → m/d/Y
        $result = getTimeZoneDateTime(0.000, $this->ts, 1, 0, "short", "date-no-gmt");
        $this->assertSame("01/15/2025", $result);
    }

    public function test_getTimeZoneDateTime_short_format_eu(): void
    {
        // date_format=2 → d/m/Y
        $result = getTimeZoneDateTime(0.000, $this->ts, 2, 0, "short", "date-no-gmt");
        $this->assertSame("15/01/2025", $result);
    }

    public function test_getTimeZoneDateTime_system_format(): void
    {
        // "system" → Y-m-d
        $result = getTimeZoneDateTime(0.000, $this->ts, 1, 0, "system", "date-no-gmt");
        $this->assertSame("2025-01-15", $result);
    }

    public function test_getTimeZoneDateTime_year_only(): void
    {
        $result = getTimeZoneDateTime(0.000, $this->ts, 1, 0, "short", "year");
        $this->assertSame("2025", $result);
    }

    public function test_getTimeZoneDateTime_long_format_includes_day_name(): void
    {
        // date_format=1, display_format="long" → "Wednesday, January 15, 2025"
        $result = getTimeZoneDateTime(0.000, $this->ts, 1, 0, "long", "date-no-gmt");
        $this->assertStringContainsString("Wednesday", $result);
        $this->assertStringContainsString("January", $result);
        $this->assertStringContainsString("2025", $result);
    }

    public function test_getTimeZoneDateTime_time_format_24h(): void
    {
        // time_format=1 → H:i (24-hour)
        $result = getTimeZoneDateTime(0.000, $this->ts, 1, 1, "short", "time");
        $this->assertMatchesRegularExpression('/^\d{2}:\d{2}$/', $result);
    }

    public function test_getTimeZoneDateTime_time_format_12h(): void
    {
        // time_format=0 → g:i A
        $result = getTimeZoneDateTime(0.000, $this->ts, 1, 0, "short", "time");
        $this->assertMatchesRegularExpression('/^\d{1,2}:\d{2} (AM|PM)$/', $result);
    }

    // ── convert_timestamp() ──────────────────────────────────

    public function test_convert_timestamp_method2_adds_offset(): void
    {
        // Method 2: adds offset hours to a UTC timestamp
        $utc_ts = 1736942400; // 2025-01-15 12:00 UTC
        $result  = convert_timestamp($utc_ts, -8.000, -8, 2);
        // Should be UTC minus 8 hours = 1736942400 - 28800 = 1736913600
        $this->assertSame(1736942400 + (-8 * 3600), $result);
    }
}

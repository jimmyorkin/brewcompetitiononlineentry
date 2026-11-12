<?php
/**
 * Characterization tests for unit conversion functions in common.lib.php.
 *
 * These tests capture CURRENT behavior, not necessarily correct behavior.
 * If a test fails after a refactor, the refactor changed observable behavior.
 */

use PHPUnit\Framework\TestCase;

class ConversionFunctionsTest extends TestCase
{
    // ── temp_convert() ──────────────────────────────────────
    // NOTE: The "F" flag comment says "Celsius to F if source is C"
    // but the formula actually converts Fahrenheit → Celsius.
    // The "C" flag uses the same formula. This is existing behavior.

    public function test_temp_convert_F_flag_freezing_point(): void
    {
        $this->assertSame(0.0, temp_convert(32, "F"));
    }

    public function test_temp_convert_F_flag_boiling_point(): void
    {
        $this->assertSame(100.0, temp_convert(212, "F"));
    }

    public function test_temp_convert_F_flag_zero_fahrenheit(): void
    {
        $this->assertSame(-17.8, temp_convert(0, "F"));
    }

    public function test_temp_convert_F_flag_negative_40_crossover(): void
    {
        $this->assertSame(-40.0, temp_convert(-40, "F"));
    }

    public function test_temp_convert_C_flag_freezing_point(): void
    {
        $this->assertSame(0.0, temp_convert(32, "C"));
    }

    public function test_temp_convert_C_flag_boiling_point(): void
    {
        $this->assertSame(100.0, temp_convert(212, "C"));
    }

    public function test_temp_convert_C_flag_body_temperature(): void
    {
        // 98.6°F → should be ~37°C
        $result = temp_convert(98.6, "C");
        $this->assertSame(37.0, $result);
    }

    // ── weight_convert() ────────────────────────────────────

    public function test_weight_convert_kg_to_pounds(): void
    {
        $this->assertSame(2.2, weight_convert(1, "pounds"));
    }

    public function test_weight_convert_10kg_to_pounds(): void
    {
        $this->assertSame(22.05, weight_convert(10, "pounds"));
    }

    public function test_weight_convert_grams_to_ounces(): void
    {
        $this->assertSame(0.04, weight_convert(1, "ounces"));
    }

    public function test_weight_convert_100g_to_ounces(): void
    {
        $this->assertSame(3.53, weight_convert(100, "ounces"));
    }

    public function test_weight_convert_ounces_to_grams(): void
    {
        $this->assertSame(28.35, weight_convert(1, "grams"));
    }

    public function test_weight_convert_pounds_to_kilograms(): void
    {
        $this->assertSame(0.45, weight_convert(1, "kilograms"));
    }

    public function test_weight_convert_zero(): void
    {
        $this->assertSame(0.0, weight_convert(0, "pounds"));
    }

    // ── volume_convert() ────────────────────────────────────

    public function test_volume_convert_liters_to_gallons(): void
    {
        $this->assertSame(0.26, volume_convert(1, "gallons"));
    }

    public function test_volume_convert_5_liters_to_gallons(): void
    {
        $this->assertSame(1.32, volume_convert(5, "gallons"));
    }

    public function test_volume_convert_ml_to_ounces(): void
    {
        $this->assertSame(29.57, volume_convert(1, "ounces"));
    }

    public function test_volume_convert_gallons_to_liters(): void
    {
        $this->assertSame(3.79, volume_convert(1, "liters"));
    }

    public function test_volume_convert_5_gallons_to_liters(): void
    {
        // Standard homebrew batch
        $this->assertSame(18.93, volume_convert(5, "liters"));
    }

    public function test_volume_convert_fl_oz_to_milliliters(): void
    {
        $this->assertSame(29.57, volume_convert(1, "milliliters"));
    }

    public function test_volume_convert_invalid_unit_returns_null(): void
    {
        $this->assertNull(volume_convert(1, "invalid"));
    }
}

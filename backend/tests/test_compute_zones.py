"""
Unit tests for backend/services/tools/compute_zones.py

Tests cover the pure zone math in compute_zones_math() without needing
LangChain or Ollama — these should always be fast and deterministic.
"""
import pytest
from services.tools.compute_zones import compute_zones_math, _parse_pace_to_seconds, _seconds_to_pace


# ---------------------------------------------------------------------------
# Pace parsing helpers
# ---------------------------------------------------------------------------

class TestPaceParsing:
    def test_parse_five_minutes(self):
        assert _parse_pace_to_seconds("5:00") == 300

    def test_parse_four_thirty(self):
        assert _parse_pace_to_seconds("4:30") == 270

    def test_parse_six_zero_zero(self):
        assert _parse_pace_to_seconds("6:00") == 360

    def test_seconds_to_pace_300(self):
        assert _seconds_to_pace(300) == "5:00"

    def test_seconds_to_pace_330(self):
        assert _seconds_to_pace(330) == "5:30"

    def test_seconds_to_pace_single_digit_sec(self):
        assert _seconds_to_pace(301) == "5:01"

    def test_invalid_pace_raises(self):
        with pytest.raises((ValueError, Exception)):
            _parse_pace_to_seconds("5:00:00")  # too many parts


# ---------------------------------------------------------------------------
# HR zone tests (anchored at LTHR)
# ---------------------------------------------------------------------------

class TestHRZones:
    def setup_method(self):
        self.result = compute_zones_math(ftp=250, lthr=160, css="5:00")
        self.hr = self.result["hr_zones"]

    def test_z1_max_is_84_percent_lthr(self):
        assert self.hr["Z1"]["max"] == round(160 * 0.84)

    def test_z2_min_is_85_percent_lthr(self):
        assert self.hr["Z2"]["min"] == round(160 * 0.85)

    def test_z2_max_is_89_percent_lthr(self):
        assert self.hr["Z2"]["max"] == round(160 * 0.89)

    def test_z3_bounds(self):
        assert self.hr["Z3"]["min"] == round(160 * 0.90)
        assert self.hr["Z3"]["max"] == round(160 * 0.94)

    def test_z4_bounds(self):
        assert self.hr["Z4"]["min"] == round(160 * 0.95)
        assert self.hr["Z4"]["max"] == round(160 * 0.99)

    def test_z5_min_is_lthr(self):
        assert self.hr["Z5"]["min"] == round(160 * 1.00)

    def test_z5_max_is_none(self):
        assert self.hr["Z5"]["max"] is None

    def test_z1_min_is_none(self):
        assert self.hr["Z1"]["min"] is None

    def test_all_zones_present(self):
        assert set(self.hr.keys()) == {"Z1", "Z2", "Z3", "Z4", "Z5"}

    def test_zones_are_contiguous(self):
        """Z2 min should be one above Z1 max (rounding may differ by 1)."""
        assert abs(self.hr["Z2"]["min"] - self.hr["Z1"]["max"]) <= 2

    def test_labels_correct(self):
        assert self.hr["Z1"]["label"] == "Recovery"
        assert self.hr["Z2"]["label"] == "Aerobic"
        assert self.hr["Z3"]["label"] == "Tempo"
        assert self.hr["Z4"]["label"] == "Threshold"
        assert self.hr["Z5"]["label"] == "VO2max"

    def test_zero_lthr_uses_default(self):
        result = compute_zones_math(ftp=200, lthr=0, css="5:00")
        # default LTHR = 155
        assert result["hr_zones"]["Z5"]["min"] == round(155 * 1.00)


# ---------------------------------------------------------------------------
# Power zone tests (anchored at FTP)
# ---------------------------------------------------------------------------

class TestPowerZones:
    def setup_method(self):
        self.result = compute_zones_math(ftp=300, lthr=155, css="5:00")
        self.pw = self.result["power_zones"]

    def test_z1_max_is_55_percent_ftp(self):
        assert self.pw["Z1"]["max"] == round(300 * 0.55)

    def test_z2_min_is_56_percent_ftp(self):
        assert self.pw["Z2"]["min"] == round(300 * 0.56)

    def test_z2_max_is_75_percent_ftp(self):
        assert self.pw["Z2"]["max"] == round(300 * 0.75)

    def test_z3_bounds(self):
        assert self.pw["Z3"]["min"] == round(300 * 0.76)
        assert self.pw["Z3"]["max"] == round(300 * 0.90)

    def test_z4_bounds(self):
        assert self.pw["Z4"]["min"] == round(300 * 0.91)
        assert self.pw["Z4"]["max"] == round(300 * 1.05)

    def test_z5_min_is_106_percent_ftp(self):
        assert self.pw["Z5"]["min"] == round(300 * 1.06)

    def test_z5_max_is_none(self):
        assert self.pw["Z5"]["max"] is None

    def test_z1_min_is_none(self):
        assert self.pw["Z1"]["min"] is None

    def test_all_zones_present(self):
        assert set(self.pw.keys()) == {"Z1", "Z2", "Z3", "Z4", "Z5"}

    def test_labels_correct(self):
        assert self.pw["Z1"]["label"] == "Recovery"
        assert self.pw["Z2"]["label"] == "Endurance"
        assert self.pw["Z3"]["label"] == "Tempo"
        assert self.pw["Z4"]["label"] == "Threshold"
        assert self.pw["Z5"]["label"] == "VO2max+"

    def test_zero_ftp_uses_default(self):
        result = compute_zones_math(ftp=0, lthr=155, css="5:00")
        # default FTP = 200
        assert result["power_zones"]["Z4"]["min"] == round(200 * 0.91)


# ---------------------------------------------------------------------------
# Pace zone tests (anchored at CSS)
# ---------------------------------------------------------------------------

class TestPaceZones:
    def setup_method(self):
        # CSS = 5:00/km = 300 sec
        self.result = compute_zones_math(ftp=200, lthr=155, css="5:00")
        self.pace = self.result["pace_zones"]

    def test_all_zones_present(self):
        assert set(self.pace.keys()) == {"Z1", "Z2", "Z3", "Z4", "Z5"}

    def test_z4_max_pace_is_css(self):
        """Threshold zone max pace should be the CSS pace itself."""
        assert self.pace["Z4"]["max_pace"] == "5:00"

    def test_z1_min_pace_is_none(self):
        assert self.pace["Z1"]["min_pace"] is None

    def test_z5_max_pace_is_none(self):
        assert self.pace["Z5"]["max_pace"] is None

    def test_z1_is_slowest_zone(self):
        """Z1 min_pace seconds should be greater than Z2 min_pace seconds."""
        z1_sec = _parse_pace_to_seconds(self.pace["Z1"]["max_pace"])
        z2_sec = _parse_pace_to_seconds(self.pace["Z2"]["max_pace"])
        # Z1 boundary should be at 1.25x CSS; Z2 boundary at 1.10x CSS
        assert z1_sec >= z2_sec

    def test_labels_correct(self):
        assert self.pace["Z1"]["label"] == "Recovery"
        assert self.pace["Z2"]["label"] == "Aerobic"
        assert self.pace["Z3"]["label"] == "Tempo"
        assert self.pace["Z4"]["label"] == "Threshold"
        assert self.pace["Z5"]["label"] == "VO2max"

    def test_empty_css_uses_default(self):
        result = compute_zones_math(ftp=200, lthr=155, css="")
        # default CSS = 5:00
        assert result["pace_zones"]["Z4"]["max_pace"] == "5:00"


# ---------------------------------------------------------------------------
# Full output structure
# ---------------------------------------------------------------------------

class TestComputeZonesMath:
    def test_returns_all_top_level_keys(self):
        result = compute_zones_math(ftp=250, lthr=165, css="4:45")
        assert "power_zones" in result
        assert "hr_zones" in result
        assert "pace_zones" in result
        assert "inputs" in result

    def test_inputs_echoed_back(self):
        result = compute_zones_math(ftp=250, lthr=165, css="4:45")
        assert result["inputs"]["ftp"] == 250
        assert result["inputs"]["lthr"] == 165
        assert result["inputs"]["css"] == "4:45"

    def test_realistic_competitive_athlete(self):
        """Competitive athlete: 350w FTP, 170bpm LTHR, 4:15/km."""
        result = compute_zones_math(ftp=350, lthr=170, css="4:15")
        pw = result["power_zones"]
        hr = result["hr_zones"]
        # Sanity: Z4 power should be around 318-367w for FTP=350
        assert pw["Z4"]["min"] == round(350 * 0.91)
        assert pw["Z4"]["max"] == round(350 * 1.05)
        # Sanity: Z4 HR should be around 161-168bpm for LTHR=170
        assert hr["Z4"]["min"] == round(170 * 0.95)

    def test_first_timer_defaults(self):
        """First-timer with unknown benchmarks gets sensible defaults."""
        result = compute_zones_math(ftp=0, lthr=0, css="")
        assert result["inputs"]["ftp"] == 200
        assert result["inputs"]["lthr"] == 155
        assert result["inputs"]["css"] == "5:00"

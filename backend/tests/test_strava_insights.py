"""Tests for the /strava/insights endpoint and get_insights service function."""
import pytest
from unittest.mock import patch, MagicMock


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_activity(
    sport_type: str,
    date: str,
    distance_m: float,
    moving_time_s: int,
    avg_hr: float | None = None,
) -> dict:
    return {
        "name": f"Test {sport_type}",
        "type": sport_type,
        "sport_type": sport_type,
        "start_date_local": f"{date}T08:00:00Z",
        "distance": distance_m,
        "moving_time": moving_time_s,
        "elapsed_time": moving_time_s + 60,
        "total_elevation_gain": 10.0,
        "average_heartrate": avg_hr,
        "max_heartrate": None,
        "average_watts": None,
        "kilojoules": None,
    }


# Three distinct ISO weeks across the activities list
FAKE_ACTIVITIES = [
    # Week 2024-W03 (Jan 15–21)
    _make_activity("Run", "2024-01-15", 8046.72, 2700),   # ~5mi, 45 min
    _make_activity("Ride", "2024-01-17", 32186.88, 3600), # ~20mi, 60 min
    # Week 2024-W04 (Jan 22–28)
    _make_activity("Swim", "2024-01-22", 2000.0, 1800),   # ~1.24mi, 30 min
    _make_activity("Run", "2024-01-24", 16093.4, 5400),   # ~10mi, 90 min
    # Week 2024-W05 (Jan 29 – Feb 4)
    _make_activity("VirtualRide", "2024-01-29", 48280.0, 7200),  # ~30mi, 120 min
]


# ---------------------------------------------------------------------------
# Tests for get_insights service
# ---------------------------------------------------------------------------

async def test_get_insights_returns_three_weeks():
    """Should produce one WeeklyVolume entry per ISO week that has activities."""
    with patch("services.strava.get_tokens", return_value={"access_token": "tok", "expires_at": 9999999999, "refresh_token": "ref"}), \
         patch("services.strava.get_athlete_activities", return_value=FAKE_ACTIVITIES):
        from services.strava import get_insights
        result = await get_insights("user-abc")

    assert result["connected"] is True
    assert len(result["weekly_volumes"]) == 3


async def test_get_insights_total_activities_count():
    """total_activities should equal the number of accepted (mapped) activities."""
    with patch("services.strava.get_tokens", return_value={"access_token": "tok", "expires_at": 9999999999, "refresh_token": "ref"}), \
         patch("services.strava.get_athlete_activities", return_value=FAKE_ACTIVITIES):
        from services.strava import get_insights
        result = await get_insights("user-abc")

    # All 5 activities have mapped sport types
    assert result["total_activities"] == 5


async def test_get_insights_week_volumes_are_correct():
    """Weekly hours and miles should be aggregated correctly per discipline."""
    with patch("services.strava.get_tokens", return_value={"access_token": "tok", "expires_at": 9999999999, "refresh_token": "ref"}), \
         patch("services.strava.get_athlete_activities", return_value=FAKE_ACTIVITIES):
        from services.strava import get_insights
        result = await get_insights("user-abc")

    # Week W03: Run 45min + Ride 60min = 1.75h total
    w03 = next(v for v in result["weekly_volumes"] if "Jan 15" in v["week_label"])
    assert abs(w03["run_hours"] - 0.75) < 0.01
    assert abs(w03["bike_hours"] - 1.0) < 0.01
    assert abs(w03["total_hours"] - 1.75) < 0.01

    # Week W04: Swim 30min + Run 90min = 2h total
    w04 = next(v for v in result["weekly_volumes"] if "Jan 22" in v["week_label"])
    assert abs(w04["swim_hours"] - 0.5) < 0.01
    assert abs(w04["run_hours"] - 1.5) < 0.01
    assert abs(w04["total_hours"] - 2.0) < 0.01


async def test_get_insights_sport_breakdown_sums_to_100():
    """Sport breakdown percentages should sum to ~100%."""
    with patch("services.strava.get_tokens", return_value={"access_token": "tok", "expires_at": 9999999999, "refresh_token": "ref"}), \
         patch("services.strava.get_athlete_activities", return_value=FAKE_ACTIVITIES):
        from services.strava import get_insights
        result = await get_insights("user-abc")

    bd = result["sport_breakdown"]
    total = bd["swim_pct"] + bd["bike_pct"] + bd["run_pct"]
    assert abs(total - 100.0) < 1.0  # allow rounding tolerance


async def test_get_insights_sport_breakdown_values():
    """Breakdown percentages should match time proportions across all activities."""
    with patch("services.strava.get_tokens", return_value={"access_token": "tok", "expires_at": 9999999999, "refresh_token": "ref"}), \
         patch("services.strava.get_athlete_activities", return_value=FAKE_ACTIVITIES):
        from services.strava import get_insights
        result = await get_insights("user-abc")

    # Total seconds: swim=1800, bike=3600+7200=10800, run=2700+5400=8100 → total=20700
    # swim_pct ≈ 8.7%, bike_pct ≈ 52.2%, run_pct ≈ 39.1%
    bd = result["sport_breakdown"]
    assert abs(bd["swim_pct"] - 8.7) < 0.5
    assert abs(bd["bike_pct"] - 52.2) < 0.5
    assert abs(bd["run_pct"] - 39.1) < 0.5


async def test_get_insights_unknown_sport_ignored():
    """Activities with unmapped sport types should be silently skipped."""
    activities_with_unknown = FAKE_ACTIVITIES + [
        _make_activity("Hike", "2024-01-15", 5000.0, 3600),
        _make_activity("WeightTraining", "2024-01-16", 0.0, 2700),
    ]
    with patch("services.strava.get_tokens", return_value={"access_token": "tok", "expires_at": 9999999999, "refresh_token": "ref"}), \
         patch("services.strava.get_athlete_activities", return_value=activities_with_unknown):
        from services.strava import get_insights
        result = await get_insights("user-abc")

    # Only the 5 known-sport activities count
    assert result["total_activities"] == 5


async def test_get_insights_not_connected():
    """When tokens are absent, connected=False and empty data."""
    with patch("services.strava.get_tokens", return_value=None):
        from services.strava import get_insights
        result = await get_insights("user-no-strava")

    assert result["connected"] is False
    assert result["weekly_volumes"] == []
    assert result["total_activities"] == 0
    bd = result["sport_breakdown"]
    assert bd["swim_pct"] == 0.0
    assert bd["bike_pct"] == 0.0
    assert bd["run_pct"] == 0.0


async def test_get_insights_no_activities():
    """Connected account with no activities returns connected=True, empty weekly_volumes."""
    with patch("services.strava.get_tokens", return_value={"access_token": "tok", "expires_at": 9999999999, "refresh_token": "ref"}), \
         patch("services.strava.get_athlete_activities", return_value=[]):
        from services.strava import get_insights
        result = await get_insights("user-new")

    assert result["connected"] is True
    assert result["weekly_volumes"] == []
    assert result["total_activities"] == 0


async def test_get_insights_max_8_weeks():
    """Should return at most 8 weeks even if more are present."""
    # Create activities spanning 10 different weeks
    many_activities = []
    for week_offset in range(10):
        # Monday of each week starting from 2023-11-06
        date = f"2023-{11 if week_offset < 4 else 12}-{6 + week_offset * 7:02d}"
        # Simplistic: just use fixed dates across 10 weeks
        pass

    # Use a more reliable approach: hardcode 10 weeks of dates
    dates_by_week = [
        "2023-10-02",  # W40
        "2023-10-09",  # W41
        "2023-10-16",  # W42
        "2023-10-23",  # W43
        "2023-10-30",  # W44
        "2023-11-06",  # W45
        "2023-11-13",  # W46
        "2023-11-20",  # W47
        "2023-11-27",  # W48
        "2023-12-04",  # W49
    ]
    ten_week_activities = [
        _make_activity("Run", d, 5000.0, 1800) for d in dates_by_week
    ]

    with patch("services.strava.get_tokens", return_value={"access_token": "tok", "expires_at": 9999999999, "refresh_token": "ref"}), \
         patch("services.strava.get_athlete_activities", return_value=ten_week_activities):
        from services.strava import get_insights
        result = await get_insights("user-abc")

    assert len(result["weekly_volumes"]) <= 8

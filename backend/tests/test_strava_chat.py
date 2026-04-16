"""Tests for Strava chat tool integration."""
import pytest
from unittest.mock import AsyncMock, patch


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

MOCK_ACTIVITIES = [
    {
        "name": "Morning Run",
        "type": "Run",
        "sport_type": "Run",
        "start_date_local": "2024-01-15T07:30:00Z",
        "distance": 8046.72,       # ~5 miles
        "moving_time": 2700,       # 45 min
        "elapsed_time": 2800,
        "total_elevation_gain": 45.2,
        "average_heartrate": 148.0,
        "max_heartrate": 165.0,
        "average_watts": None,
        "kilojoules": None,
    },
    {
        "name": "Afternoon Ride",
        "type": "Ride",
        "sport_type": "Ride",
        "start_date_local": "2024-01-14T14:00:00Z",
        "distance": 32186.88,      # ~20 miles
        "moving_time": 3600,       # 60 min
        "elapsed_time": 3700,
        "total_elevation_gain": 200.0,
        "average_heartrate": None,
        "max_heartrate": None,
        "average_watts": 180.0,
        "kilojoules": 648.0,
    },
]


# ---------------------------------------------------------------------------
# get_strava_activities tests
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_get_strava_activities_formats_output():
    """get_strava_activities should return a readable multi-line string."""
    with patch(
        "services.chat_tools.get_athlete_activities",
        new=AsyncMock(return_value=MOCK_ACTIVITIES),
    ):
        from services.chat_tools import get_strava_activities
        result = await get_strava_activities("user-123")

    assert "Recent Strava activities (2)" in result
    # Run line
    assert "2024-01-15" in result
    assert "Run" in result
    assert "Morning Run" in result
    assert "148bpm" in result   # avg HR present
    # Ride line
    assert "2024-01-14" in result
    assert "Ride" in result
    assert "Afternoon Ride" in result


@pytest.mark.asyncio
async def test_get_strava_activities_distance_conversion():
    """Distance should be converted from meters to miles."""
    with patch(
        "services.chat_tools.get_athlete_activities",
        new=AsyncMock(return_value=[MOCK_ACTIVITIES[0]]),
    ):
        from services.chat_tools import get_strava_activities
        result = await get_strava_activities("user-123")

    # 8046.72 m / 1609.34 ≈ 5.0 mi
    assert "5.0mi" in result


@pytest.mark.asyncio
async def test_get_strava_activities_duration_in_minutes():
    """Moving time should be displayed in whole minutes."""
    with patch(
        "services.chat_tools.get_athlete_activities",
        new=AsyncMock(return_value=[MOCK_ACTIVITIES[0]]),
    ):
        from services.chat_tools import get_strava_activities
        result = await get_strava_activities("user-123")

    # 2700 seconds = 45 min
    assert "45min" in result


@pytest.mark.asyncio
async def test_get_strava_activities_no_hr_when_missing():
    """Activities without average_heartrate should omit the HR segment."""
    with patch(
        "services.chat_tools.get_athlete_activities",
        new=AsyncMock(return_value=[MOCK_ACTIVITIES[1]]),
    ):
        from services.chat_tools import get_strava_activities
        result = await get_strava_activities("user-123")

    assert "bpm" not in result


@pytest.mark.asyncio
async def test_get_strava_activities_empty():
    """Empty activity list should return a helpful message."""
    with patch(
        "services.chat_tools.get_athlete_activities",
        new=AsyncMock(return_value=[]),
    ):
        from services.chat_tools import get_strava_activities
        result = await get_strava_activities("user-123")

    assert "No Strava activities found" in result


# ---------------------------------------------------------------------------
# _detect_tools tests
# ---------------------------------------------------------------------------

def test_detect_tools_strava_keyword_recent():
    from routers.chat import _detect_tools
    detected = _detect_tools("What are my recent workouts?")
    assert "get_strava_activities" in detected


def test_detect_tools_strava_keyword_strava():
    from routers.chat import _detect_tools
    detected = _detect_tools("Show me my strava data")
    assert "get_strava_activities" in detected


def test_detect_tools_strava_keyword_last_run():
    from routers.chat import _detect_tools
    detected = _detect_tools("How did my last run go?")
    assert "get_strava_activities" in detected


def test_detect_tools_strava_keyword_last_ride():
    from routers.chat import _detect_tools
    detected = _detect_tools("Tell me about my last ride")
    assert "get_strava_activities" in detected


def test_detect_tools_strava_keyword_history():
    from routers.chat import _detect_tools
    detected = _detect_tools("Show me my training history")
    assert "get_strava_activities" in detected


def test_detect_tools_strava_keyword_activities():
    from routers.chat import _detect_tools
    detected = _detect_tools("What activities have I done this month?")
    assert "get_strava_activities" in detected


def test_detect_tools_no_strava_for_unrelated_message():
    from routers.chat import _detect_tools
    detected = _detect_tools("What is Zone 2 training?")
    assert "get_strava_activities" not in detected


def test_detect_tools_strava_in_tools_dict():
    """Ensure get_strava_activities is registered in TOOLS."""
    from services.chat_tools import TOOLS
    assert "get_strava_activities" in TOOLS

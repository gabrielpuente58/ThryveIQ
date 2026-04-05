"""
Unit tests for the Workout Builder agent (Agent 2).

All tests are fully mocked — no LLM calls, no network access.
Tests validate:
  - Pydantic model validation
  - _parse_week structural enforcement logic
  - score_intensity_distribution math
  - run_workout_builder public entry point (mocked graph)
"""
import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from models.workout_builder import (
    SessionWithDescription,
    WeekWithDescriptions,
    WorkoutBuilderRequest,
)
from services.tools.score_intensity_distribution import score_intensity_distribution_math


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

SKELETON_SESSION = {
    "id": "w1_d1_swim",
    "week": 1,
    "day": "Monday",
    "sport": "swim",
    "duration_minutes": 40,
    "zone": 2,
    "zone_label": "Aerobic",
}

WEEK_SKELETON = {
    "week_index": 1,
    "sessions": [
        SKELETON_SESSION,
        {
            "id": "w1_d2_bike",
            "week": 1,
            "day": "Wednesday",
            "sport": "bike",
            "duration_minutes": 60,
            "zone": 2,
            "zone_label": "Aerobic",
        },
        {
            "id": "w1_d3_run",
            "week": 1,
            "day": "Friday",
            "sport": "run",
            "duration_minutes": 45,
            "zone": 3,
            "zone_label": "Tempo",
        },
    ],
}

ATHLETE_PROFILE = {
    "goal": "first_timer",
    "experience": "first_timer",
    "strongest_discipline": "bike",
    "weakest_discipline": "swim",
}

ZONES = {
    "hr_zones": {
        "Z2": {"label": "Aerobic", "min": 132, "max": 138},
        "Z3": {"label": "Tempo", "min": 139, "max": 146},
    },
    "power_zones": {},
    "pace_zones": {},
}


# ---------------------------------------------------------------------------
# TestSessionWithDescription
# ---------------------------------------------------------------------------

class TestSessionWithDescription:
    def test_valid_session(self):
        session = SessionWithDescription(
            id="w1_d1_swim",
            week=1,
            day="Monday",
            sport="swim",
            duration_minutes=40,
            zone=2,
            zone_label="Aerobic",
            description="Easy swim at Zone 2. Focus on bilateral breathing.",
        )
        assert session.sport == "swim"
        assert session.zone == 2
        assert session.description != ""

    def test_zone_too_low_raises(self):
        with pytest.raises(Exception):
            SessionWithDescription(
                id="w1_d1_swim",
                week=1,
                day="Monday",
                sport="swim",
                duration_minutes=40,
                zone=0,  # invalid — must be 1-5
                zone_label="Recovery",
                description="Some description.",
            )

    def test_zone_too_high_raises(self):
        with pytest.raises(Exception):
            SessionWithDescription(
                id="w1_d1_swim",
                week=1,
                day="Monday",
                sport="swim",
                duration_minutes=40,
                zone=6,  # invalid — must be 1-5
                zone_label="VO2max",
                description="Some description.",
            )

    def test_empty_description_is_allowed(self):
        """Pydantic allows empty strings — _parse_week is what fills defaults."""
        session = SessionWithDescription(
            id="w1_d1_swim",
            week=1,
            day="Monday",
            sport="swim",
            duration_minutes=40,
            zone=2,
            zone_label="Aerobic",
            description="",  # allowed at model level
        )
        assert session.description == ""


# ---------------------------------------------------------------------------
# TestWeekWithDescriptions
# ---------------------------------------------------------------------------

class TestWeekWithDescriptions:
    def _make_session(self, session_id: str, sport: str) -> SessionWithDescription:
        return SessionWithDescription(
            id=session_id,
            week=1,
            day="Monday",
            sport=sport,
            duration_minutes=45,
            zone=2,
            zone_label="Aerobic",
            description="Test description for the session.",
        )

    def test_valid_week(self):
        week = WeekWithDescriptions(
            week_index=1,
            phase_name="Base",
            sessions=[self._make_session("w1_d1_swim", "swim")],
        )
        assert week.week_index == 1
        assert week.phase_name == "Base"
        assert len(week.sessions) == 1

    def test_empty_sessions_raises(self):
        with pytest.raises(Exception):
            WeekWithDescriptions(
                week_index=1,
                phase_name="Base",
                sessions=[],  # min_length=1
            )

    def test_multiple_sessions(self):
        week = WeekWithDescriptions(
            week_index=2,
            phase_name="Build",
            sessions=[
                self._make_session("w2_d1_swim", "swim"),
                self._make_session("w2_d2_bike", "bike"),
                self._make_session("w2_d3_run", "run"),
            ],
        )
        assert len(week.sessions) == 3


# ---------------------------------------------------------------------------
# TestParseWeek
# ---------------------------------------------------------------------------

class TestParseWeek:
    def _make_llm_output(
        self,
        week_index: int = 1,
        phase_name: str = "Base",
        sessions: list | None = None,
    ) -> str:
        if sessions is None:
            sessions = [
                {
                    "id": "w1_d1_swim",
                    "week": 1,
                    "day": "Monday",
                    "sport": "swim",
                    "duration_minutes": 40,
                    "zone": 2,
                    "zone_label": "Aerobic",
                    "description": "Easy aerobic swim. Focus on technique and bilateral breathing.",
                }
            ]
        return json.dumps(
            {"week_index": week_index, "phase_name": phase_name, "sessions": sessions}
        )

    def test_parses_valid_json(self):
        from services.agents.workout_builder import _parse_week

        skeleton = {
            "week_index": 1,
            "sessions": [SKELETON_SESSION],
        }
        content = self._make_llm_output()
        result = _parse_week(content, skeleton)

        assert isinstance(result, WeekWithDescriptions)
        assert result.week_index == 1
        assert len(result.sessions) == 1
        assert result.sessions[0].description != ""

    def test_overwrites_changed_structural_fields(self):
        """If the LLM changes day/sport/duration/zone, skeleton wins."""
        from services.agents.workout_builder import _parse_week

        skeleton = {
            "week_index": 1,
            "sessions": [SKELETON_SESSION],
        }

        # LLM tried to change several structural fields
        tampered_sessions = [
            {
                "id": "w1_d1_swim",
                "week": 99,           # changed — skeleton says 1
                "day": "Sunday",      # changed — skeleton says Monday
                "sport": "run",       # changed — skeleton says swim
                "duration_minutes": 120,  # changed — skeleton says 40
                "zone": 5,            # changed — skeleton says 2
                "zone_label": "VO2max",   # changed — skeleton says Aerobic
                "description": "LLM description that should be kept.",
            }
        ]
        content = json.dumps(
            {"week_index": 1, "phase_name": "Base", "sessions": tampered_sessions}
        )
        result = _parse_week(content, skeleton)

        session = result.sessions[0]
        # All structural fields should match the skeleton
        assert session.week == 1
        assert session.day == "Monday"
        assert session.sport == "swim"
        assert session.duration_minutes == 40
        assert session.zone == 2
        assert session.zone_label == "Aerobic"
        # Description from LLM should be preserved
        assert session.description == "LLM description that should be kept."

    def test_fills_missing_description_with_default(self):
        """If LLM returns empty description, a sensible default is generated."""
        from services.agents.workout_builder import _parse_week

        skeleton = {
            "week_index": 1,
            "sessions": [SKELETON_SESSION],
        }

        sessions_no_description = [
            {
                "id": "w1_d1_swim",
                "week": 1,
                "day": "Monday",
                "sport": "swim",
                "duration_minutes": 40,
                "zone": 2,
                "zone_label": "Aerobic",
                "description": "",  # empty
            }
        ]
        content = json.dumps(
            {"week_index": 1, "phase_name": "Base", "sessions": sessions_no_description}
        )
        result = _parse_week(content, skeleton)

        assert result.sessions[0].description != ""
        assert "swim" in result.sessions[0].description.lower() or "zone" in result.sessions[0].description.lower()

    def test_backfills_sessions_llm_missed(self):
        """Sessions in skeleton but not returned by LLM get a default description."""
        from services.agents.workout_builder import _parse_week

        # LLM only returned the swim session; bike and run are missing
        content = json.dumps(
            {
                "week_index": 1,
                "phase_name": "Base",
                "sessions": [
                    {
                        "id": "w1_d1_swim",
                        "week": 1,
                        "day": "Monday",
                        "sport": "swim",
                        "duration_minutes": 40,
                        "zone": 2,
                        "zone_label": "Aerobic",
                        "description": "Good swim session.",
                    }
                ],
            }
        )
        result = _parse_week(content, WEEK_SKELETON)

        # All 3 sessions from skeleton should be present
        assert len(result.sessions) == 3
        session_ids = {s.id for s in result.sessions}
        assert "w1_d1_swim" in session_ids
        assert "w1_d2_bike" in session_ids
        assert "w1_d3_run" in session_ids


# ---------------------------------------------------------------------------
# TestScoreIntensityDistribution
# ---------------------------------------------------------------------------

class TestScoreIntensityDistribution:
    def test_all_zone2_sessions(self):
        sessions = [
            {"duration_minutes": 60, "zone": 2},
            {"duration_minutes": 40, "zone": 2},
        ]
        result = score_intensity_distribution_math(sessions)
        assert result["low_pct"] == 100.0
        assert result["moderate_pct"] == 0.0
        assert result["high_pct"] == 0.0
        assert result["total_minutes"] == 100

    def test_mixed_intensity(self):
        sessions = [
            {"duration_minutes": 80, "zone": 2},  # low
            {"duration_minutes": 20, "zone": 3},  # moderate
        ]
        result = score_intensity_distribution_math(sessions)
        assert result["low_pct"] == 80.0
        assert result["moderate_pct"] == 20.0
        assert result["high_pct"] == 0.0
        assert result["total_minutes"] == 100

    def test_high_intensity_sessions(self):
        sessions = [
            {"duration_minutes": 60, "zone": 2},  # low
            {"duration_minutes": 20, "zone": 3},  # moderate
            {"duration_minutes": 20, "zone": 5},  # high
        ]
        result = score_intensity_distribution_math(sessions)
        assert result["low_pct"] == 60.0
        assert result["moderate_pct"] == 20.0
        assert result["high_pct"] == 20.0
        assert result["total_minutes"] == 100

    def test_empty_sessions_returns_zeros(self):
        result = score_intensity_distribution_math([])
        assert result["low_pct"] == 0.0
        assert result["moderate_pct"] == 0.0
        assert result["high_pct"] == 0.0
        assert result["total_minutes"] == 0

    def test_summary_string_present(self):
        sessions = [{"duration_minutes": 30, "zone": 1}]
        result = score_intensity_distribution_math(sessions)
        assert isinstance(result["summary"], str)
        assert len(result["summary"]) > 0


# ---------------------------------------------------------------------------
# TestWorkoutBuilderAgent
# ---------------------------------------------------------------------------

VALID_WEEK = WeekWithDescriptions(
    week_index=1,
    phase_name="Base",
    sessions=[
        SessionWithDescription(
            id="w1_d1_swim",
            week=1,
            day="Monday",
            sport="swim",
            duration_minutes=40,
            zone=2,
            zone_label="Aerobic",
            description="Easy aerobic swim at Zone 2 effort. Focus on bilateral breathing.",
        ),
        SessionWithDescription(
            id="w1_d2_bike",
            week=1,
            day="Wednesday",
            sport="bike",
            duration_minutes=60,
            zone=2,
            zone_label="Aerobic",
            description="Long endurance ride at Zone 2. Keep cadence above 85 rpm.",
        ),
        SessionWithDescription(
            id="w1_d3_run",
            week=1,
            day="Friday",
            sport="run",
            duration_minutes=45,
            zone=3,
            zone_label="Tempo",
            description="Tempo run at Zone 3 effort. Hold a comfortably hard pace throughout.",
        ),
    ],
)


class TestWorkoutBuilderAgent:
    @pytest.mark.asyncio
    async def test_returns_week_with_descriptions_on_success(self):
        """run_workout_builder returns a WeekWithDescriptions when graph succeeds."""
        mock_state = {"result": VALID_WEEK}

        with patch(
            "services.agents.workout_builder._graph"
        ) as mock_graph:
            mock_graph.ainvoke = AsyncMock(return_value=mock_state)

            from services.agents.workout_builder import run_workout_builder

            result = await run_workout_builder(
                week_skeleton=WEEK_SKELETON,
                phase_name="Base",
                phase_focus="Aerobic durability and technique development",
                zones=ZONES,
                athlete_profile=ATHLETE_PROFILE,
            )

        assert isinstance(result, WeekWithDescriptions)
        assert result.week_index == 1
        assert result.phase_name == "Base"
        assert len(result.sessions) == 3

    @pytest.mark.asyncio
    async def test_raises_value_error_when_result_is_none(self):
        """run_workout_builder raises ValueError if graph returns result=None."""
        mock_state = {"result": None}

        with patch(
            "services.agents.workout_builder._graph"
        ) as mock_graph:
            mock_graph.ainvoke = AsyncMock(return_value=mock_state)

            from services.agents.workout_builder import run_workout_builder

            with pytest.raises(ValueError, match="result is None"):
                await run_workout_builder(
                    week_skeleton=WEEK_SKELETON,
                    phase_name="Base",
                    phase_focus="Aerobic durability",
                    zones=ZONES,
                    athlete_profile=ATHLETE_PROFILE,
                )

    @pytest.mark.asyncio
    async def test_graph_ainvoke_called_with_initial_state(self):
        """Verify graph.ainvoke is called and receives messages with the human prompt."""
        mock_state = {"result": VALID_WEEK}

        with patch(
            "services.agents.workout_builder._graph"
        ) as mock_graph:
            mock_graph.ainvoke = AsyncMock(return_value=mock_state)

            from services.agents.workout_builder import run_workout_builder

            await run_workout_builder(
                week_skeleton=WEEK_SKELETON,
                phase_name="Base",
                phase_focus="Aerobic durability and technique development",
                zones=ZONES,
                athlete_profile=ATHLETE_PROFILE,
            )

        mock_graph.ainvoke.assert_called_once()
        call_args = mock_graph.ainvoke.call_args[0][0]  # first positional arg
        assert "messages" in call_args
        assert len(call_args["messages"]) == 1
        assert call_args["week_skeleton"] == WEEK_SKELETON
        assert call_args["phase_name"] == "Base"

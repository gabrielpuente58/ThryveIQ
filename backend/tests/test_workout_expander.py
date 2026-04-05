"""
Unit tests for the Workout Expander agent (Agent 3).

All tests are fully mocked — no LLM calls, no network access.
Tests validate:
  - Pydantic model validation (WorkoutDetail, ExpandSessionRequest)
  - _parse_workout_detail logic (session_id enforcement, defaults, unknown fields)
  - run_workout_expander public entry point (mocked graph)
"""
import json
from unittest.mock import AsyncMock, patch

import pytest

from models.workout_expander import ExpandSessionRequest, WorkoutDetail


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

SESSION_SKELETON = {
    "id": "w1_d1_swim",
    "week": 1,
    "day": "Monday",
    "sport": "swim",
    "duration_minutes": 40,
    "zone": 2,
    "zone_label": "Aerobic",
    "description": "Easy technique swim. Focus on bilateral breathing.",
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

VALID_WORKOUT_DETAIL = WorkoutDetail(
    session_id="w1_d1_swim",
    warmup="10 min easy Z1 swim, focus on bilateral breathing and a long catch.",
    main_set="4x200m at Z2 effort with 20s rest between each rep. Smooth, relaxed stroke.",
    cooldown="5 min easy Z1 swim, shake out the arms and focus on gliding.",
    zone_ranges={"hr": "132-138bpm"},
    coaching_notes=(
        "As a first timer, prioritise technique over pace. "
        "Keep your hips high and rotate with each stroke."
    ),
)


# ---------------------------------------------------------------------------
# TestWorkoutDetail
# ---------------------------------------------------------------------------

class TestWorkoutDetail:
    def test_valid_model(self):
        detail = WorkoutDetail(
            session_id="w1_d1_swim",
            warmup="10 min easy swim warm-up.",
            main_set="4x200m at Z2 with 20s rest.",
            cooldown="5 min easy cool-down.",
            zone_ranges={"hr": "132-138bpm"},
            coaching_notes="Keep it relaxed and focus on technique.",
        )
        assert detail.session_id == "w1_d1_swim"
        assert detail.warmup != ""
        assert detail.main_set != ""
        assert detail.cooldown != ""
        assert "hr" in detail.zone_ranges
        assert detail.coaching_notes != ""

    def test_missing_session_id_raises(self):
        with pytest.raises(Exception):
            WorkoutDetail(
                # session_id is required — omitting it should raise
                warmup="Easy warm-up.",
                main_set="Main set.",
                cooldown="Cool-down.",
                zone_ranges={"hr": "130-140bpm"},
                coaching_notes="Good session.",
            )

    def test_missing_warmup_raises(self):
        with pytest.raises(Exception):
            WorkoutDetail(
                session_id="w1_d1_swim",
                # warmup is required
                main_set="Main set.",
                cooldown="Cool-down.",
                zone_ranges={"hr": "130-140bpm"},
                coaching_notes="Good session.",
            )

    def test_missing_main_set_raises(self):
        with pytest.raises(Exception):
            WorkoutDetail(
                session_id="w1_d1_swim",
                warmup="Easy warm-up.",
                # main_set is required
                cooldown="Cool-down.",
                zone_ranges={"hr": "130-140bpm"},
                coaching_notes="Good session.",
            )

    def test_zone_ranges_can_have_multiple_keys(self):
        detail = WorkoutDetail(
            session_id="w1_d2_bike",
            warmup="Easy spin.",
            main_set="60 min Z2 ride.",
            cooldown="5 min easy spin.",
            zone_ranges={"hr": "132-138bpm", "power": "150-170w"},
            coaching_notes="Focus on smooth pedalling.",
        )
        assert "hr" in detail.zone_ranges
        assert "power" in detail.zone_ranges


# ---------------------------------------------------------------------------
# TestExpandSessionRequest
# ---------------------------------------------------------------------------

class TestExpandSessionRequest:
    def test_valid_request(self):
        req = ExpandSessionRequest(
            session=SESSION_SKELETON,
            zones=ZONES,
            athlete_profile=ATHLETE_PROFILE,
        )
        assert req.session["id"] == "w1_d1_swim"
        assert req.zones == ZONES
        assert req.athlete_profile["experience"] == "first_timer"

    def test_missing_session_raises(self):
        with pytest.raises(Exception):
            ExpandSessionRequest(
                # session is required
                zones=ZONES,
                athlete_profile=ATHLETE_PROFILE,
            )

    def test_missing_zones_raises(self):
        with pytest.raises(Exception):
            ExpandSessionRequest(
                session=SESSION_SKELETON,
                # zones is required
                athlete_profile=ATHLETE_PROFILE,
            )

    def test_missing_athlete_profile_raises(self):
        with pytest.raises(Exception):
            ExpandSessionRequest(
                session=SESSION_SKELETON,
                zones=ZONES,
                # athlete_profile is required
            )


# ---------------------------------------------------------------------------
# TestParseWorkoutDetail
# ---------------------------------------------------------------------------

class TestParseWorkoutDetail:
    def _make_llm_output(
        self,
        session_id: str = "w1_d1_swim",
        warmup: str = "10 min easy Z1 swim.",
        main_set: str = "4x200m at Z2 with 20s rest.",
        cooldown: str = "5 min easy cool-down.",
        zone_ranges: dict | None = None,
        coaching_notes: str = "Focus on bilateral breathing throughout.",
        **extra_fields,
    ) -> str:
        if zone_ranges is None:
            zone_ranges = {"hr": "132-138bpm"}
        payload = {
            "session_id": session_id,
            "warmup": warmup,
            "main_set": main_set,
            "cooldown": cooldown,
            "zone_ranges": zone_ranges,
            "coaching_notes": coaching_notes,
            **extra_fields,
        }
        return json.dumps(payload)

    def test_parses_valid_json_string(self):
        from services.agents.workout_expander import _parse_workout_detail

        content = self._make_llm_output()
        result = _parse_workout_detail(content, SESSION_SKELETON)

        assert isinstance(result, WorkoutDetail)
        assert result.session_id == "w1_d1_swim"
        assert result.warmup != ""
        assert result.main_set != ""
        assert result.cooldown != ""
        assert "hr" in result.zone_ranges
        assert result.coaching_notes != ""

    def test_parses_valid_dict(self):
        from services.agents.workout_expander import _parse_workout_detail

        content = {
            "session_id": "w1_d1_swim",
            "warmup": "Easy warm-up.",
            "main_set": "Main set.",
            "cooldown": "Cool-down.",
            "zone_ranges": {"hr": "132-138bpm"},
            "coaching_notes": "Good session.",
        }
        result = _parse_workout_detail(content, SESSION_SKELETON)
        assert isinstance(result, WorkoutDetail)
        assert result.session_id == "w1_d1_swim"

    def test_fixes_wrong_session_id(self):
        """session_id in output is overwritten to match session['id']."""
        from services.agents.workout_expander import _parse_workout_detail

        content = self._make_llm_output(session_id="wrong_id_xyz")
        result = _parse_workout_detail(content, SESSION_SKELETON)

        assert result.session_id == "w1_d1_swim"  # skeleton id wins

    def test_fills_missing_warmup_with_default(self):
        from services.agents.workout_expander import _parse_workout_detail

        content = self._make_llm_output(warmup="")
        result = _parse_workout_detail(content, SESSION_SKELETON)

        assert result.warmup != ""
        assert "swim" in result.warmup.lower()

    def test_fills_missing_main_set_with_default(self):
        from services.agents.workout_expander import _parse_workout_detail

        content = self._make_llm_output(main_set="")
        result = _parse_workout_detail(content, SESSION_SKELETON)

        assert result.main_set != ""
        assert "swim" in result.main_set.lower()

    def test_fills_missing_cooldown_with_default(self):
        from services.agents.workout_expander import _parse_workout_detail

        content = self._make_llm_output(cooldown="")
        result = _parse_workout_detail(content, SESSION_SKELETON)

        assert result.cooldown != ""

    def test_fills_missing_zone_ranges_with_default(self):
        from services.agents.workout_expander import _parse_workout_detail

        payload = {
            "session_id": "w1_d1_swim",
            "warmup": "Easy warm-up.",
            "main_set": "Main set.",
            "cooldown": "Cool-down.",
            "zone_ranges": {},  # empty — treated as missing
            "coaching_notes": "Good session.",
        }
        result = _parse_workout_detail(json.dumps(payload), SESSION_SKELETON)

        assert result.zone_ranges != {}
        assert "hr" in result.zone_ranges

    def test_fills_missing_coaching_notes_with_default(self):
        from services.agents.workout_expander import _parse_workout_detail

        content = self._make_llm_output(coaching_notes="")
        result = _parse_workout_detail(content, SESSION_SKELETON)

        assert result.coaching_notes != ""
        assert "swim" in result.coaching_notes.lower()

    def test_handles_extra_unknown_fields_gracefully(self):
        """Extra fields from LLM output are silently ignored."""
        from services.agents.workout_expander import _parse_workout_detail

        content = self._make_llm_output(
            unknown_field_1="some value",
            another_extra="should be ignored",
        )
        result = _parse_workout_detail(content, SESSION_SKELETON)

        assert isinstance(result, WorkoutDetail)
        # Extra fields should not appear on the model
        assert not hasattr(result, "unknown_field_1")
        assert not hasattr(result, "another_extra")


# ---------------------------------------------------------------------------
# TestRunWorkoutExpander
# ---------------------------------------------------------------------------

class TestRunWorkoutExpander:
    @pytest.mark.asyncio
    async def test_returns_workout_detail_on_success(self):
        """run_workout_expander returns a WorkoutDetail when graph succeeds."""
        mock_state = {"result": VALID_WORKOUT_DETAIL}

        with patch("services.agents.workout_expander._graph") as mock_graph:
            mock_graph.ainvoke = AsyncMock(return_value=mock_state)

            from services.agents.workout_expander import run_workout_expander

            result = await run_workout_expander(
                session=SESSION_SKELETON,
                zones=ZONES,
                athlete_profile=ATHLETE_PROFILE,
            )

        assert isinstance(result, WorkoutDetail)
        assert result.session_id == "w1_d1_swim"
        assert result.warmup != ""
        assert result.main_set != ""
        assert result.cooldown != ""

    @pytest.mark.asyncio
    async def test_raises_value_error_when_result_is_none(self):
        """run_workout_expander raises ValueError if graph returns result=None."""
        mock_state = {"result": None}

        with patch("services.agents.workout_expander._graph") as mock_graph:
            mock_graph.ainvoke = AsyncMock(return_value=mock_state)

            from services.agents.workout_expander import run_workout_expander

            with pytest.raises(ValueError, match="result is None"):
                await run_workout_expander(
                    session=SESSION_SKELETON,
                    zones=ZONES,
                    athlete_profile=ATHLETE_PROFILE,
                )

    @pytest.mark.asyncio
    async def test_graph_ainvoke_called_with_initial_state(self):
        """Verify graph.ainvoke is called and receives messages with the human prompt."""
        mock_state = {"result": VALID_WORKOUT_DETAIL}

        with patch("services.agents.workout_expander._graph") as mock_graph:
            mock_graph.ainvoke = AsyncMock(return_value=mock_state)

            from services.agents.workout_expander import run_workout_expander

            await run_workout_expander(
                session=SESSION_SKELETON,
                zones=ZONES,
                athlete_profile=ATHLETE_PROFILE,
            )

        mock_graph.ainvoke.assert_called_once()
        call_args = mock_graph.ainvoke.call_args[0][0]  # first positional arg
        assert "messages" in call_args
        assert len(call_args["messages"]) == 1
        assert call_args["session"] == SESSION_SKELETON
        assert call_args["zones"] == ZONES
        assert call_args["athlete_profile"] == ATHLETE_PROFILE

"""
Unit tests for the deterministic pipeline tools and week generation pipeline.

All tests call pure math functions directly — no LangChain, no Ollama required.
"""
from __future__ import annotations

import pytest
from unittest.mock import AsyncMock, patch

from models.blueprint import PhaseBlueprint, PlanBlueprint
from models.workout_builder import WeekWithDescriptions, SessionWithDescription
from services.tools.calculate_weekly_target_volume import (
    calculate_weekly_target_volume_math,
)
from services.tools.allocate_week_structure import allocate_week_structure_logic
from services.tools.validate_week_structure import validate_week_structure_logic


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_session(
    day: str,
    sport: str,
    duration_minutes: int,
    zone: int,
    week: int = 1,
    idx: int = 1,
) -> dict:
    return {
        "id": f"w{week}_d{idx}_{sport}",
        "week": week,
        "day": day,
        "sport": sport,
        "duration_minutes": duration_minutes,
        "zone": zone,
        "zone_label": {1: "Recovery", 2: "Aerobic", 3: "Tempo", 4: "Threshold", 5: "VO2max"}[zone],
    }


def _make_phase(
    name: str = "Base",
    weeks: int = 4,
    template: dict | None = None,
) -> PhaseBlueprint:
    return PhaseBlueprint(
        phase_name=name,
        weeks=weeks,
        intensity_distribution_target="80/20",
        weekly_structure_template=template or {"swim": 2, "bike": 3, "run": 3},
        focus="Aerobic durability and technique development.",
    )


def _make_week_with_descriptions(week_index: int = 1, phase_name: str = "Base") -> WeekWithDescriptions:
    """Build a minimal WeekWithDescriptions for mocking."""
    sessions = [
        SessionWithDescription(
            id=f"w{week_index}_d1_swim",
            week=week_index,
            day="Monday",
            sport="swim",
            duration_minutes=45,
            zone=2,
            zone_label="Aerobic",
            description="Easy aerobic swim focusing on technique.",
        )
    ]
    return WeekWithDescriptions(
        week_index=week_index,
        phase_name=phase_name,
        sessions=sessions,
    )


# ---------------------------------------------------------------------------
# TestCalculateWeeklyTargetVolume
# ---------------------------------------------------------------------------

class TestCalculateWeeklyTargetVolume:
    BASE = 10.0

    def test_recovery_week_returns_60_percent(self):
        result = calculate_weekly_target_volume_math(
            week_index=4, phase_name="Base", base_weekly_hours=self.BASE
        )
        assert result["is_recovery_week"] is True
        assert result["target_hours"] == round(self.BASE * 0.6, 1)

    def test_recovery_week_8_also_triggers(self):
        result = calculate_weekly_target_volume_math(
            week_index=8, phase_name="Build", base_weekly_hours=self.BASE
        )
        assert result["is_recovery_week"] is True
        assert result["target_hours"] == round(self.BASE * 0.6, 1)

    def test_taper_week_1_returns_55_percent(self):
        # First taper week: previous_week_hours > 50% of base → treated as week 1
        result = calculate_weekly_target_volume_math(
            week_index=17,
            phase_name="Taper",
            base_weekly_hours=self.BASE,
            previous_week_hours=self.BASE * 0.8,
        )
        assert result["is_recovery_week"] is False
        assert result["target_hours"] == round(self.BASE * 0.55, 1)
        assert "55%" in result["ramp_note"]

    def test_taper_week_2_plus_returns_40_percent(self):
        # Subsequent taper week: previous_week_hours <= 50% of base
        result = calculate_weekly_target_volume_math(
            week_index=18,
            phase_name="Taper",
            base_weekly_hours=self.BASE,
            previous_week_hours=self.BASE * 0.55,
        )
        assert result["is_recovery_week"] is False
        assert result["target_hours"] == round(self.BASE * 0.40, 1)
        assert "40%" in result["ramp_note"]

    def test_taper_first_week_no_previous(self):
        # previous_week_hours=0 → treated as first taper week (55%)
        result = calculate_weekly_target_volume_math(
            week_index=15,
            phase_name="Taper",
            base_weekly_hours=self.BASE,
            previous_week_hours=0.0,
        )
        assert result["target_hours"] == round(self.BASE * 0.55, 1)

    def test_normal_week_caps_ramp_at_8_percent(self):
        previous = 7.0
        result = calculate_weekly_target_volume_math(
            week_index=3,
            phase_name="Build",
            base_weekly_hours=self.BASE,
            previous_week_hours=previous,
        )
        assert result["is_recovery_week"] is False
        expected = round(min(self.BASE, previous * 1.08), 1)
        assert result["target_hours"] == expected

    def test_normal_week_at_base_when_previous_close(self):
        # previous = 9.5h → 9.5 * 1.08 = 10.26 > base=10 → should return base
        result = calculate_weekly_target_volume_math(
            week_index=3,
            phase_name="Build",
            base_weekly_hours=self.BASE,
            previous_week_hours=9.5,
        )
        assert result["target_hours"] == self.BASE

    def test_first_week_of_phase_uses_base_directly(self):
        # previous_week_hours == 0.0 → no ramp constraint, use base
        result = calculate_weekly_target_volume_math(
            week_index=1,
            phase_name="Base",
            base_weekly_hours=self.BASE,
            previous_week_hours=0.0,
        )
        assert result["target_hours"] == self.BASE
        assert "First week" in result["ramp_note"]

    def test_target_minutes_matches_target_hours(self):
        result = calculate_weekly_target_volume_math(
            week_index=2, phase_name="Base", base_weekly_hours=8.0, previous_week_hours=8.0
        )
        assert result["target_minutes"] == int(result["target_hours"] * 60)

    def test_ramp_note_is_string(self):
        result = calculate_weekly_target_volume_math(
            week_index=1, phase_name="Base", base_weekly_hours=10.0
        )
        assert isinstance(result["ramp_note"], str)
        assert len(result["ramp_note"]) > 0

    def test_taper_not_treated_as_recovery_even_on_week_4(self):
        # Taper phase takes priority over recovery week logic
        result = calculate_weekly_target_volume_math(
            week_index=4,
            phase_name="Taper",
            base_weekly_hours=self.BASE,
            previous_week_hours=self.BASE * 0.9,
        )
        assert result["is_recovery_week"] is False


# ---------------------------------------------------------------------------
# TestAllocateWeekStructure
# ---------------------------------------------------------------------------

class TestAllocateWeekStructure:
    _TEMPLATE = {"swim": 2, "bike": 3, "run": 3}
    _PROFILE = dict(
        days_available=5,
        strongest_discipline="bike",
        weakest_discipline="swim",
    )

    def _allocate(self, template=None, days=5, target_hours=8.0, week_index=1):
        return allocate_week_structure_logic(
            week_index=week_index,
            phase_name="Base",
            weekly_structure_template=template or self._TEMPLATE,
            target_hours=target_hours,
            days_available=days,
            strongest_discipline="bike",
            weakest_discipline="swim",
        )

    def test_returns_dict_with_sessions_key(self):
        result = self._allocate()
        assert "sessions" in result
        assert isinstance(result["sessions"], list)

    def test_session_count_within_days_cap(self):
        result = self._allocate(days=5)
        # Template total = 8; cap = 5 * 1.5 = 7.5 → 7
        assert len(result["sessions"]) <= int(5 * 1.5)

    def test_all_sessions_have_required_fields(self):
        result = self._allocate()
        required = {"id", "week", "day", "sport", "duration_minutes", "zone", "zone_label"}
        for session in result["sessions"]:
            assert required.issubset(session.keys()), (
                f"Session missing fields: {required - set(session.keys())}"
            )

    def test_no_description_field_in_skeleton(self):
        result = self._allocate()
        for session in result["sessions"]:
            assert "description" not in session, (
                "Skeleton sessions must NOT have a description field"
            )

    def test_week_index_matches(self):
        result = self._allocate(week_index=5)
        assert result["week_index"] == 5
        for session in result["sessions"]:
            assert session["week"] == 5

    def test_total_duration_roughly_matches_target(self):
        target_hours = 8.0
        result = self._allocate(target_hours=target_hours)
        total_minutes = sum(s["duration_minutes"] for s in result["sessions"])
        target_minutes = target_hours * 60
        # Within 20% tolerance
        assert target_minutes * 0.80 <= total_minutes <= target_minutes * 1.20, (
            f"Total {total_minutes} min not within 20% of target {target_minutes} min"
        )

    def test_zone_distribution_mostly_low(self):
        result = self._allocate()
        sessions = result["sessions"]
        low_zone_count = sum(1 for s in sessions if s["zone"] in (1, 2))
        low_pct = low_zone_count / len(sessions)
        # >= 60% should be Z1-2 (polarized model)
        assert low_pct >= 0.60, (
            f"Only {low_pct:.0%} of sessions are Z1-2; expected >= 60%"
        )

    def test_session_ids_are_unique(self):
        result = self._allocate()
        ids = [s["id"] for s in result["sessions"]]
        assert len(ids) == len(set(ids)), "Session IDs are not unique"

    def test_session_id_format(self):
        result = self._allocate(week_index=3)
        for session in result["sessions"]:
            # Must start with w3_
            assert session["id"].startswith("w3_"), (
                f"ID '{session['id']}' doesn't start with week prefix"
            )

    def test_all_days_are_valid(self):
        from services.plan_engine import DAYS_OF_WEEK
        result = self._allocate()
        for session in result["sessions"]:
            assert session["day"] in DAYS_OF_WEEK, (
                f"Invalid day: {session['day']}"
            )

    def test_zone_labels_match_zone_numbers(self):
        from services.plan_engine import ZONE_LABELS
        result = self._allocate()
        for session in result["sessions"]:
            expected_label = ZONE_LABELS[session["zone"]]
            assert session["zone_label"] == expected_label

    def test_sports_in_template_appear_in_sessions(self):
        result = self._allocate()
        sports_in_sessions = {s["sport"] for s in result["sessions"]}
        # At least some of the template sports should appear
        template_sports = set(self._TEMPLATE.keys())
        assert len(sports_in_sessions & template_sports) > 0

    def test_single_sport_template(self):
        result = self._allocate(template={"run": 5}, days=5)
        for session in result["sessions"]:
            assert session["sport"] == "run"

    def test_duration_min_and_max_clamp(self):
        # Durations should be between 20 and 180 minutes (from plan_engine)
        result = self._allocate()
        for session in result["sessions"]:
            assert 20 <= session["duration_minutes"] <= 180


# ---------------------------------------------------------------------------
# TestValidateWeekStructure
# ---------------------------------------------------------------------------

class TestValidateWeekStructure:
    def _valid_skeleton(self) -> dict:
        return {
            "week_index": 1,
            "target_hours": 8.0,
            "sessions": [
                _make_session("Monday",    "swim", 45,  2, idx=1),
                _make_session("Tuesday",   "bike", 75,  2, idx=2),
                _make_session("Thursday",  "run",  50,  2, idx=4),
                _make_session("Friday",    "bike", 90,  3, idx=5),
                _make_session("Saturday",  "run",  60,  2, idx=6),
                _make_session("Sunday",    "bike", 120, 2, idx=7),
            ],
        }

    def test_valid_week_passes(self):
        result = validate_week_structure_logic(self._valid_skeleton())
        assert result["valid"] is True
        assert result["issues"] == []

    def test_too_many_hard_sessions(self):
        skeleton = self._valid_skeleton()
        # Add 3 hard sessions
        skeleton["sessions"][0]["zone"] = 4
        skeleton["sessions"][0]["zone_label"] = "Threshold"
        skeleton["sessions"][1]["zone"] = 4
        skeleton["sessions"][1]["zone_label"] = "Threshold"
        skeleton["sessions"][2]["zone"] = 5
        skeleton["sessions"][2]["zone_label"] = "VO2max"
        result = validate_week_structure_logic(skeleton)
        assert result["valid"] is False
        assert any("hard session" in issue.lower() or "zone >= 4" in issue for issue in result["issues"])

    def test_back_to_back_hard_runs(self):
        skeleton = self._valid_skeleton()
        # Make Monday and Tuesday both hard runs
        skeleton["sessions"] = [
            _make_session("Monday",   "run", 50, 4, idx=1),
            _make_session("Tuesday",  "run", 50, 4, idx=2),
            _make_session("Thursday", "bike", 90, 2, idx=4),
            _make_session("Saturday", "swim", 45, 2, idx=6),
        ]
        result = validate_week_structure_logic(skeleton)
        assert result["valid"] is False
        assert any("back-to-back" in issue.lower() or "back to back" in issue.lower() for issue in result["issues"])

    def test_long_bike_less_than_long_run_fails(self):
        skeleton = self._valid_skeleton()
        skeleton["sessions"] = [
            _make_session("Tuesday",  "bike", 90,  2, idx=2),  # long bike (>= 90 min) < long run
            _make_session("Thursday", "run",  120, 2, idx=4),  # long run (>= 60 min, longer than bike)
            _make_session("Saturday", "swim", 45,  2, idx=6),
        ]
        result = validate_week_structure_logic(skeleton)
        assert result["valid"] is False
        assert any("long bike" in issue.lower() for issue in result["issues"])

    def test_long_bike_equals_long_run_passes(self):
        skeleton = {
            "sessions": [
                _make_session("Tuesday",  "bike", 90, 2, idx=2),
                _make_session("Saturday", "run",  90, 2, idx=6),
                _make_session("Thursday", "swim", 45, 2, idx=4),
            ]
        }
        result = validate_week_structure_logic(skeleton)
        # Only bike/run check — should pass
        bike_run_issues = [i for i in result["issues"] if "long bike" in i.lower()]
        assert bike_run_issues == []

    def test_volume_outside_15_percent_fails(self):
        skeleton = {
            "target_hours": 10.0,  # target = 600 min
            "sessions": [
                _make_session("Monday",  "swim", 30, 2, idx=1),
                _make_session("Tuesday", "run",  30, 2, idx=2),
            ],  # total = 60 min — far below 600 * 0.85 = 510
        }
        result = validate_week_structure_logic(skeleton)
        assert result["valid"] is False
        assert any("volume" in issue.lower() or "target" in issue.lower() for issue in result["issues"])

    def test_volume_within_15_percent_passes(self):
        # target = 8.0h = 480 min; 15% window = 408–552; actual = 450 min → passes
        skeleton = {
            "target_hours": 8.0,
            "sessions": [
                _make_session("Monday",    "swim", 60,  2, idx=1),
                _make_session("Tuesday",   "bike", 90,  2, idx=2),
                _make_session("Thursday",  "run",  70,  2, idx=4),
                _make_session("Friday",    "bike", 80,  2, idx=5),
                _make_session("Saturday",  "run",  60,  2, idx=6),
                _make_session("Sunday",    "bike", 90,  2, idx=7),
            ],
        }
        result = validate_week_structure_logic(skeleton)
        volume_issues = [i for i in result["issues"] if "volume" in i.lower() or "target" in i.lower()]
        assert volume_issues == []

    def test_no_sessions_returns_invalid(self):
        result = validate_week_structure_logic({"sessions": []})
        assert result["valid"] is False
        assert result["issues"]

    def test_ramp_rate_violation(self):
        skeleton = {
            "previous_week_minutes": 300.0,  # 5 hours last week
            "sessions": [
                _make_session("Monday",   "swim", 120, 2, idx=1),
                _make_session("Tuesday",  "bike", 120, 2, idx=2),
                _make_session("Thursday", "run",  120, 2, idx=4),
            ],  # total = 360 min — 20% increase over 300; exceeds 10%
        }
        result = validate_week_structure_logic(skeleton)
        assert result["valid"] is False
        assert any("ramp" in issue.lower() for issue in result["issues"])

    def test_ramp_rate_within_10_percent_passes(self):
        skeleton = {
            "previous_week_minutes": 300.0,
            "sessions": [
                _make_session("Monday",   "swim",  80, 2, idx=1),
                _make_session("Tuesday",  "bike", 120, 2, idx=2),
                _make_session("Thursday", "run",   80, 2, idx=4),
                _make_session("Saturday", "bike",  40, 2, idx=6),
            ],  # total = 320 min — 6.7% increase → ok
        }
        result = validate_week_structure_logic(skeleton)
        ramp_issues = [i for i in result["issues"] if "ramp" in i.lower()]
        assert ramp_issues == []

    def test_exactly_2_hard_sessions_is_valid(self):
        skeleton = {
            "sessions": [
                _make_session("Monday",    "swim", 45, 2, idx=1),
                _make_session("Tuesday",   "bike", 75, 4, idx=2),  # hard
                _make_session("Thursday",  "run",  50, 4, idx=4),  # hard
                _make_session("Saturday",  "bike", 90, 2, idx=6),
            ]
        }
        result = validate_week_structure_logic(skeleton)
        hard_session_issues = [
            i for i in result["issues"]
            if "hard session" in i.lower() or "zone >= 4" in i
        ]
        assert hard_session_issues == []


# ---------------------------------------------------------------------------
# TestWeekPipeline
# ---------------------------------------------------------------------------

class TestWeekPipeline:
    """Tests for generate_week and generate_full_plan with Workout Builder mocked."""

    _ATHLETE = {
        "goal": "recreational",
        "experience": "recreational",
        "weekly_hours": 8.0,
        "days_available": 5,
        "strongest_discipline": "bike",
        "weakest_discipline": "swim",
    }
    _ZONES = {}  # empty zones — Workout Builder is mocked

    def _mock_workout_builder(self, week_index: int = 1, phase_name: str = "Base"):
        return AsyncMock(return_value=_make_week_with_descriptions(week_index, phase_name))

    @pytest.mark.asyncio
    async def test_generate_week_returns_week_with_descriptions(self):
        phase = _make_phase()
        with patch(
            "services.week_pipeline.run_workout_builder",
            new=self._mock_workout_builder(week_index=1),
        ):
            from services.week_pipeline import generate_week
            result = await generate_week(
                week_index=1,
                phase=phase,
                athlete_profile=self._ATHLETE,
                zones=self._ZONES,
            )
        assert isinstance(result, WeekWithDescriptions)
        assert result.week_index == 1

    @pytest.mark.asyncio
    async def test_generate_week_with_invalid_skeleton_still_returns_result(self):
        """
        Even if the skeleton fails validation after all fix attempts,
        generate_week should still return a WeekWithDescriptions.
        """
        phase = _make_phase(template={"swim": 2, "bike": 3, "run": 3})
        call_count = 0

        async def mock_builder(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            week_index = kwargs.get("week_skeleton", {}).get("week_index", 1)
            return _make_week_with_descriptions(week_index)

        with patch("services.week_pipeline.run_workout_builder", side_effect=mock_builder):
            from services.week_pipeline import generate_week
            result = await generate_week(
                week_index=1,
                phase=phase,
                athlete_profile=self._ATHLETE,
                zones=self._ZONES,
                max_retries=0,  # no retries — forces proceed-anyway path
            )

        assert isinstance(result, WeekWithDescriptions)

    @pytest.mark.asyncio
    async def test_generate_full_plan_returns_correct_week_count(self):
        blueprint = PlanBlueprint(
            phases=[
                _make_phase("Base", weeks=2),
                _make_phase("Build", weeks=2),
                _make_phase("Taper", weeks=1),
            ],
            total_weeks=5,
            notes="Test plan.",
        )

        generated_indices: list[int] = []

        async def mock_builder(week_skeleton, phase_name, phase_focus, zones, athlete_profile):
            idx = week_skeleton.get("week_index", 1)
            generated_indices.append(idx)
            return _make_week_with_descriptions(idx, phase_name)

        with patch("services.week_pipeline.run_workout_builder", side_effect=mock_builder):
            from services.week_pipeline import generate_full_plan
            results = await generate_full_plan(
                blueprint=blueprint,
                athlete_profile=self._ATHLETE,
                zones=self._ZONES,
            )

        assert len(results) == 5
        assert [r.week_index for r in results] == [1, 2, 3, 4, 5]

    @pytest.mark.asyncio
    async def test_generate_full_plan_phase_names_in_order(self):
        blueprint = PlanBlueprint(
            phases=[
                _make_phase("Base", weeks=1),
                _make_phase("Build", weeks=1),
                _make_phase("Peak", weeks=1),
                _make_phase("Taper", weeks=1),
            ],
            total_weeks=4,
            notes="Short plan.",
        )

        async def mock_builder(week_skeleton, phase_name, phase_focus, zones, athlete_profile):
            idx = week_skeleton.get("week_index", 1)
            return _make_week_with_descriptions(idx, phase_name)

        with patch("services.week_pipeline.run_workout_builder", side_effect=mock_builder):
            from services.week_pipeline import generate_full_plan
            results = await generate_full_plan(
                blueprint=blueprint,
                athlete_profile=self._ATHLETE,
                zones=self._ZONES,
            )

        phase_names = [r.phase_name for r in results]
        assert phase_names == ["Base", "Build", "Peak", "Taper"]

    @pytest.mark.asyncio
    async def test_generate_full_plan_tracks_previous_week_minutes(self):
        """
        Verify that previous_week_minutes is passed correctly to generate_week.
        The recovery week at index 4 should receive lower target_hours.
        """
        blueprint = PlanBlueprint(
            phases=[_make_phase("Base", weeks=4)],
            total_weeks=4,
            notes="Recovery test.",
        )

        target_hours_per_week: list[float] = []

        async def mock_builder(week_skeleton, phase_name, phase_focus, zones, athlete_profile):
            idx = week_skeleton.get("week_index", 1)
            target_hours_per_week.append(week_skeleton.get("target_hours", 0.0))
            # Return sessions with some duration so previous_week_minutes tracks correctly
            sessions = [
                SessionWithDescription(
                    id=f"w{idx}_d1_swim",
                    week=idx,
                    day="Monday",
                    sport="swim",
                    duration_minutes=int(week_skeleton.get("target_hours", 8.0) * 60 * 0.25),
                    zone=2,
                    zone_label="Aerobic",
                    description="Test.",
                )
            ]
            return WeekWithDescriptions(week_index=idx, phase_name=phase_name, sessions=sessions)

        with patch("services.week_pipeline.run_workout_builder", side_effect=mock_builder):
            from services.week_pipeline import generate_full_plan
            await generate_full_plan(
                blueprint=blueprint,
                athlete_profile=self._ATHLETE,
                zones=self._ZONES,
            )

        # Week 4 should be a recovery week (60% of base)
        assert len(target_hours_per_week) == 4
        assert target_hours_per_week[3] == round(8.0 * 0.6, 1)

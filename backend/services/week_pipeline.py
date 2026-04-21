"""
week_pipeline.py — Orchestration for week generation.

New architecture (as of the LLM-driven refactor):
    1. calculate_weekly_target_volume_math  →  target_hours (deterministic)
    2. run_workout_builder (LLM + validator retry loop)  →  WeekWithDescriptions
    3. _apply_experience_cap  →  clamp zones for first_timers (deterministic)
    4. _attach_intervals  →  build structured intervals per session (deterministic)

The LLM now owns day/sport/duration/zone/session_type/description decisions.
Deterministic code only handles: volume target, zone caps, and interval attachment.
"""
from __future__ import annotations

import logging

from models.blueprint import PhaseBlueprint, PlanBlueprint
from models.workout_builder import SessionWithDescription, WeekWithDescriptions
from services.agents.workout_builder import run_workout_builder
from services.tools.calculate_weekly_target_volume import (
    calculate_weekly_target_volume_math,
)
from services.workout_structure import build_workout_intervals

logger = logging.getLogger(__name__)

_ZONE_LABELS = {1: "Recovery", 2: "Aerobic", 3: "Tempo", 4: "Threshold", 5: "VO2max"}
_MAX_ZONE = {"first_timer": 3, "recreational": 5, "competitive": 5}

_SWIM_YARDS_PER_MIN = {1: 30, 2: 40, 3: 50, 4: 55, 5: 60}


def _apply_experience_cap(sessions: list[SessionWithDescription], experience: str) -> None:
    max_z = _MAX_ZONE.get(experience, 5)
    for s in sessions:
        if s.zone > max_z:
            s.zone = max_z
            s.zone_label = _ZONE_LABELS[max_z]


def _attach_intervals_and_distance(
    sessions: list[SessionWithDescription], experience: str
) -> None:
    """Derive swim distance_yards and build structured intervals per session."""
    for s in sessions:
        if s.sport == "swim" and not s.distance_yards:
            yards_per_min = _SWIM_YARDS_PER_MIN.get(s.zone, 40)
            s.distance_yards = round(s.duration_minutes * yards_per_min / 25) * 25

        s.intervals = build_workout_intervals(
            sport=s.sport,
            zone=s.zone,
            duration_minutes=s.duration_minutes,
            experience=experience,
            distance_yards=s.distance_yards,
            session_type=s.session_type,
        )


async def _generate_one_week(
    *,
    week_index: int,
    phase_name: str,
    phase_focus: str,
    intensity_target: str,
    week_within_phase: int,
    weeks_until_race: int,
    athlete_profile: dict,
    zones: dict,
    previous_week_minutes: float,
) -> WeekWithDescriptions:
    hours_max = float(
        athlete_profile.get("hours_max") or athlete_profile.get("weekly_hours") or 8.0
    )
    experience = athlete_profile.get("experience", "recreational")

    volume = calculate_weekly_target_volume_math(
        week_index=week_index,
        phase_name=phase_name,
        base_weekly_hours=hours_max,
        previous_week_hours=previous_week_minutes / 60.0,
    )
    target_hours: float = volume["target_hours"]
    logger.info(
        "week_pipeline: week %d (%s) target=%.1fh %s",
        week_index,
        phase_name,
        target_hours,
        volume.get("ramp_note", ""),
    )

    week = await run_workout_builder(
        week_index=week_index,
        phase_name=phase_name,
        phase_focus=phase_focus,
        intensity_target=intensity_target,
        week_within_phase=week_within_phase,
        weeks_until_race=weeks_until_race,
        athlete_profile=athlete_profile,
        zones=zones,
        target_hours=target_hours,
        previous_week_minutes=previous_week_minutes,
    )

    _apply_experience_cap(week.sessions, experience)
    _attach_intervals_and_distance(week.sessions, experience)
    return week


async def generate_week(
    week_index: int,
    phase: PhaseBlueprint,
    athlete_profile: dict,
    zones: dict,
    previous_week_minutes: float = 0.0,
    weeks_until_race: int = 0,
    week_within_phase: int = 1,
) -> WeekWithDescriptions:
    """Generate a single training week."""
    return await _generate_one_week(
        week_index=week_index,
        phase_name=phase.phase_name,
        phase_focus=phase.focus,
        intensity_target=phase.intensity_distribution_target,
        week_within_phase=week_within_phase,
        weeks_until_race=weeks_until_race,
        athlete_profile=athlete_profile,
        zones=zones,
        previous_week_minutes=previous_week_minutes,
    )


async def generate_full_plan(
    blueprint: PlanBlueprint,
    athlete_profile: dict,
    zones: dict,
) -> list[WeekWithDescriptions]:
    """Generate every week in the blueprint, sequentially so ramp rate chains."""
    results: list[WeekWithDescriptions] = []
    prev_minutes = 0.0
    global_week = 1
    total_weeks = sum(p.weeks for p in blueprint.phases)

    for phase in blueprint.phases:
        for week_in_phase in range(phase.weeks):
            week = await _generate_one_week(
                week_index=global_week,
                phase_name=phase.phase_name,
                phase_focus=phase.focus,
                intensity_target=phase.intensity_distribution_target,
                week_within_phase=week_in_phase + 1,
                weeks_until_race=total_weeks - global_week + 1,
                athlete_profile=athlete_profile,
                zones=zones,
                previous_week_minutes=prev_minutes,
            )
            results.append(week)
            prev_minutes = float(sum(s.duration_minutes for s in week.sessions))
            global_week += 1

    return results


async def generate_week_block(
    from_week: int,
    to_week: int,
    stored_phases: list[dict],
    athlete_profile: dict,
    zones: dict,
    previous_week_minutes: float = 0.0,
) -> list[WeekWithDescriptions]:
    """Generate a contiguous range [from_week, to_week] from stored phase data."""

    def _phase_for(week_num: int) -> dict:
        for p in stored_phases:
            if p["start_week"] <= week_num <= p["end_week"]:
                return p
        return stored_phases[-1] if stored_phases else {}

    total_weeks = max((p.get("end_week", 0) for p in stored_phases), default=to_week)
    results: list[WeekWithDescriptions] = []
    prev_minutes = previous_week_minutes

    for week_index in range(from_week, to_week + 1):
        phase = _phase_for(week_index)
        phase_start = int(phase.get("start_week", 1))
        week = await _generate_one_week(
            week_index=week_index,
            phase_name=phase.get("name", "Base"),
            phase_focus=phase.get("focus", ""),
            intensity_target=phase.get("intensity_distribution_target", "80/20"),
            week_within_phase=max(1, week_index - phase_start + 1),
            weeks_until_race=max(1, total_weeks - week_index + 1),
            athlete_profile=athlete_profile,
            zones=zones,
            previous_week_minutes=prev_minutes,
        )
        results.append(week)
        prev_minutes = float(sum(s.duration_minutes for s in week.sessions))

    return results

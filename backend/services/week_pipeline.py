"""
week_pipeline.py — Orchestration layer for week and full-plan generation.

NOT a LangGraph agent — plain async Python functions that sequence:
1. calculate_weekly_target_volume_math  →  target_hours
2. allocate_week_structure_logic        →  week_skeleton
3. validate_week_structure_logic        →  validation result + auto-fix attempt
4. run_workout_builder                  →  WeekWithDescriptions

Public API:
    generate_week(...)          — generate a single week
    generate_full_plan(...)     — iterate all phases and weeks in order
"""
from __future__ import annotations

import logging

from models.blueprint import PhaseBlueprint, PlanBlueprint
from models.workout_builder import WeekWithDescriptions
from services.agents.workout_builder import run_workout_builder
from services.plan_engine import DAYS_OF_WEEK
from services.tools.allocate_week_structure import allocate_week_structure_logic
from services.tools.calculate_weekly_target_volume import (
    calculate_weekly_target_volume_math,
)
from services.tools.validate_week_structure import validate_week_structure_logic

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Auto-fix helpers
# ---------------------------------------------------------------------------

def _fix_week_skeleton(week_skeleton: dict, issues: list[str]) -> dict:
    """
    Attempt a best-effort fix of common validation issues.

    Fixes applied:
    - More than 2 hard sessions (zone >= 4): demote excess to zone 3.
    - Back-to-back hard runs: demote the second one's zone to 3.

    Returns a (potentially modified) copy of the skeleton.
    """
    sessions = [dict(s) for s in week_skeleton.get("sessions", [])]

    # Fix 1: clamp hard sessions to max 2
    hard_indices = [i for i, s in enumerate(sessions) if int(s.get("zone", 1)) >= 4]
    if len(hard_indices) > 2:
        logger.warning(
            "week_pipeline: too many hard sessions (%d), demoting excess to zone 3",
            len(hard_indices),
        )
        for idx in hard_indices[2:]:
            sessions[idx]["zone"] = 3
            sessions[idx]["zone_label"] = "Tempo"

    # Fix 2: remove back-to-back hard runs
    _DAYS_ORDER = {day: i for i, day in enumerate(DAYS_OF_WEEK)}
    run_day_map: dict[int, list[int]] = {}  # day_order_index → [session_indices]
    for i, s in enumerate(sessions):
        if s.get("sport") == "run" and int(s.get("zone", 1)) >= 4:
            day_ord = _DAYS_ORDER.get(s.get("day", ""), 99)
            run_day_map.setdefault(day_ord, []).append(i)

    sorted_days = sorted(run_day_map.keys())
    for j in range(len(sorted_days) - 1):
        if sorted_days[j + 1] - sorted_days[j] == 1:
            # Demote the second day's hard run(s) to zone 3
            for session_idx in run_day_map[sorted_days[j + 1]]:
                logger.warning(
                    "week_pipeline: demoting back-to-back hard run at %s to zone 3",
                    sessions[session_idx].get("day"),
                )
                sessions[session_idx]["zone"] = 3
                sessions[session_idx]["zone_label"] = "Tempo"

    fixed_skeleton = dict(week_skeleton)
    fixed_skeleton["sessions"] = sessions
    return fixed_skeleton


# ---------------------------------------------------------------------------
# Core public functions
# ---------------------------------------------------------------------------

async def generate_week(
    week_index: int,
    phase: PhaseBlueprint,
    athlete_profile: dict,
    zones: dict,
    previous_week_minutes: float = 0.0,
    max_retries: int = 2,
) -> WeekWithDescriptions:
    """
    Generate a single training week through the full deterministic + LLM pipeline.

    Flow:
        1. calculate_weekly_target_volume_math  → target_hours
        2. allocate_week_structure_logic        → week_skeleton
        3. validate_week_structure_logic        → check guardrails
           - If invalid: attempt auto-fix, re-validate
           - If still invalid after max_retries: log and proceed anyway
        4. run_workout_builder                  → WeekWithDescriptions

    Args:
        week_index:             1-based global week index across the full plan.
        phase:                  PhaseBlueprint for the current phase.
        athlete_profile:        Dict with keys: goal, experience, weekly_hours,
                                days_available, strongest_discipline, weakest_discipline.
        zones:                  Athlete zone dict from compute_zones.
        previous_week_minutes:  Total minutes from the prior week (0.0 for first week).
        max_retries:            Max auto-fix attempts before proceeding anyway.

    Returns:
        WeekWithDescriptions — validated Pydantic model with all sessions described.
    """
    base_weekly_hours: float = float(athlete_profile.get("weekly_hours", 8.0))
    days_available: int = int(athlete_profile.get("days_available", 5))
    strongest: str = athlete_profile.get("strongest_discipline", "bike")
    weakest: str = athlete_profile.get("weakest_discipline", "swim")

    previous_week_hours = previous_week_minutes / 60.0

    # Step 1 — Volume target
    volume_result = calculate_weekly_target_volume_math(
        week_index=week_index,
        phase_name=phase.phase_name,
        base_weekly_hours=base_weekly_hours,
        previous_week_hours=previous_week_hours,
    )
    target_hours: float = volume_result["target_hours"]
    logger.info(
        "week_pipeline: week %d (%s) — %s",
        week_index,
        phase.phase_name,
        volume_result["ramp_note"],
    )

    # Step 2 — Build skeleton
    week_skeleton = allocate_week_structure_logic(
        week_index=week_index,
        phase_name=phase.phase_name,
        weekly_structure_template=phase.weekly_structure_template,
        target_hours=target_hours,
        days_available=days_available,
        strongest_discipline=strongest,
        weakest_discipline=weakest,
    )

    # Attach previous_week_minutes for ramp-rate validation
    if previous_week_minutes > 0:
        week_skeleton["previous_week_minutes"] = previous_week_minutes

    # Step 3 — Validate + auto-fix loop
    retries_left = max_retries
    while retries_left >= 0:
        validation = validate_week_structure_logic(week_skeleton)
        if validation["valid"]:
            break

        logger.warning(
            "week_pipeline: week %d validation failed (%d issue(s)): %s",
            week_index,
            len(validation["issues"]),
            "; ".join(validation["issues"]),
        )

        if retries_left > 0:
            logger.info("week_pipeline: attempting auto-fix (retries_left=%d)", retries_left)
            week_skeleton = _fix_week_skeleton(week_skeleton, validation["issues"])
        else:
            logger.warning(
                "week_pipeline: week %d — proceeding despite validation failures", week_index
            )
            break

        retries_left -= 1

    # Step 4 — LLM descriptions via Workout Builder
    try:
        result = await run_workout_builder(
            week_skeleton=week_skeleton,
            phase_name=phase.phase_name,
            phase_focus=phase.focus,
            zones=zones,
            athlete_profile=athlete_profile,
        )
    except ValueError as exc:
        # The LLM returned unparseable output. Fall back to placeholder descriptions
        # so a single bad LLM response doesn't abort the entire plan generation.
        logger.error(
            "week_pipeline: week %d Workout Builder failed (%s) — using skeleton fallback",
            week_index,
            exc,
        )
        from models.workout_builder import SessionWithDescription, WeekWithDescriptions as _WWD

        _ZONE_LABELS = {1: "Recovery", 2: "Aerobic", 3: "Tempo", 4: "Threshold", 5: "VO2max"}
        fallback_sessions = [
            SessionWithDescription(
                id=s["id"],
                week=s["week"],
                day=s["day"],
                sport=s["sport"],
                duration_minutes=s["duration_minutes"],
                zone=s["zone"],
                zone_label=s["zone_label"],
                description=(
                    f"Zone {s['zone']} {s['sport']} session. "
                    f"{s['duration_minutes']} minutes at {s['zone_label']} effort."
                ),
            )
            for s in week_skeleton.get("sessions", [])
        ]
        result = _WWD(
            week_index=week_index,
            phase_name=phase.phase_name,
            sessions=fallback_sessions,
        )

    return result


async def generate_full_plan(
    blueprint: PlanBlueprint,
    athlete_profile: dict,
    zones: dict,
) -> list[WeekWithDescriptions]:
    """
    Generate all weeks for a full training plan from a PlanBlueprint.

    Iterates phases in order, then weeks within each phase, calling generate_week
    for each. Tracks previous_week_minutes across weeks so ramp-rate logic is
    consistent end-to-end.

    Args:
        blueprint:       PlanBlueprint output from the Plan Architect Agent.
        athlete_profile: Athlete guide rail dict (weekly_hours, days_available, etc.).
        zones:           Athlete zone dict from compute_zones.

    Returns:
        Ordered list of WeekWithDescriptions — one entry per week, all phases.
    """
    all_weeks: list[WeekWithDescriptions] = []
    global_week_index = 1
    previous_week_minutes = 0.0

    for phase in blueprint.phases:
        logger.info(
            "week_pipeline: starting phase '%s' (%d weeks)",
            phase.phase_name,
            phase.weeks,
        )
        for _week_in_phase in range(phase.weeks):
            week = await generate_week(
                week_index=global_week_index,
                phase=phase,
                athlete_profile=athlete_profile,
                zones=zones,
                previous_week_minutes=previous_week_minutes,
            )
            all_weeks.append(week)

            # Track total minutes for next week's ramp-rate calculation
            previous_week_minutes = float(
                sum(s.duration_minutes for s in week.sessions)
            )
            global_week_index += 1

    return all_weeks

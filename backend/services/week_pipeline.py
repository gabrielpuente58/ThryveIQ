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

import asyncio
import json
import logging
import os

from dotenv import load_dotenv
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_ollama import ChatOllama

from models.blueprint import PhaseBlueprint, PlanBlueprint
from models.workout_builder import SessionWithDescription, WeekWithDescriptions
from services.plan_engine import DAYS_OF_WEEK
from services.tools.allocate_week_structure import allocate_week_structure_logic
from services.tools.calculate_weekly_target_volume import (
    calculate_weekly_target_volume_math,
)
from services.tools.validate_week_structure import validate_week_structure_logic

load_dotenv()
OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.1")

logger = logging.getLogger(__name__)

_ZONE_LABELS = {1: "Recovery", 2: "Aerobic", 3: "Tempo", 4: "Threshold", 5: "VO2max"}


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
# Batch description generator — ONE LLM call for all sessions
# ---------------------------------------------------------------------------

async def _generate_descriptions_batch(
    skeletons: list[tuple[int, object, dict]],
    athlete_profile: dict,
) -> dict[str, str]:
    """
    Single LLM call: generate coaching descriptions for every session across
    all weeks. Returns a dict mapping session_id → description string.
    Falls back to placeholder text for any session the LLM missed.
    """
    all_sessions = []
    for _wi, phase, skeleton in skeletons:
        for s in skeleton.get("sessions", []):
            all_sessions.append({
                "id": s["id"],
                "sport": s["sport"],
                "duration_minutes": s["duration_minutes"],
                "zone": s["zone"],
                "zone_label": s["zone_label"],
                "phase": getattr(phase, "phase_name", str(phase)),
                "phase_focus": getattr(phase, "focus", ""),
            })

    system = (
        "You are an expert Ironman 70.3 triathlon coach. "
        "Return ONLY valid JSON — no markdown, no extra text."
    )
    human = (
        f"Athlete: {athlete_profile.get('goal', 'recreational')} goal, "
        f"{athlete_profile.get('experience', 'recreational')} experience. "
        f"Strongest: {athlete_profile.get('strongest_discipline', 'bike')}, "
        f"Weakest: {athlete_profile.get('weakest_discipline', 'swim')}.\n\n"
        "Write a 2-3 sentence coaching description for each session below. "
        "Include: effort feel, technique cue, and zone target in practical terms.\n\n"
        f"Sessions:\n{json.dumps(all_sessions, indent=2)}\n\n"
        'Return JSON: {"descriptions": [{"id": "<session_id>", "description": "<text>"}]}'
    )

    llm = ChatOllama(
        model=OLLAMA_MODEL,
        base_url=OLLAMA_HOST,
        temperature=0,
        format="json",
        num_ctx=8192,
    )

    try:
        response = await llm.ainvoke([SystemMessage(content=system), HumanMessage(content=human)])
        data = json.loads(response.content)
        return {item["id"]: item["description"] for item in data.get("descriptions", [])}
    except Exception as exc:
        logger.error("week_pipeline: batch description generation failed (%s) — using placeholders", exc)
        return {}


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

    Two-phase approach for maximum speed:
      Phase 1 (sequential, instant): build all week skeletons deterministically
        so ramp-rate calculations chain correctly week-over-week.
      Phase 2 (parallel): fire all Workout Builder LLM calls concurrently via
        asyncio.gather — reduces wall time from N×T to ~T regardless of week count.
    """
    base_weekly_hours: float = float(athlete_profile.get("weekly_hours", 8.0))
    days_available: int = int(athlete_profile.get("days_available", 5))
    strongest: str = athlete_profile.get("strongest_discipline", "bike")
    weakest: str = athlete_profile.get("weakest_discipline", "swim")

    # ── Phase 1: build all skeletons (deterministic, no LLM) ──────────────────
    skeletons: list[tuple[int, object, dict]] = []
    global_week_index = 1
    previous_week_minutes = 0.0

    for phase in blueprint.phases:
        logger.info(
            "week_pipeline: building skeletons for phase '%s' (%d weeks)",
            phase.phase_name,
            phase.weeks,
        )
        for _ in range(phase.weeks):
            volume_result = calculate_weekly_target_volume_math(
                week_index=global_week_index,
                phase_name=phase.phase_name,
                base_weekly_hours=base_weekly_hours,
                previous_week_hours=previous_week_minutes / 60.0,
            )
            target_hours: float = volume_result["target_hours"]

            week_skeleton = allocate_week_structure_logic(
                week_index=global_week_index,
                phase_name=phase.phase_name,
                weekly_structure_template=phase.weekly_structure_template,
                target_hours=target_hours,
                days_available=days_available,
                strongest_discipline=strongest,
                weakest_discipline=weakest,
            )

            if previous_week_minutes > 0:
                week_skeleton["previous_week_minutes"] = previous_week_minutes

            # Validate + auto-fix
            retries_left = 2
            while retries_left >= 0:
                validation = validate_week_structure_logic(week_skeleton)
                if validation["valid"]:
                    break
                if retries_left > 0:
                    week_skeleton = _fix_week_skeleton(week_skeleton, validation["issues"])
                retries_left -= 1

            skeletons.append((global_week_index, phase, week_skeleton))
            previous_week_minutes = float(
                sum(s["duration_minutes"] for s in week_skeleton.get("sessions", []))
            )
            global_week_index += 1

    # ── Phase 2: ONE batch LLM call for all session descriptions ─────────────
    logger.info(
        "week_pipeline: generating descriptions for %d sessions in one LLM call",
        sum(len(sk.get("sessions", [])) for _, _, sk in skeletons),
    )
    descriptions = await _generate_descriptions_batch(skeletons, athlete_profile)

    # ── Phase 3: assemble WeekWithDescriptions from skeletons + descriptions ──
    results: list[WeekWithDescriptions] = []
    for week_index, phase, skeleton in skeletons:
        sessions = []
        for s in skeleton.get("sessions", []):
            desc = descriptions.get(s["id"]) or (
                f"Zone {s['zone']} {s['sport']} session. "
                f"{s['duration_minutes']} minutes at {_ZONE_LABELS.get(s['zone'], 'target')} effort."
            )
            sessions.append(SessionWithDescription(
                id=s["id"],
                week=s["week"],
                day=s["day"],
                sport=s["sport"],
                duration_minutes=s["duration_minutes"],
                zone=s["zone"],
                zone_label=s["zone_label"],
                description=desc,
            ))
        results.append(WeekWithDescriptions(
            week_index=week_index,
            phase_name=getattr(phase, "phase_name", str(phase)),
            sessions=sessions,
        ))

    return results

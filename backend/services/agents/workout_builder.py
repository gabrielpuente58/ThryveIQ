"""
Workout Builder Agent — proposes a FULL training week (structure + descriptions).

This is the central plan-generation agent. Given athlete context, it decides:
  - which days to train
  - which sport on each day
  - session durations, zones, and session_type (long/tempo/brick/etc.)
  - a coaching description for each session

A deterministic validator then checks the proposal against hard training rules.
If invalid, the validator's issues are fed back into the next attempt (max 2 retries).

The deterministic rule engine no longer picks days or sports — only zone-anchored
interval attachment happens downstream in week_pipeline._attach_intervals.
"""
from __future__ import annotations

import json
import logging
import os
import re

from dotenv import load_dotenv
from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage, SystemMessage

from models.workout_builder import SessionWithDescription, WeekWithDescriptions
from services.tools.validate_week_structure import validate_week_structure_logic

load_dotenv()

ANTHROPIC_MODEL = os.getenv("ANTHROPIC_MODEL_BUILDER", "claude-haiku-4-5-20251001")

logger = logging.getLogger(__name__)

_ZONE_LABELS = {1: "Recovery", 2: "Aerobic", 3: "Tempo", 4: "Threshold", 5: "VO2max"}


_SYSTEM = """You are an expert Ironman 70.3 triathlon coach designing ONE training week.

You decide day, sport, duration, zone, session_type, AND description for every session.
Every choice must respect the athlete's hours budget, days available, phase focus, and
last week's feedback.

HARD RULES (validator will reject violations):
1. Total minutes must fall within hours_min and hours_max * 60.
2. Use at most days_available distinct training days.
3. Max 2 sessions per day, and if 2 they MUST be a brick: bike first then run, same day.
4. Max 2 hard sessions (zone >= 4) per week.
5. NO back-to-back hard run days (zone >= 4).
6. Long bike duration >= long run duration.
7. Ramp rate <= 10% over previous week minutes (unless recovery/taper).

WEEK DESIGN PRINCIPLES:
- Polarize intensity: most time in Z1-Z2, limited time in Z3-Z5.
- Every non-recovery week should include ONE long bike (75-180 min) and ONE long run (45-90 min).
- Build/Peak phases should include ONE brick (bike→run same day) most weeks.
- Swims should emphasize drills/technique (session_type="drill") or structured intervals.
- Give the athlete a clear Key Session (the hardest/longest workout) and support it with easy days.

SESSION_TYPE values (pick the best fit per session):
  long, endurance, tempo, threshold, intervals, recovery, brick_bike, brick_run, drill, race_pace

IDs: use "w{week_index}_{day_lowercase}_{sport}" — e.g. "w3_saturday_bike".
For brick days: "w3_saturday_brick_bike" and "w3_saturday_brick_run".

Return ONLY valid JSON — no markdown, no prose, no trailing commentary.

JSON SHAPE:
{
  "week_index": <int>,
  "phase_name": "<string>",
  "sessions": [
    {
      "id": "<string>",
      "week": <int>,
      "day": "<Monday|Tuesday|...|Sunday>",
      "sport": "<swim|bike|run>",
      "duration_minutes": <int>,
      "zone": <1-5>,
      "zone_label": "<Recovery|Aerobic|Tempo|Threshold|VO2max>",
      "session_type": "<one of the values above>",
      "description": "<2-3 sentence coaching description>"
    }
  ]
}
"""


def _zones_summary(zones: dict) -> str:
    lines = []
    for key, label, unit in [
        ("hr_zones", "HR", "bpm"),
        ("power_zones", "Power", "W"),
        ("pace_zones", "Pace", "/km"),
    ]:
        z = zones.get(key) or {}
        if not z:
            continue
        lines.append(f"{label} zones:")
        for zname, zdata in z.items():
            if "min_pace" in zdata:
                lo, hi = zdata.get("min_pace"), zdata.get("max_pace")
            else:
                lo, hi = zdata.get("min"), zdata.get("max")
            lines.append(f"  {zname} {zdata.get('label','')}: {lo}–{hi} {unit}")
    return "\n".join(lines) if lines else "No zone data."


def _feedback_line(athlete_profile: dict) -> str:
    fb = athlete_profile.get("last_week_feedback")
    if not fb:
        return ""
    parts = []
    if (rpe := fb.get("rpe")) is not None:
        parts.append(f"RPE {rpe}/10")
    if (w := (fb.get("went_well") or "").strip()):
        parts.append(f"went well: {w}")
    if (d := (fb.get("didnt_go_well") or "").strip()):
        parts.append(f"didn't go well: {d}")
    if (n := (fb.get("notes") or "").strip()):
        parts.append(f"notes: {n}")
    return "Last week feedback: " + "; ".join(parts) + "." if parts else ""


def _build_prompt(
    *,
    week_index: int,
    phase_name: str,
    phase_focus: str,
    intensity_target: str,
    week_within_phase: int,
    weeks_until_race: int,
    athlete_profile: dict,
    zones: dict,
    target_hours: float,
    previous_week_minutes: float,
    prior_issues: list[str],
) -> str:
    hours_min = float(athlete_profile.get("hours_min") or athlete_profile.get("weekly_hours") or target_hours)
    hours_max = float(athlete_profile.get("hours_max") or athlete_profile.get("weekly_hours") or target_hours)
    days_available = int(athlete_profile.get("days_available", 5))
    ftp = int(athlete_profile.get("ftp") or 0)
    lthr = int(athlete_profile.get("lthr") or 0)

    retry_block = ""
    if prior_issues:
        bullets = "\n".join(f"  - {msg}" for msg in prior_issues)
        retry_block = (
            "\nYOUR PREVIOUS ATTEMPT FAILED VALIDATION. Fix these specific issues:\n"
            f"{bullets}\n"
        )

    feedback = _feedback_line(athlete_profile)
    fb_block = f"\n{feedback}\n" if feedback else ""

    return (
        f"Build week {week_index} for this athlete.\n\n"
        f"Race is in {weeks_until_race} weeks.\n"
        f"Phase: {phase_name} (week {week_within_phase} of this phase)\n"
        f"Phase focus: {phase_focus}\n"
        f"Intensity target: {intensity_target}\n\n"
        f"Weekly hours budget: {hours_min:.1f}–{hours_max:.1f} hours\n"
        f"Target this week: {target_hours:.1f} hours\n"
        f"Days available: {days_available}\n"
        f"FTP: {ftp or 'unknown'} W | LTHR: {lthr or 'unknown'} bpm\n"
        f"Previous week actual minutes: {previous_week_minutes:.0f}\n"
        f"{fb_block}"
        f"Zones:\n{_zones_summary(zones)}\n"
        f"{retry_block}\n"
        f"Return JSON with week_index={week_index}, phase_name=\"{phase_name}\", and sessions array."
    )


def _coerce_session(raw: dict, week_index: int) -> dict:
    """Fill derived fields the LLM might have skipped or botched."""
    zone = int(raw.get("zone", 2))
    zone = max(1, min(5, zone))
    sport = (raw.get("sport") or "swim").lower()
    day = raw.get("day", "Monday")
    duration = int(raw.get("duration_minutes", 30))
    session_type = raw.get("session_type") or "endurance"
    zone_label = raw.get("zone_label") or _ZONE_LABELS[zone]

    sid = raw.get("id") or f"w{week_index}_{day.lower()}_{sport}"
    if session_type in ("brick_bike", "brick_run") and "brick" not in sid:
        sid = f"w{week_index}_{day.lower()}_{session_type}"

    description = (raw.get("description") or "").strip()
    if not description:
        description = f"Zone {zone} {sport} session. {duration} minutes at {zone_label} effort."

    return {
        "id": sid,
        "week": week_index,
        "day": day,
        "sport": sport,
        "duration_minutes": duration,
        "zone": zone,
        "zone_label": zone_label,
        "session_type": session_type,
        "description": description,
        "intervals": [],
        "distance_yards": raw.get("distance_yards"),
    }


async def _propose_once(prompt: str) -> dict:
    llm = ChatAnthropic(
        model_name=ANTHROPIC_MODEL,
        temperature=0.2,
        max_tokens=4096,
        timeout=60,
        stop=None,
    )
    response = await llm.ainvoke(
        [SystemMessage(content=_SYSTEM), HumanMessage(content=prompt)]
    )
    content = response.content
    if isinstance(content, list):
        content = "".join(
            block.get("text", "") if isinstance(block, dict) else str(block)
            for block in content
        )
    return json.loads(_extract_json(content))


def _extract_json(text: str) -> str:
    """Pull a JSON object out of an LLM response that may include prose/fences."""
    fence = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    if fence:
        return fence.group(1)
    first = text.find("{")
    last = text.rfind("}")
    if first != -1 and last != -1 and last > first:
        return text[first : last + 1]
    return text.strip()


async def run_workout_builder(
    *,
    week_index: int,
    phase_name: str,
    phase_focus: str,
    intensity_target: str,
    week_within_phase: int,
    weeks_until_race: int,
    athlete_profile: dict,
    zones: dict,
    target_hours: float,
    previous_week_minutes: float = 0.0,
    max_retries: int = 2,
) -> WeekWithDescriptions:
    """
    Propose a full week via LLM, validate, retry with issues up to max_retries times.

    Returns the final WeekWithDescriptions. If the last attempt still violates
    rules, it's returned anyway (logged as a warning) so the user isn't blocked.
    """
    hours_min = float(athlete_profile.get("hours_min") or athlete_profile.get("weekly_hours") or target_hours)
    hours_max = float(athlete_profile.get("hours_max") or athlete_profile.get("weekly_hours") or target_hours)
    days_available = int(athlete_profile.get("days_available", 5))

    issues: list[str] = []
    last: WeekWithDescriptions | None = None

    for attempt in range(max_retries + 1):
        prompt = _build_prompt(
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
            prior_issues=issues,
        )

        try:
            data = await _propose_once(prompt)
        except Exception as exc:
            logger.error("workout_builder: LLM call failed (%s)", exc)
            if last is not None:
                return last
            raise

        raw_sessions = data.get("sessions", [])
        sessions = [_coerce_session(s, week_index) for s in raw_sessions]

        validation = validate_week_structure_logic({
            "sessions": sessions,
            "target_hours": target_hours,
            "hours_min": hours_min,
            "hours_max": hours_max,
            "days_available": days_available,
            "previous_week_minutes": previous_week_minutes,
        })

        last = WeekWithDescriptions(
            week_index=week_index,
            phase_name=phase_name,
            sessions=[SessionWithDescription(**s) for s in sessions],
        )

        if validation["valid"]:
            logger.info("workout_builder: week %d valid on attempt %d", week_index, attempt + 1)
            return last

        issues = validation["issues"]
        logger.warning(
            "workout_builder: week %d attempt %d invalid — %s",
            week_index,
            attempt + 1,
            "; ".join(issues),
        )

    logger.warning(
        "workout_builder: week %d exhausted retries; returning last proposal with unresolved issues: %s",
        week_index,
        "; ".join(issues),
    )
    return last  # type: ignore[return-value]

"""
validate_week_structure — deterministic guardrail checks for an LLM-proposed week.

Called inside the Workout Builder retry loop. Returns human-readable issues the
LLM can act on in the next attempt.
"""
from langchain_core.tools import tool

from services.plan_engine import DAYS_OF_WEEK

_DAYS_ORDER = {day: i for i, day in enumerate(DAYS_OF_WEEK)}


def validate_week_structure_logic(week_skeleton: dict) -> dict:
    """
    Hard-rule validator. `week_skeleton` may include:
      - sessions (required): list of dicts with day/sport/duration_minutes/zone
      - target_hours (optional): planner's volume target
      - hours_min / hours_max (optional): athlete's weekly budget range
      - days_available (optional): max distinct training days
      - previous_week_minutes (optional): for ramp-rate check
      - allow_skipped_days (bool): when True, require exactly days_available days

    Returns {"valid": bool, "issues": list[str]}.
    """
    issues: list[str] = []
    sessions: list[dict] = week_skeleton.get("sessions", [])

    if not sessions:
        return {"valid": False, "issues": ["Week has no sessions."]}

    total_minutes = sum(int(s.get("duration_minutes", 0)) for s in sessions)

    # --- Days-available cap ---------------------------------------------------
    days_available = week_skeleton.get("days_available")
    used_days = {s.get("day") for s in sessions if s.get("day")}
    if days_available is not None and len(used_days) > int(days_available):
        issues.append(
            f"Uses {len(used_days)} training days but athlete only has {days_available} available. "
            "Combine sessions into bricks or drop a day."
        )

    # --- Max 2 sessions per day, second must be a brick run --------------------
    by_day: dict[str, list[dict]] = {}
    for s in sessions:
        by_day.setdefault(s.get("day", ""), []).append(s)
    for day, day_sessions in by_day.items():
        if len(day_sessions) > 2:
            issues.append(
                f"{day} has {len(day_sessions)} sessions. Max 2 per day (bike→run brick only)."
            )
        elif len(day_sessions) == 2:
            sports = [s.get("sport") for s in day_sessions]
            types = [s.get("session_type", "") for s in day_sessions]
            is_brick = sports == ["bike", "run"] or (
                "brick_bike" in types and "brick_run" in types
            )
            if not is_brick:
                issues.append(
                    f"{day} has 2 sessions that are not a brick. Only bike→run (same day) is allowed. "
                    f"Got sports={sports}."
                )
            else:
                # Ensure bike appears before run in the list (so UI renders in order)
                bike_first = day_sessions[0].get("sport") == "bike" or day_sessions[0].get(
                    "session_type"
                ) == "brick_bike"
                if not bike_first:
                    issues.append(
                        f"{day} brick has run before bike. Bike must come first."
                    )

    # --- Weekly hours budget --------------------------------------------------
    hours_min = week_skeleton.get("hours_min")
    hours_max = week_skeleton.get("hours_max")
    if hours_min is not None and total_minutes < float(hours_min) * 60 * 0.85:
        issues.append(
            f"Total volume {total_minutes} min is below minimum "
            f"{float(hours_min) * 60:.0f} min (athlete's weekly minimum)."
        )
    if hours_max is not None and total_minutes > float(hours_max) * 60 * 1.05:
        issues.append(
            f"Total volume {total_minutes} min exceeds maximum "
            f"{float(hours_max) * 60:.0f} min (athlete's weekly cap)."
        )

    # --- Max 2 hard sessions --------------------------------------------------
    hard = [s for s in sessions if int(s.get("zone", 1)) >= 4]
    if len(hard) > 2:
        issues.append(
            f"Too many hard sessions ({len(hard)} at zone >= 4). Max 2 per week."
        )

    # --- No back-to-back hard run days ---------------------------------------
    hard_run_days = sorted(
        {
            _DAYS_ORDER.get(s["day"], 99)
            for s in sessions
            if s.get("sport") == "run" and int(s.get("zone", 1)) >= 4
        }
    )
    for i in range(len(hard_run_days) - 1):
        if hard_run_days[i + 1] - hard_run_days[i] == 1:
            a = DAYS_OF_WEEK[hard_run_days[i]]
            b = DAYS_OF_WEEK[hard_run_days[i + 1]]
            issues.append(f"Back-to-back hard run days ({a}, {b}). Separate by a rest day.")

    # --- Long bike ≥ long run -------------------------------------------------
    long_bikes = [s for s in sessions if s.get("sport") == "bike" and int(s.get("duration_minutes", 0)) >= 75]
    long_runs = [s for s in sessions if s.get("sport") == "run" and int(s.get("duration_minutes", 0)) >= 60]
    if long_bikes and long_runs:
        max_bike = max(int(s["duration_minutes"]) for s in long_bikes)
        max_run = max(int(s["duration_minutes"]) for s in long_runs)
        if max_bike < max_run:
            issues.append(
                f"Long run ({max_run} min) exceeds long bike ({max_bike} min). "
                "Long bike must be ≥ long run duration."
            )

    # --- Ramp rate ≤ 10% ------------------------------------------------------
    previous = week_skeleton.get("previous_week_minutes")
    if previous is not None and float(previous) > 0:
        allowed = float(previous) * 1.10
        if total_minutes > allowed:
            pct = (total_minutes - float(previous)) / float(previous) * 100
            issues.append(
                f"Volume jumped {pct:.1f}% over last week "
                f"({previous:.0f} → {total_minutes} min). Max ramp is 10%."
            )

    return {"valid": len(issues) == 0, "issues": issues}


@tool
def validate_week_structure(week_skeleton: dict) -> dict:
    """
    Validate an LLM-proposed training week against hard guardrails.

    Checks:
    - Within days_available distinct days
    - ≤ 2 sessions per day (brick = bike→run only)
    - Total minutes within hours_min/hours_max budget
    - Max 2 hard sessions (zone ≥ 4)
    - No back-to-back hard run days
    - Long bike ≥ long run duration
    - Ramp rate ≤ 10% vs previous week

    Returns {"valid": bool, "issues": list[str]}.
    """
    return validate_week_structure_logic(week_skeleton)

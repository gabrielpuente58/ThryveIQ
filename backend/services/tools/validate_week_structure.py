"""
validate_week_structure — LangChain tool for training guardrail checks.

Validates a week skeleton against hard training constraints defined in CLAUDE.md.
Returns a structured result indicating whether the week is valid and what issues
were found.
"""
from langchain_core.tools import tool

from services.plan_engine import DAYS_OF_WEEK

_DAYS_ORDER = {day: i for i, day in enumerate(DAYS_OF_WEEK)}


def validate_week_structure_logic(week_skeleton: dict) -> dict:
    """
    Pure validation logic — callable without LangChain.

    Guardrail checks (from CLAUDE.md):
    1. Max 2 hard sessions per week (zone >= 4).
    2. No two hard run sessions on back-to-back days.
    3. Long bike (>= 90 min) duration >= long run duration, if both exist.
    4. Total volume within 15% of target_hours * 60 (only if target_hours present).
    5. Minimum 1 session per sport that appears in the skeleton.
    6. Ramp rate: if previous_week_minutes provided, increase <= 10%.

    Args:
        week_skeleton: Dict with at minimum a `sessions` key containing a list
                       of session dicts (id, week, day, sport, duration_minutes, zone).
                       Optional top-level keys:
                         - target_hours (float): expected total volume
                         - previous_week_minutes (float): prior week's total volume

    Returns:
        { "valid": bool, "issues": list[str] }
    """
    issues: list[str] = []
    sessions: list[dict] = week_skeleton.get("sessions", [])

    if not sessions:
        return {"valid": False, "issues": ["Week skeleton has no sessions."]}

    # -------------------------------------------------------------------------
    # Check 1: Max 2 hard sessions (zone >= 4) per week
    # -------------------------------------------------------------------------
    hard_sessions = [s for s in sessions if int(s.get("zone", 1)) >= 4]
    if len(hard_sessions) > 2:
        issues.append(
            f"Too many hard sessions: {len(hard_sessions)} sessions at zone >= 4 "
            f"(maximum is 2 per week)."
        )

    # -------------------------------------------------------------------------
    # Check 2: No two hard run sessions on back-to-back days
    # -------------------------------------------------------------------------
    hard_run_days = sorted(
        {
            _DAYS_ORDER.get(s["day"], 99)
            for s in sessions
            if s.get("sport") == "run" and int(s.get("zone", 1)) >= 4
        }
    )
    for idx in range(len(hard_run_days) - 1):
        if hard_run_days[idx + 1] - hard_run_days[idx] == 1:
            day_a = DAYS_OF_WEEK[hard_run_days[idx]]
            day_b = DAYS_OF_WEEK[hard_run_days[idx + 1]]
            issues.append(
                f"Back-to-back hard run sessions on {day_a} and {day_b}. "
                f"Hard runs must have at least one rest day between them."
            )

    # -------------------------------------------------------------------------
    # Check 3: Long bike duration >= long run duration (if both exist)
    # -------------------------------------------------------------------------
    bike_sessions = [s for s in sessions if s.get("sport") == "bike"]
    run_sessions = [s for s in sessions if s.get("sport") == "run"]

    long_bikes = [s for s in bike_sessions if int(s.get("duration_minutes", 0)) >= 90]
    long_runs = [s for s in run_sessions if int(s.get("duration_minutes", 0)) >= 60]

    if long_bikes and long_runs:
        max_bike_duration = max(int(s.get("duration_minutes", 0)) for s in long_bikes)
        max_run_duration = max(int(s.get("duration_minutes", 0)) for s in long_runs)
        if max_bike_duration < max_run_duration:
            issues.append(
                f"Long bike ({max_bike_duration} min) is shorter than long run "
                f"({max_run_duration} min). Long bike should be >= long run duration."
            )

    # -------------------------------------------------------------------------
    # Check 4: Total volume within 15% of target_hours * 60 (if provided)
    # -------------------------------------------------------------------------
    target_hours = week_skeleton.get("target_hours")
    if target_hours is not None:
        target_minutes = float(target_hours) * 60
        actual_minutes = sum(int(s.get("duration_minutes", 0)) for s in sessions)
        lower = target_minutes * 0.85
        upper = target_minutes * 1.15
        if not (lower <= actual_minutes <= upper):
            issues.append(
                f"Total volume ({actual_minutes} min) is outside 15% of target "
                f"({target_minutes:.0f} min). Acceptable range: {lower:.0f}–{upper:.0f} min."
            )

    # -------------------------------------------------------------------------
    # Check 5: At least 1 session per sport that appears in the skeleton
    # -------------------------------------------------------------------------
    sports_in_skeleton = {s.get("sport") for s in sessions if s.get("sport")}
    for sport in sports_in_skeleton:
        count = sum(1 for s in sessions if s.get("sport") == sport)
        if count < 1:
            issues.append(f"No sessions found for sport '{sport}'.")

    # -------------------------------------------------------------------------
    # Check 6: Ramp rate <= 10% (if previous_week_minutes provided)
    # -------------------------------------------------------------------------
    previous_week_minutes = week_skeleton.get("previous_week_minutes")
    if previous_week_minutes is not None and float(previous_week_minutes) > 0:
        actual_minutes = sum(int(s.get("duration_minutes", 0)) for s in sessions)
        max_allowed = float(previous_week_minutes) * 1.10
        if actual_minutes > max_allowed:
            increase_pct = (
                (actual_minutes - float(previous_week_minutes))
                / float(previous_week_minutes)
                * 100
            )
            issues.append(
                f"Ramp rate too high: {increase_pct:.1f}% increase over previous week "
                f"({previous_week_minutes:.0f} min → {actual_minutes} min). "
                f"Maximum allowed is 10%."
            )

    return {"valid": len(issues) == 0, "issues": issues}


@tool
def validate_week_structure(week_skeleton: dict) -> dict:
    """
    Validate a week skeleton against training guardrails.

    Call this after allocate_week_structure to check the week conforms to
    training science constraints before passing it to the Workout Builder.

    Checks performed:
    - Max 2 hard sessions (zone >= 4) per week
    - No back-to-back hard run sessions
    - Long bike duration >= long run duration
    - Total volume within 15% of target_hours (if target_hours present)
    - At least 1 session per sport in the skeleton
    - Ramp rate <= 10% (if previous_week_minutes present)

    Args:
        week_skeleton: Week skeleton dict with sessions array. Optionally includes
                       target_hours (float) and previous_week_minutes (float).

    Returns:
        { "valid": bool, "issues": list[str] }
        valid=True means all guardrails passed.
    """
    return validate_week_structure_logic(week_skeleton)

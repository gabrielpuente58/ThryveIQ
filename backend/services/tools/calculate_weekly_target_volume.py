"""
calculate_weekly_target_volume — LangChain tool for weekly volume targeting.

Applies ramp rate rules, recovery week logic, and taper reduction to determine
the target training volume for a specific week within a training phase.
"""
from langchain_core.tools import tool


def calculate_weekly_target_volume_math(
    week_index: int,
    phase_name: str,
    base_weekly_hours: float,
    previous_week_hours: float = 0.0,
) -> dict:
    """
    Pure math for weekly target volume — callable without LangChain.

    Rules applied in priority order:
    1. Recovery week (week_index % 4 == 0): target = base * 0.6
    2. Taper phase week 1: target = base * 0.55
    3. Taper phase week 2+: target = base * 0.40
    4. First week of any phase (previous_week_hours == 0): use base directly
    5. Normal week: min(base, previous * 1.08) — cap ramp at 8%

    Args:
        week_index:          1-based global week index (across the full plan).
        phase_name:          Phase name, e.g. 'Base', 'Build', 'Peak', 'Taper'.
        base_weekly_hours:   Athlete's stated maximum weekly training hours.
        previous_week_hours: Actual hours from the prior week (0.0 if first week).

    Returns:
        dict with:
          target_hours (float, 1 decimal),
          target_minutes (int),
          is_recovery_week (bool),
          ramp_note (str explaining which rule applied)
    """
    phase_lower = phase_name.strip().lower()
    is_taper = phase_lower == "taper"

    # Recovery week: every 4th week regardless of phase
    is_recovery_week = (week_index % 4 == 0) and not is_taper

    if is_recovery_week:
        target_hours = base_weekly_hours * 0.6
        ramp_note = f"Recovery week (week {week_index} is a 3:1 deload — 60% of base)"
    elif is_taper:
        # Taper phases rarely exceed 2 weeks, so treat week_index within taper:
        # Week 1 of taper = 55%, all subsequent = 40%.
        # Since we only know the global week_index here, we use a simple heuristic:
        # if previous_week_hours is at or above taper week 1 level (>= 55% of base),
        # it's the first taper week; otherwise it's a subsequent taper week.
        if previous_week_hours == 0.0 or previous_week_hours >= base_weekly_hours * 0.56:
            target_hours = base_weekly_hours * 0.55
            ramp_note = "Taper phase week 1 — 55% of base volume"
        else:
            target_hours = base_weekly_hours * 0.40
            ramp_note = "Taper phase week 2+ — 40% of base volume"
    elif previous_week_hours == 0.0:
        # First week of a phase — use base directly, no ramp constraint
        target_hours = base_weekly_hours
        ramp_note = "First week of phase — using base weekly hours directly"
    else:
        # Normal progressive week: cap volume increase at 8%
        max_allowed = previous_week_hours * 1.08
        target_hours = min(base_weekly_hours, max_allowed)
        if target_hours < base_weekly_hours:
            ramp_note = (
                f"Ramp cap applied — limited to 8% over previous "
                f"({previous_week_hours:.1f}h → {target_hours:.1f}h)"
            )
        else:
            ramp_note = f"Normal progressive week — at base ({base_weekly_hours:.1f}h)"

    target_hours = round(target_hours, 1)
    target_minutes = int(target_hours * 60)

    return {
        "target_hours": target_hours,
        "target_minutes": target_minutes,
        "is_recovery_week": is_recovery_week,
        "ramp_note": ramp_note,
    }


@tool
def calculate_weekly_target_volume(
    week_index: int,
    phase_name: str,
    base_weekly_hours: float,
    previous_week_hours: float = 0.0,
) -> dict:
    """
    Calculate target training volume for a specific week.
    Applies ramp rate rules, recovery week logic, and taper reduction.

    Call this when building a week skeleton to determine how many total
    training minutes the athlete should complete that week.

    Args:
        week_index:          1-based global week index across the full plan.
        phase_name:          Training phase: 'Base', 'Build', 'Peak', or 'Taper'.
        base_weekly_hours:   Athlete's maximum weekly training hours from guide rails.
        previous_week_hours: Hours completed in the prior week (0.0 for first week).

    Returns:
        dict with target_hours (float), target_minutes (int),
        is_recovery_week (bool), ramp_note (str).
    """
    return calculate_weekly_target_volume_math(
        week_index=week_index,
        phase_name=phase_name,
        base_weekly_hours=base_weekly_hours,
        previous_week_hours=previous_week_hours,
    )

"""
allocate_week_structure — LangChain tool for building a week skeleton.

Takes a phase blueprint template and athlete constraints to produce a fully
structured week skeleton: sessions with day, sport, duration, zone, and id
assigned. No descriptions — that is the Workout Builder Agent's job.
"""
from langchain_core.tools import tool

from services.plan_engine import (
    DAYS_OF_WEEK,
    ZONE_LABELS,
    _assign_zone,
    _compute_week_durations,
)

# Sport weight used for duration budgeting (bike longer, swim shorter)
_SPORT_WEIGHT = {"swim": 0.75, "bike": 1.25, "run": 1.0}

# Days used for scheduling (Mon–Sun)
_DAYS = DAYS_OF_WEEK  # ["Monday", "Tuesday", ..., "Sunday"]


def _build_session_list(weekly_structure_template: dict) -> list[str]:
    """
    Expand the template dict into an ordered list of sport strings.

    E.g. {"swim": 2, "bike": 3, "run": 3} → ["swim","swim","bike","bike","bike","run","run","run"]
    Order: bike first (longest), then run, then swim — interleaved for variety.
    """
    sports_expanded: list[str] = []
    for sport in ("bike", "run", "swim"):
        count = weekly_structure_template.get(sport, 0)
        sports_expanded.extend([sport] * count)
    return sports_expanded


def _interleave_sports(sports: list[str]) -> list[str]:
    """
    Interleave sport repetitions so the same sport isn't back-to-back where possible.

    Uses a round-robin bucket approach similar to plan_engine._distribute_sports.
    """
    from collections import Counter, deque

    count = Counter(sports)
    # Build sorted buckets by descending frequency to always pull most frequent first
    buckets: dict[str, deque] = {
        sport: deque([sport] * n) for sport, n in count.items()
    }
    order = sorted(count.keys(), key=lambda s: -count[s])

    result: list[str] = []
    while any(buckets[s] for s in order):
        for s in order:
            if buckets[s]:
                result.append(buckets[s].popleft())

    return result


def _assign_days(
    interleaved: list[str],
    days_available: int,
    target_hours: float,
) -> list[dict]:
    """
    Assign sessions to days of the week.

    Rules:
    - Use the first `days_available` days of the week.
    - Long sessions (bike ≥ estimated 90 min, run ≥ estimated 60 min) prefer
      Saturday / Sunday. We approximate "long" as the last bike and last run
      in the list.
    - If total sessions exceed days_available, allow 2-a-days on later days
      (capped at 1.5x days_available).
    Returns list of (day_index, sport) assignment dicts.
    """
    available_days = _DAYS[:days_available]  # e.g. Mon–Fri for days_available=5
    max_slots = int(days_available * 1.5)
    sessions_to_assign = interleaved[:max_slots]

    # Identify which session indices are "long" (last bike + last run)
    long_indices: set[int] = set()
    last_bike = None
    last_run = None
    for i, sport in enumerate(sessions_to_assign):
        if sport == "bike":
            last_bike = i
        elif sport == "run":
            last_run = i
    if last_bike is not None:
        long_indices.add(last_bike)
    if last_run is not None:
        long_indices.add(last_run)

    # Preferred days for long sessions: Saturday (index 5) and Sunday (index 6)
    # Only if those days are available
    weekend_days = [d for d in ["Saturday", "Sunday"] if d in available_days]
    weekday_days = [d for d in available_days if d not in weekend_days]

    # First-pass: assign non-long sessions to weekdays, long to weekends
    assignments: list[dict] = []
    day_usage: dict[str, int] = {d: 0 for d in available_days}

    long_sessions = [(i, s) for i, s in enumerate(sessions_to_assign) if i in long_indices]
    normal_sessions = [(i, s) for i, s in enumerate(sessions_to_assign) if i not in long_indices]

    def _next_day(preferred: list[str]) -> str | None:
        """Return the next day with the fewest sessions from the preferred list."""
        candidates = [(day_usage.get(d, 0), d) for d in preferred if d in day_usage]
        if not candidates:
            return None
        candidates.sort()
        return candidates[0][1]

    # Assign long sessions to weekends first, fall back to weekdays
    for _i, sport in long_sessions:
        day = _next_day(weekend_days) or _next_day(weekday_days)
        if day:
            assignments.append({"day": day, "sport": sport, "is_long": True})
            day_usage[day] += 1

    # Assign normal sessions to weekdays first, fall back to weekends
    for _i, sport in normal_sessions:
        day = _next_day(weekday_days) or _next_day(weekend_days)
        if day:
            assignments.append({"day": day, "sport": sport, "is_long": False})
            day_usage[day] += 1

    # Sort by canonical day order for readability
    day_order = {d: i for i, d in enumerate(_DAYS)}
    assignments.sort(key=lambda a: (day_order.get(a["day"], 99), a["sport"]))

    return assignments


def allocate_week_structure_logic(
    week_index: int,
    phase_name: str,
    weekly_structure_template: dict,
    target_hours: float,
    days_available: int,
    strongest_discipline: str,
    weakest_discipline: str,
) -> dict:
    """
    Pure logic for building a week skeleton — callable without LangChain.

    Args:
        week_index:                 1-based global week index.
        phase_name:                 Training phase name (e.g. 'Base').
        weekly_structure_template:  Sport → session count from PhaseBlueprint.
        target_hours:               Target total training hours for the week.
        days_available:             Number of days athlete can train (1–7).
        strongest_discipline:       Athlete's strongest sport (swim/bike/run).
        weakest_discipline:         Athlete's weakest sport (swim/bike/run).

    Returns:
        week_skeleton dict with week_index, phase_name, target_hours, and sessions list.
        Each session: { id, week, day, sport, duration_minutes, zone, zone_label }
        NO description field — that is the Workout Builder's responsibility.
    """
    is_recovery_week = (week_index % 4 == 0)

    # Build full sport list from template
    all_sports = _build_session_list(weekly_structure_template)
    total_from_template = len(all_sports)

    if total_from_template == 0:
        # Fallback: default template if none provided
        all_sports = ["swim", "bike", "run"]
        total_from_template = 3

    # Cap at 1.5x days_available
    max_sessions = max(days_available, int(days_available * 1.5))
    if total_from_template > max_sessions:
        # Scale down proportionally
        scale = max_sessions / total_from_template
        scaled_template: dict[str, int] = {}
        for sport, count in weekly_structure_template.items():
            scaled_template[sport] = max(1, round(count * scale))
        all_sports = _build_session_list(scaled_template)

    # Interleave sports
    interleaved = _interleave_sports(all_sports)

    # Assign sessions to days
    day_assignments = _assign_days(interleaved, days_available, target_hours)

    # Assign zones (polarized model) using plan_engine._assign_zone
    total_sessions = len(day_assignments)
    zones = [
        _assign_zone(i, total_sessions, is_recovery_week)
        for i in range(total_sessions)
    ]

    # Compute durations using plan_engine._compute_week_durations
    sport_order = [a["sport"] for a in day_assignments]
    durations = _compute_week_durations(sport_order, target_hours, zones)

    # Build session dicts — track day counter for id generation
    day_counter: dict[str, int] = {}
    sessions: list[dict] = []

    for i, (assignment, zone, duration) in enumerate(
        zip(day_assignments, zones, durations)
    ):
        sport = assignment["sport"]
        day = assignment["day"]

        # Count sessions per day for 2-a-day suffix
        day_counter[day] = day_counter.get(day, 0) + 1
        count_on_day = day_counter[day]

        day_index = _DAYS.index(day) + 1  # 1-based
        if count_on_day == 1:
            session_id = f"w{week_index}_d{day_index}_{sport}"
        else:
            session_id = f"w{week_index}_d{day_index}_{sport}_{count_on_day}"

        sessions.append({
            "id": session_id,
            "week": week_index,
            "day": day,
            "sport": sport,
            "duration_minutes": duration,
            "zone": zone,
            "zone_label": ZONE_LABELS[zone],
        })

    return {
        "week_index": week_index,
        "phase_name": phase_name,
        "target_hours": target_hours,
        "sessions": sessions,
    }


@tool
def allocate_week_structure(
    week_index: int,
    phase_name: str,
    weekly_structure_template: dict,
    target_hours: float,
    days_available: int,
    strongest_discipline: str,
    weakest_discipline: str,
) -> dict:
    """
    Build a week skeleton from a phase blueprint template.

    Returns a week_skeleton dict with a sessions array. Sessions have structural
    fields (id, week, day, sport, duration_minutes, zone, zone_label) already set.
    No descriptions — those are added by the Workout Builder Agent.

    Args:
        week_index:                1-based global week index across the full plan.
        phase_name:                Training phase: 'Base', 'Build', 'Peak', 'Taper'.
        weekly_structure_template: Sessions per sport from PhaseBlueprint,
                                   e.g. {"swim": 2, "bike": 3, "run": 3}.
        target_hours:              Target total training hours from calculate_weekly_target_volume.
        days_available:            Days athlete can train per week (from guide rails).
        strongest_discipline:      Athlete's best sport ('swim', 'bike', or 'run').
        weakest_discipline:        Athlete's worst sport — gets more sessions/volume.

    Returns:
        week_skeleton dict with week_index, phase_name, target_hours, and sessions list.
    """
    return allocate_week_structure_logic(
        week_index=week_index,
        phase_name=phase_name,
        weekly_structure_template=weekly_structure_template,
        target_hours=target_hours,
        days_available=days_available,
        strongest_discipline=strongest_discipline,
        weakest_discipline=weakest_discipline,
    )

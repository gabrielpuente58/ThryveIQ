import math
from datetime import date, datetime

DAYS_OF_WEEK = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

ZONE_LABELS = {
    1: "Recovery",
    2: "Aerobic",
    3: "Tempo",
    4: "Threshold",
    5: "VO2max",
}

PLACEHOLDER_DESCRIPTIONS = {
    ("swim", 1): "Easy recovery swim. Focus on smooth technique and relaxed breathing.",
    ("swim", 2): "Aerobic swim. Focus on bilateral breathing and a long catch. Keep effort conversational.",
    ("swim", 3): "Tempo swim. Maintain steady effort with good form. Push pace slightly above comfortable.",
    ("swim", 4): "Threshold swim intervals. Hard effort with structured rest. Focus on holding pace.",
    ("swim", 5): "VO2max swim set. Short, fast repeats with full recovery between efforts.",
    ("bike", 1): "Easy recovery spin. Keep cadence light and legs loose.",
    ("bike", 2): "Aerobic endurance ride. Steady effort, should be able to hold a conversation.",
    ("bike", 3): "Tempo ride. Maintain steady power in Zone 3. Practice race-day nutrition.",
    ("bike", 4): "Threshold intervals on the bike. Sustained hard effort near FTP.",
    ("bike", 5): "VO2max bike intervals. Short, maximal efforts with recovery between.",
    ("run", 1): "Easy recovery jog. Keep it very relaxed, walk breaks are fine.",
    ("run", 2): "Easy aerobic run. Conversational pace, focus on cadence ~170-180 spm.",
    ("run", 3): "Tempo run. Comfortably hard effort, steady pace throughout.",
    ("run", 4): "Threshold run intervals. Hard effort at lactate threshold pace.",
    ("run", 5): "VO2max run repeats. Fast intervals with full recovery.",
}


def _weeks_until_race(race_date: date) -> int:
    today = date.today()
    delta = race_date - today
    return max(1, delta.days // 7)


def _assign_zone(session_index: int, total_sessions: int, is_recovery_week: bool) -> int:
    if is_recovery_week:
        return 1 if session_index % 3 == 0 else 2

    # Polarized: ~70% Z1-2, ~20% Z3, ~10% Z4-5
    ratio = session_index / max(total_sessions, 1)
    if ratio < 0.70:
        return 2
    elif ratio < 0.90:
        return 3
    else:
        return 4


def _distribute_sports(days_available: int, strongest: str, weakest: str) -> list[str]:
    sports = ["swim", "bike", "run"]
    middle = [s for s in sports if s != strongest and s != weakest][0]

    # Base distribution: equal split
    base_per_sport = days_available / 3

    # Weakest gets ~20% more, strongest gets ~20% less
    weakest_count = math.ceil(base_per_sport * 1.2)
    strongest_count = max(1, math.floor(base_per_sport * 0.8))
    middle_count = max(1, days_available - weakest_count - strongest_count)

    distribution = (
        [weakest] * weakest_count
        + [middle] * middle_count
        + [strongest] * strongest_count
    )

    # Trim or pad to match days_available
    distribution = distribution[:days_available]
    while len(distribution) < days_available:
        distribution.append(weakest)

    # Interleave so same sport isn't back to back
    result = []
    buckets = {weakest: [], middle: [], strongest: []}
    for s in distribution:
        buckets[s].append(s)

    while any(buckets[s] for s in buckets):
        for s in [weakest, middle, strongest]:
            if buckets[s]:
                result.append(buckets[s].pop())

    return result[:days_available]


def _compute_week_durations(
    sport_order: list[str], weekly_hours: float, zones: list[int]
) -> list[int]:
    """Compute durations for a week's sessions that sum to weekly_hours."""
    # Relative weights: bike longer, swim shorter, zone affects length
    sport_weight = {"swim": 0.75, "bike": 1.25, "run": 1.0}
    zone_weight = {1: 0.7, 2: 1.0, 3: 0.85, 4: 0.7, 5: 0.55}

    raw_weights = []
    for sport, zone in zip(sport_order, zones):
        w = sport_weight.get(sport, 1.0) * zone_weight.get(zone, 1.0)
        raw_weights.append(w)

    total_weight = sum(raw_weights)
    total_minutes = weekly_hours * 60

    durations = []
    for w in raw_weights:
        minutes = (w / total_weight) * total_minutes
        # Round to nearest 5, min 20, max 180
        rounded = max(20, min(180, round(minutes / 5) * 5))
        durations.append(rounded)

    return durations


def generate_plan(profile: dict) -> dict:
    race_date = profile["race_date"]
    if isinstance(race_date, str):
        race_date = date.fromisoformat(race_date)

    weeks = _weeks_until_race(race_date)
    days_available = profile["days_available"]
    weekly_hours = profile["weekly_hours"]
    strongest = profile["strongest_discipline"]
    weakest = profile["weakest_discipline"]

    sessions = []

    for week_num in range(1, weeks + 1):
        # 3-week build, 1-week recovery
        is_recovery = week_num % 4 == 0

        # Recovery weeks: reduce volume
        week_hours = weekly_hours * 0.6 if is_recovery else weekly_hours

        sport_order = _distribute_sports(days_available, strongest, weakest)
        training_days = DAYS_OF_WEEK[:days_available]

        # Pre-compute zones for the week so we can budget durations
        week_zones = [
            _assign_zone(i, days_available, is_recovery)
            for i in range(days_available)
        ]
        week_durations = _compute_week_durations(sport_order, week_hours, week_zones)

        for day_index, (day_name, sport) in enumerate(zip(training_days, sport_order)):
            zone = week_zones[day_index]
            duration = week_durations[day_index]
            description = PLACEHOLDER_DESCRIPTIONS.get(
                (sport, zone),
                f"Zone {zone} {sport} session. Maintain target intensity throughout."
            )

            session_id = f"w{week_num}_d{day_index + 1}_{sport}"

            sessions.append({
                "id": session_id,
                "week": week_num,
                "day": day_name,
                "sport": sport,
                "duration_minutes": duration,
                "zone": zone,
                "zone_label": ZONE_LABELS[zone],
                "description": description,
            })

    return {
        "weeks_until_race": weeks,
        "sessions": sessions,
    }

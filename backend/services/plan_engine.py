DAYS_OF_WEEK = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

ZONE_LABELS = {
    1: "Recovery",
    2: "Aerobic",
    3: "Tempo",
    4: "Threshold",
    5: "VO2max",
}


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


def _compute_week_durations(
    sport_order: list[str], weekly_hours: float, zones: list[int]
) -> list[int]:
    """Compute durations for a week's sessions that sum to weekly_hours."""
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
        rounded = max(20, min(180, round(minutes / 5) * 5))
        durations.append(rounded)

    return durations

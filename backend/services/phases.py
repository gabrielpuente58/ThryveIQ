from datetime import date


def calculate_phases(race_date_str: str) -> list[dict]:
    """Calculate training phases based on weeks until race.

    Phase distribution:
    - Taper: always 2 weeks (final weeks before race)
    - Peak: 2-3 weeks before taper
    - Build: ~35% of remaining weeks
    - Base: everything else (largest block)

    For short timelines (<8 weeks), compress phases.
    """
    race_date = date.fromisoformat(race_date_str) if isinstance(race_date_str, str) else race_date_str
    total_weeks = max(1, (race_date - date.today()).days // 7)

    if total_weeks <= 4:
        # Very short: just base + taper
        return [
            {"name": "Base", "weeks": max(1, total_weeks - 1), "start_week": 1,
             "end_week": max(1, total_weeks - 1), "focus": "Build aerobic fitness and technique"},
            {"name": "Taper", "weeks": 1, "start_week": total_weeks,
             "end_week": total_weeks, "focus": "Reduce volume, stay sharp for race day"},
        ]

    if total_weeks <= 8:
        # Short: base + build + taper
        taper = 1
        build = max(2, total_weeks // 3)
        base = total_weeks - build - taper
        phases = []
        week = 1
        for name, length, focus in [
            ("Base", base, "Build aerobic endurance and technique foundations"),
            ("Build", build, "Increase intensity, add race-pace work and longer sessions"),
            ("Taper", taper, "Reduce volume, maintain intensity, prepare for race day"),
        ]:
            phases.append({"name": name, "weeks": length, "start_week": week,
                          "end_week": week + length - 1, "focus": focus})
            week += length
        return phases

    # Standard distribution for 9+ weeks
    taper = 2
    peak = min(3, max(2, total_weeks // 8))
    remaining = total_weeks - taper - peak
    build = max(3, round(remaining * 0.4))
    base = remaining - build

    phases = []
    week = 1
    for name, length, focus in [
        ("Base", base, "Build aerobic endurance, technique, and consistency across all three disciplines"),
        ("Build", build, "Increase intensity and volume progressively, add race-specific workouts"),
        ("Peak", peak, "Highest intensity block, race simulations, fine-tune pacing"),
        ("Taper", taper, "Reduce volume by 40-60%, maintain intensity, rest and prepare for race day"),
    ]:
        phases.append({
            "name": name,
            "weeks": length,
            "start_week": week,
            "end_week": week + length - 1,
            "focus": focus,
        })
        week += length

    return phases

"""
workout_structure.py — Deterministic interval builder for triathlon sessions.

Generates structured workout intervals based on sport, zone, duration,
distance (swim), and athlete experience level. No LLM required.

Each interval dict:
  label           str
  reps            int
  duration_minutes float | None
  distance_yards  int | None
  zone            int
  metric          str   — effort/intensity cue
  rest_seconds    int
  notes           str
"""
from __future__ import annotations
from typing import Optional

_HR = {
    1: "HR < 130 bpm",
    2: "HR 130–145 bpm",
    3: "HR 145–158 bpm",
    4: "HR 158–168 bpm",
    5: "HR > 168 bpm",
}
_POWER = {
    1: "< 56% FTP — easy spin",
    2: "56–75% FTP — aerobic",
    3: "76–90% FTP — tempo",
    4: "91–105% FTP — threshold",
    5: "106–120% FTP — VO2max",
}
_RUN_EFFORT = {
    1: "walk/jog, very easy",
    2: "easy, fully conversational",
    3: "comfortably hard, short phrases",
    4: "hard, few words at a time",
    5: "near max, breathing hard",
}
_SWIM_PACE = {
    1: "easy, relaxed stroke",
    2: "aerobic, breathing every 3",
    3: "tempo, 85% effort",
    4: "threshold, 90–95% effort",
    5: "sprint, maximum",
}
_DRILLS = ["Catch-Up Drill", "Fingertip Drag", "Pull Buoy", "Kick Set", "Bilateral Breathing"]


def _iv(label: str, *, zone: int = 2, reps: int = 1,
        dur: Optional[float] = None, dist: Optional[int] = None,
        metric: str = "", rest: int = 0, notes: str = "") -> dict:
    return {"label": label, "reps": reps, "duration_minutes": dur,
            "distance_yards": dist, "zone": zone, "metric": metric,
            "rest_seconds": rest, "notes": notes}


def _scale(exp: str, beg: int, rec: int, comp: int) -> int:
    return comp if exp == "competitive" else beg if exp == "first_timer" else rec


# ── Run ──────────────────────────────────────────────────────────────────────

def _run(zone: int, mins: int, exp: str) -> list[dict]:
    ez = min(zone, 3) if exp == "first_timer" else zone
    wu = 10 if mins >= 40 else 5
    cd = 10 if mins >= 50 else 5
    main = max(10, mins - wu - cd)

    if ez <= 1:
        return [
            _iv("Warmup Walk/Jog", zone=1, dur=5.0, metric=_HR[1]),
            _iv("Easy Run", zone=1, dur=float(max(10, mins - 10)), metric=f"{_HR[1]} — {_RUN_EFFORT[1]}"),
            _iv("Cooldown Walk", zone=1, dur=5.0, metric="Walk, HR < 120 bpm"),
        ]
    if ez == 2:
        return [
            _iv("Warmup", zone=1, dur=float(wu), metric=f"{_HR[1]} — easy jog"),
            _iv("Aerobic Run", zone=2, dur=float(main), metric=f"{_HR[2]} — {_RUN_EFFORT[2]}"),
            _iv("Cooldown", zone=1, dur=float(cd), metric="Easy jog, HR drops naturally"),
        ]
    if ez == 3:
        reps = _scale(exp, 2, 2, 3)
        block = max(6, min(12, main // (reps + 1)))
        rest_s = _scale(exp, 120, 120, 90)
        return [
            _iv("Warmup", zone=1, dur=float(wu), metric=f"{_HR[1]}–{_HR[2]}"),
            _iv("Tempo Block", zone=3, reps=reps, dur=float(block),
                metric=f"{_HR[3]} — {_RUN_EFFORT[3]}", rest=rest_s,
                notes=f"{rest_s}s easy jog between blocks"),
            _iv("Cooldown", zone=1, dur=float(cd), metric="Easy jog/walk"),
        ]
    if ez == 4:
        reps = _scale(exp, 3, 3, 4)
        block = max(6, min(10, main // (reps * 2)))
        rest_s = _scale(exp, 150, 120, 90)
        return [
            _iv("Warmup", zone=1, dur=float(wu), metric=f"{_HR[1]}–{_HR[2]}"),
            _iv("Threshold Interval", zone=4, reps=reps, dur=float(block),
                metric=f"{_HR[4]} — {_RUN_EFFORT[4]}", rest=rest_s,
                notes=f"{rest_s}s easy recovery jog"),
            _iv("Cooldown", zone=1, dur=float(cd), metric="Easy jog, focus on breathing"),
        ]
    # z5
    reps = _scale(exp, 5, 5, 6)
    block = max(2, min(4, main // (reps * 2)))
    rest_s = _scale(exp, 210, 180, 150)
    return [
        _iv("Warmup", zone=1, dur=float(wu), metric=f"{_HR[1]}–{_HR[2]}"),
        _iv("VO2max Interval", zone=5, reps=reps, dur=float(block),
            metric=f"{_HR[5]} — {_RUN_EFFORT[5]}", rest=rest_s,
            notes=f"Full {rest_s}s recovery — quality over quantity"),
        _iv("Cooldown", zone=1, dur=float(cd), metric="Easy jog/walk"),
    ]


# ── Bike ─────────────────────────────────────────────────────────────────────

def _bike(zone: int, mins: int, exp: str) -> list[dict]:
    ez = min(zone, 3) if exp == "first_timer" else zone
    wu = 10 if mins >= 45 else 8
    cd = 10 if mins >= 60 else 8
    main = max(10, mins - wu - cd)

    if ez <= 1:
        return [_iv("Easy Spin", zone=1, dur=float(mins), metric=_POWER[1],
                    notes="Flat road or trainer, cadence 85–95 rpm")]
    if ez == 2:
        return [
            _iv("Warmup", zone=1, dur=float(wu), metric=_POWER[1]),
            _iv("Aerobic Ride", zone=2, dur=float(main), metric=_POWER[2],
                notes="Steady effort, cadence 85–95 rpm"),
            _iv("Cooldown", zone=1, dur=float(cd), metric="Easy spin"),
        ]
    if ez == 3:
        reps = _scale(exp, 2, 2, 3)
        block = max(12, min(20, main // (reps + 1)))
        rest_s = 300
        return [
            _iv("Warmup", zone=1, dur=float(wu), metric=_POWER[1]),
            _iv("Tempo Block", zone=3, reps=reps, dur=float(block),
                metric=_POWER[3], rest=rest_s,
                notes=f"{rest_s // 60}min easy spin between blocks"),
            _iv("Cooldown", zone=1, dur=float(cd), metric="Easy spin"),
        ]
    if ez == 4:
        reps = _scale(exp, 3, 3, 4)
        block = max(8, min(12, main // (reps * 2)))
        rest_s = _scale(exp, 360, 300, 240)
        return [
            _iv("Warmup", zone=1, dur=float(wu), metric=_POWER[1]),
            _iv("FTP Interval", zone=4, reps=reps, dur=float(block),
                metric=_POWER[4], rest=rest_s,
                notes=f"{rest_s // 60}min easy spin recovery — hold power steady"),
            _iv("Cooldown", zone=1, dur=float(cd), metric="Easy spin"),
        ]
    # z5
    reps = _scale(exp, 5, 5, 6)
    block = max(3, min(5, main // (reps * 2)))
    rest_s = _scale(exp, 300, 240, 180)
    return [
        _iv("Warmup", zone=1, dur=float(wu), metric=_POWER[1]),
        _iv("VO2max Effort", zone=5, reps=reps, dur=float(block),
            metric=_POWER[5], rest=rest_s,
            notes="Full gas — full recovery between each effort"),
        _iv("Cooldown", zone=1, dur=float(cd), metric="Easy spin"),
    ]


# ── Swim ─────────────────────────────────────────────────────────────────────

def _swim(zone: int, dist: Optional[int], mins: int, exp: str) -> list[dict]:
    ez = min(zone, 3) if exp == "first_timer" else zone
    total = dist or (mins * 40)
    drill = _DRILLS[min(ez - 1, 4)]

    if ez <= 1:
        wu = min(200, total // 5)
        cd = min(200, total // 5)
        return [
            _iv("Warmup", zone=1, dist=wu, metric=_SWIM_PACE[1]),
            _iv(drill, zone=1, reps=4, dist=50, metric="Focus on form", rest=20),
            _iv("Easy Freestyle", zone=1, dist=max(100, total - wu - 200 - cd), metric=_SWIM_PACE[1]),
            _iv("Cooldown", zone=1, dist=cd, metric="Easy backstroke or freestyle"),
        ]

    wu = min(300, total // 6)
    cd = min(200, total // 8)
    drills_total = 4 * 50
    remaining = max(100, total - wu - drills_total - cd)

    if ez == 2:
        i_dist = _scale(exp, 75, 100, 100)
        reps = max(2, remaining // i_dist)
        return [
            _iv("Warmup", zone=1, dist=wu, metric=_SWIM_PACE[1]),
            _iv(drill, zone=1, reps=4, dist=50, metric="Technique focus", rest=20),
            _iv("Aerobic Set", zone=2, reps=reps, dist=i_dist,
                metric=f"{_SWIM_PACE[2]} — 15s rest", rest=15),
            _iv("Cooldown", zone=1, dist=cd, metric="Easy choice of stroke"),
        ]
    if ez == 3:
        i_dist = _scale(exp, 150, 200, 300)
        reps = max(2, remaining // i_dist)
        return [
            _iv("Warmup", zone=1, dist=wu, metric=_SWIM_PACE[1]),
            _iv("Pull Buoy Drill", zone=1, reps=4, dist=50, metric="High elbow catch", rest=20),
            _iv("Tempo Set", zone=3, reps=reps, dist=i_dist,
                metric=f"{_SWIM_PACE[3]} — 30s rest", rest=30),
            _iv("Cooldown", zone=1, dist=cd, metric="Easy backstroke"),
        ]
    if ez == 4:
        i_dist = _scale(exp, 100, 100, 150)
        reps = max(3, remaining // i_dist)
        return [
            _iv("Warmup", zone=1, dist=wu, metric=_SWIM_PACE[1]),
            _iv(drill, zone=1, reps=4, dist=50, metric="Activate before hard effort", rest=20),
            _iv("Threshold Set", zone=4, reps=reps, dist=i_dist,
                metric=f"{_SWIM_PACE[4]} — 20s rest", rest=20,
                notes="Hold consistent pace across all reps"),
            _iv("Cooldown", zone=1, dist=cd, metric="Easy, recovery focus"),
        ]
    # z5
    reps = _scale(exp, 6, 8, 10)
    return [
        _iv("Warmup", zone=1, dist=wu, metric=_SWIM_PACE[1]),
        _iv(drill, zone=1, reps=4, dist=50, metric="Prime stroke before sprints", rest=20),
        _iv("Sprint Set", zone=5, reps=reps, dist=50,
            metric=f"{_SWIM_PACE[5]} — 30s rest", rest=30,
            notes="Maximum effort every rep — full rest"),
        _iv("Cooldown", zone=1, dist=cd, metric="Easy backstroke or breaststroke"),
    ]


# ── Public API ────────────────────────────────────────────────────────────────

def build_workout_intervals(
    sport: str,
    zone: int,
    duration_minutes: int,
    experience: str = "recreational",
    distance_yards: Optional[int] = None,
) -> list[dict]:
    if sport == "run":
        return _run(zone, duration_minutes, experience)
    if sport == "bike":
        return _bike(zone, duration_minutes, experience)
    if sport == "swim":
        return _swim(zone, distance_yards, duration_minutes, experience)
    return []

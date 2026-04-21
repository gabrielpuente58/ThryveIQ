"""
compute_zones — LangChain tool for zone calculation.

Wraps the deterministic zone math so the Plan Architect Agent can call it
to understand what heart rate, power, and pace ranges correspond to each
intensity zone for an athlete with known benchmarks.
"""
from langchain_core.tools import tool


def _parse_pace_to_seconds(pace: str) -> int:
    """Parse 'MM:SS' pace string into total seconds."""
    pace = pace.strip()
    parts = pace.split(":")
    if len(parts) != 2:
        raise ValueError(f"Invalid pace format '{pace}'. Expected 'MM:SS'.")
    minutes, seconds = int(parts[0]), int(parts[1])
    return minutes * 60 + seconds


def _is_valid_pace(pace: str) -> bool:
    """Return True if pace is a parseable 'MM:SS' string."""
    if not pace or not pace.strip():
        return False
    try:
        _parse_pace_to_seconds(pace)
        return True
    except (ValueError, TypeError):
        return False


def _seconds_to_pace(seconds: int) -> str:
    """Convert total seconds back to 'MM:SS' pace string."""
    m = seconds // 60
    s = seconds % 60
    return f"{m}:{s:02d}"


def compute_zones_math(ftp: int, lthr: int, css: str) -> dict:
    """
    Pure zone calculation logic — called by both the LangChain tool and unit tests.

    HR zones use the 5-zone model based on LTHR (Lactate Threshold Heart Rate).
    Power zones use the 5-zone Coggan model based on FTP (Functional Threshold Power).
    Pace zones use running threshold pace (CSS) as the anchor.

    Optional benchmarks: if the athlete hasn't done an FTP test, pass ftp=0 — power
    zones will be returned as None (power targets require a real meter). HR and pace
    fall back to conservative defaults when LTHR/CSS are missing since those zones
    can still be trained to effort.

    Args:
        ftp: Functional Threshold Power in watts. Pass 0 if athlete has no power meter /
             hasn't tested — power_zones will be None.
        lthr: Lactate Threshold Heart Rate in bpm. Pass 0 for a sensible default (155).
        css: Running/pace threshold as 'MM:SS' per km. Pass '' for a sensible default (5:00).

    Returns:
        Dict with power_zones, hr_zones, pace_zones, and inputs. power_zones may be None
        when FTP is unknown.
    """
    has_ftp = bool(ftp) and ftp > 0
    has_lthr = bool(lthr) and lthr > 0
    # Treat malformed pace strings (e.g. '5' instead of '5:00') as "not provided"
    # so zone math falls back to defaults rather than crashing plan generation.
    has_css = _is_valid_pace(css)

    # --- HR Zones (5-zone model anchored at LTHR) ---
    if not has_lthr:
        lthr = 155  # sensible default for a recreational triathlete

    hr_zones = {
        "Z1": {"label": "Recovery",   "min": None,              "max": round(lthr * 0.84)},
        "Z2": {"label": "Aerobic",    "min": round(lthr * 0.85), "max": round(lthr * 0.89)},
        "Z3": {"label": "Tempo",      "min": round(lthr * 0.90), "max": round(lthr * 0.94)},
        "Z4": {"label": "Threshold",  "min": round(lthr * 0.95), "max": round(lthr * 0.99)},
        "Z5": {"label": "VO2max",     "min": round(lthr * 1.00), "max": None},
    }

    # --- Power Zones (5-zone Coggan model anchored at FTP) ---
    # If no FTP provided, return None — targets would be misleading without a real meter.
    if has_ftp:
        power_zones = {
            "Z1": {"label": "Recovery",   "min": None,              "max": round(ftp * 0.55)},
            "Z2": {"label": "Endurance",  "min": round(ftp * 0.56), "max": round(ftp * 0.75)},
            "Z3": {"label": "Tempo",      "min": round(ftp * 0.76), "max": round(ftp * 0.90)},
            "Z4": {"label": "Threshold",  "min": round(ftp * 0.91), "max": round(ftp * 1.05)},
            "Z5": {"label": "VO2max+",    "min": round(ftp * 1.06), "max": None},
        }
    else:
        power_zones = None

    # --- Pace Zones (5-zone model anchored at CSS / running threshold pace) ---
    # Convention: min_pace = slowest allowable pace for this zone (most seconds, open end = None)
    #             max_pace = fastest allowable pace for this zone (fewest seconds, open end = None)
    # Example for CSS = 5:00/km: Z1 spans >6:15, Z5 spans <4:45.
    if not has_css:
        css = "5:00"  # default 5:00/km for recreational runner

    css_sec = _parse_pace_to_seconds(css)

    pace_zones = {
        "Z1": {
            "label": "Recovery",
            "min_pace": None,                                         # no slow limit
            "max_pace": _seconds_to_pace(round(css_sec * 1.25)),     # Z1/Z2 boundary
        },
        "Z2": {
            "label": "Aerobic",
            "min_pace": _seconds_to_pace(round(css_sec * 1.25)),     # slow side (Z1 boundary)
            "max_pace": _seconds_to_pace(round(css_sec * 1.10)),     # fast side (Z2/Z3 boundary)
        },
        "Z3": {
            "label": "Tempo",
            "min_pace": _seconds_to_pace(round(css_sec * 1.10)),     # slow side (Z2 boundary)
            "max_pace": _seconds_to_pace(round(css_sec * 1.00)),     # fast side (Z3/Z4 boundary)
        },
        "Z4": {
            "label": "Threshold",
            "min_pace": _seconds_to_pace(round(css_sec * 1.05)),     # slow side (~5% above CSS)
            "max_pace": css,                                          # fast side = CSS anchor
        },
        "Z5": {
            "label": "VO2max",
            "min_pace": _seconds_to_pace(round(css_sec * 0.95)),     # must be at least this fast
            "max_pace": None,                                         # no fast limit
        },
    }

    return {
        "power_zones": power_zones,
        "hr_zones": hr_zones,
        "pace_zones": pace_zones,
        "inputs": {
            "ftp": ftp if has_ftp else 0,
            "lthr": lthr,
            "css": css,
            "has_ftp": has_ftp,
            "has_lthr": has_lthr,
            "has_css": has_css,
        },
    }


@tool
def compute_zones(ftp: int = 200, lthr: int = 155, css: str = "5:00") -> dict:
    """
    Compute training zones for a triathlete from their fitness benchmarks.

    Call this tool when you need to understand what intensity ranges correspond
    to each training zone for phase blueprint planning — for example, to specify
    appropriate intensity distribution targets per phase or to understand the
    athlete's current fitness level.

    Args:
        ftp: Functional Threshold Power in watts (cycling benchmark).
             Use 200 as a reasonable default for a recreational triathlete.
             A first-timer typically has FTP 120-180w.
        lthr: Lactate Threshold Heart Rate in bpm.
              Use 155 as a reasonable default. First-timers often 150-165bpm.
        css: Running threshold pace as 'MM:SS' per km.
             E.g. '5:00' for 5 min/km. First-timers often '5:30'-'6:30'.

    Returns:
        Dict with:
          - power_zones: Z1-Z5 watt ranges
          - hr_zones: Z1-Z5 bpm ranges
          - pace_zones: Z1-Z5 pace ranges per km
          - inputs: the ftp/lthr/css values used
    """
    return compute_zones_math(ftp, lthr, css)

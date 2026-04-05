"""
score_intensity_distribution — LangChain tool for weekly intensity scoring.

Used by the Workout Builder Agent to verify that a week's sessions are on track
for the phase's target intensity distribution before writing descriptions.

Zone groupings:
  Low      = Z1 + Z2  (easy / aerobic)
  Moderate = Z3        (tempo)
  High     = Z4 + Z5  (threshold / VO2max)
"""
from langchain_core.tools import tool


def score_intensity_distribution_math(sessions: list[dict]) -> dict:
    """
    Pure calculation logic — called by both the LangChain tool and unit tests.

    Args:
        sessions: list of session dicts, each must contain:
                  - duration_minutes (int): session length in minutes
                  - zone (int, 1-5): training zone

    Returns:
        dict with keys:
          low_pct      (float): % of total volume in Z1-Z2
          moderate_pct (float): % of total volume in Z3
          high_pct     (float): % of total volume in Z4-Z5
          total_minutes (int): sum of all session durations
          summary (str): human-readable breakdown
    """
    if not sessions:
        return {
            "low_pct": 0.0,
            "moderate_pct": 0.0,
            "high_pct": 0.0,
            "total_minutes": 0,
            "summary": "No sessions provided.",
        }

    low_minutes = 0
    moderate_minutes = 0
    high_minutes = 0

    for session in sessions:
        duration = int(session.get("duration_minutes", 0))
        zone = int(session.get("zone", 1))

        if zone in (1, 2):
            low_minutes += duration
        elif zone == 3:
            moderate_minutes += duration
        elif zone in (4, 5):
            high_minutes += duration
        # zone outside 1-5 is ignored

    total = low_minutes + moderate_minutes + high_minutes

    if total == 0:
        return {
            "low_pct": 0.0,
            "moderate_pct": 0.0,
            "high_pct": 0.0,
            "total_minutes": 0,
            "summary": "All sessions have zero duration.",
        }

    low_pct = round(low_minutes / total * 100, 1)
    moderate_pct = round(moderate_minutes / total * 100, 1)
    high_pct = round(high_minutes / total * 100, 1)

    summary = (
        f"Total: {total} min — "
        f"Low (Z1-2): {low_pct}% ({low_minutes} min), "
        f"Moderate (Z3): {moderate_pct}% ({moderate_minutes} min), "
        f"High (Z4-5): {high_pct}% ({high_minutes} min)"
    )

    return {
        "low_pct": low_pct,
        "moderate_pct": moderate_pct,
        "high_pct": high_pct,
        "total_minutes": total,
        "summary": summary,
    }


@tool
def score_intensity_distribution(sessions: list[dict]) -> dict:
    """
    Score the intensity distribution of a week's sessions.
    Returns percentage of total volume in low (Z1-2), moderate (Z3), and high (Z4-5) zones.
    Call this to verify intensity balance before writing session descriptions.

    Args:
        sessions: list of session dicts, each with duration_minutes (int) and zone (int 1-5).
    Returns:
        dict with keys: low_pct, moderate_pct, high_pct, total_minutes, summary (str)
    """
    return score_intensity_distribution_math(sessions)

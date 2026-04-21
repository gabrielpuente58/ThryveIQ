import os
import time
from collections import defaultdict
from datetime import datetime, timedelta
import httpx
from dotenv import load_dotenv
from db.strava import get_tokens, upsert_tokens

load_dotenv()

STRAVA_CLIENT_ID = os.getenv("STRAVA_CLIENT_ID")
STRAVA_CLIENT_SECRET = os.getenv("STRAVA_CLIENT_SECRET")
STRAVA_TOKEN_URL = "https://www.strava.com/oauth/token"
STRAVA_API_BASE = "https://www.strava.com/api/v3"


async def exchange_code(code: str) -> dict:
    """Exchange an auth code for tokens. Returns the full Strava token response."""
    async with httpx.AsyncClient() as client:
        res = await client.post(STRAVA_TOKEN_URL, data={
            "client_id": STRAVA_CLIENT_ID,
            "client_secret": STRAVA_CLIENT_SECRET,
            "code": code,
            "grant_type": "authorization_code",
        })
        res.raise_for_status()
        return res.json()


async def _refresh_tokens(refresh_token: str) -> dict:
    """Refresh an expired access token."""
    async with httpx.AsyncClient() as client:
        res = await client.post(STRAVA_TOKEN_URL, data={
            "client_id": STRAVA_CLIENT_ID,
            "client_secret": STRAVA_CLIENT_SECRET,
            "refresh_token": refresh_token,
            "grant_type": "refresh_token",
        })
        res.raise_for_status()
        return res.json()


async def get_valid_access_token(user_id: str) -> str | None:
    """Return a valid access token, refreshing automatically if expired."""
    tokens = get_tokens(user_id)
    if not tokens:
        return None

    # Refresh if token expires within the next 5 minutes
    if tokens["expires_at"] - time.time() < 300:
        refreshed = await _refresh_tokens(tokens["refresh_token"])
        upsert_tokens(
            user_id=user_id,
            access_token=refreshed["access_token"],
            refresh_token=refreshed["refresh_token"],
            expires_at=refreshed["expires_at"],
            athlete_id=tokens.get("athlete_id"),
            athlete_name=tokens.get("athlete_name"),
        )
        return refreshed["access_token"]

    return tokens["access_token"]


async def get_athlete_activities(user_id: str, limit: int = 10) -> list[dict]:
    """Fetch the athlete's recent activities."""
    token = await get_valid_access_token(user_id)
    if not token:
        return []

    async with httpx.AsyncClient() as client:
        res = await client.get(
            f"{STRAVA_API_BASE}/athlete/activities",
            headers={"Authorization": f"Bearer {token}"},
            params={"per_page": limit},
        )
        res.raise_for_status()
        return res.json()


# Maps Strava sport_type values to internal discipline keys
_SPORT_MAP: dict[str, str] = {
    "Swim": "swim",
    "Ride": "bike",
    "VirtualRide": "bike",
    "Run": "run",
    "VirtualRun": "run",
}


async def get_insights(user_id: str) -> dict:
    """Aggregate last ~8 weeks of Strava activities into weekly volume stats."""
    from models.strava import StravaInsightsResponse, WeeklyVolume, SportBreakdown

    tokens = get_tokens(user_id)
    if not tokens:
        return StravaInsightsResponse(
            connected=False,
            weekly_volumes=[],
            sport_breakdown=SportBreakdown(swim_pct=0.0, bike_pct=0.0, run_pct=0.0),
            total_activities=0,
        ).model_dump()

    activities = await get_athlete_activities(user_id, limit=80)

    # week_key -> discipline -> {"hours": float, "miles": float, "moving_seconds": float}
    week_data: dict[str, dict[str, dict[str, float]]] = defaultdict(
        lambda: {
            "swim": {"hours": 0.0, "miles": 0.0, "moving_seconds": 0.0},
            "bike": {"hours": 0.0, "miles": 0.0, "moving_seconds": 0.0},
            "run": {"hours": 0.0, "miles": 0.0, "moving_seconds": 0.0},
        }
    )

    # Pre-seed the 8 most recent ISO weeks so empty weeks still render as 0 bars.
    today = datetime.now()
    monday_this_week = today - timedelta(days=today.weekday())
    recent_weeks: list[str] = []
    for i in range(8):
        wk_date = monday_this_week - timedelta(weeks=i)
        recent_weeks.append(wk_date.strftime("%G-W%V"))
    recent_weeks.reverse()  # oldest → newest
    for wk in recent_weeks:
        _ = week_data[wk]  # touch to materialize the defaultdict entry

    total_activities = 0
    for act in activities:
        sport_type = act.get("sport_type") or act.get("type", "")
        discipline = _SPORT_MAP.get(sport_type)
        if discipline is None:
            continue

        date_str = act.get("start_date_local", "")[:10]
        if not date_str:
            continue

        try:
            dt = datetime.fromisoformat(date_str)
        except ValueError:
            continue

        # ISO week key: "YYYY-Www"
        week_key = dt.strftime("%G-W%V")

        dist_miles = act.get("distance", 0.0) / 1609.34
        moving_seconds = float(act.get("moving_time", 0))
        moving_hours = moving_seconds / 3600.0

        week_data[week_key][discipline]["hours"] += moving_hours
        week_data[week_key][discipline]["miles"] += dist_miles
        week_data[week_key][discipline]["moving_seconds"] += moving_seconds
        total_activities += 1

    # Always show the 8 most recent ISO weeks, even if a week has no activities.
    sorted_weeks = recent_weeks

    weekly_volumes: list[WeeklyVolume] = []
    for wk in sorted_weeks:
        disciplines = week_data[wk]
        # Build a human-readable label from the ISO week (Monday of the week)
        # "%G-W%V-%u" with weekday=1 gives Monday
        monday = datetime.strptime(f"{wk}-1", "%G-W%V-%u")
        label = monday.strftime("%b %-d")  # e.g. "Apr 7"

        swim_h = disciplines["swim"]["hours"]
        bike_h = disciplines["bike"]["hours"]
        run_h = disciplines["run"]["hours"]
        total_h = swim_h + bike_h + run_h

        swim_mi = disciplines["swim"]["miles"]
        bike_mi = disciplines["bike"]["miles"]
        run_mi = disciplines["run"]["miles"]
        total_mi = swim_mi + bike_mi + run_mi

        weekly_volumes.append(
            WeeklyVolume(
                week_label=label,
                swim_hours=round(swim_h, 2),
                bike_hours=round(bike_h, 2),
                run_hours=round(run_h, 2),
                total_hours=round(total_h, 2),
                swim_miles=round(swim_mi, 2),
                bike_miles=round(bike_mi, 2),
                run_miles=round(run_mi, 2),
                total_miles=round(total_mi, 2),
            )
        )

    # Sport breakdown by total moving seconds
    total_swim_s = sum(week_data[wk]["swim"]["moving_seconds"] for wk in week_data)
    total_bike_s = sum(week_data[wk]["bike"]["moving_seconds"] for wk in week_data)
    total_run_s = sum(week_data[wk]["run"]["moving_seconds"] for wk in week_data)
    grand_total_s = total_swim_s + total_bike_s + total_run_s

    if grand_total_s > 0:
        swim_pct = round(total_swim_s / grand_total_s * 100, 1)
        bike_pct = round(total_bike_s / grand_total_s * 100, 1)
        run_pct = round(total_run_s / grand_total_s * 100, 1)
    else:
        swim_pct = bike_pct = run_pct = 0.0

    return StravaInsightsResponse(
        connected=True,
        weekly_volumes=weekly_volumes,
        sport_breakdown=SportBreakdown(swim_pct=swim_pct, bike_pct=bike_pct, run_pct=run_pct),
        total_activities=total_activities,
    ).model_dump()

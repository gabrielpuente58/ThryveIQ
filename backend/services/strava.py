import os
import time
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

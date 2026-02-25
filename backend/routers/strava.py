from fastapi import APIRouter, HTTPException
from models.strava import StravaExchangeRequest, StravaStatusResponse
from services.strava import exchange_code
from db.strava import upsert_tokens, get_tokens, delete_tokens

router = APIRouter(prefix="/strava", tags=["strava"])


@router.post("/exchange", response_model=StravaStatusResponse)
async def exchange(request: StravaExchangeRequest):
    """Exchange a Strava auth code for tokens and store them."""
    try:
        data = await exchange_code(request.code)
    except Exception:
        raise HTTPException(status_code=400, detail="Failed to exchange Strava auth code.")

    athlete = data.get("athlete", {})
    athlete_id = athlete.get("id")
    first = athlete.get("firstname", "")
    last = athlete.get("lastname", "")
    athlete_name = f"{first} {last}".strip() or None

    upsert_tokens(
        user_id=request.user_id,
        access_token=data["access_token"],
        refresh_token=data["refresh_token"],
        expires_at=data["expires_at"],
        athlete_id=athlete_id,
        athlete_name=athlete_name,
    )

    return StravaStatusResponse(connected=True, athlete_name=athlete_name, athlete_id=athlete_id)


@router.get("/status", response_model=StravaStatusResponse)
async def status(user_id: str):
    """Check if a user has connected Strava."""
    tokens = get_tokens(user_id)
    if not tokens:
        return StravaStatusResponse(connected=False)
    return StravaStatusResponse(
        connected=True,
        athlete_name=tokens.get("athlete_name"),
        athlete_id=tokens.get("athlete_id"),
    )


@router.delete("/disconnect")
async def disconnect(user_id: str):
    """Remove a user's Strava connection."""
    delete_tokens(user_id)
    return {"success": True}

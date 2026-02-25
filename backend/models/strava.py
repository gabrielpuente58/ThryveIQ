from pydantic import BaseModel


class StravaExchangeRequest(BaseModel):
    user_id: str
    code: str


class StravaStatusResponse(BaseModel):
    connected: bool
    athlete_name: str | None = None
    athlete_id: int | None = None


class StravaTokenRecord(BaseModel):
    user_id: str
    access_token: str
    refresh_token: str
    expires_at: int
    athlete_id: int | None = None
    athlete_name: str | None = None

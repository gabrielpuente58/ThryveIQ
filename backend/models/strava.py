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


class WeeklyVolume(BaseModel):
    week_label: str
    swim_hours: float
    bike_hours: float
    run_hours: float
    total_hours: float
    swim_miles: float
    bike_miles: float
    run_miles: float
    total_miles: float


class SportBreakdown(BaseModel):
    swim_pct: float
    bike_pct: float
    run_pct: float


class StravaInsightsResponse(BaseModel):
    connected: bool
    weekly_volumes: list[WeeklyVolume]
    sport_breakdown: SportBreakdown
    total_activities: int

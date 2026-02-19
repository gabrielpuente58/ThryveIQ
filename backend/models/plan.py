from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class Session(BaseModel):
    id: str
    week: int
    day: str
    sport: str
    duration_minutes: int
    zone: int
    zone_label: str
    description: str


class Phase(BaseModel):
    name: str
    weeks: int
    start_week: int
    end_week: int
    focus: str
    preview: Optional[str] = None


class PlanResponse(BaseModel):
    id: str
    user_id: str
    generated_at: Optional[datetime] = None
    weeks_until_race: int
    phases: list[Phase]
    sessions: list[Session]


class GeneratePlanRequest(BaseModel):
    user_id: str

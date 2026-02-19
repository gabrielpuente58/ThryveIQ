from datetime import date
from typing import Optional
from pydantic import BaseModel, Field


class AthleteProfileRequest(BaseModel):
    user_id: str
    goal: str = Field(pattern="^(first_timer|recreational|competitive)$")
    race_date: date
    experience: str = Field(pattern="^(first_timer|recreational|competitive)$")
    current_background: str
    weekly_hours: float = Field(gt=0, le=40)
    days_available: int = Field(ge=1, le=7)
    strongest_discipline: str = Field(pattern="^(swim|bike|run)$")
    weakest_discipline: str = Field(pattern="^(swim|bike|run)$")


class AthleteProfileResponse(BaseModel):
    user_id: str
    goal: str
    race_date: date
    experience: str
    current_background: str
    weekly_hours: float
    days_available: int
    strongest_discipline: str
    weakest_discipline: str
    zones: Optional[dict] = None

from datetime import date
from typing import Optional
from pydantic import BaseModel, Field, model_validator


class AthleteProfileRequest(BaseModel):
    user_id: str
    goal: str = Field(pattern="^(first_timer|recreational|competitive)$")
    race_date: date
    experience: str = Field(pattern="^(first_timer|recreational|competitive)$")
    hours_min: float = Field(gt=0, le=40)
    hours_max: float = Field(gt=0, le=40)
    days_available: int = Field(ge=1, le=7)
    strongest_discipline: str = Field(pattern="^(swim|bike|run)$")
    weakest_discipline: str = Field(pattern="^(swim|bike|run)$")
    focus_discipline: Optional[str] = Field(default=None, pattern="^(swim|bike|run)$")
    ftp: int = 0
    lthr: int = 0
    css: str = ""

    @model_validator(mode="after")
    def _check_hours_range(self):
        if self.hours_max < self.hours_min:
            raise ValueError("hours_max must be >= hours_min")
        return self


class AthleteProfileResponse(BaseModel):
    user_id: str
    goal: str
    race_date: date
    experience: str
    hours_min: float
    hours_max: float
    weekly_hours: Optional[float] = None  # legacy alias for hours_max
    days_available: int
    strongest_discipline: str
    weakest_discipline: str
    focus_discipline: Optional[str] = None
    ftp: int = 0
    lthr: int = 0
    css: str = ""
    zones: Optional[dict] = None


class UpdateProfileRequest(BaseModel):
    hours_min: Optional[float] = None
    hours_max: Optional[float] = None
    days_available: Optional[int] = None
    goal: Optional[str] = None
    experience: Optional[str] = None
    strongest_discipline: Optional[str] = None
    weakest_discipline: Optional[str] = None
    focus_discipline: Optional[str] = None
    ftp: Optional[int] = None
    lthr: Optional[int] = None
    css: Optional[str] = None
    race_date: Optional[str] = None

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
    session_type: str = "endurance"
    description: str
    distance_yards: Optional[int] = None
    intervals: list[dict] = []


class Phase(BaseModel):
    name: str
    weeks: int
    start_week: int
    end_week: int
    focus: str
    preview: Optional[str] = None
    weekly_structure_template: dict = {}
    intensity_distribution_target: str = "80/20"


class PlanResponse(BaseModel):
    id: str
    user_id: str
    generated_at: Optional[datetime] = None
    weeks_until_race: int
    weeks_generated: int = 0
    phases: list[Phase]
    sessions: list[Session]


class GeneratePlanRequest(BaseModel):
    user_id: str
    max_weeks: Optional[int] = None


class GenerateNextBlockRequest(BaseModel):
    user_id: str


class PlanJobResponse(BaseModel):
    job_id: str
    status: str  # "pending" | "done" | "error"
    plan: Optional[PlanResponse] = None
    error: Optional[str] = None


class NextWeekRequest(BaseModel):
    user_id: str


class WeekFeedbackRequest(BaseModel):
    user_id: str
    week_index: int
    rpe: Optional[int] = None  # 1-10 scale
    went_well: str = ""
    didnt_go_well: str = ""
    notes: str = ""


class WeekFeedbackResponse(BaseModel):
    week_index: int
    rpe: Optional[int] = None
    went_well: str = ""
    didnt_go_well: str = ""
    notes: str = ""
    created_at: Optional[datetime] = None

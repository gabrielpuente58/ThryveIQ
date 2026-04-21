"""
Pydantic models for the Workout Builder Agent (Agent 2).

The Workout Builder receives a pre-built week skeleton from the rule engine
(sessions with day, sport, duration, zone already set) and fills in coaching
descriptions. It cannot change any structural field — descriptions only.
"""
from typing import Optional
from pydantic import BaseModel, Field


class SessionWithDescription(BaseModel):
    """A single training session — now fully LLM-proposed including structure."""

    id: str = Field(description="Session identifier, e.g. 'w1_d1_swim'.")
    week: int = Field(description="Week number (1-indexed).")
    day: str = Field(description="Day of the week, e.g. 'Monday'.")
    sport: str = Field(description="Sport: swim | bike | run.")
    duration_minutes: int = Field(description="Session length in minutes.")
    zone: int = Field(description="Training zone (1-5).", ge=1, le=5)
    zone_label: str = Field(description="Human-readable zone label.")
    session_type: str = Field(
        default="endurance",
        description="Workout type: long | endurance | tempo | threshold | intervals | recovery | brick_bike | brick_run | drill | race_pace",
    )
    description: str = Field(description="2-3 sentence coaching description.")
    distance_yards: Optional[int] = None
    intervals: list[dict] = []


class WeekWithDescriptions(BaseModel):
    """
    A full training week with all sessions described by the Workout Builder.
    Structural fields (day, sport, duration, zone) are set by the rule engine
    and cannot be changed by the LLM.
    """

    week_index: int = Field(description="Week number (1-indexed).")
    phase_name: str = Field(description="Name of the training phase, e.g. 'Base'.")
    sessions: list[SessionWithDescription] = Field(
        description="All sessions for this week with descriptions.",
        min_length=1,
    )


class WorkoutBuilderRequest(BaseModel):
    """Request payload for the Workout Builder agent."""

    week_skeleton: dict = Field(
        description="Raw week skeleton from the rule engine. Contains sessions with structural fields set."
    )
    phase_name: str = Field(
        description="Name of the current training phase, e.g. 'Base'."
    )
    phase_focus: str = Field(
        description="1-2 sentence description of what this phase emphasises, e.g. 'Aerobic durability and technique'."
    )
    zones: dict = Field(
        description="Athlete's computed training zones (output from compute_zones tool)."
    )
    athlete_profile: dict = Field(
        description=(
            "Key athlete attributes: goal, experience, weakest_discipline, strongest_discipline. "
            "Used to tailor coaching language."
        )
    )

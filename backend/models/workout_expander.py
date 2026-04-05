"""
Pydantic models for the Workout Expander Agent (Agent 3).

The Workout Expander receives a single session skeleton and the athlete's zones,
then expands it into a full workout with warmup, main set, cooldown, and specific
zone targets. It runs on demand when a user taps a session in the app.
"""
from pydantic import BaseModel, Field


class WorkoutDetail(BaseModel):
    """A fully expanded workout with warmup, main set, cooldown, and zone targets."""

    session_id: str = Field(description="Session identifier matching the input skeleton.")
    warmup: str = Field(
        description=(
            "Warmup instructions, ~15-20% of total duration. "
            "E.g. '10 min easy Z1 swim, focus on bilateral breathing'."
        )
    )
    main_set: str = Field(
        description=(
            "Main set instructions. Gets the bulk of session time after warmup and cooldown. "
            "E.g. '4x200m at Z3 effort with 30s rest'."
        )
    )
    cooldown: str = Field(
        description=(
            "Cooldown instructions, ~10-15% of total duration. "
            "E.g. '5 min easy Z1 cooldown, shake out the legs'."
        )
    )
    zone_ranges: dict = Field(
        description=(
            "Sport-specific zone targets. Always includes 'hr' (bpm range). "
            "Also includes 'power' for bike, 'pace' for run (per km), "
            "'pace' for swim (per 100m)."
        )
    )
    coaching_notes: str = Field(
        description=(
            "1-2 sentences of overall session context and coaching tips tailored "
            "to the athlete's experience level and the session type."
        )
    )


class ExpandSessionRequest(BaseModel):
    """Request payload for the Workout Expander agent."""

    session: dict = Field(
        description=(
            "Single session skeleton from the training plan. "
            "Must contain: id, week, day, sport, duration_minutes, zone, zone_label, description."
        )
    )
    zones: dict = Field(
        description="Athlete's computed training zones (output from compute_zones tool)."
    )
    athlete_profile: dict = Field(
        description=(
            "Key athlete attributes: goal, experience, weakest_discipline, strongest_discipline. "
            "Used to tailor coaching language and tips."
        )
    )

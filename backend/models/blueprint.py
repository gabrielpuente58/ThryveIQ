"""
Pydantic models for the Plan Architect agent output.

The Plan Architect Agent produces a PlanBlueprint — a structured list of
training phases with their week counts, session type mix, and intensity targets.
It does NOT contain individual workout sessions; that is the Workout Builder's job.
"""
from pydantic import BaseModel, Field, field_validator


class PhaseBlueprint(BaseModel):
    """A single training phase within the full plan blueprint."""

    phase_name: str = Field(
        description="Name of the phase, e.g. 'Base', 'Build', 'Peak', 'Taper'."
    )
    weeks: int = Field(
        description="Number of weeks this phase spans. Must be >= 1.",
        ge=1,
    )
    intensity_distribution_target: str = Field(
        description=(
            "Target polarized intensity split for this phase, e.g. '80/20' means "
            "80% easy (Z1-Z2) and 20% moderate/hard (Z3-Z5). Use '70/20/10' for "
            "Z1-2 / Z3 / Z4-5 breakdown."
        )
    )
    weekly_structure_template: dict = Field(
        description=(
            "Number of sessions per sport per week, e.g. "
            '{"swim": 2, "bike": 3, "run": 3}. '
            "Keys must be 'swim', 'bike', or 'run'. Values are session counts."
        )
    )
    focus: str = Field(
        description=(
            "1-2 sentence description of what this phase emphasises, "
            "e.g. 'Aerobic durability and technique development.'"
        )
    )

    @field_validator("weekly_structure_template")
    @classmethod
    def validate_sports(cls, v: dict) -> dict:
        allowed = {"swim", "bike", "run"}
        for key in v:
            if key not in allowed:
                raise ValueError(f"Invalid sport '{key}'. Must be one of {allowed}.")
        for key, val in v.items():
            if not isinstance(val, int) or val < 0:
                raise ValueError(f"Session count for '{key}' must be a non-negative int.")
        return v

    @field_validator("weeks")
    @classmethod
    def weeks_positive(cls, v: int) -> int:
        if v < 1:
            raise ValueError("Phase must have at least 1 week.")
        return v


class PlanBlueprint(BaseModel):
    """
    Full plan blueprint output from the Plan Architect Agent.

    Contains all training phases in order, a total week count that must
    equal the sum of each phase's week count, and overall coaching notes.
    """

    phases: list[PhaseBlueprint] = Field(
        description="Ordered list of training phases from first to last.",
        min_length=1,
    )
    total_weeks: int = Field(
        description="Total weeks across all phases. Must equal sum of each phase's weeks.",
        ge=1,
    )
    notes: str = Field(
        description=(
            "Brief coaching rationale for the phase structure, e.g. why a certain "
            "number of base weeks was chosen given the athlete's experience and timeline."
        )
    )

    @field_validator("total_weeks")
    @classmethod
    def total_matches_phases(cls, v: int, info) -> int:
        # Validate after phases are set
        phases = info.data.get("phases")
        if phases is not None:
            phase_sum = sum(p.weeks for p in phases)
            if phase_sum != v:
                raise ValueError(
                    f"total_weeks ({v}) must equal the sum of all phase weeks ({phase_sum})."
                )
        return v


class ArchitectRequest(BaseModel):
    """Request body for POST /plans/architect."""

    user_id: str = Field(description="Supabase user UUID.")
    overrides: dict = Field(
        default_factory=dict,
        description=(
            "Optional profile field overrides for testing. Any key here will replace "
            "the value fetched from Supabase before the agent runs. "
            "e.g. {\"race_date\": \"2026-04-01\", \"weekly_hours\": 12}"
        ),
    )

import uuid
from fastapi import APIRouter, BackgroundTasks, HTTPException, Query
from models.plan import (
    GenerateNextBlockRequest,
    GeneratePlanRequest,
    PlanJobResponse,
    PlanResponse,
    Session,
    Phase,
)
from models.blueprint import ArchitectRequest, PlanBlueprint
from models.workout_expander import WorkoutDetail, ExpandRequest
from db.supabase import supabase
from services.agents.plan_architect import run_plan_architect
from services.week_pipeline import generate_full_plan, generate_week_block
from services.tools.compute_zones import compute_zones_math
from services.agents.workout_expander import run_workout_expander

router = APIRouter(prefix="/plans", tags=["plans"])

BLOCK_SIZE = 4  # weeks per block

# In-memory job store: job_id → PlanJobResponse
_jobs: dict[str, PlanJobResponse] = {}


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

def _build_plan_response(saved: dict) -> PlanResponse:
    sessions = [Session(**s) for s in saved.get("sessions", [])]
    weeks_generated = max((s.week for s in sessions), default=0)
    return PlanResponse(
        id=saved["id"],
        user_id=saved["user_id"],
        generated_at=saved["generated_at"],
        weeks_until_race=saved["weeks_until_race"],
        weeks_generated=weeks_generated,
        phases=[Phase(**p) for p in (saved.get("phases") or [])],
        sessions=sessions,
    )


def _phase_data_from_blueprint(blueprint: PlanBlueprint) -> list[dict]:
    phase_data = []
    cumulative_week = 0
    for phase in blueprint.phases:
        start_week = cumulative_week + 1
        end_week = cumulative_week + phase.weeks
        phase_data.append({
            "name": phase.phase_name,
            "weeks": phase.weeks,
            "start_week": start_week,
            "end_week": end_week,
            "focus": phase.focus,
            "preview": None,
            "weekly_structure_template": phase.weekly_structure_template,
            "intensity_distribution_target": phase.intensity_distribution_target,
        })
        cumulative_week = end_week
    return phase_data


# ---------------------------------------------------------------------------
# Background tasks
# ---------------------------------------------------------------------------

async def _run_generation(job_id: str, user_id: str) -> None:
    """Generate the first BLOCK_SIZE weeks and save a new plan."""
    try:
        profile_result = (
            supabase.table("athlete_profiles")
            .select("*")
            .eq("user_id", user_id)
            .single()
            .execute()
        )
        if not profile_result.data:
            _jobs[job_id] = PlanJobResponse(job_id=job_id, status="error", error="Profile not found.")
            return

        profile = profile_result.data
        blueprint = await run_plan_architect(profile)
        zones = compute_zones_math(ftp=0, lthr=0, css="")

        to_week = min(BLOCK_SIZE, blueprint.total_weeks)
        first_block = await generate_week_block(
            from_week=1,
            to_week=to_week,
            stored_phases=_phase_data_from_blueprint(blueprint),
            athlete_profile=profile,
            zones=zones,
            previous_week_minutes=0.0,
        )

        all_sessions = [s.model_dump() for week in first_block for s in week.sessions]

        row = {
            "user_id": user_id,
            "weeks_until_race": blueprint.total_weeks,
            "phases": _phase_data_from_blueprint(blueprint),
            "sessions": all_sessions,
        }

        supabase.table("plans").delete().eq("user_id", user_id).execute()
        result = supabase.table("plans").insert(row).execute()

        if not result.data:
            _jobs[job_id] = PlanJobResponse(job_id=job_id, status="error", error="Failed to save plan.")
            return

        _jobs[job_id] = PlanJobResponse(
            job_id=job_id,
            status="done",
            plan=_build_plan_response(result.data[0]),
        )

    except Exception as exc:
        _jobs[job_id] = PlanJobResponse(job_id=job_id, status="error", error=str(exc))


async def _run_next_block(job_id: str, user_id: str) -> None:
    """Append the next BLOCK_SIZE weeks to the existing plan."""
    try:
        plan_result = (
            supabase.table("plans")
            .select("*")
            .eq("user_id", user_id)
            .order("generated_at", desc=True)
            .limit(1)
            .execute()
        )
        if not plan_result.data:
            _jobs[job_id] = PlanJobResponse(job_id=job_id, status="error", error="No plan found.")
            return

        saved = plan_result.data[0]
        existing_sessions: list[dict] = saved.get("sessions", [])
        weeks_until_race: int = saved["weeks_until_race"]
        stored_phases: list[dict] = saved.get("phases", [])

        weeks_generated = max((s["week"] for s in existing_sessions), default=0)

        if weeks_generated >= weeks_until_race:
            _jobs[job_id] = PlanJobResponse(
                job_id=job_id, status="done", plan=_build_plan_response(saved)
            )
            return

        from_week = weeks_generated + 1
        to_week = min(weeks_generated + BLOCK_SIZE, weeks_until_race)

        # Seed ramp-rate from the last generated week
        last_week_sessions = [s for s in existing_sessions if s["week"] == weeks_generated]
        previous_week_minutes = float(sum(s["duration_minutes"] for s in last_week_sessions))

        profile_result = (
            supabase.table("athlete_profiles")
            .select("*")
            .eq("user_id", user_id)
            .single()
            .execute()
        )
        profile = profile_result.data or {}
        zones = compute_zones_math(ftp=0, lthr=0, css="")

        new_weeks = await generate_week_block(
            from_week=from_week,
            to_week=to_week,
            stored_phases=stored_phases,
            athlete_profile=profile,
            zones=zones,
            previous_week_minutes=previous_week_minutes,
        )

        new_sessions = [s.model_dump() for week in new_weeks for s in week.sessions]
        updated_sessions = existing_sessions + new_sessions

        supabase.table("plans").update({"sessions": updated_sessions}).eq("id", saved["id"]).execute()

        updated = dict(saved)
        updated["sessions"] = updated_sessions
        _jobs[job_id] = PlanJobResponse(
            job_id=job_id, status="done", plan=_build_plan_response(updated)
        )

    except Exception as exc:
        _jobs[job_id] = PlanJobResponse(job_id=job_id, status="error", error=str(exc))


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/generate", response_model=PlanJobResponse, status_code=202)
async def generate(request: GeneratePlanRequest, background_tasks: BackgroundTasks):
    job_id = str(uuid.uuid4())
    _jobs[job_id] = PlanJobResponse(job_id=job_id, status="pending")
    background_tasks.add_task(_run_generation, job_id, request.user_id)
    return _jobs[job_id]


@router.post("/generate-next", response_model=PlanJobResponse, status_code=202)
async def generate_next(request: GenerateNextBlockRequest, background_tasks: BackgroundTasks):
    job_id = str(uuid.uuid4())
    _jobs[job_id] = PlanJobResponse(job_id=job_id, status="pending")
    background_tasks.add_task(_run_next_block, job_id, request.user_id)
    return _jobs[job_id]


@router.get("/job/{job_id}", response_model=PlanJobResponse)
async def get_job_status(job_id: str):
    job = _jobs.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found.")
    return job


@router.get("/current", response_model=PlanResponse)
async def get_current_plan(user_id: str = Query(...)):
    result = (
        supabase.table("plans")
        .select("*")
        .eq("user_id", user_id)
        .order("generated_at", desc=True)
        .limit(1)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="No plan found. Generate one first.")
    return _build_plan_response(result.data[0])


@router.post("/session/{session_id}/expand", response_model=WorkoutDetail)
async def expand_session(session_id: str, request: ExpandRequest):
    plan_result = (
        supabase.table("plans")
        .select("*")
        .eq("user_id", request.user_id)
        .order("generated_at", desc=True)
        .limit(1)
        .execute()
    )
    if not plan_result.data:
        raise HTTPException(status_code=404, detail="No plan found. Generate one first.")

    sessions = plan_result.data[0].get("sessions", [])
    session = next((s for s in sessions if s.get("id") == session_id), None)
    if session is None:
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found.")

    try:
        detail = await run_workout_expander(session, request.zones, request.athlete_profile)
    except ValueError as exc:
        raise HTTPException(status_code=500, detail=f"Workout Expander failed: {exc}")
    return detail


@router.post("/architect", response_model=PlanBlueprint)
async def architect_plan(request: ArchitectRequest):
    profile_result = (
        supabase.table("athlete_profiles")
        .select("*")
        .eq("user_id", request.user_id)
        .single()
        .execute()
    )
    if not profile_result.data:
        raise HTTPException(status_code=404, detail="Athlete profile not found.")

    profile = {**profile_result.data, **request.overrides}
    try:
        blueprint = await run_plan_architect(profile)
    except ValueError as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    return blueprint


@router.get("/week/{week_number}", response_model=list[Session])
async def get_plan_week(week_number: int, user_id: str = Query(...)):
    result = (
        supabase.table("plans")
        .select("*")
        .eq("user_id", user_id)
        .order("generated_at", desc=True)
        .limit(1)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="No plan found. Generate one first.")

    sessions = result.data[0]["sessions"]
    week_sessions = [Session(**s) for s in sessions if s["week"] == week_number]
    if not week_sessions:
        raise HTTPException(status_code=404, detail=f"No sessions found for week {week_number}")
    return week_sessions

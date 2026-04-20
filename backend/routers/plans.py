import asyncio
import uuid
from fastapi import APIRouter, BackgroundTasks, HTTPException, Query
from models.plan import GeneratePlanRequest, PlanJobResponse, PlanResponse, Session, Phase
from models.blueprint import ArchitectRequest, PlanBlueprint
from models.workout_expander import WorkoutDetail, ExpandRequest
from db.supabase import supabase
from services.agents.plan_architect import run_plan_architect
from services.week_pipeline import generate_full_plan
from services.tools.compute_zones import compute_zones_math
from services.agents.workout_expander import run_workout_expander

router = APIRouter(prefix="/plans", tags=["plans"])

# In-memory job store: job_id → PlanJobResponse
_jobs: dict[str, PlanJobResponse] = {}


async def _run_generation(job_id: str, user_id: str) -> None:
    """Background task: run full plan generation pipeline and update job store."""
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
        all_weeks = await generate_full_plan(blueprint, profile, zones)

        all_sessions = []
        for week in all_weeks:
            for s in week.sessions:
                all_sessions.append(s.model_dump())

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
            })
            cumulative_week = end_week

        row = {
            "user_id": user_id,
            "weeks_until_race": blueprint.total_weeks,
            "phases": phase_data,
            "sessions": all_sessions,
        }

        supabase.table("plans").delete().eq("user_id", user_id).execute()
        result = supabase.table("plans").insert(row).execute()

        if not result.data:
            _jobs[job_id] = PlanJobResponse(job_id=job_id, status="error", error="Failed to save plan.")
            return

        saved = result.data[0]
        plan = PlanResponse(
            id=saved["id"],
            user_id=saved["user_id"],
            generated_at=saved["generated_at"],
            weeks_until_race=saved["weeks_until_race"],
            phases=[Phase(**p) for p in (saved.get("phases") or [])],
            sessions=[Session(**s) for s in saved["sessions"]],
        )
        _jobs[job_id] = PlanJobResponse(job_id=job_id, status="done", plan=plan)

    except Exception as exc:
        _jobs[job_id] = PlanJobResponse(job_id=job_id, status="error", error=str(exc))


@router.post("/generate", response_model=PlanJobResponse, status_code=202)
async def generate(request: GeneratePlanRequest, background_tasks: BackgroundTasks):
    job_id = str(uuid.uuid4())
    _jobs[job_id] = PlanJobResponse(job_id=job_id, status="pending")
    background_tasks.add_task(_run_generation, job_id, request.user_id)
    return _jobs[job_id]


@router.get("/job/{job_id}", response_model=PlanJobResponse)
async def get_job_status(job_id: str):
    job = _jobs.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found.")
    return job


@router.post("/session/{session_id}/expand", response_model=WorkoutDetail)
async def expand_session(session_id: str, request: ExpandRequest):
    # Fetch user's current plan from Supabase
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

    # Find the session with matching id
    session = next((s for s in sessions if s.get("id") == session_id), None)
    if session is None:
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found in current plan.")

    # Expand the session via the Workout Expander agent
    try:
        detail = await run_workout_expander(session, request.zones, request.athlete_profile)
    except ValueError as exc:
        raise HTTPException(status_code=500, detail=f"Workout Expander failed: {exc}")

    return detail


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

    saved = result.data[0]
    return PlanResponse(
        id=saved["id"],
        user_id=saved["user_id"],
        generated_at=saved["generated_at"],
        weeks_until_race=saved["weeks_until_race"],
        phases=[Phase(**p) for p in (saved.get("phases") or [])],
        sessions=[Session(**s) for s in saved["sessions"]],
    )


@router.post("/architect", response_model=PlanBlueprint)
async def architect_plan(request: ArchitectRequest):
    """
    Run the Plan Architect Agent for the authenticated user.

    Reads the athlete's profile from Supabase, runs the LangChain Plan Architect
    Agent, and returns a validated PlanBlueprint with phase names, week counts,
    session type mix, and intensity distribution targets.

    The agent does NOT generate individual workout sessions.
    """
    profile_result = (
        supabase.table("athlete_profiles")
        .select("*")
        .eq("user_id", request.user_id)
        .single()
        .execute()
    )

    if not profile_result.data:
        raise HTTPException(
            status_code=404,
            detail="Athlete profile not found. Complete onboarding first.",
        )

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

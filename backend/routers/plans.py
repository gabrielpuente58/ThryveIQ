import uuid
from fastapi import APIRouter, BackgroundTasks, HTTPException, Query
from models.plan import (
    GeneratePlanRequest,
    PlanJobResponse,
    PlanResponse,
    Session,
    Phase,
    NextWeekRequest,
    WeekFeedbackRequest,
    WeekFeedbackResponse,
)
from models.blueprint import ArchitectRequest, PlanBlueprint
from models.workout_expander import WorkoutDetail, ExpandRequest
from db.supabase import supabase
from services.agents.plan_architect import run_plan_architect
from services.week_pipeline import generate_week_block
from services.tools.compute_zones import compute_zones_math
from services.agents.workout_expander import run_workout_expander

router = APIRouter(prefix="/plans", tags=["plans"])

# In-memory job store: job_id → PlanJobResponse
_jobs: dict[str, PlanJobResponse] = {}


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

def _build_plan_response(saved: dict) -> PlanResponse:
    sessions = [Session(**s) for s in saved.get("sessions", [])]
    weeks_generated = saved.get("weeks_generated") or max(
        (s.week for s in sessions), default=0
    )
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


def _zones_for_profile(profile: dict) -> dict:
    return compute_zones_math(
        ftp=int(profile.get("ftp") or 0),
        lthr=int(profile.get("lthr") or 0),
        css=str(profile.get("css") or ""),
    )


def _fetch_feedback(user_id: str, week_index: int) -> dict | None:
    res = (
        supabase.table("week_feedback")
        .select("*")
        .eq("user_id", user_id)
        .eq("week_index", week_index)
        .limit(1)
        .execute()
    )
    return res.data[0] if res.data else None


# ---------------------------------------------------------------------------
# Background tasks
# ---------------------------------------------------------------------------

async def _run_generation(job_id: str, user_id: str) -> None:
    """Create the blueprint and generate WEEK 1 only. Subsequent weeks use /next-week."""
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
        zones = _zones_for_profile(profile)
        phases = _phase_data_from_blueprint(blueprint)

        # Only generate week 1. User requests subsequent weeks manually.
        weeks = await generate_week_block(
            from_week=1,
            to_week=1,
            stored_phases=phases,
            athlete_profile=profile,
            zones=zones,
            previous_week_minutes=0.0,
        )
        sessions = [s.model_dump() for week in weeks for s in week.sessions]

        row = {
            "user_id": user_id,
            "weeks_until_race": blueprint.total_weeks,
            "phases": phases,
            "sessions": sessions,
            "weeks_generated": 1,
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


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

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


@router.post("/next-week", response_model=PlanResponse)
async def generate_next_week(request: NextWeekRequest):
    """Generate the next unbuilt week, merge into the stored plan, and return it."""
    plan_res = (
        supabase.table("plans")
        .select("*")
        .eq("user_id", request.user_id)
        .order("generated_at", desc=True)
        .limit(1)
        .execute()
    )
    if not plan_res.data:
        raise HTTPException(status_code=404, detail="No plan. Generate one first.")
    plan = plan_res.data[0]

    weeks_generated = plan.get("weeks_generated") or max(
        (s.get("week", 0) for s in plan.get("sessions", [])), default=0
    )
    weeks_until_race = plan["weeks_until_race"]
    next_week = weeks_generated + 1
    if next_week > weeks_until_race:
        raise HTTPException(status_code=400, detail="All weeks already generated.")

    profile_res = (
        supabase.table("athlete_profiles")
        .select("*")
        .eq("user_id", request.user_id)
        .single()
        .execute()
    )
    if not profile_res.data:
        raise HTTPException(status_code=404, detail="Profile not found.")
    profile = profile_res.data

    # Pull last week's feedback so the builder can adapt descriptions.
    feedback = _fetch_feedback(request.user_id, weeks_generated)
    if feedback:
        profile = {**profile, "last_week_feedback": feedback}

    zones = _zones_for_profile(profile)
    existing_sessions = plan.get("sessions", [])
    prev_minutes = float(
        sum(s.get("duration_minutes", 0) for s in existing_sessions if s.get("week") == weeks_generated)
    )

    weeks = await generate_week_block(
        from_week=next_week,
        to_week=next_week,
        stored_phases=plan.get("phases") or [],
        athlete_profile=profile,
        zones=zones,
        previous_week_minutes=prev_minutes,
    )

    new_sessions = [s.model_dump() for week in weeks for s in week.sessions]
    merged = existing_sessions + new_sessions

    updated = (
        supabase.table("plans")
        .update({"sessions": merged, "weeks_generated": next_week})
        .eq("id", plan["id"])
        .execute()
    )
    if not updated.data:
        raise HTTPException(status_code=500, detail="Failed to save next week.")
    return _build_plan_response(updated.data[0])


@router.post("/feedback", response_model=WeekFeedbackResponse)
async def save_feedback(request: WeekFeedbackRequest):
    row = {
        "user_id": request.user_id,
        "week_index": request.week_index,
        "rpe": request.rpe,
        "went_well": request.went_well,
        "didnt_go_well": request.didnt_go_well,
        "notes": request.notes,
    }
    res = (
        supabase.table("week_feedback")
        .upsert(row, on_conflict="user_id,week_index")
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=500, detail="Failed to save feedback.")
    return WeekFeedbackResponse(**res.data[0])


@router.get("/feedback/{week_index}", response_model=WeekFeedbackResponse)
async def get_feedback(week_index: int, user_id: str = Query(...)):
    data = _fetch_feedback(user_id, week_index)
    if not data:
        raise HTTPException(status_code=404, detail="No feedback recorded for that week.")
    return WeekFeedbackResponse(**data)


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

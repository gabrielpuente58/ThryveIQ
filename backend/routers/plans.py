from fastapi import APIRouter, HTTPException, Query
from models.plan import GeneratePlanRequest, PlanResponse, Session, Phase
from db.supabase import supabase
from services.phases import calculate_phases
from services.llm import generate_phase_sessions, generate_phase_previews
from services.plan_engine import generate_plan as generate_plan_fallback

router = APIRouter(prefix="/plans", tags=["plans"])


@router.post("/generate", response_model=PlanResponse)
async def generate(request: GeneratePlanRequest):
    # Fetch athlete profile
    profile_result = (
        supabase.table("athlete_profiles")
        .select("*")
        .eq("user_id", request.user_id)
        .single()
        .execute()
    )

    if not profile_result.data:
        raise HTTPException(status_code=404, detail="Profile not found. Complete onboarding first.")

    profile = profile_result.data

    # Calculate phases
    phases = calculate_phases(profile["race_date"])

    # Generate first phase sessions via LLM
    first_phase = phases[0]
    all_sessions = await generate_phase_sessions(profile, first_phase, phases)

    # If LLM failed, fall back to rule engine for the whole plan
    if not all_sessions:
        print("LLM failed for first phase, using rule engine fallback")
        fallback = generate_plan_fallback(profile)
        all_sessions = fallback["sessions"]

    # Get previews for future phases
    previews = await generate_phase_previews(profile, phases, first_phase["name"])

    # Attach previews to phase objects
    phase_data = []
    for p in phases:
        phase_data.append({
            **p,
            "preview": previews.get(p["name"], None),
        })

    # Calculate weeks_until_race
    weeks_until_race = phases[-1]["end_week"] if phases else 1

    # Save to Supabase
    row = {
        "user_id": request.user_id,
        "weeks_until_race": weeks_until_race,
        "phases": phase_data,
        "sessions": all_sessions,
    }

    supabase.table("plans").delete().eq("user_id", request.user_id).execute()
    result = supabase.table("plans").insert(row).execute()

    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to save plan")

    saved = result.data[0]
    return PlanResponse(
        id=saved["id"],
        user_id=saved["user_id"],
        generated_at=saved["generated_at"],
        weeks_until_race=saved["weeks_until_race"],
        phases=[Phase(**p) for p in (saved.get("phases") or [])],
        sessions=[Session(**s) for s in saved["sessions"]],
    )


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

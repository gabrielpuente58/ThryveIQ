from fastapi import APIRouter, HTTPException, Query
from models.plan import GeneratePlanRequest, PlanResponse, Session
from db.supabase import supabase
from services.plan_engine import generate_plan
from services.llm import generate_session_descriptions

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

    # Generate plan from rule engine
    plan_data = generate_plan(profile)

    # Generate LLM descriptions for week 1 sessions (batch by week to limit tokens)
    # We do all weeks but send in batches to avoid overwhelming the LLM
    sessions = plan_data["sessions"]
    weeks = set(s["week"] for s in sessions)
    for week in weeks:
        week_sessions = [s for s in sessions if s["week"] == week]
        # Send minimal data to LLM (no description field needed)
        llm_input = [
            {"id": s["id"], "sport": s["sport"], "day": s["day"],
             "zone": s["zone"], "zone_label": s["zone_label"],
             "duration_minutes": s["duration_minutes"]}
            for s in week_sessions
        ]
        desc_map = await generate_session_descriptions(llm_input, profile)
        for s in week_sessions:
            if s["id"] in desc_map:
                s["description"] = desc_map[s["id"]]

    # Upsert to plans table (one active plan per user)
    row = {
        "user_id": request.user_id,
        "weeks_until_race": plan_data["weeks_until_race"],
        "sessions": plan_data["sessions"],
    }

    # Delete existing plan for this user, then insert new one
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

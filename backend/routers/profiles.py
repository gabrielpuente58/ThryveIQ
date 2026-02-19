from fastapi import APIRouter, HTTPException
from models.profile import AthleteProfileRequest, AthleteProfileResponse
from db.supabase import supabase

router = APIRouter(prefix="/profiles", tags=["profiles"])


@router.post("", response_model=AthleteProfileResponse)
async def create_profile(profile: AthleteProfileRequest):
    data = profile.model_dump()
    data["race_date"] = data["race_date"].isoformat()

    result = (
        supabase.table("athlete_profiles")
        .upsert(data, on_conflict="user_id")
        .execute()
    )

    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to save profile")

    return AthleteProfileResponse(**result.data[0])


@router.get("/{user_id}", response_model=AthleteProfileResponse)
async def get_profile(user_id: str):
    result = (
        supabase.table("athlete_profiles")
        .select("*")
        .eq("user_id", user_id)
        .single()
        .execute()
    )

    if not result.data:
        raise HTTPException(status_code=404, detail="Profile not found")

    return AthleteProfileResponse(**result.data)

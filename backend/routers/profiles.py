from fastapi import APIRouter, HTTPException
from models.profile import AthleteProfileRequest, AthleteProfileResponse, UpdateProfileRequest
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


@router.patch("/{user_id}")
async def update_profile(user_id: str, body: UpdateProfileRequest):
    update_data = {k: v for k, v in body.model_dump().items() if v is not None}

    if not update_data:
        return {"success": True}

    result = (
        supabase.table("athlete_profiles")
        .update(update_data)
        .eq("user_id", user_id)
        .execute()
    )

    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to update profile")

    return {"success": True}

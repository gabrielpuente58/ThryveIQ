from db.supabase import supabase


def upsert_tokens(user_id: str, access_token: str, refresh_token: str,
                  expires_at: int, athlete_id: int | None, athlete_name: str | None) -> None:
    supabase.table("strava_tokens").upsert({
        "user_id": user_id,
        "access_token": access_token,
        "refresh_token": refresh_token,
        "expires_at": expires_at,
        "athlete_id": athlete_id,
        "athlete_name": athlete_name,
    }, on_conflict="user_id").execute()


def get_tokens(user_id: str) -> dict | None:
    result = (
        supabase.table("strava_tokens")
        .select("*")
        .eq("user_id", user_id)
        .single()
        .execute()
    )
    return result.data or None


def delete_tokens(user_id: str) -> None:
    supabase.table("strava_tokens").delete().eq("user_id", user_id).execute()

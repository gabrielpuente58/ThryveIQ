import json
from db.supabase import supabase


def get_current_plan(user_id: str) -> str:
    """Fetch the user's current training plan."""
    result = (
        supabase.table("plans")
        .select("*")
        .eq("user_id", user_id)
        .order("generated_at", desc=True)
        .limit(1)
        .execute()
    )
    if not result.data:
        return "No training plan found. The athlete hasn't generated a plan yet."

    plan = result.data[0]
    sessions = plan["sessions"]
    weeks = set(s["week"] for s in sessions)
    summary = f"Plan has {len(weeks)} weeks, {len(sessions)} total sessions.\n\n"
    for week in sorted(weeks)[:4]:
        week_sessions = [s for s in sessions if s["week"] == week]
        summary += f"Week {week}:\n"
        for s in week_sessions:
            summary += f"  {s['day']}: {s['sport']} - {s['duration_minutes']}min Z{s['zone']} ({s['zone_label']})\n"
        summary += "\n"
    if len(weeks) > 4:
        summary += f"... and {len(weeks) - 4} more weeks.\n"
    return summary


def get_user_zones(user_id: str) -> str:
    """Fetch the user's training zones."""
    result = (
        supabase.table("athlete_profiles")
        .select("zones")
        .eq("user_id", user_id)
        .single()
        .execute()
    )
    if not result.data or not result.data.get("zones"):
        return "No training zones have been calculated yet for this athlete."
    return json.dumps(result.data["zones"], indent=2)


def get_athlete_profile(user_id: str) -> str:
    """Fetch the athlete's profile and guide rails."""
    result = (
        supabase.table("athlete_profiles")
        .select("*")
        .eq("user_id", user_id)
        .single()
        .execute()
    )
    if not result.data:
        return "No athlete profile found."

    p = result.data
    return (
        f"Goal: {p['goal']}\n"
        f"Race date: {p['race_date']}\n"
        f"Experience: {p['experience']}\n"
        f"Background: {p['current_background']}\n"
        f"Weekly hours: {p['weekly_hours']}\n"
        f"Days available: {p['days_available']}\n"
        f"Strongest: {p['strongest_discipline']}\n"
        f"Weakest: {p['weakest_discipline']}"
    )


TOOLS = {
    "get_current_plan": get_current_plan,
    "get_user_zones": get_user_zones,
    "get_athlete_profile": get_athlete_profile,
}

TOOL_DESCRIPTIONS = """Available tools (use EXACTLY these names when calling a tool):

1. get_current_plan - Call this when the user asks about their training plan, upcoming workouts, weekly schedule, or what they should do next.
2. get_user_zones - Call this when the user asks about their heart rate zones, pace zones, power zones, or training intensity targets.
3. get_athlete_profile - Call this when you need the athlete's profile details like their goal, experience level, availability, or disciplines.

To use a tool, respond with JSON: {"tool": "tool_name"}
Only call ONE tool at a time. If no tool is needed, respond normally."""

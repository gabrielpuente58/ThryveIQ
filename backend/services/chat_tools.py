import json
from datetime import date, datetime, timedelta
from db.supabase import supabase
from services.strava import get_athlete_activities


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
    weeks_until_race = plan.get("weeks_until_race") or len(weeks)

    # Compute "today's plan week" from the athlete's race_date.
    today = date.today()
    today_weekday = today.strftime("%A")
    current_week: int | None = None

    profile_res = (
        supabase.table("athlete_profiles")
        .select("race_date")
        .eq("user_id", user_id)
        .single()
        .execute()
    )
    race_date_str = profile_res.data.get("race_date") if profile_res.data else None
    if race_date_str:
        try:
            race_date = datetime.strptime(race_date_str, "%Y-%m-%d").date()
            plan_start = race_date - timedelta(weeks=weeks_until_race)
            days_in = (today - plan_start).days
            if 0 <= days_in:
                current_week = min(weeks_until_race, days_in // 7 + 1)
            else:
                current_week = 1  # plan hasn't started yet
        except ValueError:
            pass

    header = (
        f"Today is {today_weekday}, {today.strftime('%B %-d, %Y')}.\n"
        f"Plan has {len(weeks)} weeks generated of {weeks_until_race} total, "
        f"{len(sessions)} total sessions.\n"
    )
    if current_week is not None:
        header += f"This is week {current_week} of the plan.\n"
        todays_sessions = [s for s in sessions if s.get("week") == current_week and s.get("day") == today_weekday]
        if todays_sessions:
            header += "Today's session(s):\n"
            for s in todays_sessions:
                header += f"  {s['sport']} - {s['duration_minutes']}min Z{s['zone']} ({s['zone_label']}): {s.get('description', '')}\n"
        else:
            header += "No session scheduled for today (rest day).\n"
    header += "\n"

    summary = header
    # Show current week first (if known), then surrounding weeks
    weeks_to_show = sorted(weeks)
    if current_week is not None:
        weeks_to_show = [w for w in weeks_to_show if abs(w - current_week) <= 2][:4]
    else:
        weeks_to_show = weeks_to_show[:4]

    for week in weeks_to_show:
        week_sessions = [s for s in sessions if s["week"] == week]
        marker = " (THIS WEEK)" if week == current_week else ""
        summary += f"Week {week}{marker}:\n"
        for s in week_sessions:
            summary += f"  {s['day']}: {s['sport']} - {s['duration_minutes']}min Z{s['zone']} ({s['zone_label']})\n"
        summary += "\n"
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
    hours_min = p.get("hours_min") or p.get("weekly_hours")
    hours_max = p.get("hours_max") or p.get("weekly_hours")
    lines = [
        f"Goal: {p.get('goal', '-')}",
        f"Race date: {p.get('race_date', '-')}",
        f"Experience: {p.get('experience', '-')}",
        f"Weekly hours: {hours_min}–{hours_max}",
        f"Days available: {p.get('days_available', '-')}",
        f"Strongest: {p.get('strongest_discipline', '-')}",
        f"Weakest: {p.get('weakest_discipline', '-')}",
        f"Focus: {p.get('focus_discipline') or p.get('weakest_discipline', '-')}",
    ]
    ftp, lthr, css = p.get("ftp") or 0, p.get("lthr") or 0, p.get("css") or ""
    if ftp:
        lines.append(f"FTP: {ftp}w")
    if lthr:
        lines.append(f"LTHR: {lthr}bpm")
    if css:
        lines.append(f"CSS: {css}/km")
    return "\n".join(lines)


async def get_strava_activities(user_id: str, limit: int = 10) -> str:
    """Fetch recent Strava activities and format as readable text."""
    activities = await get_athlete_activities(user_id, limit)
    if not activities:
        return "No Strava activities found. The athlete may not have connected Strava."

    lines: list[str] = []
    for a in activities:
        sport = a.get("sport_type") or a.get("type", "Unknown")
        name = a.get("name", "Untitled")
        date_str = a.get("start_date_local", "")[:10]  # YYYY-MM-DD
        dist_m = a.get("distance", 0)
        dist_mi = dist_m / 1609.34
        moving_s = a.get("moving_time", 0)
        moving_min = moving_s // 60
        elev_m = a.get("total_elevation_gain", 0)
        elev_ft = elev_m * 3.28084
        avg_hr = a.get("average_heartrate")
        hr_str = f", avg HR {int(avg_hr)}bpm" if avg_hr else ""
        lines.append(
            f"- {date_str} | {sport}: {name} | {dist_mi:.1f}mi in {moving_min}min{hr_str}, elev gain {elev_ft:.0f}ft"
        )

    return f"Recent Strava activities ({len(activities)}):\n" + "\n".join(lines)


TOOLS = {
    "get_current_plan": get_current_plan,
    "get_user_zones": get_user_zones,
    "get_athlete_profile": get_athlete_profile,
    "get_strava_activities": get_strava_activities,
}

TOOL_DESCRIPTIONS = """Available tools (use EXACTLY these names when calling a tool):

1. get_current_plan - Call this when the user asks about their training plan, upcoming workouts, weekly schedule, or what they should do next.
2. get_user_zones - Call this when the user asks about their heart rate zones, pace zones, power zones, or training intensity targets.
3. get_athlete_profile - Call this when you need the athlete's profile details like their goal, experience level, availability, or disciplines.
4. get_strava_activities - Call this when the user asks about recent workouts, recent runs/rides/swims, Strava activities, past training, how much they've been training, or their training history.

To use a tool, respond with JSON: {"tool": "tool_name"}
Only call ONE tool at a time. If no tool is needed, respond normally."""

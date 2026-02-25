import os
import json
import httpx
from dotenv import load_dotenv

load_dotenv()

OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.1")

DAYS_OF_WEEK = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


async def ollama_generate(prompt: str, system: str = "", format_json: bool = False) -> str:
    """Send a prompt to Ollama and return the response text."""
    payload: dict = {
        "model": OLLAMA_MODEL,
        "prompt": prompt,
        "stream": False,
    }
    if system:
        payload["system"] = system
    if format_json:
        payload["format"] = "json"

    async with httpx.AsyncClient(timeout=180.0) as client:
        res = await client.post(f"{OLLAMA_HOST}/api/generate", json=payload)
        res.raise_for_status()
        return res.json()["response"]


async def ollama_chat(messages: list[dict], system: str = "", format_json: bool = False) -> str:
    """Send a chat conversation to Ollama and return the assistant response."""
    chat_messages = []
    if system:
        chat_messages.append({"role": "system", "content": system})
    chat_messages.extend(messages)

    payload: dict = {
        "model": OLLAMA_MODEL,
        "messages": chat_messages,
        "stream": False,
    }
    if format_json:
        payload["format"] = "json"

    async with httpx.AsyncClient(timeout=180.0) as client:
        res = await client.post(f"{OLLAMA_HOST}/api/chat", json=payload)
        res.raise_for_status()
        return res.json()["message"]["content"]


def _extract_json(text: str) -> dict | None:
    """Extract a JSON object from text that may contain thinking/extra content."""
    # Try direct parse first
    text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Find the outermost JSON object
    start = text.find("{")
    if start == -1:
        return None

    depth = 0
    for i in range(start, len(text)):
        if text[i] == "{":
            depth += 1
        elif text[i] == "}":
            depth -= 1
            if depth == 0:
                try:
                    return json.loads(text[start:i + 1])
                except json.JSONDecodeError:
                    return None
    return None


PLAN_SYSTEM = """You are an expert Ironman 70.3 triathlon coach. Return ONLY valid JSON — no markdown, no explanation, no extra text.

Session rules:
- Each session: id, week, day, sport, duration_minutes, zone (1-5), zone_label, description
- zone_label: Recovery (Z1), Aerobic (Z2), Tempo (Z3), Threshold (Z4), VO2max (Z5)
- sport: swim, bike, run
- id format: w{week}_d{day_number}_{sport}
- description: 2-3 sentences with specific coaching cues for the sport, zone, and athlete level
- Include recovery weeks (every 3-4 weeks): reduce volume ~40%, zones 1-2 only
- Polarized model: ~70% Z1-2, ~20% Z3, ~10% Z4-5
- Vary session types: endurance, tempo, intervals, technique/drills, brick workouts"""


async def generate_phase_sessions(profile: dict, phase: dict, all_phases: list[dict]) -> list[dict]:
    """Have the LLM generate sessions for a phase, one week at a time."""
    days = profile["days_available"]
    training_days = DAYS_OF_WEEK[:days]
    weekly_minutes = int(profile["weekly_hours"] * 60)
    is_recovery_interval = 4  # every 4th week is recovery

    all_sessions = []

    for week_num in range(phase["start_week"], phase["end_week"] + 1):
        is_recovery = week_num % is_recovery_interval == 0
        week_minutes = int(weekly_minutes * 0.6) if is_recovery else weekly_minutes
        week_type = "RECOVERY week (reduce volume ~40%, zones 1-2 only)" if is_recovery else f"normal {phase['name']} training week"

        max_sessions = days + days // 2  # up to 1.5x days for 2-a-days

        prompt = f"""Generate {days} to {max_sessions} training sessions for week {week_num}.

Athlete: {profile['experience']} triathlete, goal: {profile['goal']}
Weakest: {profile['weakest_discipline']} (prioritize), Strongest: {profile['strongest_discipline']}
Phase: {phase['name']} — {phase['focus']}
This is a {week_type}.

Available training days: {', '.join(training_days)}
Rules:
- Each day can have 1 or 2 sessions (max 2 per day)
- Use 2 sessions on a day for: brick workouts (bike + run same day) or 2-a-days (e.g. morning swim + evening run)
- Not every day needs 2 sessions — use judgment based on phase and athlete level
- Assign each session a "day" value from the available training days above
- Total weekly volume: ~{week_minutes} minutes spread across all sessions
- All sessions must have week: {week_num}

Return JSON: {{"sessions": [{{"id": "w{week_num}_d1_swim", "week": {week_num}, "day": "{training_days[0]}", "sport": "swim", "duration_minutes": 60, "zone": 2, "zone_label": "Aerobic", "description": "..."}}]}}"""

        try:
            response = await ollama_chat(
                [{"role": "user", "content": prompt}],
                system=PLAN_SYSTEM,
            )
            parsed = _extract_json(response)

            if parsed and "sessions" in parsed:
                week_phase = {"start_week": week_num, "end_week": week_num,
                              "name": phase["name"], "weeks": 1, "focus": phase["focus"]}
                week_sessions = _validate_sessions(parsed["sessions"], week_phase)

                # Enforce max 2 sessions per day and assign stable IDs
                day_counts: dict[str, int] = {}
                assigned = []
                for s in week_sessions:
                    day = s["day"] if s["day"] in training_days else training_days[0]
                    s["day"] = day
                    count = day_counts.get(day, 0) + 1
                    if count > 2:
                        continue  # skip 3rd+ session on same day
                    day_counts[day] = count
                    day_index = training_days.index(day) + 1
                    suffix = "_2" if count == 2 else ""
                    s["id"] = f"w{week_num}_d{day_index}_{s['sport']}{suffix}"
                    assigned.append(s)

                all_sessions.extend(assigned)
            else:
                print(f"LLM returned no sessions for week {week_num}")

        except Exception as e:
            print(f"LLM failed for week {week_num}: {e}")

    return all_sessions


async def generate_phase_previews(profile: dict, phases: list[dict], generated_phase: str) -> dict:
    """Have the LLM describe what future phases will focus on (no exact workouts)."""
    future_phases = [p for p in phases if p["name"] != generated_phase]
    if not future_phases:
        return {}

    phase_list = "\n".join(
        f"- {p['name']}: weeks {p['start_week']}-{p['end_week']} ({p['weeks']} weeks)"
        for p in future_phases
    )

    prompt = f"""For this {profile['goal']} triathlete ({profile['experience']} level), describe what each future training phase will focus on.

Athlete weakest discipline: {profile['weakest_discipline']}
Athlete strongest discipline: {profile['strongest_discipline']}

Future phases:
{phase_list}

For each phase give: the training focus, key session types they can expect, and how intensity/volume will change.

Return JSON: {{"previews": [{{"phase": "Build", "summary": "2-3 sentence description..."}}]}}"""

    try:
        response = await ollama_chat(
            [{"role": "user", "content": prompt}],
            system="You are an expert Ironman 70.3 triathlon coach. Return ONLY valid JSON.",
        )
        parsed = _extract_json(response)
        if parsed and "previews" in parsed:
            return {p["phase"]: p["summary"] for p in parsed["previews"]}
        return {}
    except Exception as e:
        print(f"LLM phase preview generation failed: {e}")
        return {}


def _validate_sessions(sessions: list, phase: dict) -> list[dict]:
    """Validate and clean up LLM-generated sessions."""
    valid_sports = {"swim", "bike", "run"}
    valid_zones = {1, 2, 3, 4, 5}
    zone_labels = {1: "Recovery", 2: "Aerobic", 3: "Tempo", 4: "Threshold", 5: "VO2max"}
    cleaned = []

    for s in sessions:
        if not isinstance(s, dict):
            continue
        sport = str(s.get("sport", "")).lower()
        zone = s.get("zone", 2)
        week = s.get("week", phase["start_week"])

        if sport not in valid_sports:
            continue
        if zone not in valid_zones:
            zone = 2
        if week < phase["start_week"] or week > phase["end_week"]:
            continue

        cleaned.append({
            "id": s.get("id", f"w{week}_d{len(cleaned) + 1}_{sport}"),
            "week": week,
            "day": s.get("day", "Monday"),
            "sport": sport,
            "duration_minutes": max(20, min(180, int(s.get("duration_minutes", 60)))),
            "zone": zone,
            "zone_label": zone_labels.get(zone, "Aerobic"),
            "description": s.get("description", f"Zone {zone} {sport} session."),
        })

    return cleaned

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
    """Have the LLM generate all sessions for a single training phase."""
    days = profile["days_available"]
    training_days = DAYS_OF_WEEK[:days]
    weekly_minutes = int(profile["weekly_hours"] * 60)

    phase_context = "\n".join(
        f"  - {p['name']}: weeks {p['start_week']}-{p['end_week']} ({p['weeks']} weeks) — {p['focus']}"
        for p in all_phases
    )

    prompt = f"""Generate training sessions for the {phase['name']} phase.

Athlete:
- Goal: {profile['goal']}
- Experience: {profile['experience']}
- Background: {profile['current_background']}
- Strongest: {profile['strongest_discipline']}
- Weakest: {profile['weakest_discipline']} (give ~20% more sessions to this discipline)

Plan overview:
{phase_context}

Current phase: {phase['name']}
- Weeks {phase['start_week']} through {phase['end_week']} ({phase['weeks']} weeks)
- Focus: {phase['focus']}

Constraints:
- {days} sessions per week on: {', '.join(training_days)}
- Weekly volume target: ~{weekly_minutes} minutes ({profile['weekly_hours']} hours)
- Week numbers must be {phase['start_week']} through {phase['end_week']}

Return JSON: {{"sessions": [...]}}"""

    try:
        response = await ollama_chat(
            [{"role": "user", "content": prompt}],
            system=PLAN_SYSTEM,
        )
        parsed = _extract_json(response)

        if not parsed or "sessions" not in parsed:
            return []

        return _validate_sessions(parsed["sessions"], phase)

    except Exception as e:
        print(f"LLM phase generation failed for {phase['name']}: {e}")
        return []


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

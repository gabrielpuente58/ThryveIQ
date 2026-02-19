import os
import json
import httpx
from datetime import date
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


def _weeks_until_race(race_date_str: str) -> int:
    race_date = date.fromisoformat(race_date_str) if isinstance(race_date_str, str) else race_date_str
    delta = race_date - date.today()
    return max(1, delta.days // 7)


async def generate_plan_with_llm(profile: dict) -> dict:
    """Have the LLM build an entire training plan based on guide rail constraints."""
    weeks = _weeks_until_race(profile["race_date"])
    days = profile["days_available"]
    training_days = DAYS_OF_WEEK[:days]

    system = """You are an expert Ironman 70.3 triathlon coach building a personalized training plan.
You must return ONLY valid JSON — no markdown, no explanation, no extra text.

Rules:
- Each session must have: id, week, day, sport, duration_minutes, zone (1-5), zone_label, description
- zone_label must be one of: Recovery, Aerobic, Tempo, Threshold, VO2max
- sport must be one of: swim, bike, run
- id format: w{week}_d{day_number}_{sport} (e.g. w1_d1_swim)
- description should be 2-3 sentences with specific coaching cues
- Use periodization: build for 3 weeks, recovery week every 4th week
- Recovery weeks should reduce volume by ~40% and keep zones at 1-2
- Follow polarized training: ~70% Zone 1-2, ~20% Zone 3, ~10% Zone 4-5
- Include variety: long sessions, tempo work, intervals, technique/drill sessions, brick workouts
- Total weekly duration must stay within the athlete's weekly hours budget"""

    prompt = f"""Build a complete training plan with these constraints:

Athlete:
- Goal: {profile['goal']}
- Experience: {profile['experience']}
- Race date: {profile['race_date']} ({weeks} weeks away)
- Weekly hours available: {profile['weekly_hours']}
- Training days per week: {days} ({', '.join(training_days)})
- Strongest discipline: {profile['strongest_discipline']}
- Weakest discipline: {profile['weakest_discipline']}
- Background: {profile['current_background']}

Requirements:
- Generate {weeks} weeks of training
- {days} sessions per week on {', '.join(training_days)}
- Give the weakest discipline ({profile['weakest_discipline']}) ~20% more sessions
- Total duration per week should be close to {profile['weekly_hours']} hours ({int(profile['weekly_hours'] * 60)} minutes)
- Recovery weeks (every 4th week): reduce to ~{int(profile['weekly_hours'] * 0.6 * 60)} minutes total

Return JSON: {{"sessions": [...]}}"""

    try:
        response = await ollama_generate(prompt, system=system, format_json=True)
        parsed = json.loads(response)
        sessions = parsed.get("sessions", [])

        if not sessions:
            return None

        # Validate and clean up sessions
        valid_sports = {"swim", "bike", "run"}
        valid_zones = {1, 2, 3, 4, 5}
        zone_labels = {1: "Recovery", 2: "Aerobic", 3: "Tempo", 4: "Threshold", 5: "VO2max"}
        cleaned = []

        for s in sessions:
            sport = s.get("sport", "").lower()
            zone = s.get("zone", 2)
            if sport not in valid_sports:
                continue
            if zone not in valid_zones:
                zone = 2

            cleaned.append({
                "id": s.get("id", f"w{s.get('week', 1)}_d{len(cleaned) + 1}_{sport}"),
                "week": s.get("week", 1),
                "day": s.get("day", "Monday"),
                "sport": sport,
                "duration_minutes": max(20, min(180, s.get("duration_minutes", 60))),
                "zone": zone,
                "zone_label": zone_labels.get(zone, "Aerobic"),
                "description": s.get("description", f"Zone {zone} {sport} session."),
            })

        return {
            "weeks_until_race": weeks,
            "sessions": cleaned,
        }

    except Exception as e:
        print(f"LLM plan generation failed: {e}")
        return None

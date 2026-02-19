import os
import json
import httpx
from dotenv import load_dotenv

load_dotenv()

OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.1")


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

    async with httpx.AsyncClient(timeout=120.0) as client:
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

    async with httpx.AsyncClient(timeout=120.0) as client:
        res = await client.post(f"{OLLAMA_HOST}/api/chat", json=payload)
        res.raise_for_status()
        return res.json()["message"]["content"]


async def generate_session_descriptions(sessions: list[dict], profile: dict) -> list[dict]:
    """Given structured sessions and athlete profile, generate descriptions via LLM."""
    system = """You are an expert triathlon coach. Given a list of training sessions with their
sport, zone, duration, and day, write a helpful 2-3 sentence description for each session.
The description should include specific coaching cues relevant to the sport and intensity zone.

Respond in JSON format: {"descriptions": [{"id": "session_id", "description": "..."}]}"""

    prompt = f"""Athlete profile:
- Goal: {profile.get('goal')}
- Experience: {profile.get('experience')}
- Race date: {profile.get('race_date')}
- Strongest: {profile.get('strongest_discipline')}
- Weakest: {profile.get('weakest_discipline')}

Sessions to describe:
{json.dumps(sessions, indent=2)}

Write a 2-3 sentence coaching description for each session. Return JSON only."""

    try:
        response = await ollama_generate(prompt, system=system, format_json=True)
        parsed = json.loads(response)
        desc_map = {d["id"]: d["description"] for d in parsed.get("descriptions", [])}
        return desc_map
    except Exception as e:
        print(f"LLM description generation failed: {e}")
        return {}

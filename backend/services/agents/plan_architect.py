"""
Plan Architect Agent — Agent 1 of 3 in ThryveIQ's LangChain plan generation pipeline.

Responsibility:
  - Takes athlete guide rails (goal, experience, weeks_until_race, weekly_hours, etc.)
  - Decides training phases (Base / Build / Peak / Taper), week counts per phase,
    session type mix per phase, and intensity distribution targets.
  - Does NOT generate individual workout sessions — that is the Workout Builder's job.

Tools available to this agent:
  - compute_zones: call to understand the athlete's HR/power/pace zone ranges
    before deciding intensity distribution targets.

Output:
  - PlanBlueprint: validated Pydantic model with all phases + total_weeks + notes.
"""
from __future__ import annotations

import json
import os
from datetime import date

from dotenv import load_dotenv
from langchain.agents import create_agent
from langchain_ollama import ChatOllama

from models.blueprint import PlanBlueprint
from services.tools.compute_zones import compute_zones

load_dotenv()

OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.1")

_SYSTEM = """You are an expert Ironman 70.3 triathlon coach and periodization specialist.

Your ONLY job is to design a high-level training phase blueprint for an athlete.
Do NOT generate individual workout sessions — those come later.

Rules for phase design:
- Use phase names from: Base, Build, Peak, Taper
- Standard distribution for 10+ weeks: Base (40%), Build (35%), Peak (15%), Taper (10%)
- For < 6 weeks: Base + Taper only
- For 6-9 weeks: Base + Build + Taper
- For 10+ weeks: Base + Build + Peak + Taper
- total_weeks MUST equal the exact sum of all phase.weeks values
- weekly_structure_template keys must be swim / bike / run (no other sports for MVP)
- Training sport split: ~20% swim, ~50% bike, ~30% run (by session count)
- Weakest discipline gets ~20% more sessions than the template average
- intensity_distribution_target: use '80/20' for Base, '75/25' for Build,
  '70/30' for Peak, '90/10' for Taper (easy/hard split)
- You MAY call compute_zones if you want concrete zone ranges to inform targets
- Return a complete, valid blueprint with all required fields
"""

_HUMAN_TEMPLATE = """Design a training phase blueprint for this athlete:

Goal: {goal}
Experience: {experience}
Race date: {race_date}
Weeks until race: {weeks_until_race}
Weekly training hours: {weekly_hours}
Days available per week: {days_available}
Strongest discipline: {strongest_discipline}
Weakest discipline: {weakest_discipline}
Current background: {current_background}

Produce a PlanBlueprint with all phases, total_weeks, and coaching notes."""


def _weeks_until_race(race_date_str: str) -> int:
    """Calculate weeks from today until the race date."""
    race = date.fromisoformat(race_date_str)
    today = date.today()
    delta = (race - today).days
    return max(1, delta // 7)


def _parse_blueprint(raw: str | dict) -> PlanBlueprint:
    """
    Parse the agent's output into a validated PlanBlueprint.

    The agent may return a dict (structured output) or a JSON string.
    Auto-corrects total_weeks if the model computed it incorrectly.
    """
    if isinstance(raw, dict):
        data = raw
    else:
        data = json.loads(raw)

    # Handle extra nesting some models add
    if "phases" not in data and "properties" in data:
        data = data["properties"]

    # Auto-correct total_weeks to match actual phase sum
    if "phases" in data:
        computed_sum = sum(p.get("weeks", 0) for p in data["phases"])
        data["total_weeks"] = computed_sum

    return PlanBlueprint.model_validate(data)


async def run_plan_architect(profile: dict) -> PlanBlueprint:
    """
    Run the Plan Architect Agent for the given athlete profile dict.

    Uses langchain.agents.create_agent with:
    - ChatOllama (format="json", temperature=0) for deterministic, structured output
    - compute_zones tool for optional zone lookup
    - response_format=PlanBlueprint for structured Pydantic output

    Args:
        profile: Athlete profile row from Supabase (athlete_profiles table).
                 Must contain: goal, experience, race_date, weekly_hours,
                 days_available, strongest_discipline, weakest_discipline,
                 current_background.

    Returns:
        PlanBlueprint — validated Pydantic model with all phases.

    Raises:
        ValueError: if the agent output cannot be parsed into a valid PlanBlueprint.
    """
    weeks = _weeks_until_race(profile["race_date"])

    llm = ChatOllama(
        model=OLLAMA_MODEL,
        base_url=OLLAMA_HOST,
        temperature=0,
        format="json",
    )

    # response_format is not supported by Ollama's API — we use format="json" on the
    # model and parse the output manually with _parse_blueprint instead.
    agent = create_agent(
        model=llm,
        tools=[compute_zones],
        system_prompt=_SYSTEM,
    )

    human_message = _HUMAN_TEMPLATE.format(
        goal=profile.get("goal", "recreational"),
        experience=profile.get("experience", "recreational"),
        race_date=profile.get("race_date", ""),
        weeks_until_race=weeks,
        weekly_hours=profile.get("weekly_hours", 8),
        days_available=profile.get("days_available", 5),
        strongest_discipline=profile.get("strongest_discipline", "bike"),
        weakest_discipline=profile.get("weakest_discipline", "swim"),
        current_background=profile.get("current_background", "General fitness"),
    )

    result = await agent.ainvoke({"messages": [("human", human_message)]})

    # LangGraph returns the final messages; extract the structured response
    # When response_format is set, the last message content is the Pydantic model
    messages = result.get("messages", [])
    if not messages:
        raise ValueError("Plan Architect agent returned no messages.")

    last_message = messages[-1]

    # Structured output: content may already be a PlanBlueprint or dict
    content = getattr(last_message, "content", last_message)

    if isinstance(content, PlanBlueprint):
        return content

    try:
        return _parse_blueprint(content)
    except Exception as exc:
        raise ValueError(
            f"Plan Architect returned unparseable output.\n"
            f"Raw content: {content!r}\n"
            f"Error: {exc}"
        ) from exc

"""
Plan Architect Agent — Agent 1 of 3 in ThryveIQ's LangGraph plan generation pipeline.

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

Graph structure:
  START → call_llm → routing_function → run_compute_zones → call_llm (loop)
                                      → parse_result → END
"""
from __future__ import annotations

import json
import operator
import os
import re
from datetime import date
from typing import Annotated, TypedDict

from dotenv import load_dotenv
from langchain_anthropic import ChatAnthropic
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage
from langgraph.graph import END, START, StateGraph

from models.blueprint import PlanBlueprint
from services.tools.compute_zones import compute_zones

load_dotenv()

ANTHROPIC_MODEL = os.getenv("ANTHROPIC_MODEL_ARCHITECT", "claude-haiku-4-5-20251001")

_MAX_TOOL_LOOPS = 5

_SYSTEM = """You are an expert Ironman 70.3 triathlon coach and periodization specialist.

Your ONLY job is to design a high-level training phase blueprint for an athlete.
Do NOT generate individual workout sessions — those come later.

OUTPUT FORMAT — return exactly this JSON structure (no extra fields, no markdown):
{
  "phases": [
    {
      "phase_name": "Base",
      "weeks": 4,
      "intensity_distribution_target": "80/20",
      "weekly_structure_template": {"swim": 4, "bike": 3, "run": 3},
      "focus": "1-2 sentence description of phase goal"
    }
  ],
  "total_weeks": 10,
  "notes": "Brief rationale for the phase structure"
}

FIELD NAMES — use exactly these names:
- phase_name (not "name", not "phase", not "title")
- focus (not "coaching_notes", not "description", not "objective")
- notes (not "coaching_notes", not "plan_notes")
- weekly_structure_template (not "session_mix", not "sessions")

PHASE DESIGN RULES:
- Use 3-4 phases maximum with UNIQUE names from: Base, Build, Peak, Taper
- Do NOT repeat the same phase name
- For < 6 weeks: Base + Taper only (2 phases)
- For 6-9 weeks: Base + Build + Taper (3 phases)
- For 10+ weeks: Base + Build + Peak + Taper (4 phases)
- total_weeks = sum of all phase.weeks values (e.g. 4 + 3 + 2 + 1 = 10)
- weekly_structure_template: keys must be swim, bike, run only

SESSION COUNT RULES:
- Distribute sessions EVENLY across all three sports throughout the week
- A typical week looks like: {"swim": 3, "bike": 3, "run": 3} or {"swim": 4, "bike": 4, "run": 4}
- The 20% swim / 50% bike / 30% run split refers to TRAINING TIME (duration), NOT session count
  - Bike sessions are longer (60-120 min) so they accumulate more time with fewer or equal sessions
  - Swim sessions are shorter (30-60 min) so equal session counts still produce the correct time split
- Weakest discipline gets 1 extra session per week compared to the others
  - e.g. if weakest is swim and base is 3 sessions each: {"swim": 4, "bike": 3, "run": 3}
- Minimum 2 sessions per sport per week

- intensity_distribution_target: '80/20' Base, '75/25' Build, '70/30' Peak, '90/10' Taper
- You MAY call compute_zones to understand zone ranges before deciding targets
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


# ---------------------------------------------------------------------------
# State definition
# ---------------------------------------------------------------------------

class AgentState(TypedDict):
    """LangGraph state for the Plan Architect graph."""

    # Append reducer — messages accumulate across nodes
    messages: Annotated[list, operator.add]

    # Replace semantics — only the current batch of pending tool calls is stored
    tool_calls: list

    # Replace semantics — the athlete profile dict passed in at invocation time
    profile: dict

    # Replace semantics — populated by parse_result node, None until then
    result: PlanBlueprint | None

    # Replace semantics — tracks how many times call_llm has run to prevent loops
    call_count: int


# ---------------------------------------------------------------------------
# Helper functions (kept exactly as before)
# ---------------------------------------------------------------------------

def _weeks_until_race(race_date_str: str) -> int:
    """Calculate weeks from today until the race date."""
    race = date.fromisoformat(race_date_str)
    today = date.today()
    delta = (race - today).days
    return max(1, delta // 7)


def _normalize_phase(phase: dict) -> dict:
    """
    Normalize a phase dict to match PhaseBlueprint field names.

    Models sometimes use abbreviated field names like 'name' instead of
    'phase_name', or 'coaching_notes' instead of 'focus'. This function maps
    all known variants to the canonical field names.
    """
    out = dict(phase)

    # phase_name aliases
    if "phase_name" not in out:
        for alt in ("name", "phase", "phase_label", "title"):
            if alt in out:
                out["phase_name"] = out.pop(alt)
                break

    # focus aliases
    if "focus" not in out:
        for alt in ("coaching_notes", "description", "summary", "objective", "notes"):
            if alt in out:
                out["focus"] = out.pop(alt)
                break

    # intensity_distribution_target aliases
    if "intensity_distribution_target" not in out:
        for alt in ("intensity_target", "intensity", "distribution", "zone_distribution"):
            if alt in out:
                out["intensity_distribution_target"] = out.pop(alt)
                break
        else:
            out.setdefault("intensity_distribution_target", "80/20")

    # weekly_structure_template aliases
    if "weekly_structure_template" not in out:
        for alt in ("session_template", "session_mix", "sessions_per_week", "structure"):
            if alt in out:
                out["weekly_structure_template"] = out.pop(alt)
                break

    # Ensure weekly_structure_template only has valid sport keys
    template = out.get("weekly_structure_template", {})
    if isinstance(template, dict):
        valid = {k: v for k, v in template.items() if k in ("swim", "bike", "run")}
        if valid:
            out["weekly_structure_template"] = valid
        else:
            out["weekly_structure_template"] = {"swim": 2, "bike": 3, "run": 3}

    return out


def _extract_json(text: str) -> str:
    """Pull a JSON object out of an LLM response that may include prose/fences."""
    fence = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    if fence:
        return fence.group(1)
    first = text.find("{")
    last = text.rfind("}")
    if first != -1 and last != -1 and last > first:
        return text[first : last + 1]
    return text.strip()


def _parse_blueprint(raw: str | dict) -> PlanBlueprint:
    """
    Parse the agent's output into a validated PlanBlueprint.

    The agent may return a dict (structured output) or a JSON string.
    Handles common LLM field name variations and auto-corrects total_weeks.
    """
    if isinstance(raw, dict):
        data = raw
    else:
        data = json.loads(_extract_json(raw))

    # Handle extra nesting some models add
    if "phases" not in data and "properties" in data:
        data = data["properties"]

    # Normalize top-level 'notes' field
    if "notes" not in data:
        for alt in ("coaching_notes", "plan_notes", "rationale", "summary"):
            if alt in data:
                data["notes"] = data.pop(alt)
                break
        else:
            data["notes"] = "Training blueprint generated by Plan Architect."

    # Normalize each phase's field names
    if "phases" in data:
        data["phases"] = [_normalize_phase(p) for p in data["phases"]]

        # Deduplicate phases — model sometimes repeats the same phase block.
        # Keep first occurrence of each unique phase_name.
        seen_names: set[str] = set()
        deduped = []
        for p in data["phases"]:
            name = p.get("phase_name", "")
            if name not in seen_names:
                seen_names.add(name)
                deduped.append(p)
        data["phases"] = deduped

        # Clamp weeks to minimum 1 — LLM sometimes returns 0 for short timelines
        for p in data["phases"]:
            if p.get("weeks", 1) < 1:
                p["weeks"] = 1

        # Auto-correct total_weeks to match actual (deduplicated) phase sum
        computed_sum = sum(p.get("weeks", 0) for p in data["phases"])
        data["total_weeks"] = computed_sum

    return PlanBlueprint.model_validate(data)


# ---------------------------------------------------------------------------
# LLM instance (module-level so the graph reuses it)
# ---------------------------------------------------------------------------

def _make_llm() -> ChatAnthropic:
    return ChatAnthropic(
        model_name=ANTHROPIC_MODEL,
        temperature=0,
        max_tokens=4096,
        timeout=60,
        stop=None,
    )


# ---------------------------------------------------------------------------
# Graph nodes
# ---------------------------------------------------------------------------

def _call_llm(state: AgentState) -> dict:
    """
    Build the full message list from state and invoke the LLM with compute_zones
    bound as a tool. Returns new messages (the AIMessage) and the tool_calls
    extracted from that response.
    """
    llm = _make_llm()
    llm_with_tools = llm.bind_tools([compute_zones])

    # Build the message list: system prompt + all prior messages
    system_msg = SystemMessage(content=_SYSTEM)
    messages = [system_msg] + list(state["messages"])

    response: AIMessage = llm_with_tools.invoke(messages)

    tool_calls = response.tool_calls if hasattr(response, "tool_calls") and response.tool_calls else []

    return {
        "messages": [response],
        "tool_calls": tool_calls,
        "call_count": state.get("call_count", 0) + 1,
    }


def _run_compute_zones(state: AgentState) -> dict:
    """
    Execute the first pending tool call (expected to be compute_zones).
    Pops it from tool_calls and appends a ToolMessage so the LLM sees the result
    on the next call_llm invocation.
    """
    pending = list(state["tool_calls"])
    tool_call = pending[0]
    remaining = pending[1:]

    # Execute the tool — args is a dict matching compute_zones parameters
    tool_result = compute_zones.invoke(tool_call["args"])

    tool_message = ToolMessage(
        content=json.dumps(tool_result),
        name=tool_call["name"],
        tool_call_id=tool_call["id"],
    )

    return {
        "messages": [tool_message],
        "tool_calls": remaining,
    }


def _parse_result(state: AgentState) -> dict:
    """
    Extract the JSON blueprint from the last AIMessage content and validate it
    into a PlanBlueprint. Stores the result in state["result"].
    """
    # Walk messages in reverse to find the last AIMessage with content
    content = None
    for msg in reversed(state["messages"]):
        if isinstance(msg, AIMessage) and msg.content:
            content = msg.content
            break

    if content is None:
        raise ValueError("Plan Architect: no AIMessage content found to parse.")

    # Anthropic returns content as a list of blocks; flatten to text.
    if isinstance(content, list):
        content = "".join(
            block.get("text", "") if isinstance(block, dict) else str(block)
            for block in content
        ).strip()

    try:
        blueprint = _parse_blueprint(content)
    except Exception as exc:
        raise ValueError(
            f"Plan Architect returned unparseable output.\n"
            f"Raw content: {content!r}\n"
            f"Error: {exc}"
        ) from exc

    return {"result": blueprint}


# ---------------------------------------------------------------------------
# Routing function
# ---------------------------------------------------------------------------

def _routing_function(state: AgentState) -> str:
    """
    Decide which node to visit after call_llm:
    - If call_count exceeded the safety limit, go straight to parse_result.
    - If there are pending tool calls and the first is compute_zones, run it.
    - Otherwise, parse the LLM's final response.
    """
    if state.get("call_count", 0) > _MAX_TOOL_LOOPS:
        return "parse_result"

    pending = state.get("tool_calls", [])
    if pending and pending[0].get("name") == "compute_zones":
        return "run_compute_zones"

    return "parse_result"


# ---------------------------------------------------------------------------
# Graph compilation
# ---------------------------------------------------------------------------

def _build_graph() -> StateGraph:
    workflow = StateGraph(AgentState)

    workflow.add_node("call_llm", _call_llm)
    workflow.add_node("run_compute_zones", _run_compute_zones)
    workflow.add_node("parse_result", _parse_result)

    workflow.add_edge(START, "call_llm")
    workflow.add_conditional_edges(
        "call_llm",
        _routing_function,
        ["run_compute_zones", "parse_result"],
    )
    workflow.add_edge("run_compute_zones", "call_llm")
    workflow.add_edge("parse_result", END)

    return workflow.compile()


# Compile once at module import time
_graph = _build_graph()


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

async def run_plan_architect(profile: dict) -> PlanBlueprint:
    """
    Run the Plan Architect StateGraph for the given athlete profile dict.

    Uses a LangGraph StateGraph with:
    - ChatAnthropic (temperature=0) for deterministic, structured output
    - compute_zones tool for optional zone lookup (loops back to LLM with result)
    - _parse_blueprint() to validate the final AIMessage into a PlanBlueprint

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

    human_text = _HUMAN_TEMPLATE.format(
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

    initial_state: AgentState = {
        "messages": [HumanMessage(content=human_text)],
        "tool_calls": [],
        "profile": profile,
        "result": None,
        "call_count": 0,
    }

    result_state = await _graph.ainvoke(initial_state)

    blueprint = result_state.get("result")
    if blueprint is None:
        raise ValueError("Plan Architect graph completed but result is None.")

    return blueprint

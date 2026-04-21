"""
Workout Expander Agent — Agent 3 of 3 in ThryveIQ's LangGraph plan generation pipeline.

Responsibility:
  - Runs on demand when a user taps a session in the app.
  - Takes a single session skeleton (id, week, day, sport, duration_minutes, zone,
    zone_label, description) plus the athlete's zones and profile.
  - Expands the session into a full workout: warmup, main_set, cooldown, zone_ranges,
    and coaching_notes.
  - Cannot change any structural field — expansion only.

Tools available to this agent:
  - compute_zones: look up exact HR/power/pace zone ranges before writing targets.

Output:
  - WorkoutDetail: validated Pydantic model with the full expanded workout.

Graph structure:
  START → call_llm → routing_function → run_tool → call_llm (loop)
                                      → parse_result → END
"""
from __future__ import annotations

import json
import operator
import os
import re
from typing import Annotated, TypedDict

from dotenv import load_dotenv
from langchain_anthropic import ChatAnthropic
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage
from langgraph.graph import END, START, StateGraph

from models.workout_expander import WorkoutDetail
from services.tools.compute_zones import compute_zones

load_dotenv()

ANTHROPIC_MODEL = os.getenv("ANTHROPIC_MODEL_EXPANDER", "claude-haiku-4-5-20251001")

_MAX_TOOL_LOOPS = 5

_SYSTEM = """You are an expert Ironman 70.3 triathlon coach expanding a single training session.

Your ONLY job is to take the session skeleton and produce a detailed workout with:
- warmup: what to do before the main set (~15-20% of total duration_minutes)
- main_set: the core training stimulus (~65-75% of total duration_minutes)
- cooldown: how to finish the session (~10-15% of total duration_minutes)
- zone_ranges: specific physiological targets for this session
- coaching_notes: 1-2 sentences of overall context tailored to the athlete

ZONE GUIDANCE:
- Z1-2 = conversational, very easy to easy aerobic effort
- Z3 = comfortably hard, tempo effort, can speak in short sentences
- Z4 = hard, threshold, difficult to speak
- Z5 = very hard, short intervals only, cannot speak

ZONE RANGES — include only what is relevant to the sport:
- hr: always include heart rate range in bpm (e.g. "140-150bpm")
- power: bike sessions only, in watts (e.g. "190-210w")
- pace: run sessions — per km (e.g. "5:30-6:00/km")
- pace: swim sessions — per 100m (e.g. "1:50-2:00/100m")

TIMING RULES:
- Warmup ~15-20% of total duration_minutes
- Cooldown ~10-15% of total duration_minutes
- Main set gets the rest (65-75%)
- Be specific with intervals, sets, reps, and rest periods in the main_set

COACHING NOTES:
- 1-2 sentences only
- Reference the athlete's experience level (first_timer / recreational / competitive)
- Include a key tip for the session type (e.g. technique cue for swim, pacing tip for run)
- Mention the weakest discipline if it matches this session sport

OUTPUT FORMAT — return exactly this JSON structure (no extra fields, no markdown):
{
  "session_id": "<copy from session id>",
  "warmup": "...",
  "main_set": "...",
  "cooldown": "...",
  "zone_ranges": {"hr": "...", ...},
  "coaching_notes": "..."
}

You MAY call compute_zones to get exact zone ranges before writing zone_ranges.
"""

_HUMAN_TEMPLATE = """Expand this session into a full workout:

Session: {sport} | {duration_minutes} min | Zone {zone} ({zone_label}) | Week {week}, {day}
Session description: {description}

Athlete: {goal} | Experience: {experience}
Strongest: {strongest_discipline} | Weakest: {weakest_discipline}

Zone reference:
{zones_summary}

Return JSON:
{{
  "session_id": "{session_id}",
  "warmup": "...",
  "main_set": "...",
  "cooldown": "...",
  "zone_ranges": {{"hr": "...", ...}},
  "coaching_notes": "..."
}}"""


# ---------------------------------------------------------------------------
# State definition
# ---------------------------------------------------------------------------

class WorkoutExpanderState(TypedDict):
    """LangGraph state for the Workout Expander graph."""

    # Append reducer — messages accumulate across nodes
    messages: Annotated[list, operator.add]

    # Replace semantics — current pending batch of tool calls
    tool_calls: list

    # Replace semantics — the input session skeleton
    session: dict

    # Replace semantics — athlete zones
    zones: dict

    # Replace semantics — athlete profile dict
    athlete_profile: dict

    # Replace semantics — populated by parse_result, None until then
    result: WorkoutDetail | None

    # Replace semantics — tracks call_llm invocations to prevent infinite loops
    call_count: int


# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------

def _zones_summary(zones: dict) -> str:
    """Build a compact zone reference string for the LLM prompt."""
    lines = []

    hr_zones = zones.get("hr_zones", {})
    if hr_zones:
        lines.append("HR Zones:")
        for zname, zdata in hr_zones.items():
            label = zdata.get("label", "")
            zmin = zdata.get("min", "—")
            zmax = zdata.get("max", "—")
            lines.append(f"  {zname} {label}: {zmin}–{zmax} bpm")

    power_zones = zones.get("power_zones", {})
    if power_zones:
        lines.append("Power Zones:")
        for zname, zdata in power_zones.items():
            label = zdata.get("label", "")
            zmin = zdata.get("min", "—")
            zmax = zdata.get("max", "—")
            lines.append(f"  {zname} {label}: {zmin}–{zmax} W")

    pace_zones = zones.get("pace_zones", {})
    if pace_zones:
        lines.append("Pace Zones (per km):")
        for zname, zdata in pace_zones.items():
            label = zdata.get("label", "")
            slow = zdata.get("min_pace", "—")
            fast = zdata.get("max_pace", "—")
            lines.append(f"  {zname} {label}: {slow}–{fast} /km")

    return "\n".join(lines) if lines else "No zone data provided."


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


def _parse_workout_detail(content: str | dict, session: dict) -> WorkoutDetail:
    """
    Parse and validate the LLM's JSON output into a WorkoutDetail.

    Ensures session_id matches the skeleton session id (overwrites if wrong).
    Fills sensible defaults for any missing required fields.
    Ignores any extra unknown fields.
    """
    if isinstance(content, dict):
        data = content
    else:
        data = json.loads(_extract_json(content))

    # Enforce session_id matches the skeleton
    data["session_id"] = session.get("id", data.get("session_id", ""))

    # Fill defaults for any missing required fields
    sport = session.get("sport", "swim")
    zone = session.get("zone", 2)
    zone_label = session.get("zone_label", "Aerobic")

    if not data.get("warmup", "").strip():
        data["warmup"] = f"Easy {sport} warm-up to get the body moving."

    if not data.get("main_set", "").strip():
        data["main_set"] = f"Main {sport} effort at Zone {zone} ({zone_label})."

    if not data.get("cooldown", "").strip():
        data["cooldown"] = "Easy cool-down, reduce intensity gradually."

    if not data.get("zone_ranges"):
        data["zone_ranges"] = {"hr": "see your zone chart"}

    if not data.get("coaching_notes", "").strip():
        data["coaching_notes"] = (
            f"Focus on consistent effort throughout the {sport} session."
        )

    # Extract only the fields WorkoutDetail expects — drop any extras
    return WorkoutDetail(
        session_id=data["session_id"],
        warmup=data["warmup"],
        main_set=data["main_set"],
        cooldown=data["cooldown"],
        zone_ranges=data["zone_ranges"],
        coaching_notes=data["coaching_notes"],
    )


# ---------------------------------------------------------------------------
# LLM instance
# ---------------------------------------------------------------------------

def _make_llm() -> ChatAnthropic:
    return ChatAnthropic(
        model_name=ANTHROPIC_MODEL,
        temperature=0,
        max_tokens=2048,
        timeout=60,
        stop=None,
    )


# ---------------------------------------------------------------------------
# Graph nodes
# ---------------------------------------------------------------------------

def _call_llm(state: WorkoutExpanderState) -> dict:
    """
    Build the full message list and invoke the LLM with compute_zones bound as a tool.
    Returns updated messages, extracted tool_calls, and incremented call_count.
    """
    llm = _make_llm()
    llm_with_tools = llm.bind_tools([compute_zones])

    system_msg = SystemMessage(content=_SYSTEM)
    messages = [system_msg] + list(state["messages"])

    response: AIMessage = llm_with_tools.invoke(messages)

    tool_calls = (
        response.tool_calls
        if hasattr(response, "tool_calls") and response.tool_calls
        else []
    )

    return {
        "messages": [response],
        "tool_calls": tool_calls,
        "call_count": state.get("call_count", 0) + 1,
    }


def _run_tool(state: WorkoutExpanderState) -> dict:
    """
    Execute the first pending tool call — only compute_zones is supported.
    Pops it from tool_calls and appends a ToolMessage so the LLM sees the result
    on the next call_llm invocation.
    """
    pending = list(state["tool_calls"])
    tool_call = pending[0]
    remaining = pending[1:]

    name = tool_call["name"]
    args = tool_call["args"]

    if name == "compute_zones":
        tool_result = compute_zones.invoke(args)
    else:
        # Unknown tool — return an error message so the LLM can recover
        tool_result = {"error": f"Unknown tool '{name}'."}

    tool_message = ToolMessage(
        content=json.dumps(tool_result),
        name=name,
        tool_call_id=tool_call["id"],
    )

    return {
        "messages": [tool_message],
        "tool_calls": remaining,
    }


def _parse_result(state: WorkoutExpanderState) -> dict:
    """
    Extract the JSON workout from the last AIMessage and validate it into a
    WorkoutDetail. session["id"] is enforced as the authoritative session_id.
    """
    content = None
    for msg in reversed(state["messages"]):
        if isinstance(msg, AIMessage) and msg.content:
            content = msg.content
            break

    if content is None:
        raise ValueError("Workout Expander: no AIMessage content found to parse.")

    if isinstance(content, list):
        content = "".join(
            block.get("text", "") if isinstance(block, dict) else str(block)
            for block in content
        ).strip()

    try:
        result = _parse_workout_detail(content, state["session"])
    except Exception as exc:
        raise ValueError(
            f"Workout Expander returned unparseable output.\n"
            f"Raw content: {content!r}\n"
            f"Error: {exc}"
        ) from exc

    return {"result": result}


# ---------------------------------------------------------------------------
# Routing function
# ---------------------------------------------------------------------------

def _routing_function(state: WorkoutExpanderState) -> str:
    """
    Decide which node to visit after call_llm:
    - If call_count exceeded the safety limit, go straight to parse_result.
    - If there are any pending tool calls, run the tool (handles unknown names
      gracefully via the error path in _run_tool).
    - Otherwise, parse the LLM's final response.
    """
    if state.get("call_count", 0) > _MAX_TOOL_LOOPS:
        return "parse_result"

    pending = state.get("tool_calls", [])
    if pending:
        return "run_tool"

    return "parse_result"


# ---------------------------------------------------------------------------
# Graph compilation
# ---------------------------------------------------------------------------

def _build_graph() -> StateGraph:
    workflow = StateGraph(WorkoutExpanderState)

    workflow.add_node("call_llm", _call_llm)
    workflow.add_node("run_tool", _run_tool)
    workflow.add_node("parse_result", _parse_result)

    workflow.add_edge(START, "call_llm")
    workflow.add_conditional_edges(
        "call_llm",
        _routing_function,
        ["run_tool", "parse_result"],
    )
    workflow.add_edge("run_tool", "call_llm")
    workflow.add_edge("parse_result", END)

    return workflow.compile()


# Compile once at module import time
_graph = _build_graph()


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

async def run_workout_expander(
    session: dict,
    zones: dict,
    athlete_profile: dict,
) -> WorkoutDetail:
    """
    Run the Workout Expander StateGraph for a single session skeleton.

    Uses a LangGraph StateGraph with:
    - ChatAnthropic (temperature=0) for deterministic, structured output
    - compute_zones tool for optional zone range lookups
    - _parse_workout_detail() to validate the final AIMessage into a WorkoutDetail

    The session id is enforced — session_id in the returned WorkoutDetail always
    matches session["id"] regardless of what the LLM returns.

    Args:
        session: Single session skeleton from the training plan. Must contain:
                 id, week, day, sport, duration_minutes, zone, zone_label, description.
        zones:   Athlete's computed training zones (from compute_zones).
        athlete_profile: Dict with goal, experience, strongest_discipline,
                         weakest_discipline.

    Returns:
        WorkoutDetail — validated Pydantic model with the expanded workout.

    Raises:
        ValueError: if the agent output cannot be parsed into a valid WorkoutDetail.
    """
    zones_summary = _zones_summary(zones)

    human_text = _HUMAN_TEMPLATE.format(
        sport=session.get("sport", "swim"),
        duration_minutes=session.get("duration_minutes", 30),
        zone=session.get("zone", 2),
        zone_label=session.get("zone_label", "Aerobic"),
        week=session.get("week", 1),
        day=session.get("day", "Monday"),
        description=session.get("description", ""),
        goal=athlete_profile.get("goal", "recreational"),
        experience=athlete_profile.get("experience", "recreational"),
        strongest_discipline=athlete_profile.get("strongest_discipline", "bike"),
        weakest_discipline=athlete_profile.get("weakest_discipline", "swim"),
        zones_summary=zones_summary,
        session_id=session.get("id", ""),
    )

    initial_state: WorkoutExpanderState = {
        "messages": [HumanMessage(content=human_text)],
        "tool_calls": [],
        "session": session,
        "zones": zones,
        "athlete_profile": athlete_profile,
        "result": None,
        "call_count": 0,
    }

    result_state = await _graph.ainvoke(initial_state)

    detail = result_state.get("result")
    if detail is None:
        raise ValueError("Workout Expander graph completed but result is None.")

    return detail

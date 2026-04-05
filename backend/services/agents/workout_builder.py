"""
Workout Builder Agent — Agent 2 of 3 in ThryveIQ's LangGraph plan generation pipeline.

Responsibility:
  - Takes a pre-built week skeleton (sessions with day, sport, duration, zone
    already set by the rule engine) and adds coaching descriptions to each session.
  - Cannot change duration, zone, day, or sport — descriptions ONLY.
  - Uses score_intensity_distribution to verify intensity balance before writing.

Tools available to this agent:
  - compute_zones: look up athlete HR/power/pace zone ranges
  - score_intensity_distribution: verify weekly intensity balance

Output:
  - WeekWithDescriptions: validated Pydantic model with all sessions described.

Graph structure:
  START → call_llm → routing_function → run_tool → call_llm (loop)
                                      → parse_result → END
"""
from __future__ import annotations

import json
import operator
import os
from typing import Annotated, TypedDict

from dotenv import load_dotenv
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage
from langchain_ollama import ChatOllama
from langgraph.graph import END, START, StateGraph

from models.workout_builder import SessionWithDescription, WeekWithDescriptions
from services.tools.compute_zones import compute_zones
from services.tools.score_intensity_distribution import score_intensity_distribution

load_dotenv()

OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.1")

_MAX_TOOL_LOOPS = 5

_ZONE_LABELS = {
    1: "Recovery",
    2: "Aerobic",
    3: "Tempo",
    4: "Threshold",
    5: "VO2max",
}

_SYSTEM = """You are an expert Ironman 70.3 triathlon coach writing session descriptions.

Your ONLY job is to fill in the `description` field for each session in the week skeleton.
Do NOT change any other field — id, week, day, sport, duration_minutes, zone, and zone_label
are all set by the rule engine and are GROUND TRUTH. Copy them exactly.

DESCRIPTION REQUIREMENTS:
- 2-3 sentences per session
- Include: what the effort should feel like (e.g. "conversational", "comfortably hard")
- Include: a specific technique cue or focus for the sport
- Include: the zone target and what that means in practical terms
- Include: pacing or cadence notes where relevant
- Tailor language to the athlete's experience level and which discipline is weakest

OUTPUT FORMAT — return exactly this JSON structure (no extra fields, no markdown):
{
  "week_index": <int>,
  "phase_name": "<string>",
  "sessions": [
    {
      "id": "<copy from skeleton>",
      "week": <copy from skeleton>,
      "day": "<copy from skeleton>",
      "sport": "<copy from skeleton>",
      "duration_minutes": <copy from skeleton>,
      "zone": <copy from skeleton>,
      "zone_label": "<copy from skeleton>",
      "description": "<YOUR 2-3 sentence coaching description>"
    }
  ]
}

You MAY call compute_zones to look up the athlete's exact HR/power/pace zone ranges.
You MAY call score_intensity_distribution on the sessions to verify intensity balance.
"""

_HUMAN_TEMPLATE = """You are writing session descriptions for week {week_index} of the {phase_name} phase.
Phase focus: {phase_focus}

Athlete: {goal} | Experience: {experience}
Strongest discipline: {strongest_discipline} | Weakest: {weakest_discipline}

Zone reference:
{zones_summary}

Sessions to describe (DO NOT change any field except description):
{sessions_json}

Return JSON: {{"week_index": {week_index}, "phase_name": "{phase_name}", "sessions": [...each session with description filled in...]}}"""


# ---------------------------------------------------------------------------
# State definition
# ---------------------------------------------------------------------------

class WorkoutBuilderState(TypedDict):
    """LangGraph state for the Workout Builder graph."""

    # Append reducer — messages accumulate across nodes
    messages: Annotated[list, operator.add]

    # Replace semantics — current pending batch of tool calls
    tool_calls: list

    # Replace semantics — the input week skeleton
    week_skeleton: dict

    # Replace semantics — athlete zones
    zones: dict

    # Replace semantics — current phase name
    phase_name: str

    # Replace semantics — current phase focus
    phase_focus: str

    # Replace semantics — athlete profile dict
    athlete_profile: dict

    # Replace semantics — populated by parse_result, None until then
    result: WeekWithDescriptions | None

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


def _parse_week(content: str | dict, week_skeleton: dict) -> WeekWithDescriptions:
    """
    Parse and validate the LLM's JSON output into a WeekWithDescriptions.

    The skeleton is ground truth for all structural fields. If the LLM changed
    any of id / week / day / sport / duration_minutes / zone / zone_label,
    those values are silently overwritten with the skeleton values.

    If a session's description is missing or empty, a sensible default is used.
    """
    if isinstance(content, dict):
        data = content
    else:
        data = json.loads(content)

    # Build a lookup from the skeleton sessions keyed by id
    skeleton_sessions: dict[str, dict] = {}
    for s in week_skeleton.get("sessions", []):
        skeleton_sessions[s["id"]] = s

    week_index = week_skeleton.get("week_index", data.get("week_index", 1))
    phase_name = data.get("phase_name", "")

    merged_sessions = []
    llm_sessions = data.get("sessions", [])

    # Match LLM sessions to skeleton sessions by id, then enforce skeleton values
    for llm_session in llm_sessions:
        session_id = llm_session.get("id", "")
        skeleton = skeleton_sessions.get(session_id, {})

        if not skeleton:
            # LLM returned an unknown session id — skip it; will be backfilled below
            continue

        zone = skeleton.get("zone", llm_session.get("zone", 1))
        sport = skeleton.get("sport", llm_session.get("sport", "swim"))
        duration = skeleton.get("duration_minutes", llm_session.get("duration_minutes", 30))
        zone_label = skeleton.get(
            "zone_label",
            llm_session.get("zone_label", _ZONE_LABELS.get(zone, "Aerobic")),
        )

        description = llm_session.get("description", "").strip()
        if not description:
            description = (
                f"Zone {zone} {sport} session. "
                f"{duration} minutes at {zone_label} effort."
            )

        merged_sessions.append({
            "id": skeleton.get("id", session_id),
            "week": skeleton.get("week", llm_session.get("week", week_index)),
            "day": skeleton.get("day", llm_session.get("day", "Monday")),
            "sport": sport,
            "duration_minutes": duration,
            "zone": zone,
            "zone_label": zone_label,
            "description": description,
        })

    # Backfill any skeleton sessions the LLM missed entirely
    merged_ids = {s["id"] for s in merged_sessions}
    for s_id, skeleton in skeleton_sessions.items():
        if s_id not in merged_ids:
            zone = skeleton.get("zone", 2)
            sport = skeleton.get("sport", "swim")
            duration = skeleton.get("duration_minutes", 30)
            zone_label = skeleton.get("zone_label", _ZONE_LABELS.get(zone, "Aerobic"))
            merged_sessions.append({
                "id": s_id,
                "week": skeleton.get("week", week_index),
                "day": skeleton.get("day", "Monday"),
                "sport": sport,
                "duration_minutes": duration,
                "zone": zone,
                "zone_label": zone_label,
                "description": (
                    f"Zone {zone} {sport} session. "
                    f"{duration} minutes at {zone_label} effort."
                ),
            })

    return WeekWithDescriptions(
        week_index=week_index,
        phase_name=phase_name,
        sessions=[SessionWithDescription(**s) for s in merged_sessions],
    )


# ---------------------------------------------------------------------------
# LLM instance
# ---------------------------------------------------------------------------

def _make_llm() -> ChatOllama:
    return ChatOllama(
        model=OLLAMA_MODEL,
        base_url=OLLAMA_HOST,
        temperature=0,
        format="json",
    )


# ---------------------------------------------------------------------------
# Graph nodes
# ---------------------------------------------------------------------------

def _call_llm(state: WorkoutBuilderState) -> dict:
    """
    Build the full message list and invoke the LLM with both tools bound.
    Returns updated messages, extracted tool_calls, and incremented call_count.
    """
    llm = _make_llm()
    llm_with_tools = llm.bind_tools([compute_zones, score_intensity_distribution])

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


def _run_tool(state: WorkoutBuilderState) -> dict:
    """
    Execute the first pending tool call — handles both compute_zones and
    score_intensity_distribution. Pops it from tool_calls and appends a
    ToolMessage so the LLM sees the result on the next call_llm invocation.
    """
    pending = list(state["tool_calls"])
    tool_call = pending[0]
    remaining = pending[1:]

    name = tool_call["name"]
    args = tool_call["args"]

    if name == "compute_zones":
        tool_result = compute_zones.invoke(args)
    elif name == "score_intensity_distribution":
        tool_result = score_intensity_distribution.invoke(args)
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


def _parse_result(state: WorkoutBuilderState) -> dict:
    """
    Extract the JSON week from the last AIMessage and validate it into a
    WeekWithDescriptions. Skeleton values override any LLM deviations.
    """
    content = None
    for msg in reversed(state["messages"]):
        if isinstance(msg, AIMessage) and msg.content:
            content = msg.content
            break

    if content is None:
        raise ValueError("Workout Builder: no AIMessage content found to parse.")

    try:
        result = _parse_week(content, state["week_skeleton"])
    except Exception as exc:
        raise ValueError(
            f"Workout Builder returned unparseable output.\n"
            f"Raw content: {content!r}\n"
            f"Error: {exc}"
        ) from exc

    return {"result": result}


# ---------------------------------------------------------------------------
# Routing function
# ---------------------------------------------------------------------------

def _routing_function(state: WorkoutBuilderState) -> str:
    """
    Decide which node to visit after call_llm:
    - If call_count exceeded the safety limit, go straight to parse_result.
    - If there are pending tool calls for a known tool, run them.
    - Otherwise, parse the LLM's final response.
    """
    if state.get("call_count", 0) > _MAX_TOOL_LOOPS:
        return "parse_result"

    pending = state.get("tool_calls", [])
    if pending and pending[0].get("name") in ("compute_zones", "score_intensity_distribution"):
        return "run_tool"

    return "parse_result"


# ---------------------------------------------------------------------------
# Graph compilation
# ---------------------------------------------------------------------------

def _build_graph() -> StateGraph:
    workflow = StateGraph(WorkoutBuilderState)

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

async def run_workout_builder(
    week_skeleton: dict,
    phase_name: str,
    phase_focus: str,
    zones: dict,
    athlete_profile: dict,
) -> WeekWithDescriptions:
    """
    Run the Workout Builder StateGraph for a single week skeleton.

    Uses a LangGraph StateGraph with:
    - ChatOllama (format="json", temperature=0) for deterministic, structured output
    - compute_zones tool for zone range lookups
    - score_intensity_distribution tool for intensity balance checks
    - _parse_week() to validate the final AIMessage into a WeekWithDescriptions

    The skeleton is ground truth — all structural fields (id, week, day, sport,
    duration_minutes, zone, zone_label) are enforced by _parse_week regardless
    of what the LLM returns.

    Args:
        week_skeleton: Week skeleton from the rule engine. Must contain:
                       week_index (int), sessions (list of session dicts with
                       id, week, day, sport, duration_minutes, zone, zone_label).
        phase_name:    Name of the current training phase (e.g. "Base").
        phase_focus:   1-2 sentence description of the phase's emphasis.
        zones:         Athlete's computed training zones (from compute_zones).
        athlete_profile: Dict with goal, experience, strongest_discipline,
                         weakest_discipline.

    Returns:
        WeekWithDescriptions — validated Pydantic model with all sessions described.

    Raises:
        ValueError: if the agent output cannot be parsed into a valid WeekWithDescriptions.
    """
    week_index = week_skeleton.get("week_index", 1)
    sessions = week_skeleton.get("sessions", [])

    zones_summary = _zones_summary(zones)
    sessions_json = json.dumps(sessions, indent=2)

    human_text = _HUMAN_TEMPLATE.format(
        week_index=week_index,
        phase_name=phase_name,
        phase_focus=phase_focus,
        goal=athlete_profile.get("goal", "recreational"),
        experience=athlete_profile.get("experience", "recreational"),
        strongest_discipline=athlete_profile.get("strongest_discipline", "bike"),
        weakest_discipline=athlete_profile.get("weakest_discipline", "swim"),
        zones_summary=zones_summary,
        sessions_json=sessions_json,
    )

    initial_state: WorkoutBuilderState = {
        "messages": [HumanMessage(content=human_text)],
        "tool_calls": [],
        "week_skeleton": week_skeleton,
        "zones": zones,
        "phase_name": phase_name,
        "phase_focus": phase_focus,
        "athlete_profile": athlete_profile,
        "result": None,
        "call_count": 0,
    }

    result_state = await _graph.ainvoke(initial_state)

    week = result_state.get("result")
    if week is None:
        raise ValueError("Workout Builder graph completed but result is None.")

    return week

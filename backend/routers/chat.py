import asyncio
import os
from datetime import datetime

from dotenv import load_dotenv
from fastapi import APIRouter
from langchain_anthropic import ChatAnthropic
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

from models.chat import ChatRequest, ChatResponse
from services.chat_tools import TOOLS

load_dotenv()

ANTHROPIC_MODEL = os.getenv("ANTHROPIC_MODEL_CHAT", "claude-haiku-4-5-20251001")

router = APIRouter(prefix="/chat", tags=["chat"])

SYSTEM_PROMPT = """You are ThryveIQ, an expert triathlon coach AI. You help athletes with their
training plans, answer questions about triathlons, and provide coaching advice.

Today's date is {today}. When the athlete asks about "today", "tomorrow", "this week", or
any relative time, use this as the reference. Match plan sessions to the correct day of
the week using this date.

Be concise, friendly, and encouraging. When athlete data is provided below, use specific
numbers and details from it. Never fabricate stats or training data.

{context}"""

TOOL_TRIGGERS = {
    "get_current_plan": [
        "plan", "schedule", "workout", "session", "training week",
        "what should i do", "next workout", "this week", "upcoming",
    ],
    "get_user_zones": [
        "zone", "heart rate", "pace", "power", "intensity", "threshold",
        "hr zone", "ftp",
    ],
    "get_athlete_profile": [
        "profile", "my goal", "race date", "experience", "availability",
        "strongest", "weakest", "background", "how many hours", "how many days",
    ],
    "get_strava_activities": [
        "recent", "strava", "activity", "activities", "last run", "last ride",
        "last swim", "training history", "how much have i", "this week i trained",
        "past workout", "what did i do", "history",
    ],
}


def _detect_tools(message: str) -> list[str]:
    """Detect which tools to call based on keywords in the user message."""
    msg_lower = message.lower()
    needed = []
    for tool_name, keywords in TOOL_TRIGGERS.items():
        if any(kw in msg_lower for kw in keywords):
            needed.append(tool_name)
    return needed


def _flatten_content(content) -> str:
    if isinstance(content, list):
        return "".join(
            block.get("text", "") if isinstance(block, dict) else str(block)
            for block in content
        ).strip()
    return str(content).strip()


@router.post("/message", response_model=ChatResponse)
async def chat_message(request: ChatRequest):
    tools_used: list[str] = []
    context_parts: list[str] = []

    needed_tools = _detect_tools(request.message)
    for tool_name in needed_tools:
        tool_fn = TOOLS[tool_name]
        result = tool_fn(request.user_id)
        if asyncio.iscoroutine(result):
            result = await result
        context_parts.append(f"[{tool_name}]:\n{result}")
        tools_used.append(tool_name)

    if request.workout_context:
        context_parts.insert(0, f"[current_workout]:\n{request.workout_context}")

    if context_parts:
        context = "Athlete data:\n\n" + "\n\n".join(context_parts)
    else:
        context = "No specific athlete data was requested."

    now = datetime.now()
    system = SYSTEM_PROMPT.format(
        today=now.strftime("%A, %B %-d, %Y"),
        context=context,
    )

    messages = [SystemMessage(content=system)]
    for m in request.history:
        if m.role == "assistant":
            messages.append(AIMessage(content=m.content))
        else:
            messages.append(HumanMessage(content=m.content))
    messages.append(HumanMessage(content=request.message))

    llm = ChatAnthropic(
        model_name=ANTHROPIC_MODEL,
        temperature=0,
        max_tokens=1024,
        timeout=60,
        stop=None,
    )
    response = await llm.ainvoke(messages)

    return ChatResponse(response=_flatten_content(response.content), tools_used=tools_used)

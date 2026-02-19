import re
from fastapi import APIRouter
from models.chat import ChatRequest, ChatResponse
from services.llm import ollama_chat
from services.chat_tools import TOOLS

router = APIRouter(prefix="/chat", tags=["chat"])

SYSTEM_PROMPT = """You are ThryveIQ, an expert triathlon coach AI. You help athletes with their
training plans, answer questions about triathlons, and provide coaching advice.

Be concise, friendly, and encouraging. When athlete data is provided below, use specific
numbers and details from it. Never fabricate stats or training data.

{context}"""

# Keywords that trigger automatic tool lookups
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
}


def _detect_tools(message: str) -> list[str]:
    """Detect which tools to call based on keywords in the user message."""
    msg_lower = message.lower()
    needed = []
    for tool_name, keywords in TOOL_TRIGGERS.items():
        if any(kw in msg_lower for kw in keywords):
            needed.append(tool_name)
    return needed


@router.post("/message", response_model=ChatResponse)
async def chat_message(request: ChatRequest):
    tools_used: list[str] = []
    context_parts: list[str] = []

    # Detect and run relevant tools
    needed_tools = _detect_tools(request.message)
    for tool_name in needed_tools:
        tool_fn = TOOLS[tool_name]
        result = tool_fn(request.user_id)
        context_parts.append(f"[{tool_name}]:\n{result}")
        tools_used.append(tool_name)

    # Build context string
    if context_parts:
        context = "Athlete data:\n\n" + "\n\n".join(context_parts)
    else:
        context = "No specific athlete data was requested."

    system = SYSTEM_PROMPT.format(context=context)

    # Build message history
    messages = [{"role": m.role, "content": m.content} for m in request.history]
    messages.append({"role": "user", "content": request.message})

    response_text = await ollama_chat(messages, system=system)

    return ChatResponse(response=response_text, tools_used=tools_used)

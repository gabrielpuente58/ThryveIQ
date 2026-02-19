import json
from fastapi import APIRouter
from models.chat import ChatRequest, ChatResponse
from services.llm import ollama_chat
from services.chat_tools import TOOLS, TOOL_DESCRIPTIONS

router = APIRouter(prefix="/chat", tags=["chat"])

SYSTEM_PROMPT = """You are ThryveIQ, an expert triathlon coach AI. You have access to tools to look up
the athlete's real training data. Always use a tool when the user asks about their
workouts, plan, zones, or profile — never guess or make up numbers.

When you need data, respond with ONLY a JSON object: {{"tool": "tool_name"}}
When you don't need a tool, respond with your coaching advice directly.

{tools}

Be concise, friendly, and encouraging. Use specific numbers and details from tool results.
Never fabricate stats or training data."""


@router.post("/message", response_model=ChatResponse)
async def chat_message(request: ChatRequest):
    system = SYSTEM_PROMPT.format(tools=TOOL_DESCRIPTIONS)
    tools_used: list[str] = []

    # Build message history
    messages = [{"role": m.role, "content": m.content} for m in request.history]
    messages.append({"role": "user", "content": request.message})

    # First LLM call — may request a tool
    response_text = await ollama_chat(messages, system=system)

    # Check if LLM wants to call a tool (up to 3 rounds)
    for _ in range(3):
        tool_call = _parse_tool_call(response_text)
        if not tool_call:
            break

        tool_name = tool_call.get("tool", "")
        if tool_name not in TOOLS:
            break

        tools_used.append(tool_name)

        # Execute the tool
        tool_result = TOOLS[tool_name](request.user_id)

        # Append tool interaction to messages and re-call LLM
        messages.append({"role": "assistant", "content": response_text})
        messages.append({
            "role": "user",
            "content": f"[Tool result from {tool_name}]:\n{tool_result}\n\nNow answer the user's question using this data.",
        })

        response_text = await ollama_chat(messages, system=system)

    return ChatResponse(response=response_text, tools_used=tools_used)


def _parse_tool_call(text: str) -> dict | None:
    """Try to parse a tool call JSON from the LLM response."""
    text = text.strip()
    try:
        parsed = json.loads(text)
        if isinstance(parsed, dict) and "tool" in parsed:
            return parsed
    except json.JSONDecodeError:
        pass

    # Try to find JSON embedded in text
    start = text.find("{")
    end = text.rfind("}") + 1
    if start != -1 and end > start:
        try:
            parsed = json.loads(text[start:end])
            if isinstance(parsed, dict) and "tool" in parsed:
                return parsed
        except json.JSONDecodeError:
            pass

    return None

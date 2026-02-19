from pydantic import BaseModel


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str
    history: list[ChatMessage] = []
    user_id: str = "00000000-0000-0000-0000-000000000001"


class ChatResponse(BaseModel):
    response: str
    tools_used: list[str] = []

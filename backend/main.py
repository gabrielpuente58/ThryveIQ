from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from routers.profiles import router as profiles_router

app = FastAPI(title="ThryveIQ API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(profiles_router)

STOCK_RESPONSES = {
    "swim": "For swimming, focus on your stroke technique before building distance. Try drills like catch-up and fingertip drag to improve efficiency.",
    "bike": "On the bike, consistency is key. Aim for a steady cadence of 85-95 RPM and build your base endurance before adding intensity.",
    "run": "Running off the bike takes practice. Start with short brick sessions — even 10 minutes of running after a ride helps your legs adapt.",
    "nutrition": "Nutrition is your fourth discipline. Practice your race-day fueling during training so there are no surprises.",
    "recovery": "Recovery is when your body actually gets stronger. Prioritize sleep, hydration, and easy days between hard sessions.",
    "race": "Race day tip: start conservative. It's much better to finish strong than to blow up halfway through.",
    "training": "A solid training plan balances swim, bike, and run with strength work and rest days. What distance are you training for?",
    "default": "That's a great question! As your AI coach, I can help with swim, bike, run training, nutrition, recovery, and race strategy. What area would you like to focus on?",
}


class ChatRequest(BaseModel):
    message: str


class ChatResponse(BaseModel):
    reply: str


@app.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    user_text = request.message.lower()
    for keyword, response in STOCK_RESPONSES.items():
        if keyword != "default" and keyword in user_text:
            return ChatResponse(reply=response)
    return ChatResponse(reply=STOCK_RESPONSES["default"])


@app.get("/health")
async def health():
    return {"status": "ok"}

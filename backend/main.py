from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers.profiles import router as profiles_router
from routers.plans import router as plans_router
from routers.chat import router as chat_router
from routers.strava import router as strava_router

app = FastAPI(title="ThryveIQ API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(profiles_router)
app.include_router(plans_router)
app.include_router(chat_router)
app.include_router(strava_router)


@app.get("/health")
async def health():
    return {"status": "ok"}

# ThryveIQ

An AI-powered mobile app that acts as a personal triathlon coach for athletes training for triathlons. It builds adaptive, week-by-week training plans and provides a conversational AI coach for real-time guidance.

## Stack

- **Frontend:** Expo / React Native (TypeScript), Expo Router, Supabase client
- **Backend:** FastAPI (Python), LangChain + LangGraph, Anthropic Claude
- **Data/Auth:** Supabase
- **Integrations:** Strava

## Project Structure

```
backend/    FastAPI app (routers, services, models, migrations)
frontend/   Expo app (screens, components, context)
```

## Getting Started

### Backend

```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload
```

Create a `.env` with your Supabase, Anthropic, and Strava credentials.

### Frontend

```bash
cd frontend
npm install
npx expo start
```

## Features

- Onboarding with race date, weekly hours range, and optional FTP/LTHR/CSS benchmarks
- Adaptive plan generation via a two-agent LLM pipeline (Architect → Builder) with a validator and retry loop
- Week-by-week plan generation with per-week feedback (RPE + notes) feeding the next week
- Plan view with sport-colored sessions, zone badges, donut sport breakdown, and 7-day rhythm strip
- Conversational AI coach
- Strava activity sync

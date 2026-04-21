"""
End-to-end smoke test for the onboarding → plan → feedback → next-week flow.

Usage:
    python scripts/smoke_onboarding.py --user-id <uuid>
    python scripts/smoke_onboarding.py --user-id <uuid> --next-weeks 2
    python scripts/smoke_onboarding.py --user-id <uuid> --base-url http://localhost:8000

Steps:
    1. POST /profiles           (create/upsert athlete profile with a sample payload)
    2. POST /plans/generate     (kick off async week-1 generation)
    3. GET  /plans/job/{id}     (poll until done/error)
    4. GET  /plans/current      (fetch saved plan)
    5. Optional loop: POST /plans/feedback + POST /plans/next-week
       for --next-weeks additional weeks.

Requires the user-id to exist in auth.users (FK constraint on athlete_profiles).
Grab one from Supabase Auth or use an existing seeded user.
"""

from __future__ import annotations

import argparse
import sys
import time
from typing import Any

import httpx


DEFAULT_BASE_URL = "http://localhost:8000"
POLL_INTERVAL_SECONDS = 2
POLL_TIMEOUT_SECONDS = 300


def _sample_profile(user_id: str) -> dict[str, Any]:
    return {
        "user_id": user_id,
        "goal": "recreational",
        "race_date": "2026-07-26",
        "experience": "recreational",
        "hours_min": 6.0,
        "hours_max": 10.0,
        "days_available": 5,
        "strongest_discipline": "bike",
        "weakest_discipline": "swim",
        "focus_discipline": "swim",
        "ftp": 220,
        "lthr": 165,
        "css": "1:45",
    }


def _sample_feedback(week_index: int) -> dict[str, Any]:
    return {
        "week_index": week_index,
        "rpe": 6,
        "went_well": "long ride felt strong, tempo run nailed",
        "didnt_go_well": "skipped one swim, calves tight Sunday",
        "notes": "sleep was solid this week",
    }


def _log(step: str, msg: str) -> None:
    print(f"[{step}] {msg}", flush=True)


def _die(step: str, resp: httpx.Response) -> None:
    print(f"[{step}] FAILED {resp.status_code}: {resp.text}", file=sys.stderr, flush=True)
    sys.exit(1)


def create_profile(client: httpx.Client, user_id: str) -> dict[str, Any]:
    resp = client.post("/profiles", json=_sample_profile(user_id))
    if resp.status_code >= 400:
        _die("profile", resp)
    profile = resp.json()
    _log("profile", f"upserted hours={profile.get('hours_min')}-{profile.get('hours_max')}h, focus={profile.get('focus_discipline')}")
    return profile


def generate_plan(client: httpx.Client, user_id: str) -> str:
    resp = client.post("/plans/generate", json={"user_id": user_id})
    if resp.status_code >= 400:
        _die("generate", resp)
    job_id = resp.json()["job_id"]
    _log("generate", f"job_id={job_id}")
    return job_id


def poll_job(client: httpx.Client, job_id: str) -> dict[str, Any]:
    deadline = time.time() + POLL_TIMEOUT_SECONDS
    while time.time() < deadline:
        resp = client.get(f"/plans/job/{job_id}")
        if resp.status_code >= 400:
            _die("poll", resp)
        body = resp.json()
        status = body.get("status")
        if status == "done":
            _log("poll", "done")
            return body["plan"]
        if status == "error":
            print(f"[poll] generation error: {body.get('error')}", file=sys.stderr)
            sys.exit(1)
        _log("poll", f"status={status} …")
        time.sleep(POLL_INTERVAL_SECONDS)
    print("[poll] timed out waiting for generation", file=sys.stderr)
    sys.exit(1)


def summarize_plan(plan: dict[str, Any]) -> None:
    sessions = plan.get("sessions", [])
    weeks_generated = plan.get("weeks_generated")
    weeks_until_race = plan.get("weeks_until_race")
    phases = plan.get("phases", [])
    _log(
        "plan",
        f"weeks_generated={weeks_generated}/{weeks_until_race}, "
        f"sessions={len(sessions)}, phases={len(phases)}",
    )
    last_week = max((s.get("week", 0) for s in sessions), default=0)
    this_week = [s for s in sessions if s.get("week") == last_week]
    for s in this_week:
        _log(
            "plan",
            f"  W{s.get('week')} {s.get('day'):>9} | {s.get('sport'):>4} "
            f"{s.get('duration_minutes'):>3}m Z{s.get('zone')}",
        )


def submit_feedback(client: httpx.Client, user_id: str, week_index: int) -> None:
    payload = {"user_id": user_id, **_sample_feedback(week_index)}
    resp = client.post("/plans/feedback", json=payload)
    if resp.status_code >= 400:
        _die("feedback", resp)
    _log("feedback", f"week {week_index} saved (rpe={payload['rpe']})")


def build_next_week(client: httpx.Client, user_id: str) -> dict[str, Any]:
    resp = client.post("/plans/next-week", json={"user_id": user_id})
    if resp.status_code >= 400:
        _die("next-week", resp)
    plan = resp.json()
    _log("next-week", f"weeks_generated={plan.get('weeks_generated')}")
    return plan


def main() -> None:
    parser = argparse.ArgumentParser(description="ThryveIQ onboarding smoke test")
    parser.add_argument("--user-id", required=True, help="UUID of a user that exists in auth.users")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
    parser.add_argument(
        "--next-weeks",
        type=int,
        default=0,
        help="How many additional weeks to build after week 1 (each with sample feedback).",
    )
    args = parser.parse_args()

    with httpx.Client(base_url=args.base_url, timeout=60.0) as client:
        create_profile(client, args.user_id)
        job_id = generate_plan(client, args.user_id)
        plan = poll_job(client, job_id)
        summarize_plan(plan)

        for i in range(args.next_weeks):
            current_week = plan.get("weeks_generated", 1)
            submit_feedback(client, args.user_id, current_week)
            plan = build_next_week(client, args.user_id)
            summarize_plan(plan)

    _log("done", "smoke test complete")


if __name__ == "__main__":
    main()

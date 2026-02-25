"""
Integration test for POST /plans/architect.

Calls the endpoint with a hardcoded first-timer athlete profile and validates:
  - The returned PlanBlueprint is structurally valid
  - Phase names are sensible triathlon training phases
  - Phase week counts sum exactly to total_weeks
  - weekly_structure_template only uses allowed sports
  - intensity_distribution_target is present on each phase

This test calls the REAL Ollama LLM (no mocks). It will be skipped automatically
if the Ollama server is unreachable, so CI stays green.

Run manually:
    pytest tests/test_integration_architect.py -v -s
"""
import json
import os

import httpx
import pytest
import pytest_asyncio
from fastapi.testclient import TestClient
from unittest.mock import MagicMock, patch

from main import app
from services.agents.plan_architect import run_plan_architect
from models.blueprint import PlanBlueprint

# ---------------------------------------------------------------------------
# Hardcoded first-timer test profile (10 weeks to race, 8h/week, swim weakest)
# ---------------------------------------------------------------------------

FIRST_TIMER_PROFILE = {
    "user_id": "integration-test-user",
    "goal": "first_timer",
    "experience": "first_timer",
    "race_date": "2026-05-06",   # ~10 weeks from Feb 2026
    "weekly_hours": 8.0,
    "days_available": 5,
    "strongest_discipline": "run",
    "weakest_discipline": "swim",
    "current_background": "Recreational runner with 2 years experience. New to swimming and cycling.",
    "zones": None,
}

VALID_PHASE_NAMES = {"Base", "Build", "Peak", "Taper", "Foundation", "Race Prep", "Preparation"}
VALID_SPORTS = {"swim", "bike", "run"}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _is_ollama_reachable() -> bool:
    """Check if the Ollama server is reachable before running live tests."""
    ollama_host = os.getenv("OLLAMA_HOST", "http://localhost:11434")
    try:
        resp = httpx.get(f"{ollama_host}/api/tags", timeout=5.0)
        return resp.status_code == 200
    except Exception:
        return False


def _validate_blueprint(blueprint: PlanBlueprint, weeks_until_race: int = 10) -> None:  # noqa: ARG001
    """Shared assertions for blueprint validity — used in both live and mock tests."""
    # total_weeks must be positive
    assert blueprint.total_weeks >= 1, "total_weeks must be >= 1"

    # Phase list must be non-empty
    assert len(blueprint.phases) >= 1, "Blueprint must have at least one phase"

    # Phase week counts must sum to total_weeks
    phase_sum = sum(p.weeks for p in blueprint.phases)
    assert phase_sum == blueprint.total_weeks, (
        f"Phase weeks sum ({phase_sum}) != total_weeks ({blueprint.total_weeks})"
    )

    for phase in blueprint.phases:
        # Phase name should be a non-empty string
        assert phase.phase_name and len(phase.phase_name) > 0

        # Weeks per phase must be >= 1
        assert phase.weeks >= 1

        # weekly_structure_template must only use valid sports
        assert set(phase.weekly_structure_template.keys()).issubset(VALID_SPORTS), (
            f"Invalid sport in weekly_structure_template for phase {phase.phase_name}: "
            f"{phase.weekly_structure_template.keys()}"
        )

        # Session counts must be non-negative
        for sport, count in phase.weekly_structure_template.items():
            assert count >= 0, f"Session count for {sport} in {phase.phase_name} must be >= 0"

        # intensity_distribution_target must be a non-empty string
        assert phase.intensity_distribution_target and len(phase.intensity_distribution_target) > 0

        # Focus must be a non-empty string
        assert phase.focus and len(phase.focus) > 0


# ---------------------------------------------------------------------------
# Live integration test (skipped if Ollama is unreachable)
# ---------------------------------------------------------------------------

@pytest.mark.skipif(
    not _is_ollama_reachable(),
    reason="Ollama server not reachable — skipping live integration test",
)
@pytest.mark.asyncio
async def test_plan_architect_live():
    """
    Calls the real Ollama LLM and validates the full response.
    Logs the blueprint to stdout so you can inspect it manually.
    """
    blueprint = await run_plan_architect(FIRST_TIMER_PROFILE)

    # --- Log full output for manual inspection ---
    print("\n" + "=" * 60)
    print("LIVE INTEGRATION TEST — Plan Architect Output")
    print("=" * 60)
    print(f"Total weeks: {blueprint.total_weeks}")
    print(f"Notes: {blueprint.notes}")
    print(f"\nPhases ({len(blueprint.phases)}):")
    for phase in blueprint.phases:
        print(f"\n  [{phase.phase_name}] {phase.weeks} weeks")
        print(f"    Intensity: {phase.intensity_distribution_target}")
        print(f"    Sessions/week: {phase.weekly_structure_template}")
        print(f"    Focus: {phase.focus}")
    print("=" * 60 + "\n")

    # --- Structural assertions ---
    assert isinstance(blueprint, PlanBlueprint)
    _validate_blueprint(blueprint, weeks_until_race=10)

    # Phase names should be recognizable training terms
    for phase in blueprint.phases:
        name_lower = phase.phase_name.lower()
        assert any(
            keyword in name_lower
            for keyword in ["base", "build", "peak", "taper", "prep", "foundation"]
        ), f"Unexpected phase name: {phase.phase_name}"


@pytest.mark.skipif(
    not _is_ollama_reachable(),
    reason="Ollama server not reachable — skipping live integration test",
)
@pytest.mark.asyncio
async def test_plan_architect_live_via_endpoint():
    """
    Hits POST /plans/architect via the FastAPI test client with a real Supabase mock,
    but a real Ollama call for the agent.
    """
    mock_supabase_result = MagicMock()
    mock_supabase_result.data = FIRST_TIMER_PROFILE

    with patch("routers.plans.supabase") as mock_sb:
        mock_sb.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value = mock_supabase_result

        client = TestClient(app)
        response = client.post(
            "/plans/architect",
            json={"user_id": "integration-test-user"},
        )

    print("\n" + "=" * 60)
    print("LIVE ENDPOINT INTEGRATION TEST")
    print("=" * 60)
    print(f"Status: {response.status_code}")
    print(f"Response: {json.dumps(response.json(), indent=2)}")
    print("=" * 60 + "\n")

    assert response.status_code == 200
    data = response.json()

    blueprint = PlanBlueprint.model_validate(data)
    _validate_blueprint(blueprint, weeks_until_race=10)


# ---------------------------------------------------------------------------
# Offline validation: mock the agent, validate full endpoint + parsing chain
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_plan_architect_offline_structure():
    """
    Validates the full request → Supabase → agent → parse → response chain
    using a mock LLM response — does NOT require Ollama.
    """
    from unittest.mock import AsyncMock
    from models.blueprint import PhaseBlueprint

    mock_blueprint = PlanBlueprint(
        phases=[
            PhaseBlueprint(
                phase_name="Base",
                weeks=4,
                intensity_distribution_target="80/20",
                weekly_structure_template={"swim": 3, "bike": 3, "run": 3},
                focus="Aerobic foundation and swim technique.",
            ),
            PhaseBlueprint(
                phase_name="Build",
                weeks=4,
                intensity_distribution_target="75/25",
                weekly_structure_template={"swim": 2, "bike": 4, "run": 3},
                focus="Race-specific fitness and volume increase.",
            ),
            PhaseBlueprint(
                phase_name="Taper",
                weeks=2,
                intensity_distribution_target="90/10",
                weekly_structure_template={"swim": 2, "bike": 2, "run": 2},
                focus="Rest and race preparation.",
            ),
        ],
        total_weeks=10,
        notes=(
            "10-week plan for a first-timer. Heavy Base phase to build aerobic capacity. "
            "Build phase adds race-pace work. Short taper for freshness."
        ),
    )

    mock_supabase_result = MagicMock()
    mock_supabase_result.data = FIRST_TIMER_PROFILE

    with patch("routers.plans.supabase") as mock_sb, \
         patch("routers.plans.run_plan_architect", new_callable=AsyncMock) as mock_agent:

        mock_sb.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value = mock_supabase_result
        mock_agent.return_value = mock_blueprint

        client = TestClient(app)
        response = client.post(
            "/plans/architect",
            json={"user_id": "integration-test-user"},
        )

    print("\n" + "=" * 60)
    print("OFFLINE INTEGRATION TEST — Blueprint Structure Validation")
    print("=" * 60)
    print(json.dumps(response.json(), indent=2))
    print("=" * 60 + "\n")

    assert response.status_code == 200
    data = response.json()

    # Validate the parsed blueprint
    blueprint = PlanBlueprint.model_validate(data)
    _validate_blueprint(blueprint, weeks_until_race=10)

    # Verify the agent was called with the correct profile
    mock_agent.assert_called_once()
    called_profile = mock_agent.call_args[0][0]
    assert called_profile["goal"] == "first_timer"
    assert called_profile["weakest_discipline"] == "swim"
    assert called_profile["weekly_hours"] == 8.0

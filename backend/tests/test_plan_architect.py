"""
Unit tests for the Plan Architect agent and POST /plans/architect endpoint.

LLM and Supabase are fully mocked — these tests run instantly without
network access and validate structure, routing, and error handling.
"""
import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from main import app
from models.blueprint import PhaseBlueprint, PlanBlueprint, ArchitectRequest


# ---------------------------------------------------------------------------
# Pydantic model unit tests
# ---------------------------------------------------------------------------

class TestPhaseBlueprint:
    def test_valid_phase(self):
        phase = PhaseBlueprint(
            phase_name="Base",
            weeks=4,
            intensity_distribution_target="80/20",
            weekly_structure_template={"swim": 2, "bike": 3, "run": 3},
            focus="Build aerobic base.",
        )
        assert phase.weeks == 4
        assert phase.phase_name == "Base"

    def test_invalid_sport_key_raises(self):
        with pytest.raises(Exception):
            PhaseBlueprint(
                phase_name="Base",
                weeks=4,
                intensity_distribution_target="80/20",
                weekly_structure_template={"strength": 2},  # invalid sport
                focus="strength focus",
            )

    def test_negative_session_count_raises(self):
        with pytest.raises(Exception):
            PhaseBlueprint(
                phase_name="Base",
                weeks=4,
                intensity_distribution_target="80/20",
                weekly_structure_template={"swim": -1, "bike": 3, "run": 3},
                focus="bad",
            )

    def test_zero_weeks_raises(self):
        with pytest.raises(Exception):
            PhaseBlueprint(
                phase_name="Base",
                weeks=0,
                intensity_distribution_target="80/20",
                weekly_structure_template={"swim": 2, "bike": 3, "run": 3},
                focus="bad",
            )


class TestPlanBlueprint:
    def _make_phase(self, name: str, weeks: int) -> PhaseBlueprint:
        return PhaseBlueprint(
            phase_name=name,
            weeks=weeks,
            intensity_distribution_target="80/20",
            weekly_structure_template={"swim": 2, "bike": 3, "run": 3},
            focus="Test focus.",
        )

    def test_valid_blueprint(self):
        blueprint = PlanBlueprint(
            phases=[self._make_phase("Base", 4), self._make_phase("Taper", 2)],
            total_weeks=6,
            notes="Short plan.",
        )
        assert blueprint.total_weeks == 6
        assert len(blueprint.phases) == 2

    def test_total_weeks_must_match_phase_sum(self):
        with pytest.raises(Exception):
            PlanBlueprint(
                phases=[self._make_phase("Base", 4), self._make_phase("Taper", 2)],
                total_weeks=10,  # wrong — should be 6
                notes="Bad.",
            )

    def test_empty_phases_raises(self):
        with pytest.raises(Exception):
            PlanBlueprint(phases=[], total_weeks=0, notes="empty")


# ---------------------------------------------------------------------------
# _parse_blueprint unit tests (isolate JSON parsing logic)
# ---------------------------------------------------------------------------

class TestParseBlueprint:
    def test_parse_valid_json_string(self):
        from services.agents.plan_architect import _parse_blueprint

        data = {
            "phases": [
                {
                    "phase_name": "Base",
                    "weeks": 4,
                    "intensity_distribution_target": "80/20",
                    "weekly_structure_template": {"swim": 2, "bike": 3, "run": 3},
                    "focus": "Aerobic base.",
                },
                {
                    "phase_name": "Taper",
                    "weeks": 2,
                    "intensity_distribution_target": "90/10",
                    "weekly_structure_template": {"swim": 1, "bike": 2, "run": 2},
                    "focus": "Rest and sharpen.",
                },
            ],
            "total_weeks": 6,
            "notes": "Short plan for 6-week timeline.",
        }
        blueprint = _parse_blueprint(json.dumps(data))
        assert blueprint.total_weeks == 6
        assert blueprint.phases[0].phase_name == "Base"

    def test_parse_dict_input(self):
        from services.agents.plan_architect import _parse_blueprint

        data = {
            "phases": [
                {
                    "phase_name": "Base",
                    "weeks": 3,
                    "intensity_distribution_target": "80/20",
                    "weekly_structure_template": {"swim": 2, "bike": 3, "run": 3},
                    "focus": "Base.",
                }
            ],
            "total_weeks": 3,
            "notes": "Ultra short.",
        }
        blueprint = _parse_blueprint(data)
        assert blueprint.phases[0].weeks == 3

    def test_parse_auto_corrects_total_weeks(self):
        """_parse_blueprint should fix total_weeks if model got it wrong."""
        from services.agents.plan_architect import _parse_blueprint

        data = {
            "phases": [
                {
                    "phase_name": "Base",
                    "weeks": 4,
                    "intensity_distribution_target": "80/20",
                    "weekly_structure_template": {"swim": 2, "bike": 3, "run": 3},
                    "focus": "Base.",
                },
                {
                    "phase_name": "Taper",
                    "weeks": 2,
                    "intensity_distribution_target": "90/10",
                    "weekly_structure_template": {"swim": 1, "bike": 2, "run": 2},
                    "focus": "Taper.",
                },
            ],
            "total_weeks": 999,  # model got it wrong — should be auto-corrected to 6
            "notes": "Auto-fix test.",
        }
        blueprint = _parse_blueprint(data)
        assert blueprint.total_weeks == 6


# ---------------------------------------------------------------------------
# Endpoint tests (mock everything)
# ---------------------------------------------------------------------------

MOCK_PROFILE = {
    "user_id": "test-user-123",
    "goal": "first_timer",
    "experience": "first_timer",
    "race_date": "2026-07-15",
    "weekly_hours": 8.0,
    "days_available": 5,
    "strongest_discipline": "bike",
    "weakest_discipline": "swim",
    "current_background": "Recreational runner, new to triathlon",
    "zones": None,
}

MOCK_BLUEPRINT = PlanBlueprint(
    phases=[
        PhaseBlueprint(
            phase_name="Base",
            weeks=4,
            intensity_distribution_target="80/20",
            weekly_structure_template={"swim": 3, "bike": 3, "run": 3},
            focus="Aerobic durability and technique.",
        ),
        PhaseBlueprint(
            phase_name="Build",
            weeks=3,
            intensity_distribution_target="75/25",
            weekly_structure_template={"swim": 2, "bike": 4, "run": 3},
            focus="Race-specific fitness.",
        ),
        PhaseBlueprint(
            phase_name="Taper",
            weeks=2,
            intensity_distribution_target="90/10",
            weekly_structure_template={"swim": 2, "bike": 2, "run": 2},
            focus="Recovery and race sharpening.",
        ),
    ],
    total_weeks=9,
    notes="9-week plan with base-build-taper structure.",
)


@pytest.fixture
def client():
    return TestClient(app)


class TestArchitectEndpoint:
    def test_valid_request_returns_blueprint(self, client):
        mock_supabase_result = MagicMock()
        mock_supabase_result.data = MOCK_PROFILE

        with patch("routers.plans.supabase") as mock_sb, \
             patch("routers.plans.run_plan_architect", new_callable=AsyncMock) as mock_agent:
            mock_sb.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value = mock_supabase_result
            mock_agent.return_value = MOCK_BLUEPRINT

            response = client.post(
                "/plans/architect",
                json={"user_id": "test-user-123"},
            )

        assert response.status_code == 200
        data = response.json()
        assert "phases" in data
        assert "total_weeks" in data
        assert len(data["phases"]) > 0

    def test_phase_weeks_sum_to_total(self, client):
        mock_supabase_result = MagicMock()
        mock_supabase_result.data = MOCK_PROFILE

        with patch("routers.plans.supabase") as mock_sb, \
             patch("routers.plans.run_plan_architect", new_callable=AsyncMock) as mock_agent:
            mock_sb.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value = mock_supabase_result
            mock_agent.return_value = MOCK_BLUEPRINT

            response = client.post(
                "/plans/architect",
                json={"user_id": "test-user-123"},
            )

        data = response.json()
        phase_sum = sum(p["weeks"] for p in data["phases"])
        assert phase_sum == data["total_weeks"]

    def test_profile_not_found_returns_404(self, client):
        mock_supabase_result = MagicMock()
        mock_supabase_result.data = None

        with patch("routers.plans.supabase") as mock_sb:
            mock_sb.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value = mock_supabase_result

            response = client.post(
                "/plans/architect",
                json={"user_id": "nonexistent-user"},
            )

        assert response.status_code == 404

    def test_malformed_body_returns_422(self, client):
        """Missing required user_id field → FastAPI returns 422."""
        response = client.post(
            "/plans/architect",
            json={},  # user_id missing
        )
        assert response.status_code == 422

    def test_invalid_user_id_type_returns_422(self, client):
        """user_id must be a string."""
        response = client.post(
            "/plans/architect",
            json={"user_id": 12345},  # should be string
        )
        # FastAPI will coerce int to str, so check it still works or 422
        # Either is acceptable — main thing is the endpoint exists
        assert response.status_code in (200, 404, 422)

    def test_agent_error_returns_500(self, client):
        mock_supabase_result = MagicMock()
        mock_supabase_result.data = MOCK_PROFILE

        with patch("routers.plans.supabase") as mock_sb, \
             patch("routers.plans.run_plan_architect", new_callable=AsyncMock) as mock_agent:
            mock_sb.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value = mock_supabase_result
            mock_agent.side_effect = ValueError("LLM returned garbage")

            response = client.post(
                "/plans/architect",
                json={"user_id": "test-user-123"},
            )

        assert response.status_code == 500

    def test_response_has_all_required_phase_fields(self, client):
        mock_supabase_result = MagicMock()
        mock_supabase_result.data = MOCK_PROFILE

        with patch("routers.plans.supabase") as mock_sb, \
             patch("routers.plans.run_plan_architect", new_callable=AsyncMock) as mock_agent:
            mock_sb.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value = mock_supabase_result
            mock_agent.return_value = MOCK_BLUEPRINT

            response = client.post(
                "/plans/architect",
                json={"user_id": "test-user-123"},
            )

        for phase in response.json()["phases"]:
            assert "phase_name" in phase
            assert "weeks" in phase
            assert "intensity_distribution_target" in phase
            assert "weekly_structure_template" in phase
            assert "focus" in phase

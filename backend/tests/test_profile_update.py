"""
Unit tests for PATCH /profiles/{user_id} endpoint.
"""
import pytest
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_supabase_mock(return_data: list):
    """Return a mock supabase client whose chain resolves to return_data."""
    mock_result = MagicMock()
    mock_result.data = return_data

    mock_execute = MagicMock(return_value=mock_result)
    mock_eq = MagicMock()
    mock_eq.execute = mock_execute

    mock_update = MagicMock()
    mock_update.eq = MagicMock(return_value=mock_eq)

    mock_table = MagicMock()
    mock_table.update = MagicMock(return_value=mock_update)

    mock_supabase = MagicMock()
    mock_supabase.table = MagicMock(return_value=mock_table)
    return mock_supabase, mock_table


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestUpdateProfileEndpoint:
    def _get_client(self, mock_supabase):
        with patch("db.supabase.supabase", mock_supabase), \
             patch("routers.profiles.supabase", mock_supabase):
            from main import app
            return TestClient(app)

    def test_patch_hours_max_mirrors_to_weekly_hours(self):
        """PATCH hours_max should also set weekly_hours (legacy pipeline mirror)."""
        mock_supabase, mock_table = _make_supabase_mock([{"user_id": "abc", "hours_max": 12.0}])

        with patch("routers.profiles.supabase", mock_supabase):
            from main import app
            client = TestClient(app)
            response = client.patch("/profiles/abc", json={"hours_max": 12.0})

        assert response.status_code == 200
        assert response.json() == {"success": True}

        call_args = mock_table.update.call_args
        assert call_args is not None
        update_dict = call_args[0][0]
        assert update_dict == {"hours_max": 12.0, "weekly_hours": 12.0}

    def test_patch_multiple_fields(self):
        """PATCH with several fields should include all non-None values."""
        mock_supabase, mock_table = _make_supabase_mock([{"user_id": "abc"}])

        with patch("routers.profiles.supabase", mock_supabase):
            from main import app
            client = TestClient(app)
            response = client.patch(
                "/profiles/abc",
                json={"hours_max": 10.0, "days_available": 5, "goal": "competitive"},
            )

        assert response.status_code == 200
        call_args = mock_table.update.call_args
        update_dict = call_args[0][0]
        assert update_dict == {
            "hours_max": 10.0,
            "weekly_hours": 10.0,
            "days_available": 5,
            "goal": "competitive",
        }

    def test_patch_all_none_sends_nothing(self):
        """PATCH with all None values should return success without calling supabase update."""
        mock_supabase, mock_table = _make_supabase_mock([])

        with patch("routers.profiles.supabase", mock_supabase):
            from main import app
            client = TestClient(app)
            # Send an empty body — all fields are Optional so they default to None
            response = client.patch("/profiles/abc", json={})

        assert response.status_code == 200
        assert response.json() == {"success": True}
        # update() should NOT have been called when there's nothing to update
        mock_table.update.assert_not_called()

    def test_patch_none_values_excluded(self):
        """Fields explicitly set to null in JSON should not appear in the update dict."""
        mock_supabase, mock_table = _make_supabase_mock([{"user_id": "abc"}])

        with patch("routers.profiles.supabase", mock_supabase):
            from main import app
            client = TestClient(app)
            response = client.patch(
                "/profiles/abc",
                json={"hours_max": 8.0, "days_available": None},
            )

        assert response.status_code == 200
        update_dict = mock_table.update.call_args[0][0]
        assert "days_available" not in update_dict
        assert update_dict == {"hours_max": 8.0, "weekly_hours": 8.0}

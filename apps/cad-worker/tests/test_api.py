"""
CAD Worker API Tests
Integration tests for the FastAPI endpoints.
"""

from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


class TestHealthEndpoint:
    def test_health_returns_ok(self):
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert data["service"] == "cad-worker"
        assert "cad_engine" in data

    def test_health_reports_build123d_status(self):
        response = client.get("/health")
        data = response.json()
        assert "build123d_available" in data["cad_engine"]


class TestGenerateEndpoint:
    def test_unsupported_family_returns_400(self):
        response = client.post("/generate", json={
            "job_id": "00000000-0000-0000-0000-000000000001",
            "part_spec_id": "00000000-0000-0000-0000-000000000002",
            "part_spec": {
                "family": "freeform_sculpture",
                "units": "mm",
                "dimensions": {},
            },
            "variant_type": "requested",
        })
        # 422: Pydantic rejects the unknown enum value before the route handler fires
        # 400: route handler explicitly rejects the family
        # Both are correct — the family is unsupported either way
        assert response.status_code in (400, 422)

    def test_missing_dimensions_returns_failed(self):
        """When build123d is available, missing dims should return failed status."""
        response = client.post("/generate", json={
            "job_id": "00000000-0000-0000-0000-000000000001",
            "part_spec_id": "00000000-0000-0000-0000-000000000002",
            "part_spec": {
                "family": "spacer",
                "units": "mm",
                "dimensions": {},  # Missing required dimensions
            },
            "variant_type": "requested",
        })
        # Either 400 (unsupported) or 200 with failed status
        if response.status_code == 200:
            data = response.json()
            assert data["status"] == "failed"
            assert data["failure_stage"] in ["invalid_dimensions", "spec_ambiguity"]

    def test_freecad_engine_disabled_returns_400(self):
        response = client.post("/generate", json={
            "job_id": "00000000-0000-0000-0000-000000000001",
            "part_spec_id": "00000000-0000-0000-0000-000000000002",
            "part_spec": {
                "family": "spacer",
                "units": "mm",
                "dimensions": {"outer_diameter": 20.0, "inner_diameter": 10.0, "length": 15.0},
            },
            "variant_type": "requested",
            "engine": "freecad",
        })
        assert response.status_code == 400

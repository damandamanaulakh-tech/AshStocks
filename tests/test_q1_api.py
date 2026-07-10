from __future__ import annotations

import ashstocks.api as api


def test_q1_status_never_exposes_token(monkeypatch):
    monkeypatch.setenv("UPSTOX_ACCESS_TOKEN", "secret-token")
    status = api._q1_status()
    assert status["token_visible"] is True
    assert "secret-token" not in repr(status)
    assert status["safety"]["live_orders"] is False


def test_q1_run_is_render_only(monkeypatch):
    monkeypatch.delenv("RENDER", raising=False)
    monkeypatch.delenv("RENDER_SERVICE_ID", raising=False)
    monkeypatch.delenv("RENDER_EXTERNAL_URL", raising=False)
    result = api._run_q1_fetch()
    assert result == {"ok": False, "error": "render_only_endpoint"}

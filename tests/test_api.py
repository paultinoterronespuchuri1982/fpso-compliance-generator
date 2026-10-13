# Pruebas de la API. No llaman a Anthropic de verdad: la IA se simula,
# así que se pueden correr sin créditos y sin conexión a internet.

import json
from types import SimpleNamespace

import anthropic
import httpx
import pytest
from fastapi.testclient import TestClient

import main
from main import extract_json

client = TestClient(main.app)

VALID_LOG = {
    "date": "2024-09-21",
    "vessel_name": "FPSO Santos",
    "watch_start": "08:00",
    "watch_end": "16:00",
    "chief_officer": "John Smith",
    "operational_summary": "Normal operations",
}


def request_body(language="en", **log_overrides):
    return {"logs": {**VALID_LOG, **log_overrides}, "language": language}


def use_fake_claude(monkeypatch, respond):
    # `respond` recibe los argumentos de messages.create y devuelve la respuesta simulada.
    class FakeMessages:
        async def create(self, **kwargs):
            return respond(kwargs)

    monkeypatch.setattr(main, "client", SimpleNamespace(messages=FakeMessages()))
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")


def text_reply(text):
    return SimpleNamespace(content=[SimpleNamespace(text=text)])


def test_extract_json_reads_plain_object():
    assert extract_json('{"a": 1}') == {"a": 1}


def test_extract_json_reads_object_inside_markdown_fence():
    assert extract_json('```json\n{"a": 1}\n```') == {"a": 1}


def test_extract_json_rejects_plain_text():
    with pytest.raises(ValueError):
        extract_json("hola, esto no es JSON")


def test_extract_json_rejects_list():
    with pytest.raises(ValueError):
        extract_json("[1, 2, 3]")


def test_health_never_exposes_the_key(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "clave-secreta-123")
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["claude_api"] == "configured"
    assert "clave-secreta-123" not in response.text


def test_generate_without_key_returns_500(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    response = client.post("/api/generate-report", json=request_body())
    assert response.status_code == 500


def test_unsupported_language_returns_400(monkeypatch):
    use_fake_claude(monkeypatch, lambda kwargs: text_reply("{}"))
    response = client.post("/api/generate-report", json=request_body(language="fr"))
    assert response.status_code == 400


def test_summary_longer_than_limit_returns_422(monkeypatch):
    use_fake_claude(monkeypatch, lambda kwargs: text_reply("{}"))
    response = client.post(
        "/api/generate-report", json=request_body(operational_summary="A" * 2001)
    )
    assert response.status_code == 422


def test_equipment_status_as_list_returns_422(monkeypatch):
    use_fake_claude(monkeypatch, lambda kwargs: text_reply("{}"))
    response = client.post(
        "/api/generate-report", json=request_body(equipment_status=["x"])
    )
    assert response.status_code == 422


def test_successful_report_is_returned_as_structured_data(monkeypatch):
    report = {"executive_summary": "Todo en orden", "compliance_checklist": ["item 1"]}
    use_fake_claude(monkeypatch, lambda kwargs: text_reply(json.dumps(report)))

    response = client.post("/api/generate-report", json=request_body())

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "success"
    assert body["report"] == report
    assert body["vessel_name"] == "FPSO Santos"


def test_non_json_reply_is_kept_as_summary(monkeypatch):
    use_fake_claude(monkeypatch, lambda kwargs: text_reply("Texto libre del modelo"))

    response = client.post("/api/generate-report", json=request_body())

    assert response.status_code == 200
    assert response.json()["report"]["executive_summary"] == "Texto libre del modelo"


def test_api_failure_returns_generic_502(monkeypatch):
    def fail(kwargs):
        raise anthropic.APIError(
            "detalle interno secreto",
            httpx.Request("POST", "https://api.anthropic.com/v1/messages"),
            body=None,
        )

    use_fake_claude(monkeypatch, fail)

    response = client.post("/api/generate-report", json=request_body())

    assert response.status_code == 502
    assert "detalle interno secreto" not in response.text
    assert "Falha ao gerar o relatório" in response.json()["detail"]

import json

import main
from schemas import FieldUpdateIntentRequest


class FakeProvider:
    def __init__(self, outputs=None, error=None):
        self.outputs = list(outputs or [])
        self.error = error

    def generate_json(self, system_prompt, user_prompt, json_schema=None):
        if self.error:
            raise self.error
        return self.outputs.pop(0)


def request(text="Cầu La Hai không qua được, lực lượng chưa thể tiếp cận điểm tập kết."):
    return FieldUpdateIntentRequest(
        confirmedText=text,
        sourceId="field-update-1",
        capturedAt="2026-07-28T02:00:00.000Z",
    )


def test_field_intent_provider_failure_keeps_an_auditable_unresolved_route_observation(monkeypatch):
    monkeypatch.setattr(main, "provider", FakeProvider(error=RuntimeError("offline")))

    result = main.field_update_intent(request())

    assert result.kind == "ROUTE_HAZARD"
    assert result.requiresAdminVerification is True
    assert result.resolvedReferenceIds == []
    assert result.unresolvedReferences == ["Cầu La Hai không qua được, lực lượng chưa thể tiếp cận điểm tập kết."]
    assert result.facts[0].source is not None
    assert result.facts[0].source.excerpt == "Cầu La Hai không qua được, lực lượng chưa thể tiếp cận điểm tập kết."


def test_field_intent_rejects_auto_dispatch_and_uses_safe_fallback(monkeypatch):
    malicious = {
        "schemaVersion": "field-update-intent.v1",
        "kind": "ARRIVED",
        "confidence": 0.99,
        "sourceExcerpt": "Đã đến điểm tập kết.",
        "requiresAdminVerification": True,
        "facts": [
            {
                "id": "F1",
                "key": "OTHER",
                "provenance": "REPORTED",
                "value": "Đã đến điểm tập kết.",
                "qualifier": "EXACT",
                "source": {
                    "sourceType": "FIELD_UPDATE",
                    "sourceId": "field-update-1",
                    "excerpt": "Đã đến điểm tập kết.",
                    "capturedAt": "2026-07-28T02:00:00.000Z",
                },
            }
        ],
        "resolvedReferenceIds": [],
        "unresolvedReferences": [],
        "autoDispatch": True,
    }
    monkeypatch.setattr(main, "provider", FakeProvider([json.dumps(malicious)]))

    result = main.field_update_intent(request("Đã đến điểm tập kết."))

    assert result.kind == "ARRIVED"
    assert not hasattr(result, "autoDispatch")
    assert result.requiresAdminVerification is True

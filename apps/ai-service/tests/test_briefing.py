import json

import pytest
from fastapi import HTTPException

import main
from schemas import BriefingSelectRequest


class FakeProvider:
    def __init__(self, outputs):
        self.outputs = list(outputs)

    def generate_json(self, system_prompt, user_prompt, json_schema=None):
        return self.outputs.pop(0)


def request():
    return BriefingSelectRequest(
        facts=[
            {"id": "F1", "text": "Readiness đã được backend tính."},
            {"id": "F2", "text": "Thời tiết đã được backend lấy."},
            {"id": "F3", "text": "Sự cố đã được backend đếm."},
        ],
    )


def test_briefing_ai_only_reorders_verified_fact_ids(monkeypatch):
    provider = FakeProvider([json.dumps({"factIds": ["F3", "F2", "F1"]})])
    monkeypatch.setattr(main, "provider", provider)

    result = main.briefing_select(request())

    assert result.factIds == ["F3", "F2", "F1"]


def test_briefing_rejects_missing_or_invented_fact_ids(monkeypatch):
    provider = FakeProvider(
        [
            json.dumps({"factIds": ["F1", "F9"]}),
            json.dumps({"factIds": ["F1", "F1", "F2"]}),
        ],
    )
    monkeypatch.setattr(main, "provider", provider)

    with pytest.raises(HTTPException) as error:
        main.briefing_select(request())
    assert error.value.status_code == 503

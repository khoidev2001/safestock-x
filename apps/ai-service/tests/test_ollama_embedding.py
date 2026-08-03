"""Ollama embedding adapter — mock HTTP, không cần model/Ollama thật."""
import json
import math
import sys
from pathlib import Path

import httpx
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from providers.ollama_embedding import OllamaEmbeddingProvider  # noqa: E402
from providers.runtime import KEEP_ALIVE  # noqa: E402


def _provider(handler) -> OllamaEmbeddingProvider:
    return OllamaEmbeddingProvider(
        base_url="http://ollama.test",
        transport=httpx.MockTransport(handler),
    )


def test_batch_embed_uses_current_api_and_task_prefix():
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        payload = json.loads(request.content)
        assert payload == {
            "model": "nomic-embed-text",
            "input": ["search_query: nước mỗi người", "search_query: sơ tán lũ"],
            "truncate": False,
            # Model phải nằm thường trú trong VRAM, xem providers/runtime.py.
            "keep_alive": KEEP_ALIVE,
        }
        return httpx.Response(200, json={"embeddings": [[1, 0], [0, 1]]})

    vectors = _provider(handler).embed(
        ["  nước  mỗi người ", "sơ tán lũ"],
        task="query",
    )
    assert vectors == [[1.0, 0.0], [0.0, 1.0]]
    assert requests[0].url.path == "/api/embed"


def test_falls_back_to_legacy_only_for_404_or_405():
    paths: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        paths.append(request.url.path)
        if request.url.path == "/api/embed":
            return httpx.Response(404)
        payload = json.loads(request.content)
        value = 1 if "mục một" in payload["prompt"] else 2
        return httpx.Response(200, json={"embedding": [value, 0]})

    vectors = _provider(handler).embed(["mục một", "mục hai"], task="document")
    assert vectors == [[1.0, 0.0], [2.0, 0.0]]
    assert paths == ["/api/embed", "/api/embeddings", "/api/embeddings"]


def test_server_error_does_not_fall_back():
    paths: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        paths.append(request.url.path)
        return httpx.Response(500, text="boom")

    with pytest.raises(httpx.HTTPStatusError):
        _provider(handler).embed(["nước"], task="query")
    assert paths == ["/api/embed"]


@pytest.mark.parametrize(
    "payload, message",
    [
        ({"embeddings": []}, "sai số vector"),
        ({"embeddings": [[]]}, "vector rỗng"),
        ({"embeddings": [[1, 2], [3]]}, "không cùng số chiều"),
        ({"embeddings": [[1, float("nan")]]}, "NaN/Infinity"),
        ({"embeddings": [["x", 1]]}, "không phải số"),
    ],
)
def test_rejects_malformed_vectors(payload, message):
    count = 2 if len(payload.get("embeddings", [])) == 2 else 1

    def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=payload)

    with pytest.raises(ValueError, match=message):
        _provider(handler).embed([f"mục {i}" for i in range(count)], task="document")


def test_empty_input_skips_http():
    def handler(_: httpx.Request) -> httpx.Response:
        raise AssertionError("không được gọi HTTP khi input rỗng")

    assert _provider(handler).embed([], task="query") == []


def test_model_digest_resolves_latest_and_is_cached():
    calls = []
    digest = "a" * 64

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request.url.path)
        return httpx.Response(200, json={"models": [
            {"name": "nomic-embed-text:latest", "digest": digest}
        ]})

    provider = _provider(handler)
    assert provider.model_digest() == digest
    assert provider.model_digest() == digest
    assert calls == ["/api/tags"]


def test_model_digest_rejects_missing_or_malformed_model():
    missing = _provider(lambda _: httpx.Response(200, json={"models": []}))
    with pytest.raises(RuntimeError, match="Chưa cài model"):
        missing.model_digest()

    malformed = _provider(lambda _: httpx.Response(200, json={"models": [
        {"name": "nomic-embed-text:latest", "digest": "not-a-sha"}
    ]}))
    with pytest.raises(ValueError, match="digest không hợp lệ"):
        malformed.model_digest()


def test_rejects_empty_text_and_unknown_task():
    provider = _provider(lambda _: httpx.Response(500))
    with pytest.raises(ValueError, match="văn bản rỗng"):
        provider.embed(["  "], task="query")
    with pytest.raises(ValueError, match="task không hợp lệ"):
        provider.embed(["nước"], task="invalid")  # type: ignore[arg-type]

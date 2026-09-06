"""Vòng canh giữ model trong VRAM — không cần Ollama thật."""
import sys
from pathlib import Path

import httpx
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import keep_warm  # noqa: E402
from providers.runtime import KEEP_ALIVE  # noqa: E402


@pytest.fixture(autouse=True)
def _env(monkeypatch):
    monkeypatch.setenv("OLLAMA_URL", "http://ollama.test")
    monkeypatch.setenv("OLLAMA_MODEL", "qwen3.5:4b")
    monkeypatch.setenv("OLLAMA_EMBED_MODEL", "nomic-embed-text")
    keep_warm.resume()
    yield
    keep_warm.resume()


def _fake_ollama(monkeypatch, loaded: list[str]):
    """Giả lập Ollama: /api/ps trả danh sách cho trước, ghi lại mọi lệnh nạp."""
    calls: list[tuple[str, dict]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/api/ps":
            return httpx.Response(200, json={"models": [{"name": n} for n in loaded]})
        import json as _json

        calls.append((request.url.path, _json.loads(request.content)))
        return httpx.Response(200, json={"embeddings": [[1.0]]})

    transport = httpx.MockTransport(handler)
    original = httpx.Client

    def client(*args, **kwargs):
        kwargs["transport"] = transport
        return original(*args, **kwargs)

    monkeypatch.setattr(httpx, "Client", client)
    return calls


def test_no_reload_when_both_models_are_in_vram(monkeypatch):
    calls = _fake_ollama(monkeypatch, ["qwen3.5:4b", "nomic-embed-text:latest"])
    assert keep_warm.warm_once() == []
    assert calls == [], "model đã sẵn sàng thì không được gọi nạp lại"


def test_reloads_when_vram_is_empty(monkeypatch):
    calls = _fake_ollama(monkeypatch, [])
    reloaded = keep_warm.warm_once()
    assert set(reloaded) == {"qwen3.5:4b", "nomic-embed-text:latest"}
    assert [path for path, _ in calls] == ["/api/generate", "/api/embed"]


def test_loads_only_the_missing_model(monkeypatch):
    calls = _fake_ollama(monkeypatch, ["qwen3.5:4b"])
    assert keep_warm.warm_once() == ["nomic-embed-text:latest"]
    assert [path for path, _ in calls] == ["/api/embed"]


def test_always_loads_with_permanent_keep_alive(monkeypatch):
    """Nạp xong mà vẫn để hạn 30 phút thì lượt canh sau lại phải nạp tiếp."""
    calls = _fake_ollama(monkeypatch, [])
    keep_warm.warm_once()
    assert all(body["keep_alive"] == -1 for _, body in calls)


def test_does_not_generate_text_when_only_loading_weights(monkeypatch):
    calls = _fake_ollama(monkeypatch, ["nomic-embed-text:latest"])
    keep_warm.warm_once()
    _, body = calls[0]
    assert body["options"]["num_predict"] == 0


def test_model_name_without_tag_still_matches(monkeypatch):
    """Ollama trả "nomic-embed-text:latest" còn env ghi "nomic-embed-text"."""
    calls = _fake_ollama(monkeypatch, ["qwen3.5:4b", "nomic-embed-text:latest"])
    monkeypatch.setenv("OLLAMA_EMBED_MODEL", "nomic-embed-text")
    assert keep_warm.warm_once() == []
    assert calls == []


def test_can_be_disabled_via_environment_variable(monkeypatch):
    monkeypatch.setenv("OLLAMA_KEEP_WARM", "false")
    assert keep_warm.start() is None


def test_watch_interval_never_below_30_seconds(monkeypatch):
    monkeypatch.setenv("OLLAMA_KEEP_WARM_INTERVAL_SECONDS", "1")
    assert keep_warm._interval_seconds() == 30
    monkeypatch.setenv("OLLAMA_KEEP_WARM_INTERVAL_SECONDS", "rac")
    assert keep_warm._interval_seconds() == 120


def test_provider_sends_permanent_keep_alive():
    # Phải là SỐ -1. Ollama đọc chuỗi như khoảng thời gian nên "-1" trả 400 và
    # làm hỏng mọi lệnh gọi sinh văn bản lẫn embedding.
    assert KEEP_ALIVE == -1, "mặc định phải là giữ model thường trú"
    assert isinstance(KEEP_ALIVE, int), "keep_alive dạng chuỗi bị Ollama từ chối"


def test_duration_keep_alive_stays_a_string():
    from providers.runtime import _parse_keep_alive

    assert _parse_keep_alive("30m") == "30m"
    assert _parse_keep_alive(" -1 ") == -1
    assert _parse_keep_alive("0") == 0


# ===== Công tắc bật/tắt cho công cụ ngoài =====


def test_unloads_models_from_vram(monkeypatch):
    calls = _fake_ollama(monkeypatch, ["qwen3.5:4b", "nomic-embed-text:latest"])
    unloaded = keep_warm.unload_all()
    assert set(unloaded) == {"qwen3.5:4b", "nomic-embed-text:latest"}
    assert all(body["keep_alive"] == 0 for _, body in calls), "phải trả VRAM ngay"


def test_does_not_unload_models_absent_from_vram(monkeypatch):
    calls = _fake_ollama(monkeypatch, [])
    assert keep_warm.unload_all() == []
    assert calls == []


def test_paused_watch_loop_does_not_reload(monkeypatch):
    """Lỗi nguy hiểm nhất: bấm nguội xong 120 giây sau model tự nóng lại."""
    calls = _fake_ollama(monkeypatch, [])
    keep_warm.pause()
    keep_warm._loop_tick_for_test(120)
    assert calls == [], "đang tạm dừng thì không được nạp"
    keep_warm.resume()
    keep_warm._loop_tick_for_test(120)
    assert [path for path, _ in calls] == ["/api/generate", "/api/embed"]


def test_status_is_accurate_when_ollama_is_down(monkeypatch):
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("ollama chưa chạy")

    transport = httpx.MockTransport(handler)
    original = httpx.Client
    monkeypatch.setattr(
        httpx, "Client", lambda *a, **k: original(*a, **{**k, "transport": transport})
    )
    state = keep_warm.status()
    assert state["ollamaReachable"] is False
    assert state["loadedModels"] == []
    assert state["wantedModels"] == ["nomic-embed-text:latest", "qwen3.5:4b"]

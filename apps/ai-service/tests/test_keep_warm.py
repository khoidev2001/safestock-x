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


def test_khong_nap_lai_khi_ca_hai_model_dang_o_trong_vram(monkeypatch):
    calls = _fake_ollama(monkeypatch, ["qwen3.5:4b", "nomic-embed-text:latest"])
    assert keep_warm.warm_once() == []
    assert calls == [], "model đã sẵn sàng thì không được gọi nạp lại"


def test_nap_lai_khi_vram_trong(monkeypatch):
    calls = _fake_ollama(monkeypatch, [])
    reloaded = keep_warm.warm_once()
    assert set(reloaded) == {"qwen3.5:4b", "nomic-embed-text:latest"}
    assert [path for path, _ in calls] == ["/api/generate", "/api/embed"]


def test_chi_nap_model_con_thieu(monkeypatch):
    calls = _fake_ollama(monkeypatch, ["qwen3.5:4b"])
    assert keep_warm.warm_once() == ["nomic-embed-text:latest"]
    assert [path for path, _ in calls] == ["/api/embed"]


def test_luon_nap_voi_keep_alive_vinh_vien(monkeypatch):
    """Nạp xong mà vẫn để hạn 30 phút thì lượt canh sau lại phải nạp tiếp."""
    calls = _fake_ollama(monkeypatch, [])
    keep_warm.warm_once()
    assert all(body["keep_alive"] == -1 for _, body in calls)


def test_khong_sinh_chu_khi_chi_can_nap_trong_so(monkeypatch):
    calls = _fake_ollama(monkeypatch, ["nomic-embed-text:latest"])
    keep_warm.warm_once()
    _, body = calls[0]
    assert body["options"]["num_predict"] == 0


def test_ten_model_khong_ghi_tag_van_khop(monkeypatch):
    """Ollama trả "nomic-embed-text:latest" còn env ghi "nomic-embed-text"."""
    calls = _fake_ollama(monkeypatch, ["qwen3.5:4b", "nomic-embed-text:latest"])
    monkeypatch.setenv("OLLAMA_EMBED_MODEL", "nomic-embed-text")
    assert keep_warm.warm_once() == []
    assert calls == []


def test_tat_duoc_qua_bien_moi_truong(monkeypatch):
    monkeypatch.setenv("OLLAMA_KEEP_WARM", "false")
    assert keep_warm.start() is None


def test_khoang_canh_khong_duoi_30_giay(monkeypatch):
    monkeypatch.setenv("OLLAMA_KEEP_WARM_INTERVAL_SECONDS", "1")
    assert keep_warm._interval_seconds() == 30
    monkeypatch.setenv("OLLAMA_KEEP_WARM_INTERVAL_SECONDS", "rac")
    assert keep_warm._interval_seconds() == 120


def test_provider_gui_keep_alive_vinh_vien():
    # Phải là SỐ -1. Ollama đọc chuỗi như khoảng thời gian nên "-1" trả 400 và
    # làm hỏng mọi lệnh gọi sinh văn bản lẫn embedding.
    assert KEEP_ALIVE == -1, "mặc định phải là giữ model thường trú"
    assert isinstance(KEEP_ALIVE, int), "keep_alive dạng chuỗi bị Ollama từ chối"


def test_keep_alive_dang_khoang_thoi_gian_van_giu_nguyen_chuoi():
    from providers.runtime import _parse_keep_alive

    assert _parse_keep_alive("30m") == "30m"
    assert _parse_keep_alive(" -1 ") == -1
    assert _parse_keep_alive("0") == 0


# ===== Công tắc bật/tắt cho công cụ ngoài =====


def test_day_model_ra_khoi_vram(monkeypatch):
    calls = _fake_ollama(monkeypatch, ["qwen3.5:4b", "nomic-embed-text:latest"])
    unloaded = keep_warm.unload_all()
    assert set(unloaded) == {"qwen3.5:4b", "nomic-embed-text:latest"}
    assert all(body["keep_alive"] == 0 for _, body in calls), "phải trả VRAM ngay"


def test_khong_day_model_von_da_khong_o_trong_vram(monkeypatch):
    calls = _fake_ollama(monkeypatch, [])
    assert keep_warm.unload_all() == []
    assert calls == []


def test_tam_dung_thi_vong_canh_khong_nap_lai(monkeypatch):
    """Lỗi nguy hiểm nhất: bấm nguội xong 120 giây sau model tự nóng lại."""
    calls = _fake_ollama(monkeypatch, [])
    keep_warm.pause()
    keep_warm._loop_tick_for_test(120)
    assert calls == [], "đang tạm dừng thì không được nạp"
    keep_warm.resume()
    keep_warm._loop_tick_for_test(120)
    assert [path for path, _ in calls] == ["/api/generate", "/api/embed"]


def test_trang_thai_bao_dung_khi_ollama_tat(monkeypatch):
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

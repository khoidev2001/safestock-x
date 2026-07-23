"""Test transcribe.py — mock pipeline PhoWhisper, KHÔNG tải model thật.

Kiểm tra: decode WAV (mono/stereo), resample về 16kHz, base64 hỏng → ValueError,
audio rỗng → "", và luồng gọi pipe trả text đã strip.
"""
import base64
import io
import sys
from pathlib import Path

import numpy as np
import pytest
import soundfile as sf

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import transcribe  # noqa: E402


def _wav_base64(samples: np.ndarray, sr: int, channels: int = 1) -> str:
    """Tạo WAV in-memory → base64 (giả lập frontend gửi lên)."""
    if channels == 2:
        samples = np.stack([samples, samples], axis=1)
    buf = io.BytesIO()
    sf.write(buf, samples, sr, format="WAV", subtype="PCM_16")
    return base64.b64encode(buf.getvalue()).decode("ascii")


@pytest.fixture
def fake_pipe(monkeypatch):
    """Thay _load_pipeline bằng pipe giả — ghi lại audio nhận được để kiểm tra."""
    captured = {}

    def _pipe(payload):
        captured["array"] = payload["array"]
        captured["sr"] = payload["sampling_rate"]
        return {"text": "  lũ quét xã đồng xuân  "}

    monkeypatch.setattr(transcribe, "_load_pipeline", lambda: _pipe)
    return captured


def test_transcribe_strips_text(fake_pipe):
    tone = (0.2 * np.sin(np.linspace(0, 100, 16_000))).astype("float32")
    text = transcribe.transcribe_base64(_wav_base64(tone, 16_000))
    assert text == "lũ quét xã đồng xuân"  # đã strip khoảng trắng


def test_resamples_to_16k(fake_pipe):
    # Đầu vào 44.1kHz, 1 giây → sau resample phải ~16000 mẫu, sr = 16000.
    tone = (0.2 * np.sin(np.linspace(0, 200, 44_100))).astype("float32")
    transcribe.transcribe_base64(_wav_base64(tone, 44_100))
    assert fake_pipe["sr"] == 16_000
    assert abs(fake_pipe["array"].shape[0] - 16_000) <= 2


def test_stereo_downmixed_to_mono(fake_pipe):
    tone = (0.2 * np.sin(np.linspace(0, 100, 16_000))).astype("float32")
    transcribe.transcribe_base64(_wav_base64(tone, 16_000, channels=2))
    assert fake_pipe["array"].ndim == 1  # đã gộp về mono


def test_invalid_base64_raises_value_error(fake_pipe):
    with pytest.raises(ValueError):
        transcribe.transcribe_base64("@@@not-base64@@@")


def test_empty_audio_returns_empty_without_calling_pipe(monkeypatch):
    # Pipe rỗng phải KHÔNG được gọi khi audio 0 mẫu (tránh nạp model vô ích).
    def _boom():
        raise AssertionError("không được nạp pipeline cho audio rỗng")

    monkeypatch.setattr(transcribe, "_load_pipeline", _boom)
    empty = np.zeros(0, dtype="float32")
    assert transcribe.transcribe_base64(_wav_base64(empty, 16_000)) == ""

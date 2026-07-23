"""Nhận dạng giọng nói tiếng Việt bằng PhoWhisper (VinAI) — chạy LOCAL, offline.

Nguyên tắc:
- LAZY-LOAD: chỉ nạp model ở lần gọi ĐẦU. Thiếu torch/transformers/model → raise lỗi
  có kiểm soát, KHÔNG làm sập các endpoint LLM khác của service.
- Offline sau khi đã tải model 1 lần (cache HuggingFace). Không gọi mạng khi suy luận.
- Chỉ nhận dạng → trả text. Người dùng xem lại & sửa trước khi parse (con người là trọng tài).
"""
import base64
import io
import os
import threading

# Cho phép đổi cỡ model qua env (small/medium/large). Mặc định medium — cân bằng cho giọng Việt.
_MODEL_ID = os.getenv("PHOWHISPER_MODEL", "vinai/PhoWhisper-medium")
_TARGET_SR = 16_000  # PhoWhisper/Whisper yêu cầu 16kHz mono.

_pipe = None
_load_lock = threading.Lock()
_load_error: str | None = None


def _load_pipeline():
    """Nạp pipeline ASR 1 lần (thread-safe). Trả (pipe, device_str)."""
    global _pipe, _load_error
    if _pipe is not None:
        return _pipe
    with _load_lock:
        if _pipe is not None:
            return _pipe
        try:
            import torch  # nặng — chỉ import khi thật sự dùng
            from transformers import pipeline

            device = 0 if torch.cuda.is_available() else -1
            _pipe = pipeline(
                "automatic-speech-recognition",
                model=_MODEL_ID,
                device=device,
                torch_dtype=torch.float16 if device == 0 else torch.float32,
            )
            return _pipe
        except Exception as exc:  # noqa: BLE001 — báo lỗi rõ, không để service sập
            _load_error = f"{type(exc).__name__}: {exc}"
            raise RuntimeError(
                f"Không nạp được PhoWhisper ({_MODEL_ID}). "
                f"Kiểm tra torch/transformers/soundfile đã cài và model đã tải chưa. Chi tiết: {_load_error}"
            ) from exc


def _decode_wav(audio_bytes: bytes):
    """Giải mã WAV/PCM → mảng float32 mono 16kHz. Dùng soundfile (không cần ffmpeg)."""
    import numpy as np
    import soundfile as sf

    data, sr = sf.read(io.BytesIO(audio_bytes), dtype="float32", always_2d=True)
    # Gộp về mono nếu nhiều kênh.
    mono = data.mean(axis=1) if data.shape[1] > 1 else data[:, 0]
    # Resample tuyến tính về 16kHz nếu cần (clip ngắn, không cần chất lượng cao).
    if sr != _TARGET_SR and mono.size > 0:
        duration = mono.shape[0] / sr
        target_len = max(1, int(round(duration * _TARGET_SR)))
        xp = np.linspace(0.0, 1.0, num=mono.shape[0], endpoint=False)
        xq = np.linspace(0.0, 1.0, num=target_len, endpoint=False)
        mono = np.interp(xq, xp, mono).astype("float32")
    return mono


def transcribe_base64(audio_base64: str) -> str:
    """base64(WAV) → text tiếng Việt. Ném RuntimeError/ValueError nếu lỗi (endpoint đổi thành 503)."""
    try:
        audio_bytes = base64.b64decode(audio_base64, validate=True)
    except Exception as exc:  # noqa: BLE001
        raise ValueError(f"audioBase64 không hợp lệ: {exc}") from exc

    audio = _decode_wav(audio_bytes)
    if audio.size == 0:
        return ""

    pipe = _load_pipeline()
    result = pipe({"array": audio, "sampling_rate": _TARGET_SR})
    text = (result or {}).get("text", "") if isinstance(result, dict) else str(result)
    return text.strip()

"""Giữ model Ollama luôn nằm sẵn trong VRAM.

Model nguội không làm câu trả lời kém đi, nhưng làm nó KHÔNG KỊP ĐẾN: lần gọi đầu
sau khi rơi khỏi VRAM mất hơn 15 giây nạp lại, vượt thời gian chờ của backend, nên
trợ lý trả lỗi và bản tin rơi về bản mẫu. Nhìn từ ngoài thì đúng là hệ thống bỗng
dưng kém thông minh.

Hai lớp bảo vệ, vì mỗi lớp hụt một trường hợp khác nhau:

  1. keep_alive=-1 gửi trong từng request (providers/runtime.py) — model đã nạp thì
     không bao giờ tự rời VRAM vì để lâu không dùng.

  2. Vòng canh trong file này — lớp 1 vô nghĩa nếu chính Ollama khởi động lại (cập
     nhật, mất điện, bật lại máy): VRAM trống trở lại và không ai đánh thức cho tới
     khi có người hỏi câu đầu tiên, đúng lúc đang trình diễn.

Vòng canh hỏi /api/ps chứ không gọi sinh văn bản, nên lúc bình thường gần như không
tốn gì; chỉ khi thấy model vắng mặt mới nạp lại.
"""
import os
import threading
import time

import httpx

_DEFAULT_INTERVAL_SECONDS = 120
_PROBE_TIMEOUT = 10.0
_LOAD_TIMEOUT = 600.0

# Công tắc tạm dừng. Đẩy model ra khỏi VRAM mà không tắt vòng canh thì 120 giây sau
# nó nạp lại — người bấm "nguội ngay" sẽ tưởng lệnh không ăn.
_paused = threading.Event()


def pause() -> None:
    _paused.set()


def resume() -> None:
    _paused.clear()


def is_paused() -> bool:
    return _paused.is_set()


def _enabled() -> bool:
    return os.getenv("OLLAMA_KEEP_WARM", "true").strip().lower() not in {"false", "0", "no"}


def _interval_seconds() -> int:
    try:
        value = int(os.getenv("OLLAMA_KEEP_WARM_INTERVAL_SECONDS", str(_DEFAULT_INTERVAL_SECONDS)))
    except ValueError:
        return _DEFAULT_INTERVAL_SECONDS
    return max(30, value)


def _base_url() -> str:
    return os.getenv("OLLAMA_URL", "http://localhost:11434").rstrip("/")


def _normalize(name: str) -> str:
    return name if ":" in name else f"{name}:latest"


def loaded_models(base_url: str) -> set[str]:
    """Tên model Ollama đang giữ trong bộ nhớ. Rỗng nếu chưa hỏi được."""
    with httpx.Client(timeout=_PROBE_TIMEOUT) as client:
        response = client.get(f"{base_url}/api/ps")
        response.raise_for_status()
        models = response.json().get("models") or []
    return {_normalize(str(item.get("name") or item.get("model") or "")) for item in models}


def _load_chat_model(base_url: str, model: str) -> None:
    # num_predict=0 chỉ nạp trọng số vào VRAM, không sinh chữ nào.
    with httpx.Client(timeout=_LOAD_TIMEOUT) as client:
        client.post(
            f"{base_url}/api/generate",
            json={"model": model, "keep_alive": -1, "options": {"num_predict": 0}},
        ).raise_for_status()


def _load_embedding_model(base_url: str, model: str) -> None:
    with httpx.Client(timeout=_LOAD_TIMEOUT) as client:
        client.post(
            f"{base_url}/api/embed",
            json={"model": model, "input": "khoi dong", "keep_alive": -1},
        ).raise_for_status()


def _wanted_models() -> dict:
    return {
        _normalize(os.getenv("OLLAMA_MODEL", "qwen3.5:4b")): _load_chat_model,
        _normalize(os.getenv("OLLAMA_EMBED_MODEL", "nomic-embed-text")): _load_embedding_model,
    }


def warm_once() -> list[str]:
    """Nạp model nào đang vắng mặt. Trả tên những model vừa phải nạp lại."""
    base_url = _base_url()
    present = loaded_models(base_url)
    reloaded: list[str] = []
    for model, load in _wanted_models().items():
        if model in present:
            continue
        load(base_url, model)
        reloaded.append(model)
    return reloaded


def unload_all() -> list[str]:
    """Đẩy model ra khỏi VRAM ngay. Trả tên những model vừa đẩy."""
    base_url = _base_url()
    present = loaded_models(base_url)
    unloaded: list[str] = []
    with httpx.Client(timeout=_PROBE_TIMEOUT) as client:
        for model in _wanted_models():
            if model not in present:
                continue
            # keep_alive=0 nghĩa là trả VRAM ngay sau lệnh này.
            client.post(
                f"{base_url}/api/generate",
                json={"model": model, "keep_alive": 0, "options": {"num_predict": 0}},
            )
            unloaded.append(model)
    return unloaded


def status() -> dict:
    """Trạng thái cho công cụ điều khiển ngoài."""
    try:
        present = sorted(loaded_models(_base_url()))
        reachable = True
    except Exception:  # noqa: BLE001 — Ollama tắt thì báo chưa tới được, không ném.
        present, reachable = [], False
    return {
        "keepWarmPaused": is_paused(),
        "ollamaReachable": reachable,
        "loadedModels": present,
        "wantedModels": sorted(_wanted_models()),
    }


# Service Windows chạy stdout mã cp1252, chữ có dấu ném UnicodeEncodeError và làm
# sập luôn lúc khởi động. Log của vòng canh giữ ASCII để không bao giờ kéo đổ service.
def _log(message: str) -> None:
    try:
        print(f"[keep-warm] {message}", flush=True)
    except Exception:  # noqa: BLE001 — log hỏng không được phép làm chết service
        pass


def _tick(interval: int) -> None:
    """Một nhịp canh. Tách khỏi vòng lặp để test được mà không phải chờ thật."""
    if _paused.is_set():
        return
    try:
        reloaded = warm_once()
        if reloaded:
            _log(f"reloaded into VRAM: {', '.join(reloaded)}")
    except Exception as error:  # Ollama tắt/đang khởi động — thử lại lượt sau.
        _log(f"load failed ({error}); retry in {interval}s")


# Tên rõ ràng cho test, để không ai tưởng _tick là API công khai.
_loop_tick_for_test = _tick


def _loop(interval: int) -> None:
    while True:
        _tick(interval)
        time.sleep(interval)


def start() -> threading.Thread | None:
    """Chạy vòng canh nền. Trả None nếu bị tắt qua OLLAMA_KEEP_WARM=false."""
    if not _enabled():
        _log("disabled via OLLAMA_KEEP_WARM")
        return None
    interval = _interval_seconds()
    thread = threading.Thread(target=_loop, args=(interval,), name="ollama-keep-warm", daemon=True)
    thread.start()
    _log(f"watching every {interval}s, keeping models resident in VRAM")
    return thread

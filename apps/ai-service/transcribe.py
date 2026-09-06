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
import time


def _log(message: str) -> None:
    """Ghi một dòng vào log của service.

    KHÔNG dùng `logging.getLogger(...).info(...)`: dưới uvicorn, logger của module
    không được cấu hình nên mức INFO bị nuốt sạch — đã kiểm lại toàn bộ file log
    lịch sử, không có một dòng nào lọt ra. Bao nhiêu câu lệnh chẩn đoán viết theo
    kiểu đó đều vô hình đúng lúc cần nhất.

    Giữ ASCII: service chạy dưới SYSTEM với stdout mã cp1252, một dòng tiếng Việt
    có dấu là ném UnicodeEncodeError và kéo đổ luôn service.
    """
    try:
        print(f"[transcribe] {message}", flush=True)
    except Exception:  # noqa: BLE001 — log hỏng không được phép làm chết service
        pass

# Cỡ model đổi được qua env (small/medium/large).
#
# Mặc định là SMALL vì lý do bộ nhớ, không phải vì tốc độ thuần tuý. Máy demo có
# RTX 2060 6 GB, mà Ollama đã giữ ~4 GB thường trú cho qwen3.5. Bản medium chiếm
# thêm 1.5 GB, chỉ chừa lại chưa tới 500 MB — và ở mức đó CUDA bắt đầu giành giật:
# đo trên chính máy này, CÙNG một clip 14.5 giây chạy lúc 6.7 giây, lúc 59.8 giây.
# Bản small chiếm 478 MB, còn dư ~1.9 GB, và thời gian ổn định lại: 4.7–5.1 giây.
#
#   medium: 6.7 – 59.8 s  (thất thường, có lúc quá hạn chờ của backend)
#   small:   4.7 –  5.1 s  (ổn định)
#
# Muốn đổi lại thì sửa PHOWHISPER_MODEL trong .env — cả hai bản đã nằm sẵn trong
# cache HuggingFace nên không phải tải lại.
_MODEL_ID = os.getenv("PHOWHISPER_MODEL", "vinai/PhoWhisper-small")
_TARGET_SR = 16_000  # PhoWhisper/Whisper yêu cầu 16kHz mono.

_pipe = None
_load_lock = threading.Lock()
_gpu_lock = threading.Lock()
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
            import inspect

            import torch  # nặng — chỉ import khi thật sự dùng
            from transformers import pipeline

            device = 0 if torch.cuda.is_available() else -1
            dtype = torch.float16 if device == 0 else torch.float32
            # transformers 5.x đổi kwarg torch_dtype → dtype; 4.x vẫn dùng torch_dtype.
            # Dò chữ ký để chạy đúng trên cả hai (tránh dtype lọt vào **kwargs bị bỏ qua).
            dtype_kw = "dtype" if "dtype" in inspect.signature(pipeline).parameters else "torch_dtype"
            _pipe = pipeline(
                "automatic-speech-recognition",
                model=_MODEL_ID,
                device=device,
                **{dtype_kw: dtype},
            )
            return _pipe
        except Exception as exc:  # noqa: BLE001 — báo lỗi rõ, không để service sập
            _load_error = f"{type(exc).__name__}: {exc}"
            raise RuntimeError(
                f"Không nạp được PhoWhisper ({_MODEL_ID}). "
                f"Kiểm tra torch/transformers/soundfile đã cài và model đã tải chưa. Chi tiết: {_load_error}"
            ) from exc


def _acquire_gpu(pipe) -> None:
    """Đẩy trọng số lên card ngay trước khi nhận dạng."""
    _move_pipeline(pipe, "cuda:0")


def _release_gpu(pipe) -> None:
    """Đưa trọng số về RAM và trả sạch chỗ trên card."""
    _move_pipeline(pipe, "cpu")
    try:
        import torch

        if torch.cuda.is_available():
            torch.cuda.empty_cache()
    except Exception:  # noqa: BLE001 — trả chỗ không được thì vẫn phải chạy tiếp
        pass


def _move_pipeline(pipe, destination: str) -> None:
    """Chuyển pipeline sang một chỗ chứa khác (card hoặc RAM).

    VÌ SAO PHẢI TRẢ CARD SAU MỖI LƯỢT — đây là bài học đắt nhất trên máy demo:

    Card chỉ có 6 GB. Ollama giữ 3,4 GB thường trực. PhoWhisper giữ thêm ~0,95 GB
    nữa là vượt ngưỡng, và Windows bắt đầu tráo bộ nhớ GPU ra RAM. Lúc đó KHÔNG có
    gì báo lỗi cả — mọi thứ vẫn chạy, chỉ là chậm đi một bậc. Đo trên chính máy này:

        PhoWhisper nằm lì trên card : đọc đề  65 chữ/s, viết  15 chữ/s → ~24 s một câu
        PhoWhisper trả card về RAM  : đọc đề 241 chữ/s, viết  50 chữ/s → ~1,7 s một câu

    Mười bốn lần. Không phải do mã trợ lý, không phải do mô hình, chỉ là hai thứ
    giành nhau chỗ trên một cái card.

    Trọng số vẫn nằm trong RAM chứ không bị xoá, nên lượt sau chỉ tốn một lần chép
    RAM → card, không phải đọc lại 2,9 GB từ đĩa. Nhận dạng giọng nói và trả lời
    bằng chữ không bao giờ chạy cùng lúc — người ta nói xong rồi mới đọc — nên giữ
    cả hai thường trực là trả giá cho một thứ không ai dùng tới.
    """
    try:
        import torch

        if not torch.cuda.is_available():
            return
        pipe.model.to(destination)
        # `pipe.device` quyết định nơi transformers đặt dữ liệu vào; quên dòng này
        # thì dữ liệu ở một chỗ, trọng số ở chỗ khác, và nó ném lỗi lệch thiết bị.
        pipe.device = torch.device(destination)
    except Exception as exc:  # noqa: BLE001
        _log(f"Khong doi cho duoc sang {destination}: {type(exc).__name__}: {exc}")


def warm_up() -> float:
    """Nạp model và chạy một lượt giải mã nháp. Trả số giây đã tốn.

    Lần nhận dạng ĐẦU TIÊN sau mỗi lần khởi động lại service đắt hơn hẳn các lần
    sau: phải đọc 2.9 GB trọng số từ đĩa, đẩy lên VRAM, rồi biên dịch nhân CUDA ở
    lượt giải mã đầu. Đo trên chính máy này: **124 giây** khi Ollama đang giữ 4 GB
    VRAM (chỉ 7 giây nếu GPU trống), so với 5 giây cho các lượt sau.

    124 giây thì backend đã hết thời gian chờ, người dùng thấy "Nhận dạng giọng nói
    chưa sẵn sàng" và tưởng tính năng hỏng — trong khi nó chỉ đang nạp. Trả giá đó
    lúc service khởi động, không bắt người bấm micro đầu tiên trả.

    Chạy ở luồng nền: model chưa nóng thì các endpoint khác vẫn phục vụ bình thường.
    """
    started = time.perf_counter()
    import numpy as np

    pipe = _load_pipeline()
    # Một giây tiếng ồn rất nhỏ: đủ để chạy hết đường giải mã (encoder → decoder →
    # tokenizer) mà không cần file mẫu nào trong repo. Nội dung trả về vứt đi.
    dummy_audio = (np.random.default_rng(0).standard_normal(_TARGET_SR) * 0.01).astype("float32")
    _run_pipeline(pipe, dummy_audio)
    elapsed = time.perf_counter() - started
    _log(f"PhoWhisper ({_MODEL_ID}) da nong sau {elapsed:.1f}s")
    return elapsed


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


# Ngưỡng biên độ trung bình dưới mức này coi như không có tiếng nói. Đặt thấp để
# vẫn nhận giọng nói nhỏ trong kho ồn, chỉ loại đúng phần im lặng thật.
# Hạ thấp có chủ đích: micro máy ảo và micro điện thoại rẻ tiền thu rất nhỏ, đặt
# cao là chặn nhầm giọng nói thật rồi báo "chưa nghe rõ" trong khi người ta có nói.
_SILENCE_RMS = 0.0015


def measure_rms(audio) -> float:
    """Biên độ trung bình bình phương của đoạn ghi (0…1)."""
    import numpy as np

    return float(np.sqrt(np.mean(np.square(audio, dtype="float64"))))


def _is_silent(audio) -> bool:
    """Đoạn ghi có tiếng nói không, đo bằng năng lượng trung bình bình phương."""
    return measure_rms(audio) < _SILENCE_RMS


def transcribe_base64(audio_base64: str) -> str:
    """base64(WAV) → text tiếng Việt. Ném RuntimeError/ValueError nếu lỗi (endpoint đổi thành 503)."""
    try:
        audio_bytes = base64.b64decode(audio_base64, validate=True)
    except Exception as exc:  # noqa: BLE001
        raise ValueError(f"audioBase64 không hợp lệ: {exc}") from exc

    audio = _decode_wav(audio_bytes)
    if audio.size == 0:
        _log("Doan ghi rong (0 mau)")
        return ""
    # Ghi lại độ dài và độ to để dò được khi người dùng báo "chưa nghe rõ": phân
    # biệt được micro không thu (rms ~ 0) với mô hình không nhận ra (rms bình thường).
    _log(
        f"Nhan dang: {audio.size / _TARGET_SR:.1f}s, "
        f"rms={measure_rms(audio):.5f}, nguong={_SILENCE_RMS:.5f}"
    )
    if _is_silent(audio):
        # Whisper BỊA khi không có tiếng nói: đưa vào hai giây im lặng, nó trả về
        # một câu hoàn chỉnh nghe xuôi tai nhưng không ai nói cả. Người dùng bấm
        # nhầm nút ghi âm rồi thả ra sẽ thấy một câu lạ hoắc trong ô mô tả.
        # Chặn ở đây rẻ hơn và chắc hơn là mong mô hình tự im.
        return ""

    pipe = _load_pipeline()
    started = time.perf_counter()
    result = _run_pipeline(pipe, audio)
    text = (result or {}).get("text", "") if isinstance(result, dict) else str(result)
    # Ghi thời gian nhận dạng riêng, tách khỏi thời gian nạp model: người dùng kêu
    # chậm thì nhìn số này là biết ngay chậm ở bước nào.
    elapsed_seconds = time.perf_counter() - started
    _log(f"Nhan dang xong sau {elapsed_seconds:.2f}s (x{elapsed_seconds / max(audio.size / _TARGET_SR, 0.001):.2f} thoi luong)")
    return text.strip()


def _run_pipeline(pipe, audio):
    """Chạy nhận dạng với tham số đã ép đúng cho tiếng Việt.

    Hai thứ bắt buộc, thiếu là sai hoàn toàn chứ không phải sai chút ít:

    1. `language="vi"` + `task="transcribe"`. PhoWhisper là bản tinh chỉnh của
       Whisper; không ép thì bộ giải mã TỰ ĐOÁN ngôn ngữ từ vài giây đầu. Đoán
       nhầm là nó dịch hoặc bịa ra một câu tiếng khác nghe xuôi tai — đúng hiện
       tượng "nhận diện sai hoàn toàn".

    2. `chunk_length_s=30`. Whisper chỉ nhìn cửa sổ 30 giây. Không khai báo thì
       clip dài hơn bị CẮT ÂM THẦM, phần sau mất sạch mà không báo gì. Người báo
       cáo hiện trường nói một phút là mất hai phần ba.

    `stride_length_s` cho các khối chồng lấn nhau, tránh nuốt từ ở chỗ nối.

    3. `max_new_tokens` chặn theo độ dài tiếng. Whisper có tật lặp: gặp đoạn khó
       nghe là nó lặp lại một cụm cho tới khi cạn 448 token của cả cửa sổ. Một clip
       ba giây có thể tốn thời gian như clip ba mươi giây, mà kết quả là rác. Chặn
       theo độ dài thật vừa cắt được trường hợp xấu nhất, vừa không đụng gì tới clip
       bình thường — tiếng Việt nói nhanh cũng chỉ khoảng 7 token mỗi giây.

    Bọc trong try để không phụ thuộc chữ ký của một phiên bản transformers cụ thể:
    tham số bị từ chối thì vẫn nhận dạng được, chỉ kém chính xác hơn. Mỗi lần gọi
    phải dựng payload MỚI: pipeline lấy dữ liệu ra bằng `pop`, nên dict đã dùng một
    lần là rỗng — dùng lại sẽ ném ValueError khó hiểu về khoá "raw".
    """
    generate_kwargs = {
        "language": "vi",
        "task": "transcribe",
        "max_new_tokens": _token_limit(audio),
    }
    # Khoá để hai lượt nhận dạng cùng lúc không đổi chỗ trọng số ngay dưới chân
    # nhau: lượt này trả card về RAM trong khi lượt kia đang chạy trên card là lỗi
    # lệch thiết bị giữa chừng, rất khó lần ra.
    with _gpu_lock:
        _acquire_gpu(pipe)
        try:
            try:
                return pipe(
                    {"array": audio, "sampling_rate": _TARGET_SR},
                    chunk_length_s=30,
                    stride_length_s=(5, 5),
                    generate_kwargs=generate_kwargs,
                )
            except (TypeError, ValueError):
                return pipe({"array": audio, "sampling_rate": _TARGET_SR})
        finally:
            # Nhận dạng hỏng cũng phải trả card. Giữ lại là để nguyên cái bẫy đã
            # làm trợ lý chậm mười bốn lần, chỉ khác là lần này không ai ngờ tới.
            _release_gpu(pipe)


# Whisper giải mã tối đa 448 token cho mỗi cửa sổ 30 giây; chừa lại ít chỗ cho các
# token điều khiển ở đầu chuỗi.
_MAX_NEW_TOKENS = 440
_TOKENS_PER_SECOND = 12  # gấp đôi tốc độ nói nhanh nhất, chỉ cắt đúng phần lặp vô hạn


def _token_limit(audio) -> int:
    """Số token tối đa cho một cửa sổ giải mã, suy từ độ dài đoạn ghi."""
    # Clip dài hơn 30 giây bị cắt thành nhiều khối, mỗi khối tự giải mã riêng, nên
    # hạn mức tính theo khối chứ không theo tổng.
    seconds = min(audio.size / _TARGET_SR, 30.0)
    return max(32, min(_MAX_NEW_TOKENS, int(seconds * _TOKENS_PER_SECOND) + 24))

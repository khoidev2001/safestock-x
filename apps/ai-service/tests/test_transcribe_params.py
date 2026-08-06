"""Tham số nhận dạng phải ép đúng tiếng Việt và khai độ dài cửa sổ.

Thiếu `language="vi"` thì Whisper tự đoán ngôn ngữ từ vài giây đầu; đoán nhầm là
nó dịch hoặc bịa ra một câu tiếng khác nghe xuôi tai — đúng hiện tượng "nhận diện
sai hoàn toàn" đã gặp trên máy demo.

Thiếu `chunk_length_s` thì clip dài hơn 30 giây bị cắt âm thầm, phần sau mất sạch
mà không báo gì.
"""

import numpy as np

from transcribe import _run_pipeline


class FakePipeline:
    """Ghi lại tham số được truyền vào để kiểm, trả kết quả cố định."""

    def __init__(self, reject_kwargs=False):
        self.reject_kwargs = reject_kwargs
        self.calls = []

    def __call__(self, payload, **kwargs):
        self.calls.append(kwargs)
        if self.reject_kwargs and kwargs:
            raise TypeError("phien ban transformers nay khong nhan tham so do")
        return {"text": "nước lũ đang lên ở thôn Long Châu"}


AUDIO = np.zeros(16_000, dtype="float32")


def test_ep_tieng_viet_va_khai_cua_so():
    pipe = FakePipeline()

    _run_pipeline(pipe, AUDIO)

    kwargs = pipe.calls[0]
    assert kwargs["generate_kwargs"]["language"] == "vi"
    assert kwargs["generate_kwargs"]["task"] == "transcribe"
    assert kwargs["chunk_length_s"] == 30


def test_khoi_chong_lan_de_khong_nuot_tu_o_cho_noi():
    pipe = FakePipeline()

    _run_pipeline(pipe, AUDIO)

    assert pipe.calls[0]["stride_length_s"] == (5, 5)


def test_phien_ban_khong_nhan_tham_so_thi_van_nhan_dang_duoc():
    # Không phụ thuộc chữ ký của một phiên bản transformers cụ thể: bị từ chối thì
    # lùi về gọi trần, kém chính xác hơn nhưng vẫn ra chữ.
    pipe = FakePipeline(reject_kwargs=True)

    result = _run_pipeline(pipe, AUDIO)

    assert result["text"] == "nước lũ đang lên ở thôn Long Châu"
    assert pipe.calls[-1] == {}


def test_chan_im_lang_de_mo_hinh_khong_bia():
    # Whisper trả về một câu hoàn chỉnh khi đưa vào im lặng — người bấm nhầm nút
    # ghi âm sẽ thấy câu lạ hoắc trong ô mô tả. Đã gặp thật trên máy demo.
    from transcribe import _is_silent

    assert _is_silent(np.zeros(16_000, dtype="float32")) is True
    # Nhiễu nền cực nhỏ vẫn coi là im lặng.
    assert _is_silent((np.random.randn(16_000) * 0.0005).astype("float32")) is True


def test_giong_noi_binh_thuong_khong_bi_chan_nham():
    from transcribe import _is_silent

    assert _is_silent((np.random.randn(16_000) * 0.08).astype("float32")) is False


def test_giong_noi_NHO_van_qua_duoc_chot():
    # Micro máy ảo và micro điện thoại rẻ thu rất nhỏ. Chặn nhầm ở đây thì người
    # dùng nhận "chưa nghe rõ nội dung" trong khi họ có nói thật.
    from transcribe import _is_silent

    assert _is_silent((np.random.randn(16_000) * 0.01).astype("float32")) is False


def test_chan_so_token_theo_do_dai_de_cat_vong_lap():
    # Whisper gặp đoạn khó nghe là lặp một cụm cho tới khi cạn 448 token của cả
    # cửa sổ — clip ba giây tốn thời gian như clip ba mươi giây, kết quả là rác.
    from transcribe import _gioi_han_token

    ngan = _gioi_han_token(np.zeros(16_000 * 3, dtype="float32"))
    dai = _gioi_han_token(np.zeros(16_000 * 25, dtype="float32"))

    assert ngan < dai < 448


def test_han_muc_tinh_theo_KHOI_chu_khong_theo_tong():
    # Clip dài hơn 30 giây bị cắt thành nhiều khối, mỗi khối giải mã riêng. Tính
    # theo tổng là hạn mức vô nghĩa với khối, và vượt luôn giới hạn 448 của Whisper.
    from transcribe import _gioi_han_token

    assert _gioi_han_token(np.zeros(16_000 * 300, dtype="float32")) <= 440


def test_han_muc_du_rong_cho_giong_noi_that():
    # Tiếng Việt nói nhanh khoảng 7 token mỗi giây. Hạn mức phải rộng hơn hẳn,
    # nếu không sẽ cắt cụt câu của người nói bình thường.
    from transcribe import _gioi_han_token

    assert _gioi_han_token(np.zeros(16_000 * 10, dtype="float32")) >= 10 * 7


def test_moi_luot_goi_dung_payload_moi():
    # Pipeline lấy dữ liệu ra bằng `pop`, dict đã dùng một lần là rỗng. Dùng lại
    # sẽ ném ValueError khó hiểu về khoá "raw" ở đúng đường dự phòng.
    class PipeLayPayload:
        def __init__(self):
            self.khoa_luc_goi = []

        def __call__(self, payload, **kwargs):
            # Chụp lại khoá TẠI LÚC GỌI, vì ngay sau đây payload sẽ bị vét rỗng.
            self.khoa_luc_goi.append(set(payload))
            payload.pop("array", None)
            payload.pop("sampling_rate", None)
            if kwargs:
                raise ValueError("khong nhan tham so")
            return {"text": "ok"}

    pipe = PipeLayPayload()

    assert _run_pipeline(pipe, AUDIO)["text"] == "ok"
    assert pipe.khoa_luc_goi[1] == {"array", "sampling_rate"}

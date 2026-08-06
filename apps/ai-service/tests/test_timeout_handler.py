"""Quá hạn chờ mô hình phải ra 503 kèm câu nói rõ nguyên nhân, không phải 500 trống.

Ollama sinh văn bản mỗi lần một yêu cầu trên một GPU. Bấm "Phân tích bằng AI" đúng
lúc trang theo dõi đang gọi việc nền là xếp hàng phía sau, và có thể chờ quá hạn.
Trả 500 thì backend dịch thành "AI service không xử lý được yêu cầu" — câu đẩy
người dùng đi khởi động lại dịch vụ, trong khi dịch vụ vẫn chạy tốt.
"""
import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import main


def _app_gia(loi: Exception) -> TestClient:
    app = FastAPI()
    for exc_type, handler in main.app.exception_handlers.items():
        app.add_exception_handler(exc_type, handler)

    @app.post("/thu")
    def thu():  # noqa: ANN202
        raise loi

    return TestClient(app, raise_server_exceptions=False)


@pytest.mark.parametrize(
    "loi",
    [
        httpx.ReadTimeout("timed out"),
        httpx.ConnectTimeout("timed out"),
        httpx.PoolTimeout("timed out"),
    ],
)
def test_moi_kieu_qua_han_deu_ra_503(loi):
    ra = _app_gia(loi).post("/thu")

    assert ra.status_code == 503


def test_cau_bao_loi_noi_ro_phai_lam_gi():
    ra = _app_gia(httpx.ReadTimeout("timed out")).post("/thu")
    chu = ra.json()["detail"]

    assert "bận" in chu
    # Phải nói việc cần làm, và nói rõ KHÔNG cần khởi động lại — đó là phản xạ sai
    # mà câu báo lỗi cũ gây ra.
    assert "thử lại" in chu.lower() or "bấm lại" in chu.lower()
    assert "khởi động lại" in chu


def test_bo_bat_da_duoc_dang_ky_o_app_that():
    assert httpx.TimeoutException in main.app.exception_handlers

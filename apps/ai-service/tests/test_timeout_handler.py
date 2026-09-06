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


def _fake_app(error: Exception) -> TestClient:
    app = FastAPI()
    for exc_type, handler in main.app.exception_handlers.items():
        app.add_exception_handler(exc_type, handler)

    @app.post("/probe")
    def probe():  # noqa: ANN202
        raise error

    return TestClient(app, raise_server_exceptions=False)


@pytest.mark.parametrize(
    "error",
    [
        httpx.ReadTimeout("timed out"),
        httpx.ConnectTimeout("timed out"),
        httpx.PoolTimeout("timed out"),
    ],
)
def test_every_timeout_kind_returns_503(error):
    response = _fake_app(error).post("/probe")

    assert response.status_code == 503


def test_error_message_says_what_to_do():
    response = _fake_app(httpx.ReadTimeout("timed out")).post("/probe")
    message = response.json()["detail"]

    assert "bận" in message
    # Phải nói việc cần làm, và nói rõ KHÔNG cần khởi động lại — đó là phản xạ sai
    # mà câu báo lỗi cũ gây ra.
    assert "thử lại" in message.lower() or "bấm lại" in message.lower()
    assert "khởi động lại" in message


def test_handler_is_registered_on_the_real_app():
    assert httpx.TimeoutException in main.app.exception_handlers

"""Adapter Ollama — local, 0đ, offline (production). Không cần key."""
import json
from typing import Any

import httpx

from .base import LLMProvider
from .runtime import KEEP_ALIVE

_TIMEOUT = 90.0  # model local chậm hơn cloud, CPU-only cần dư giờ


class OllamaProvider(LLMProvider):
    name = "ollama"

    def __init__(self, base_url: str = "http://localhost:11434", model: str = "qwen3.5:4b") -> None:
        self._base_url = base_url.rstrip("/")
        self._model = model

    def generate_json(
        self,
        system_prompt: str,
        user_prompt: str,
        json_schema: dict[str, Any] | None = None,
    ) -> str:
        return self._call(system_prompt, user_prompt, json_format=json_schema or "json")

    def generate_text(self, system_prompt: str, user_prompt: str) -> str:
        return self._call(system_prompt, user_prompt)

    def _call(
        self,
        system_prompt: str,
        user_prompt: str,
        json_format: str | dict[str, Any] | None = None,
    ) -> str:
        payload = {
            "model": self._model,
            "system": system_prompt,
            "prompt": user_prompt,
            "stream": False,
            "think": False,
            "keep_alive": KEEP_ALIVE,
            "options": {
                "temperature": 0.1,
                "num_predict": 2048 if json_format else 512,
            },
        }
        if json_format:
            payload["format"] = json_format
        with httpx.Client(timeout=_TIMEOUT) as client:
            response = client.post(f"{self._base_url}/api/generate", json=payload)
            response.raise_for_status()
            return response.json()["response"]

    def stream_text(self, system_prompt: str, user_prompt: str):
        """Sinh văn bản theo DÒNG, nhả từng mẩu chữ ngay khi mô hình trả ra.

        Ollama trả về mỗi mẩu một dòng JSON khi bật `stream`. Đọc từng dòng thay vì
        chờ trọn câu trả lời là khác biệt giữa "màn hình đứng im tám giây" và "chữ
        bắt đầu chạy sau nửa giây" — cùng một tổng thời gian, nhưng người dùng biết
        máy đang làm việc thay vì tưởng nó treo.

        Dòng hỏng thì BỎ QUA chứ không làm đứt cả luồng: mất một mẩu chữ còn hơn
        mất cả câu trả lời đang chạy dở.
        """
        payload = {
            "model": self._model,
            "system": system_prompt,
            "prompt": user_prompt,
            "stream": True,
            "think": False,
            "keep_alive": KEEP_ALIVE,
            "options": {"temperature": 0.1, "num_predict": 512},
        }
        with httpx.Client(timeout=_TIMEOUT) as client:
            with client.stream("POST", f"{self._base_url}/api/generate", json=payload) as response:
                response.raise_for_status()
                for line in response.iter_lines():
                    if not line:
                        continue
                    try:
                        mau = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    manh = mau.get("response")
                    if manh:
                        yield manh
                    if mau.get("done"):
                        return

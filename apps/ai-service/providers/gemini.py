"""Adapter Gemini (Google AI Studio, free tier). Default cho demo."""
import time
from typing import Any

import httpx

from .base import LLMProvider

_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models"
# Gemini free tier có thể chậm (~15-25s khi cold). Cache parse câu demo (D1b) cho tốc độ.
_TIMEOUT = 60.0
# Free tier đôi khi trả 503/429 tạm thời → thử lại vài lần với backoff.
_MAX_RETRIES = 3
_RETRY_STATUS = {429, 500, 503}


class GeminiProvider(LLMProvider):
    name = "gemini"

    def __init__(self, api_key: str, model: str = "gemini-flash-latest") -> None:
        if not api_key:
            raise ValueError("GEMINI_API_KEY chưa cấu hình")
        self._api_key = api_key
        self._model = model

    def generate_json(
        self,
        system_prompt: str,
        user_prompt: str,
        json_schema: dict[str, Any] | None = None,
    ) -> str:
        return self._call(system_prompt, user_prompt, json_mode=True)

    def generate_text(self, system_prompt: str, user_prompt: str) -> str:
        return self._call(system_prompt, user_prompt, json_mode=False)

    def _call(self, system_prompt: str, user_prompt: str, json_mode: bool) -> str:
        url = f"{_BASE_URL}/{self._model}:generateContent?key={self._api_key}"
        # KHÔNG dùng responseMimeType=application/json: Gemini flash đôi khi trả JSON
        # thiếu ngoặc đóng ở chế độ đó. Thay bằng yêu cầu JSON trong prompt + strip
        # fence ở tầng gọi — ổn định hơn.
        # 4096: Action Plan (4 mảng tiếng Việt + 3 giai đoạn) dễ vượt 2048 → JSON cắt cụt.
        generation_config = {"temperature": 0.2, "maxOutputTokens": 4096}
        combined_system = system_prompt
        if json_mode:
            combined_system += "\n\nChỉ in JSON hợp lệ, đầy đủ dấu ngoặc, không kèm giải thích."

        payload = {
            "systemInstruction": {"parts": [{"text": combined_system}]},
            "contents": [{"parts": [{"text": user_prompt}]}],
            "generationConfig": generation_config,
        }

        data = self._post_with_retry(url, payload)
        candidates = data.get("candidates", [])
        if not candidates:
            raise RuntimeError(f"Gemini không trả kết quả: {data.get('promptFeedback', data)}")
        return candidates[0]["content"]["parts"][0]["text"]

    def _post_with_retry(self, url: str, payload: dict) -> dict:
        """Gọi Gemini, thử lại khi gặp lỗi tạm thời (429/500/503) với backoff."""
        last_status = 0
        with httpx.Client(timeout=_TIMEOUT) as client:
            for attempt in range(_MAX_RETRIES):
                response = client.post(url, json=payload)
                if response.status_code in _RETRY_STATUS:
                    last_status = response.status_code
                    time.sleep(1.5 * (attempt + 1))
                    continue
                response.raise_for_status()
                return response.json()
        raise RuntimeError(f"Gemini quá tải (HTTP {last_status}) sau {_MAX_RETRIES} lần thử")

"""Adapter Ollama — local, 0đ, offline (production). Không cần key."""
import httpx

from .base import LLMProvider

_TIMEOUT = 60.0  # model local chậm hơn cloud


class OllamaProvider(LLMProvider):
    name = "ollama"

    def __init__(self, base_url: str = "http://localhost:11434", model: str = "qwen2.5") -> None:
        self._base_url = base_url.rstrip("/")
        self._model = model

    def generate_json(self, system_prompt: str, user_prompt: str) -> str:
        return self._call(system_prompt, user_prompt, json_mode=True)

    def generate_text(self, system_prompt: str, user_prompt: str) -> str:
        return self._call(system_prompt, user_prompt, json_mode=False)

    def _call(self, system_prompt: str, user_prompt: str, json_mode: bool) -> str:
        payload = {
            "model": self._model,
            "system": system_prompt,
            "prompt": user_prompt,
            "stream": False,
            "options": {"temperature": 0.2},
        }
        if json_mode:
            payload["format"] = "json"
        with httpx.Client(timeout=_TIMEOUT) as client:
            response = client.post(f"{self._base_url}/api/generate", json=payload)
            response.raise_for_status()
            return response.json()["response"]

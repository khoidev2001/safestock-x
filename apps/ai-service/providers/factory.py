"""Chọn provider theo env AI_PROVIDER (CODING-STANDARDS §23 — không rải điều kiện env)."""
import os

from .base import LLMProvider
from .gemini import GeminiProvider
from .ollama import OllamaProvider


def build_provider() -> LLMProvider:
    provider = os.getenv("AI_PROVIDER", "ollama").lower()

    if provider == "gemini":
        return GeminiProvider(
            api_key=os.getenv("GEMINI_API_KEY", ""),
            model=os.getenv("GEMINI_MODEL", "gemini-flash-latest"),
        )
    if provider == "ollama":
        return OllamaProvider(
            base_url=os.getenv("OLLAMA_URL", "http://localhost:11434"),
            model=os.getenv("OLLAMA_MODEL", "qwen3.5:4b"),
        )
    if provider == "claude":
        # Claude adapter thêm khi cần bản cao cấp — chưa dùng cho MVP.
        raise NotImplementedError("Claude provider chưa triển khai — dùng gemini/ollama")

    raise ValueError(f"AI_PROVIDER không hợp lệ: {provider}")

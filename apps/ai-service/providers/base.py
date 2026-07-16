"""Interface LLM chung — mọi provider (Gemini/Ollama/Claude) tuân theo.

Provider CHỈ làm NLP: sinh text / trả JSON có cấu trúc. KHÔNG tự tính toán
nghiệp vụ (backend + rule engine lo). AI output luôn xem là dữ liệu không đáng
tin cậy — validate schema ở tầng gọi (CODING-STANDARDS §14).
"""
from abc import ABC, abstractmethod


class LLMProvider(ABC):
    """Cổng gọi mô hình ngôn ngữ, đổi được qua env AI_PROVIDER."""

    name: str = "base"

    @abstractmethod
    def generate_json(self, system_prompt: str, user_prompt: str) -> str:
        """Sinh phản hồi kỳ vọng là JSON thuần (chuỗi). Tầng gọi tự parse + validate."""
        raise NotImplementedError

    @abstractmethod
    def generate_text(self, system_prompt: str, user_prompt: str) -> str:
        """Sinh văn bản tự do (vd giải thích tiếng Việt)."""
        raise NotImplementedError

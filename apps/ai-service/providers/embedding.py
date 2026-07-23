"""Interface embedding riêng — không buộc chat provider phải hỗ trợ vector.

Tách cổng này khỏi LLMProvider để có thể dùng Gemini sinh câu trả lời nhưng vẫn
truy hồi tri thức bằng Ollama local. B5/B7 cũng tái sử dụng cùng contract.
"""
from abc import ABC, abstractmethod
from typing import Literal

EmbeddingTask = Literal["document", "query"]


class EmbeddingProvider(ABC):
    """Cổng vector hóa văn bản, đổi được độc lập với AI_PROVIDER."""

    name: str = "base"
    model: str
    input_transform: str

    @abstractmethod
    def embed(
        self,
        texts: list[str],
        *,
        task: EmbeddingTask,
    ) -> list[list[float]]:
        """Vector hóa một batch; thứ tự output phải khớp thứ tự input."""
        raise NotImplementedError

    def model_digest(self) -> str | None:
        """SHA-256 artifact nếu provider hỗ trợ; None với provider không có fingerprint."""
        return None

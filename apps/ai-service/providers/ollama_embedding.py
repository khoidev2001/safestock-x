"""Embedding Ollama — local/offline, ưu tiên API batch hiện hành /api/embed.

nomic-embed-text cần prefix khác nhau cho tài liệu và câu hỏi để retrieval đúng
mục đích. Prefix là một phần fingerprint của index, không được đổi âm thầm.
"""
import math
import re

import httpx

from .embedding import EmbeddingProvider, EmbeddingTask

_TIMEOUT = 60.0
_INPUT_TRANSFORM = "nomic-search-prefix-v1"
_PREFIX = {
    "document": "search_document: ",
    "query": "search_query: ",
}
_LEGACY_STATUS = {404, 405}


class OllamaEmbeddingProvider(EmbeddingProvider):
    name = "ollama"
    input_transform = _INPUT_TRANSFORM

    def __init__(
        self,
        base_url: str = "http://localhost:11434",
        model: str = "nomic-embed-text",
        timeout: float = _TIMEOUT,
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self.model = model
        self._timeout = timeout
        self._transport = transport
        self._digest: str | None = None

    def model_digest(self) -> str | None:
        if self._digest is not None:
            return self._digest
        with httpx.Client(timeout=self._timeout, transport=self._transport) as client:
            response = client.get(f"{self._base_url}/api/tags")
            response.raise_for_status()
            models = response.json().get("models", [])
        requested = _normalize_model_name(self.model)
        for item in models:
            name = item.get("name") or item.get("model")
            digest = item.get("digest")
            if _normalize_model_name(str(name or "")) == requested and isinstance(digest, str):
                if not re.fullmatch(r"[0-9a-f]{64}", digest):
                    raise ValueError("Ollama trả model digest không hợp lệ")
                self._digest = digest
                return digest
        raise RuntimeError(f"Chưa cài model embedding Ollama: {self.model}")

    def embed(
        self,
        texts: list[str],
        *,
        task: EmbeddingTask,
    ) -> list[list[float]]:
        if not texts:
            return []
        if task not in _PREFIX:
            raise ValueError(f"Embedding task không hợp lệ: {task}")
        normalized = [self._prepare(text, task) for text in texts]

        with httpx.Client(timeout=self._timeout, transport=self._transport) as client:
            response = client.post(
                f"{self._base_url}/api/embed",
                json={
                    "model": self.model,
                    "input": normalized,
                    "truncate": False,
                    "keep_alive": "30m",
                },
            )
            if response.status_code in _LEGACY_STATUS:
                vectors = self._legacy_embed(client, normalized)
            else:
                response.raise_for_status()
                vectors = response.json().get("embeddings")

        return _validate_vectors(vectors, len(texts))

    def _legacy_embed(
        self,
        client: httpx.Client,
        texts: list[str],
    ) -> list[list[float]]:
        vectors: list[list[float]] = []
        for text in texts:
            response = client.post(
                f"{self._base_url}/api/embeddings",
                json={"model": self.model, "prompt": text, "keep_alive": "30m"},
            )
            response.raise_for_status()
            vectors.append(response.json().get("embedding"))
        return vectors

    @staticmethod
    def _prepare(text: str, task: EmbeddingTask) -> str:
        normalized = " ".join(text.split())
        if not normalized:
            raise ValueError("Không thể embedding văn bản rỗng")
        return _PREFIX[task] + normalized


def _normalize_model_name(name: str) -> str:
    return name if ":" in name else f"{name}:latest"


def _validate_vectors(vectors: object, expected_count: int) -> list[list[float]]:
    if not isinstance(vectors, list) or len(vectors) != expected_count:
        raise ValueError(
            f"Ollama trả sai số vector: cần {expected_count}, nhận "
            f"{len(vectors) if isinstance(vectors, list) else 0}"
        )

    validated: list[list[float]] = []
    dimension: int | None = None
    for vector in vectors:
        if not isinstance(vector, list) or not vector:
            raise ValueError("Ollama trả vector rỗng hoặc sai định dạng")
        try:
            numeric = [float(value) for value in vector]
        except (TypeError, ValueError) as exc:
            raise ValueError("Ollama trả vector có phần tử không phải số") from exc
        if not all(math.isfinite(value) for value in numeric):
            raise ValueError("Ollama trả vector chứa NaN/Infinity")
        if dimension is None:
            dimension = len(numeric)
        elif len(numeric) != dimension:
            raise ValueError("Ollama trả các vector không cùng số chiều")
        validated.append(numeric)
    return validated

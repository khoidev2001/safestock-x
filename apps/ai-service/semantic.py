"""Xếp hạng ngữ nghĩa dùng embedding local, tái sử dụng cho B5 và B7.

Module này chỉ trả ID + cosine score. Dữ liệu nghiệp vụ vẫn do backend giữ và
scope; ai-service không được tự tạo hoặc tự sửa danh mục vật tư.
"""
from __future__ import annotations

import math
import threading
from collections import OrderedDict
from dataclasses import dataclass

from knowledge import KnowledgeValidationError, cosine_similarity
from providers.embedding import EmbeddingProvider


@dataclass(frozen=True)
class SemanticCandidate:
    id: str
    text: str


@dataclass(frozen=True)
class SemanticHit:
    id: str
    score: float


@dataclass(frozen=True)
class SemanticResult:
    available: bool
    reason: str | None
    hits: tuple[SemanticHit, ...]


class SemanticRanker:
    """Vector hóa query + catalog và cache vector catalog trong bộ nhớ tiến trình."""

    def __init__(self, provider: EmbeddingProvider, cache_size: int = 2048) -> None:
        self._provider = provider
        self._cache_size = max(1, cache_size)
        self._document_cache: OrderedDict[str, tuple[float, ...]] = OrderedDict()
        self._cache_lock = threading.Lock()

    def rank(
        self,
        query: str,
        candidates: list[SemanticCandidate],
        *,
        top_k: int = 5,
        min_score: float = 0.35,
    ) -> SemanticResult:
        normalized_query = _normalize(query)
        normalized_candidates = [
            SemanticCandidate(candidate.id, _normalize(candidate.text))
            for candidate in candidates
            if candidate.id and _normalize(candidate.text)
        ]
        if not normalized_query or not normalized_candidates:
            return SemanticResult(True, None, ())

        try:
            query_vectors = self._provider.embed([normalized_query], task="query")
            if len(query_vectors) != 1:
                raise ValueError("invalid_query_vector")
            query_vector = _validate_vector(query_vectors[0])
            document_vectors = self._document_vectors(normalized_candidates)

            scored = []
            for candidate, vector in zip(
                normalized_candidates,
                document_vectors,
                strict=True,
            ):
                score = cosine_similarity(query_vector, list(vector))
                if score >= min_score:
                    scored.append(SemanticHit(candidate.id, round(score, 6)))
        except (Exception, KnowledgeValidationError):  # noqa: BLE001 — degrade an toàn
            return SemanticResult(False, "embedding_unavailable", ())

        scored.sort(key=lambda hit: (-hit.score, hit.id))
        return SemanticResult(True, None, tuple(scored[: max(1, min(20, top_k))]))

    def _document_vectors(
        self,
        candidates: list[SemanticCandidate],
    ) -> list[tuple[float, ...]]:
        keys = [self._cache_key(candidate.text) for candidate in candidates]
        resolved: dict[str, tuple[float, ...]] = {}
        missing_keys: list[str] = []
        missing_texts: list[str] = []

        with self._cache_lock:
            for key, candidate in zip(keys, candidates, strict=True):
                cached = self._document_cache.get(key)
                if cached is not None:
                    self._document_cache.move_to_end(key)
                    resolved[key] = cached
                elif key not in missing_keys:
                    missing_keys.append(key)
                    missing_texts.append(candidate.text)

        if missing_texts:
            vectors = self._provider.embed(missing_texts, task="document")
            if len(vectors) != len(missing_texts):
                raise ValueError("invalid_document_vectors")
            validated = [_validate_vector(vector) for vector in vectors]
            with self._cache_lock:
                for key, vector in zip(missing_keys, validated, strict=True):
                    frozen = tuple(vector)
                    self._document_cache[key] = frozen
                    self._document_cache.move_to_end(key)
                    resolved[key] = frozen
                while len(self._document_cache) > self._cache_size:
                    self._document_cache.popitem(last=False)

        return [resolved[key] for key in keys]

    def _cache_key(self, text: str) -> str:
        return f"{self._provider.name}:{self._provider.model}:{self._provider.input_transform}:{text}"


def _normalize(text: str) -> str:
    return " ".join(text.split())


def _validate_vector(vector: object) -> list[float]:
    if not isinstance(vector, list) or not vector:
        raise ValueError("invalid_vector")
    values = [float(value) for value in vector]
    if not all(math.isfinite(value) for value in values):
        raise ValueError("invalid_vector")
    return values


_RANKER: SemanticRanker | None = None
_RANKER_LOCK = threading.Lock()


def get_semantic_ranker() -> SemanticRanker:
    """Lazy singleton: import FastAPI không gọi Ollama."""
    global _RANKER
    if _RANKER is not None:
        return _RANKER
    with _RANKER_LOCK:
        if _RANKER is None:
            from providers.factory import build_embedding_provider

            _RANKER = SemanticRanker(build_embedding_provider())
    return _RANKER

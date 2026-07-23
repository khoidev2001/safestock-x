"""Corpus/index RAG có nguồn — parse deterministic, validate trước khi retrieval.

Mọi chunk phải tự chứa và có nguồn cấu trúc. Index ghi version + fingerprint để
không âm thầm dùng vector cũ khi corpus/model/cách prefix đã đổi.
"""
from __future__ import annotations

import hashlib
import json
import math
import os
import re
import threading
import unicodedata
from dataclasses import asdict, dataclass
from datetime import date
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from providers.embedding import EmbeddingProvider

SCHEMA_VERSION = 2
MAX_CHUNK_WORDS = 220
PREVIEW_LENGTH = 240

_HEADING_RE = re.compile(r"^(#{2,3})\s+(.+?)\s*$")
_SOURCE_RE = re.compile(
    r"^>\s*Nguồn:\s*(?P<title>[^|]+?)\s*\|\s*"
    r"(?P<locator>[^|]+?)\s*\|\s*(?P<url>https?://\S+?)\s*\|\s*"
    r"truy cập\s+(?P<accessed>\d{4}-\d{2}-\d{2})\s*$",
    re.IGNORECASE,
)
_OLD_ADMIN_RE = re.compile(r"\bhuyện\b", re.IGNORECASE)


class KnowledgeValidationError(ValueError):
    """Corpus/index không đạt hợp đồng an toàn."""


@dataclass(frozen=True)
class KnowledgeSource:
    title: str
    locator: str
    url: str
    accessedAt: str


@dataclass(frozen=True)
class KnowledgeChunk:
    id: str
    document: str
    heading: str
    text: str
    textSha256: str
    sources: tuple[KnowledgeSource, ...]

    def to_index_dict(self, embedding: list[float]) -> dict[str, Any]:
        return {
            "id": self.id,
            "document": self.document,
            "heading": self.heading,
            "text": self.text,
            "textSha256": self.textSha256,
            "sources": [asdict(source) for source in self.sources],
            "embedding": embedding,
        }


def parse_knowledge_file(path: Path) -> list[KnowledgeChunk]:
    """Tách markdown theo heading ##/###; mỗi section thành đúng một chunk."""
    raw = path.read_text(encoding="utf-8").replace("\r\n", "\n")
    chunks: list[KnowledgeChunk] = []
    heading: str | None = None
    body: list[str] = []

    def flush() -> None:
        nonlocal heading, body
        if heading is None:
            body = []
            return
        chunks.append(_make_chunk(path.name, heading, body))
        heading, body = None, []

    for line in raw.splitlines():
        match = _HEADING_RE.match(line)
        if match:
            flush()
            heading = match.group(2).strip()
            continue
        if heading is not None:
            body.append(line)
    flush()

    if not chunks:
        raise KnowledgeValidationError(f"{path.name}: không có heading ##/###")
    _reject_duplicate_ids(chunks, path.name)
    return chunks


def load_corpus(corpus_dir: Path) -> list[KnowledgeChunk]:
    """Đọc corpus theo thứ tự ổn định; README không phải tài liệu retrieval."""
    paths = sorted(path for path in corpus_dir.glob("*.md") if path.name.lower() != "readme.md")
    if not paths:
        raise KnowledgeValidationError(f"Không có corpus markdown trong {corpus_dir}")
    chunks = [chunk for path in paths for chunk in parse_knowledge_file(path)]
    _reject_duplicate_ids(chunks, str(corpus_dir))
    return chunks


def corpus_sha256(chunks: list[KnowledgeChunk]) -> str:
    """Fingerprint semantic corpus; không phụ thuộc whitespace/giờ build."""
    payload = [
        {
            "id": chunk.id,
            "document": chunk.document,
            "heading": chunk.heading,
            "text": chunk.text,
            "textSha256": chunk.textSha256,
            "sources": [asdict(source) for source in chunk.sources],
        }
        for chunk in chunks
    ]
    canonical = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def validate_index(
    data: object,
    *,
    provider_name: str,
    model: str,
    input_transform: str,
    model_digest: str | None = None,
) -> dict[str, Any]:
    """Validate cấu trúc + fingerprint embedding trước khi cho runtime sử dụng."""
    if not isinstance(data, dict):
        raise KnowledgeValidationError("index_invalid")
    if data.get("schemaVersion") != SCHEMA_VERSION:
        raise KnowledgeValidationError("schema_version_mismatch")

    embedding = data.get("embedding")
    corpus = data.get("corpus")
    chunks = data.get("chunks")
    if not isinstance(embedding, dict) or not isinstance(corpus, dict) or not isinstance(chunks, list):
        raise KnowledgeValidationError("index_invalid")
    if embedding.get("provider") != provider_name or embedding.get("model") != model:
        raise KnowledgeValidationError("model_mismatch")
    if embedding.get("inputTransform") != input_transform:
        raise KnowledgeValidationError("model_mismatch")
    stored_digest = embedding.get("digest")
    if not isinstance(stored_digest, str) or not re.fullmatch(r"[0-9a-f]{64}", stored_digest):
        raise KnowledgeValidationError("model_mismatch")
    if model_digest is not None and stored_digest != model_digest:
        raise KnowledgeValidationError("model_mismatch")

    dimension = embedding.get("dimension")
    if not isinstance(dimension, int) or dimension <= 0:
        raise KnowledgeValidationError("dimension_mismatch")
    if corpus.get("chunkCount") != len(chunks) or not isinstance(corpus.get("contentSha256"), str):
        raise KnowledgeValidationError("index_invalid")

    ids: set[str] = set()
    validated_chunks: list[KnowledgeChunk] = []
    for chunk in chunks:
        validated_chunks.append(_validate_index_chunk(chunk, dimension, ids))
    if corpus["contentSha256"] != corpus_sha256(validated_chunks):
        raise KnowledgeValidationError("index_invalid")
    return data


def verify_index_matches_corpus(data: dict[str, Any], chunks: list[KnowledgeChunk]) -> None:
    """Dùng cho build --check: index commit phải đúng corpus hiện tại."""
    expected_by_id = {chunk.id: chunk for chunk in chunks}
    indexed = data["chunks"]
    if data["corpus"]["contentSha256"] != corpus_sha256(chunks):
        raise KnowledgeValidationError("corpus_stale")
    if data["corpus"]["chunkCount"] != len(chunks) or len(indexed) != len(chunks):
        raise KnowledgeValidationError("corpus_stale")
    for item in indexed:
        expected = expected_by_id.get(item["id"])
        if expected is None or item["textSha256"] != expected.textSha256:
            raise KnowledgeValidationError("corpus_stale")


def cosine_similarity(left: list[float], right: list[float]) -> float:
    if not left or len(left) != len(right):
        raise KnowledgeValidationError("dimension_mismatch")
    left_norm = math.sqrt(sum(value * value for value in left))
    right_norm = math.sqrt(sum(value * value for value in right))
    if left_norm == 0 or right_norm == 0:
        return 0.0
    return sum(a * b for a, b in zip(left, right, strict=True)) / (left_norm * right_norm)


def make_preview(text: str, limit: int = PREVIEW_LENGTH) -> str:
    normalized = " ".join(text.split())
    if len(normalized) <= limit:
        return normalized
    return normalized[: max(0, limit - 1)].rstrip() + "…"


@dataclass(frozen=True)
class SearchHit:
    id: str
    document: str
    heading: str
    text: str
    score: float
    sources: tuple[dict[str, str], ...]

    def public_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "document": self.document,
            "heading": self.heading,
            "score": round(self.score, 4),
            "preview": make_preview(self.text),
            "sources": list(self.sources),
        }


@dataclass(frozen=True)
class SearchResult:
    available: bool
    reason: str | None
    index_version: int | None
    model: str | None
    hits: tuple[SearchHit, ...]


class KnowledgeRetriever:
    """Lazy-load index + semantic search; mọi lỗi runtime được đổi thành reason code."""

    def __init__(
        self,
        index_path: Path,
        embedding_provider: EmbeddingProvider,
        min_score: float = 0.65,
        relative_margin: float = 0.005,
        high_confidence_score: float = 0.88,
        min_lexical_overlap: int = 1,
    ) -> None:
        self._index_path = index_path
        self._provider = embedding_provider
        self._min_score = min_score
        self._relative_margin = relative_margin
        self._high_confidence_score = high_confidence_score
        self._min_lexical_overlap = min_lexical_overlap
        self._index: dict[str, Any] | None = None
        self._load_reason: str | None = None
        self._load_lock = threading.Lock()

    def search(self, query: str, top_k: int = 3) -> SearchResult:
        normalized = " ".join(query.split())
        if not normalized:
            return self._unavailable("query_empty")
        top_k = max(1, min(5, top_k))
        index = self._load_index()
        if index is None:
            return self._unavailable(self._load_reason or "index_invalid")

        try:
            vectors = self._provider.embed([normalized], task="query")
        except Exception:  # noqa: BLE001 — degrade, không lộ stack/model HTTP ra API
            return self._unavailable("embedding_unavailable", index)
        if not vectors:
            return self._unavailable("embedding_unavailable", index)
        query_vector = vectors[0]
        dimension = index["embedding"]["dimension"]
        if len(query_vector) != dimension:
            return self._unavailable("dimension_mismatch", index)

        query_tokens = _meaningful_tokens(normalized)
        scored: list[tuple[float, SearchHit]] = []
        try:
            for chunk in index["chunks"]:
                score = cosine_similarity(query_vector, chunk["embedding"])
                overlap = len(query_tokens & _meaningful_tokens(chunk["text"]))
                anchor_tokens = _meaningful_tokens(chunk["heading"])
                anchor_overlap = len(query_tokens & anchor_tokens)
                # Embedding nhỏ có thể cho điểm cao chỉ vì cùng bối cảnh "vùng lũ".
                # Bình thường cần >=2 từ chuyên môn ở heading. Riêng câu định mức/
                # số lượng được phép 1 từ chủ đề nếu chunk thật sự chứa con số.
                # Mọi query phải phủ ít nhất hai token chủ đề trong heading.
                # Với câu hỏi số lượng, chunk còn phải có định lượng cùng đơn vị
                # (lít/người/calo/viên/...); không lấy một con số bất kỳ làm bằng chứng.
                answerable = anchor_overlap >= 2
                quantity_match = True
                if _is_quantity_query(normalized):
                    requested_units = _quantity_units(normalized, require_number=False)
                    chunk_units = _quantity_units(chunk["text"], require_number=True)
                    quantity_match = (
                        requested_units.issubset(chunk_units)
                        if requested_units
                        else bool(chunk_units)
                    )
                if (
                    score < self._min_score
                    or not quantity_match
                    or (
                        score < self._high_confidence_score
                        and (not answerable or overlap < self._min_lexical_overlap)
                    )
                ):
                    continue
                hit = SearchHit(
                    id=chunk["id"],
                    document=chunk["document"],
                    heading=chunk["heading"],
                    text=chunk["text"],
                    score=score,
                    sources=tuple(_public_source(source) for source in chunk["sources"]),
                )
                # Rerank bằng mức bao phủ từ chuyên môn ở thân bài + tiêu đề;
                # raw cosine vẫn được trả để audit. Tiêu đề phân biệt intent tốt hơn.
                rank_score = (
                    score
                    + min(overlap, 5) * 0.02
                    + min(anchor_overlap, 5) * 0.02
                )
                scored.append((rank_score, hit))
        except KnowledgeValidationError:
            return self._unavailable("dimension_mismatch", index)

        scored.sort(key=lambda item: (-item[0], item[1].id))
        if not scored:
            return self._available((), index)
        cutoff = scored[0][0] - self._relative_margin
        hits = tuple(hit for rank, hit in scored if rank >= cutoff)[:top_k]
        return self._available(hits, index)

    def _load_index(self) -> dict[str, Any] | None:
        if self._index is not None or self._load_reason in _PERMANENT_LOAD_REASONS:
            return self._index
        with self._load_lock:
            if self._index is not None or self._load_reason in _PERMANENT_LOAD_REASONS:
                return self._index
            # embedding_unavailable là lỗi transient: request sau phải thử lại.
            self._load_reason = None
            if not self._index_path.exists():
                self._load_reason = "index_missing"
                return None
            try:
                raw = json.loads(self._index_path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                self._load_reason = "index_invalid"
                return None
            try:
                digest = self._provider.model_digest()
            except Exception:  # noqa: BLE001 — /api/tags/model chưa sẵn sàng
                self._load_reason = "embedding_unavailable"
                return None
            try:
                self._index = validate_index(
                    raw,
                    provider_name=self._provider.name,
                    model=self._provider.model,
                    input_transform=self._provider.input_transform,
                    model_digest=digest,
                )
            except KnowledgeValidationError as exc:
                self._load_reason = _safe_reason(str(exc))
            return self._index

    def _available(
        self,
        hits: tuple[SearchHit, ...],
        index: dict[str, Any],
    ) -> SearchResult:
        return SearchResult(
            available=True,
            reason=None,
            index_version=index["schemaVersion"],
            model=index["embedding"]["model"],
            hits=hits,
        )

    def _unavailable(
        self,
        reason: str,
        index: dict[str, Any] | None = None,
    ) -> SearchResult:
        return SearchResult(
            available=False,
            reason=_safe_reason(reason),
            index_version=index.get("schemaVersion") if index else None,
            model=index.get("embedding", {}).get("model") if index else self._provider.model,
            hits=(),
        )


_RETRIEVER: KnowledgeRetriever | None = None
_RETRIEVER_LOCK = threading.Lock()


def get_knowledge_retriever() -> KnowledgeRetriever:
    """Lazy singleton cho FastAPI; import module không gọi Ollama và không đọc index."""
    global _RETRIEVER
    if _RETRIEVER is not None:
        return _RETRIEVER
    with _RETRIEVER_LOCK:
        if _RETRIEVER is None:
            from providers.factory import build_embedding_provider

            try:
                min_score = float(os.getenv("KNOWLEDGE_MIN_SCORE", "0.65"))
            except ValueError:
                min_score = 0.65
            _RETRIEVER = KnowledgeRetriever(
                Path(__file__).resolve().parent / "knowledge_index.json",
                build_embedding_provider(),
                min_score=min_score,
            )
    return _RETRIEVER


def _make_chunk(document: str, heading: str, body_lines: list[str]) -> KnowledgeChunk:
    sources: list[KnowledgeSource] = []
    content_lines: list[str] = []
    for line in body_lines:
        stripped = line.strip()
        if stripped.lower().startswith("> nguồn:"):
            match = _SOURCE_RE.match(stripped)
            if not match:
                raise KnowledgeValidationError(
                    f"{document} / {heading}: nguồn sai format; cần title | locator | URL | truy cập YYYY-MM-DD"
                )
            source = KnowledgeSource(
                title=match.group("title").strip(),
                locator=match.group("locator").strip(),
                url=match.group("url").strip(),
                accessedAt=match.group("accessed"),
            )
            _validate_source(source, document, heading)
            sources.append(source)
        else:
            content_lines.append(line)

    text = _normalize_markdown_text(content_lines)
    if not text:
        raise KnowledgeValidationError(f"{document} / {heading}: chunk rỗng")
    if not sources:
        raise KnowledgeValidationError(f"{document} / {heading}: thiếu nguồn")
    word_count = len(text.split())
    if word_count > MAX_CHUNK_WORDS:
        raise KnowledgeValidationError(
            f"{document} / {heading}: {word_count} từ, vượt trần {MAX_CHUNK_WORDS}"
        )
    if _OLD_ADMIN_RE.search(text) or _OLD_ADMIN_RE.search(heading):
        raise KnowledgeValidationError(
            f"{document} / {heading}: dùng đơn vị hành chính cũ không được phép"
        )

    chunk_id = f"{_slug(Path(document).stem)}--{_slug(heading)}"
    semantic_text = f"{heading}\n{text}"
    return KnowledgeChunk(
        id=chunk_id,
        document=document,
        heading=heading,
        text=text,
        textSha256=hashlib.sha256(semantic_text.encode("utf-8")).hexdigest(),
        sources=tuple(sources),
    )


def _normalize_markdown_text(lines: list[str]) -> str:
    paragraphs: list[str] = []
    current: list[str] = []
    for line in lines:
        stripped = line.strip()
        if not stripped:
            if current:
                paragraphs.append(" ".join(current))
                current = []
            continue
        current.append(stripped)
    if current:
        paragraphs.append(" ".join(current))
    return "\n\n".join(paragraphs).strip()


def _validate_source(source: KnowledgeSource, document: str, heading: str) -> None:
    if len(source.title) < 4 or len(source.locator) < 2:
        raise KnowledgeValidationError(f"{document} / {heading}: tên nguồn hoặc locator quá mơ hồ")
    parsed = urlparse(source.url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise KnowledgeValidationError(f"{document} / {heading}: URL nguồn không hợp lệ")
    try:
        date.fromisoformat(source.accessedAt)
    except ValueError as exc:
        raise KnowledgeValidationError(
            f"{document} / {heading}: ngày truy cập nguồn không hợp lệ"
        ) from exc


def _validate_index_chunk(
    chunk: object,
    dimension: int,
    ids: set[str],
) -> KnowledgeChunk:
    if not isinstance(chunk, dict):
        raise KnowledgeValidationError("index_invalid")
    required = {"id", "document", "heading", "text", "textSha256", "sources", "embedding"}
    if not required.issubset(chunk):
        raise KnowledgeValidationError("index_invalid")
    if not all(isinstance(chunk.get(field), str) for field in ("id", "document", "heading", "text", "textSha256")):
        raise KnowledgeValidationError("index_invalid")

    chunk_id = chunk["id"]
    if not chunk["text"].strip() or chunk_id in ids:
        raise KnowledgeValidationError("index_invalid")
    expected_id = f"{_slug(Path(chunk['document']).stem)}--{_slug(chunk['heading'])}"
    expected_hash = hashlib.sha256(
        f"{chunk['heading']}\n{chunk['text']}".encode("utf-8")
    ).hexdigest()
    if chunk_id != expected_id or chunk["textSha256"] != expected_hash:
        raise KnowledgeValidationError("index_invalid")
    if _OLD_ADMIN_RE.search(chunk["heading"]) or _OLD_ADMIN_RE.search(chunk["text"]):
        raise KnowledgeValidationError("index_invalid")
    ids.add(chunk_id)

    vector = chunk["embedding"]
    if not isinstance(vector, list) or len(vector) != dimension:
        raise KnowledgeValidationError("dimension_mismatch")
    if not all(isinstance(value, (int, float)) and math.isfinite(value) for value in vector):
        raise KnowledgeValidationError("index_invalid")

    raw_sources = chunk["sources"]
    if not isinstance(raw_sources, list) or not raw_sources:
        raise KnowledgeValidationError("index_invalid")
    sources: list[KnowledgeSource] = []
    for raw_source in raw_sources:
        if not isinstance(raw_source, dict):
            raise KnowledgeValidationError("index_invalid")
        fields = ("title", "locator", "url", "accessedAt")
        if not all(isinstance(raw_source.get(field), str) for field in fields):
            raise KnowledgeValidationError("index_invalid")
        source = KnowledgeSource(
            title=raw_source["title"],
            locator=raw_source["locator"],
            url=raw_source["url"],
            accessedAt=raw_source["accessedAt"],
        )
        try:
            _validate_source(source, chunk["document"], chunk["heading"])
        except KnowledgeValidationError as exc:
            raise KnowledgeValidationError("index_invalid") from exc
        sources.append(source)

    return KnowledgeChunk(
        id=chunk_id,
        document=chunk["document"],
        heading=chunk["heading"],
        text=chunk["text"],
        textSha256=chunk["textSha256"],
        sources=tuple(sources),
    )


def _slug(text: str) -> str:
    text = text.replace("đ", "d").replace("Đ", "D")
    plain = unicodedata.normalize("NFD", text)
    plain = "".join(char for char in plain if unicodedata.category(char) != "Mn")
    slug = re.sub(r"[^a-z0-9]+", "-", plain.lower()).strip("-")
    if not slug:
        raise KnowledgeValidationError(f"Không tạo được ID từ: {text}")
    return slug


def _reject_duplicate_ids(chunks: list[KnowledgeChunk], scope: str) -> None:
    ids: set[str] = set()
    for chunk in chunks:
        if chunk.id in ids:
            raise KnowledgeValidationError(f"{scope}: ID chunk trùng {chunk.id}")
        ids.add(chunk.id)


_PERMANENT_LOAD_REASONS = {
    "index_missing",
    "index_invalid",
    "schema_version_mismatch",
    "model_mismatch",
    "dimension_mismatch",
}

_REASON_CODES = {
    "query_empty",
    "index_missing",
    "index_invalid",
    "schema_version_mismatch",
    "model_mismatch",
    "embedding_unavailable",
    "dimension_mismatch",
}


def _safe_reason(reason: str) -> str:
    return reason if reason in _REASON_CODES else "index_invalid"


def _public_source(source: object) -> dict[str, str]:
    if not isinstance(source, dict):
        raise KnowledgeValidationError("index_invalid")
    fields = ("title", "locator", "url", "accessedAt")
    if not all(isinstance(source.get(field), str) for field in fields):
        raise KnowledgeValidationError("index_invalid")
    return {field: source[field] for field in fields}


_STOPWORDS = {
    "bạn", "bao", "các", "cần", "cho", "có", "còn", "của", "đã", "đang", "để",
    "được", "gì", "hãy", "hiện", "không", "là", "làm", "một", "mỗi",
    "nào", "này", "người", "những", "ở", "phải", "ra", "sao", "thế",
    "thì", "tôi", "trong", "từ", "và", "về", "với",
}


def _meaningful_tokens(text: str) -> set[str]:
    """Token lexical giữ dấu; bỏ dấu làm năng=nặng, bao=bão và gây false-positive."""
    normalized = unicodedata.normalize("NFC", text.lower())
    return {
        token
        for token in re.findall(r"[0-9a-zà-ỹđ]+", normalized)
        if len(token) >= 2 and token not in _STOPWORDS
    }


def _is_quantity_query(text: str) -> bool:
    normalized = unicodedata.normalize("NFC", text.lower())
    markers = ("bao nhiêu", "định mức", "tối thiểu", "liều", "số lượng")
    explicit_units = ("lít", "calo", "kcal", "insulin", "viên thuốc", "%", "phần trăm")
    return any(marker in normalized for marker in markers) or any(
        unit in normalized for unit in explicit_units
    )


def _quantity_units(text: str, *, require_number: bool) -> set[str]:
    """Rút dimension định lượng; runtime không ghép số lít với người/calo/thuốc."""
    normalized = unicodedata.normalize("NFC", text.lower())
    number = r"\d+(?:[.,]\d+)?"
    range_number = rf"{number}(?:\s*[–-]\s*{number})?"
    units: set[str] = set()

    if require_number:
        if re.search(rf"{range_number}\s*lít\b", normalized):
            units.add("litre")
        if (
            re.search(rf"{range_number}\s*người\b", normalized)
            or re.search(rf"{range_number}[^.!?]{{0,60}}(?:mỗi|/)\s*người\b", normalized)
        ):
            units.add("person")
        if re.search(rf"{range_number}\s*(?:calo|kcal)\b", normalized):
            units.add("calorie")
        if re.search(rf"{range_number}[^.!?]{{0,30}}\binsulin\b", normalized):
            units.add("insulin")
        if re.search(rf"{range_number}\s*(?:viên|liều)\b", normalized):
            units.add("medicine-dose")
        if re.search(rf"{range_number}\s*(?:%|phần trăm)\b", normalized):
            units.add("percent")
        return units

    if "lít" in normalized or re.search(
        r"(?:bao nhiêu|định mức|lượng)\s+nước|nước\s+mỗi\s+(?:người|ngày)",
        normalized,
    ):
        units.add("litre")
    if re.search(r"bao nhiêu\s+người|mỗi\s+người", normalized):
        units.add("person")
    if "calo" in normalized or "kcal" in normalized:
        units.add("calorie")
    if "insulin" in normalized:
        units.add("insulin")
    if "viên thuốc" in normalized or "liều thuốc" in normalized or "liều lượng" in normalized:
        units.add("medicine-dose")
    if "%" in normalized or "phần trăm" in normalized:
        units.add("percent")
    return units

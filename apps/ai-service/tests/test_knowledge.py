"""Parser/index/cosine RAG — pure unit tests, không cần Ollama."""
import json
import sys
from pathlib import Path

import pytest

AI_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(AI_DIR))

from knowledge import (  # noqa: E402
    KnowledgeRetriever,
    KnowledgeValidationError,
    corpus_sha256,
    cosine_similarity,
    load_corpus,
    make_preview,
    parse_knowledge_file,
    validate_index,
    verify_index_matches_corpus,
)
from providers.embedding import EmbeddingProvider  # noqa: E402

_SOURCE = (
    "> Nguồn: Sphere Handbook 2018 | WASH Standard 2.1, trang 94 | "
    "https://spherestandards.org/handbook/ | truy cập 2026-07-23"
)


def _write(path: Path, content: str) -> Path:
    path.write_text(content, encoding="utf-8")
    return path


def _sample_doc(extra: str = "") -> str:
    return f"""# Tài liệu

## Nước sạch khẩn cấp
Theo dõi nhu cầu nước theo phạm vi sử dụng và điều kiện thực tế. {extra}

{_SOURCE}

### Bảo quản nước
Đậy kín dụng cụ chứa nước và bảo vệ nguồn nước khỏi ô nhiễm.

> Nguồn: WHO technical note | Water safety, mục 2 | https://www.who.int/example | truy cập 2026-07-23
"""


def _index(chunks, vectors=None):
    vectors = vectors or [[1.0, 0.0] for _ in chunks]
    return {
        "schemaVersion": 2,
        "builtAt": "2026-07-23T00:00:00Z",
        "embedding": {
            "provider": "ollama",
            "model": "nomic-embed-text",
            "digest": "a" * 64,
            "dimension": len(vectors[0]),
            "inputTransform": "nomic-search-prefix-v1",
        },
        "corpus": {
            "contentSha256": corpus_sha256(chunks),
            "chunkCount": len(chunks),
        },
        "chunks": [chunk.to_index_dict(vector) for chunk, vector in zip(chunks, vectors, strict=True)],
    }


def test_parser_splits_headings_and_keeps_structured_sources(tmp_path):
    chunks = parse_knowledge_file(_write(tmp_path / "dinh-muc.md", _sample_doc()))
    assert [chunk.id for chunk in chunks] == [
        "dinh-muc--nuoc-sach-khan-cap",
        "dinh-muc--bao-quan-nuoc",
    ]
    assert chunks[0].heading == "Nước sạch khẩn cấp"
    assert chunks[0].sources[0].locator == "WASH Standard 2.1, trang 94"
    assert "Nguồn:" not in chunks[0].text


def test_load_corpus_is_stable_and_ignores_readme(tmp_path):
    _write(tmp_path / "b.md", _sample_doc())
    _write(tmp_path / "a.md", _sample_doc().replace("Nước sạch", "Sơ tán"))
    _write(tmp_path / "README.md", "không phải corpus")
    chunks = load_corpus(tmp_path)
    assert chunks[0].document == "a.md"
    assert chunks[-1].document == "b.md"


@pytest.mark.parametrize(
    "content, message",
    [
        ("# Chỉ tiêu đề cấp một", "không có heading"),
        ("## Mục rỗng\n" + _SOURCE, "chunk rỗng"),
        ("## Thiếu nguồn\nNội dung rõ ràng.", "thiếu nguồn"),
        ("## Nguồn sai\nNội dung.\n> Nguồn: chỉ ghi tên", "nguồn sai format"),
        (
            "## Ngày sai\nNội dung.\n> Nguồn: Tài liệu chính thức | mục 1 | https://example.org/doc | truy cập 2026-99-99",
            "ngày truy cập nguồn không hợp lệ",
        ),
        (
            "## Đơn vị cũ\nĐiều phối từ huyện xuống xã.\n" + _SOURCE,
            "đơn vị hành chính cũ",
        ),
    ],
)
def test_parser_rejects_unsafe_corpus(tmp_path, content, message):
    with pytest.raises(KnowledgeValidationError, match=message):
        parse_knowledge_file(_write(tmp_path / "bad.md", content))


def test_parser_rejects_duplicate_slug_ids(tmp_path):
    content = f"""## Sơ tán khẩn cấp
Nội dung một.
{_SOURCE}

## Sơ-tán khẩn cấp
Nội dung hai.
{_SOURCE}
"""
    with pytest.raises(KnowledgeValidationError, match="ID chunk trùng"):
        parse_knowledge_file(_write(tmp_path / "dup.md", content))


def test_corpus_fingerprint_changes_only_with_semantic_content(tmp_path):
    path = _write(tmp_path / "doc.md", _sample_doc())
    first = corpus_sha256(parse_knowledge_file(path))
    path.write_text(_sample_doc().replace("Theo dõi", "  Theo dõi"), encoding="utf-8")
    assert corpus_sha256(parse_knowledge_file(path)) == first
    path.write_text(_sample_doc(extra="Bổ sung."), encoding="utf-8")
    assert corpus_sha256(parse_knowledge_file(path)) != first


def test_validate_index_and_detect_stale_corpus(tmp_path):
    chunks = parse_knowledge_file(_write(tmp_path / "doc.md", _sample_doc()))
    data = _index(chunks)
    validated = validate_index(
        data,
        provider_name="ollama",
        model="nomic-embed-text",
        input_transform="nomic-search-prefix-v1",
    )
    verify_index_matches_corpus(validated, chunks)

    changed = parse_knowledge_file(_write(tmp_path / "doc.md", _sample_doc(extra="Đã đổi.")))
    with pytest.raises(KnowledgeValidationError, match="corpus_stale"):
        verify_index_matches_corpus(validated, changed)


@pytest.mark.parametrize(
    "mutate, message",
    [
        (lambda d: d.update(schemaVersion=1), "schema_version_mismatch"),
        (lambda d: d["embedding"].update(model="other"), "model_mismatch"),
        (lambda d: d["embedding"].update(inputTransform="other"), "model_mismatch"),
        (lambda d: d["embedding"].update(dimension=3), "dimension_mismatch"),
        (lambda d: d["chunks"][0].update(embedding=[float("nan"), 0]), "index_invalid"),
        (lambda d: d["chunks"][0].update(text="nội dung bị sửa tay"), "index_invalid"),
        (lambda d: d["chunks"][0]["sources"][0].update(url="javascript:alert(1)"), "index_invalid"),
    ],
)
def test_validate_index_rejects_mismatch(tmp_path, mutate, message):
    chunks = parse_knowledge_file(_write(tmp_path / "doc.md", _sample_doc()))
    data = _index(chunks)
    mutate(data)
    with pytest.raises(KnowledgeValidationError, match=message):
        validate_index(
            data,
            provider_name="ollama",
            model="nomic-embed-text",
            input_transform="nomic-search-prefix-v1",
        )


def test_cosine_similarity_and_edge_cases():
    assert cosine_similarity([1, 0], [1, 0]) == pytest.approx(1)
    assert cosine_similarity([1, 0], [0, 1]) == pytest.approx(0)
    assert cosine_similarity([0, 0], [1, 0]) == 0
    with pytest.raises(KnowledgeValidationError, match="dimension_mismatch"):
        cosine_similarity([1], [1, 2])


def test_preview_is_deterministic():
    assert make_preview("  một   hai\nba  ", 20) == "một hai ba"
    assert make_preview("abcdefghij", 6) == "abcde…"


class FakeEmbedding(EmbeddingProvider):
    name = "ollama"
    model = "nomic-embed-text"
    input_transform = "nomic-search-prefix-v1"

    def __init__(
        self,
        vector=(1.0, 0.0),
        error: Exception | None = None,
        digest: str | None = None,
        digest_error: Exception | None = None,
    ):
        self.vector = list(vector)
        self.error = error
        self.digest = digest
        self.digest_error = digest_error
        self.calls: list[tuple[list[str], str]] = []

    def model_digest(self):
        if self.digest_error:
            raise self.digest_error
        return self.digest

    def embed(self, texts, *, task):
        self.calls.append((texts, task))
        if self.error:
            raise self.error
        return [self.vector for _ in texts]


def _write_index(path: Path, data) -> Path:
    path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    return path


def test_retriever_ranks_filters_margin_and_top_k(tmp_path):
    chunks = parse_knowledge_file(_write(tmp_path / "doc.md", _sample_doc()))
    data = _index(chunks, vectors=[[1.0, 0.0], [0.8, 0.6]])
    provider = FakeEmbedding((1.0, 0.0))
    retriever = KnowledgeRetriever(
        _write_index(tmp_path / "index.json", data),
        provider,
        min_score=0.5,
        relative_margin=0.1,
    )
    result = retriever.search("nước mỗi người", top_k=5)
    assert result.available is True
    assert [hit.id for hit in result.hits] == [chunks[0].id]  # hit 0.8 bị bỏ vì cách top >0.1
    assert provider.calls == [(["nước mỗi người"], "query")]
    assert result.hits[0].sources[0]["title"] == "Sphere Handbook 2018"


def test_retriever_returns_no_hits_below_threshold(tmp_path):
    chunks = parse_knowledge_file(_write(tmp_path / "doc.md", _sample_doc()))
    data = _index(chunks, vectors=[[0.0, 1.0], [0.1, 0.99]])
    retriever = KnowledgeRetriever(
        _write_index(tmp_path / "index.json", data),
        FakeEmbedding((1.0, 0.0)),
        min_score=0.5,
    )
    result = retriever.search("chuyện không liên quan")
    assert result.available is True
    assert result.reason is None
    assert result.hits == ()


@pytest.mark.parametrize(
    "setup, expected",
    [
        ("missing", "index_missing"),
        ("invalid", "index_invalid"),
        ("model", "model_mismatch"),
    ],
)
def test_retriever_degrades_for_bad_index(tmp_path, setup, expected):
    path = tmp_path / "index.json"
    if setup == "invalid":
        path.write_text("{broken", encoding="utf-8")
    elif setup == "model":
        chunks = parse_knowledge_file(_write(tmp_path / "doc.md", _sample_doc()))
        data = _index(chunks)
        data["embedding"]["model"] = "other"
        _write_index(path, data)
    result = KnowledgeRetriever(path, FakeEmbedding()).search("nước")
    assert result.available is False
    assert result.reason == expected
    assert result.hits == ()


def test_retriever_degrades_for_embedding_error_and_dimension(tmp_path):
    chunks = parse_knowledge_file(_write(tmp_path / "doc.md", _sample_doc()))
    path = _write_index(tmp_path / "index.json", _index(chunks))
    unavailable = KnowledgeRetriever(
        path,
        FakeEmbedding(error=TimeoutError("ollama down")),
    ).search("nước")
    assert unavailable.reason == "embedding_unavailable"

    mismatch = KnowledgeRetriever(path, FakeEmbedding((1.0, 0.0, 0.0))).search("nước")
    assert mismatch.reason == "dimension_mismatch"


def test_retriever_degrades_for_model_digest_change_or_tags_failure(tmp_path):
    chunks = parse_knowledge_file(_write(tmp_path / "doc.md", _sample_doc()))
    path = _write_index(tmp_path / "index.json", _index(chunks))

    changed = KnowledgeRetriever(path, FakeEmbedding(digest="b" * 64)).search("nước")
    assert changed.reason == "model_mismatch"
    assert changed.hits == ()

    tags_down = KnowledgeRetriever(
        path,
        FakeEmbedding(digest_error=TimeoutError("tags unavailable")),
    ).search("nước")
    assert tags_down.reason == "embedding_unavailable"
    assert tags_down.hits == ()


def test_retriever_recovers_after_transient_tags_failure(tmp_path):
    chunks = parse_knowledge_file(_write(tmp_path / "doc.md", _sample_doc()))
    path = _write_index(tmp_path / "index.json", _index(chunks))
    provider = FakeEmbedding(digest_error=TimeoutError("ollama starting"))
    retriever = KnowledgeRetriever(path, provider, min_score=-1, high_confidence_score=-1)

    first = retriever.search("nước sạch")
    assert first.reason == "embedding_unavailable"

    provider.digest_error = None
    provider.digest = "a" * 64
    second = retriever.search("nước sạch")
    assert second.available is True
    assert second.hits


def test_quantity_queries_do_not_bypass_topic_answerability(tmp_path):
    doc = f"""## Nước tối thiểu cho uống và vệ sinh sinh hoạt
Mức tối thiểu là 15 lít mỗi người mỗi ngày cho uống và vệ sinh sinh hoạt.
{_SOURCE}
"""
    chunks = parse_knowledge_file(_write(tmp_path / "water.md", doc))
    path = _write_index(tmp_path / "index.json", _index(chunks))
    retriever = KnowledgeRetriever(
        path,
        FakeEmbedding((1.0, 0.0)),
        min_score=0.5,
        high_confidence_score=1.1,
    )
    assert retriever.search("Bao nhiêu người được đi qua nước xiết?").hits == ()
    assert retriever.search("Cần bao nhiêu lít nước mặn để sơ cứu đuối nước?").hits == ()
    assert retriever.search("Cần uống 15 viên thuốc mỗi ngày phải không?").hits == ()


def test_retriever_query_empty_does_not_load_index_or_call_provider(tmp_path):
    provider = FakeEmbedding()
    result = KnowledgeRetriever(tmp_path / "missing.json", provider).search("   ")
    assert result.reason == "query_empty"
    assert provider.calls == []

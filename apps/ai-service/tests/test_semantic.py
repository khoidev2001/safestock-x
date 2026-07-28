from providers.embedding import EmbeddingProvider
from semantic import SemanticCandidate, SemanticRanker


class FakeEmbedding(EmbeddingProvider):
    name = "fake"
    model = "semantic-test"
    input_transform = "test-v1"

    def __init__(self, *, fail: bool = False):
        self.fail = fail
        self.calls: list[tuple[list[str], str]] = []

    def embed(self, texts, *, task):
        self.calls.append((texts, task))
        if self.fail:
            raise TimeoutError("offline")
        if task == "query":
            return [[1.0, 0.0] for _ in texts]
        vectors = {
            "chăn cứu trợ giữ ấm trẻ em": [0.98, 0.02],
            "áo phao cứu sinh": [0.45, 0.55],
            "gạo cứu trợ": [0.05, 0.95],
        }
        return [vectors[text] for text in texts]


def test_ranker_returns_semantic_order_and_threshold():
    provider = FakeEmbedding()
    ranker = SemanticRanker(provider)
    result = ranker.rank(
        "đồ giữ ấm cho trẻ",
        [
            SemanticCandidate("blanket", "chăn cứu trợ giữ ấm trẻ em"),
            SemanticCandidate("life", "áo phao cứu sinh"),
            SemanticCandidate("rice", "gạo cứu trợ"),
        ],
        top_k=2,
        min_score=0.3,
    )

    assert result.available is True
    assert [hit.id for hit in result.hits] == ["blanket", "life"]
    assert result.hits[0].score > result.hits[1].score


def test_ranker_caches_document_vectors_but_not_query():
    provider = FakeEmbedding()
    ranker = SemanticRanker(provider)
    candidates = [SemanticCandidate("blanket", "chăn cứu trợ giữ ấm trẻ em")]

    ranker.rank("giữ ấm", candidates)
    ranker.rank("trẻ bị lạnh", candidates)

    assert provider.calls == [
        (["giữ ấm"], "query"),
        (["chăn cứu trợ giữ ấm trẻ em"], "document"),
        (["trẻ bị lạnh"], "query"),
    ]


def test_ranker_degrades_without_leaking_embedding_error():
    result = SemanticRanker(FakeEmbedding(fail=True)).rank(
        "giữ ấm",
        [SemanticCandidate("blanket", "chăn cứu trợ giữ ấm trẻ em")],
    )
    assert result.available is False
    assert result.reason == "embedding_unavailable"
    assert result.hits == ()

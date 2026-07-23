"""Build/check knowledge_index.json từ docs/knowledge/*.md.

Build cần Ollama + nomic-embed-text. `--check` chỉ đọc corpus/index, không gọi model;
dùng trong CI để bắt index stale sau khi sửa tài liệu.
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv

AI_DIR = Path(__file__).resolve().parent.parent
REPO_ROOT = AI_DIR.parent.parent
CORPUS_DIR = REPO_ROOT / "docs" / "knowledge"
INDEX_PATH = AI_DIR / "knowledge_index.json"
sys.path.insert(0, str(AI_DIR))
load_dotenv(REPO_ROOT / ".env")

from knowledge import (  # noqa: E402
    SCHEMA_VERSION,
    KnowledgeValidationError,
    corpus_sha256,
    load_corpus,
    validate_index,
    verify_index_matches_corpus,
)
from providers.factory import build_embedding_provider  # noqa: E402


def build_index(corpus_dir: Path = CORPUS_DIR, index_path: Path = INDEX_PATH) -> dict:
    chunks = load_corpus(corpus_dir)
    provider = build_embedding_provider()
    digest = provider.model_digest()
    if digest is None:
        raise KnowledgeValidationError("Embedding provider không cung cấp model digest")
    vectors = provider.embed(
        [f"{chunk.heading}\n{chunk.text}" for chunk in chunks],
        task="document",
    )
    if not vectors:
        raise KnowledgeValidationError("Embedding provider không trả vector")
    dimension = len(vectors[0])

    data = {
        "schemaVersion": SCHEMA_VERSION,
        "builtAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "embedding": {
            "provider": provider.name,
            "model": provider.model,
            "digest": digest,
            "dimension": dimension,
            "inputTransform": provider.input_transform,
        },
        "corpus": {
            "contentSha256": corpus_sha256(chunks),
            "chunkCount": len(chunks),
        },
        "chunks": [
            chunk.to_index_dict(vector)
            for chunk, vector in zip(chunks, vectors, strict=True)
        ],
    }
    validate_index(
        data,
        provider_name=provider.name,
        model=provider.model,
        input_transform=provider.input_transform,
        model_digest=digest,
    )
    index_path.write_text(
        json.dumps(data, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    return data


def check_index(corpus_dir: Path = CORPUS_DIR, index_path: Path = INDEX_PATH) -> dict:
    chunks = load_corpus(corpus_dir)
    if not index_path.exists():
        raise KnowledgeValidationError("index_missing")
    try:
        data = json.loads(index_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise KnowledgeValidationError("index_invalid") from exc

    # Khởi tạo provider chỉ đọc env, KHÔNG gọi HTTP/model. Nhờ vậy đổi model/
    # input transform mà quên rebuild index sẽ bị bắt ngay trước demo.
    provider = build_embedding_provider()
    validated = validate_index(
        data,
        provider_name=provider.name,
        model=provider.model,
        input_transform=provider.input_transform,
    )
    verify_index_matches_corpus(validated, chunks)
    return validated


def main() -> int:
    parser = argparse.ArgumentParser(description="Build/check RAG knowledge index")
    parser.add_argument("--check", action="store_true", help="Chỉ kiểm index đã commit, không gọi Ollama")
    parser.add_argument("--corpus-dir", type=Path, default=CORPUS_DIR)
    parser.add_argument("--index-path", type=Path, default=INDEX_PATH)
    args = parser.parse_args()
    try:
        data = (
            check_index(args.corpus_dir, args.index_path)
            if args.check
            else build_index(args.corpus_dir, args.index_path)
        )
    except (KnowledgeValidationError, OSError, RuntimeError, ValueError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1

    action = "Index hợp lệ" if args.check else "Đã build index"
    print(
        f"{action}: {data['corpus']['chunkCount']} chunks, "
        f"{data['embedding']['model']} ({data['embedding']['dimension']} chiều)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

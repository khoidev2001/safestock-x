"""Schema Pydantic — validate output AI (không tin AI, §14)."""
from enum import Enum
from typing import Any, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator


class IncidentType(str, Enum):
    FLOOD = "FLOOD"
    STORM = "STORM"
    LANDSLIDE = "LANDSLIDE"
    FIRE = "FIRE"
    ISOLATION = "ISOLATION"
    OTHER = "OTHER"


class Priority(str, Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class ParsedIncident(BaseModel):
    """Tình huống đã trích xuất từ mô tả ngôn ngữ tự nhiên."""
    incidentType: IncidentType
    location: Optional[str] = None
    affectedPeople: int = Field(ge=0, le=1_000_000)
    durationHours: int = Field(ge=0, le=8760)
    children: int = Field(default=0, ge=0)
    elderly: int = Field(default=0, ge=0)
    medicalSupportCases: int = Field(default=0, ge=0)
    priority: Priority = Priority.MEDIUM


class ParseRequest(BaseModel):
    description: str = Field(min_length=5, max_length=2000)


# ===== Situation analysis extraction (AI-2.1) =====
# The AI service may extract only text-grounded facts. Backend owns every
# inventory, routing, forecast and allocation calculation.

SituationFactKey = Literal[
    "LOCATION",
    "AFFECTED_PEOPLE",
    "HOUSEHOLDS",
    "INCIDENT_TYPE",
    "WEATHER",
    "ISOLATION_RISK",
    "PEOPLE_STRANDED",
    "VULNERABLE_GROUP",
    "ACCESS_CONDITION",
    "DURATION_HOURS",
    "OTHER",
]


class SituationAnalysisRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    description: str = Field(min_length=5, max_length=4_000)
    sourceId: str = Field(min_length=1, max_length=128)
    sourceType: Literal["USER_REPORT", "FIELD_UPDATE"] = "USER_REPORT"
    capturedAt: Optional[str] = Field(default=None, max_length=64)


class SituationFactSource(BaseModel):
    model_config = ConfigDict(extra="forbid")

    sourceType: Literal["USER_REPORT", "FIELD_UPDATE"]
    sourceId: str = Field(min_length=1, max_length=128)
    excerpt: str = Field(min_length=1, max_length=1_000)
    capturedAt: Optional[str] = Field(default=None, max_length=64)


class SituationExtractedFact(BaseModel):
    """A fact must declare whether it was reported, inferred, or is missing."""

    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1, max_length=128)
    key: SituationFactKey
    provenance: Literal["REPORTED", "AI_INFERENCE", "MISSING"]
    value: Any = None
    qualifier: Optional[Literal["EXACT", "APPROXIMATE", "POSSIBLE", "UNSPECIFIED"]] = None
    source: Optional[SituationFactSource] = None
    confidence: Optional[float] = Field(default=None, ge=0, le=1)
    basisFactIds: List[str] = Field(default_factory=list, max_length=20)
    explanation: Optional[str] = Field(default=None, max_length=1_000)
    question: Optional[str] = Field(default=None, max_length=500)
    impact: Optional[str] = Field(default=None, max_length=500)

    @model_validator(mode="after")
    def validate_provenance_shape(self) -> "SituationExtractedFact":
        if self.provenance == "REPORTED":
            if self.value is None or self.source is None or self.qualifier is None:
                raise ValueError("REPORTED fact requires value, source and qualifier")
            if self.confidence is not None or self.basisFactIds or self.explanation is not None:
                raise ValueError("REPORTED fact cannot contain inference fields")
        elif self.provenance == "AI_INFERENCE":
            if self.value is None or not self.basisFactIds or not self.explanation:
                raise ValueError("AI_INFERENCE fact requires value, basisFactIds and explanation")
            # M4: khớp InferredCoordinationFact (TS) yêu cầu confidence: number bắt buộc.
            if self.confidence is None:
                raise ValueError("AI_INFERENCE fact requires a confidence score")
            if self.source is not None or self.qualifier is not None:
                raise ValueError("AI_INFERENCE fact cannot contain a report source")
        else:
            if self.value is not None or self.source is not None or not self.question or not self.impact:
                raise ValueError("MISSING fact requires question and impact only")
            if self.qualifier is not None or self.confidence is not None or self.basisFactIds or self.explanation:
                raise ValueError("MISSING fact cannot contain reported or inference fields")
        return self


class SituationMissingData(BaseModel):
    model_config = ConfigDict(extra="forbid")

    key: SituationFactKey
    question: str = Field(min_length=1, max_length=500)
    impact: str = Field(min_length=1, max_length=500)


class SituationConflict(BaseModel):
    model_config = ConfigDict(extra="forbid")

    key: SituationFactKey
    factIds: List[str] = Field(min_length=2, max_length=10)
    question: str = Field(min_length=1, max_length=500)


class SituationPriorityQuestion(BaseModel):
    model_config = ConfigDict(extra="forbid")

    factKey: SituationFactKey
    question: str = Field(min_length=1, max_length=500)
    expectedImpact: str = Field(min_length=1, max_length=500)


class SituationExtraction(BaseModel):
    """Strict NLP-only output; no recommendation or operational calculation."""

    model_config = ConfigDict(extra="forbid")

    schemaVersion: Literal["situation-extraction.v1"]
    facts: List[SituationExtractedFact] = Field(min_length=1, max_length=30)
    missingData: List[SituationMissingData] = Field(default_factory=list, max_length=12)
    conflicts: List[SituationConflict] = Field(default_factory=list, max_length=8)
    priorityQuestion: Optional[SituationPriorityQuestion] = None

    @model_validator(mode="after")
    def validate_references(self) -> "SituationExtraction":
        fact_ids = [fact.id for fact in self.facts]
        if len(fact_ids) != len(set(fact_ids)):
            raise ValueError("fact ids must be unique")
        known_ids = set(fact_ids)
        for fact in self.facts:
            if fact.provenance == "AI_INFERENCE" and not set(fact.basisFactIds).issubset(known_ids):
                raise ValueError("inference basisFactIds must reference returned facts")
        for conflict in self.conflicts:
            if not set(conflict.factIds).issubset(known_ids):
                raise ValueError("conflict factIds must reference returned facts")
        return self


# ===== Field assistant intent extraction (AI-4.3) =====
# This is deliberately an evidence classifier, not a dispatch/replanning API.
FieldUpdateIntentKind = Literal[
    "ARRIVED",
    "ACCESS_BLOCKED",
    "ROUTE_HAZARD",
    "AFFECTED_PEOPLE_CHANGED",
    "VULNERABLE_GROUP_REPORTED",
    "MORE_SUPPLIES_NEEDED",
    "SUPPLIES_RECEIVED",
    "SUPPLIES_DELIVERED",
    "CANNOT_CONTINUE",
    "SITUATION_STABLE",
    "OTHER",
]


class FieldUpdateIntentRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    confirmedText: str = Field(min_length=1, max_length=4_000)
    sourceId: str = Field(min_length=1, max_length=128)
    capturedAt: Optional[str] = Field(default=None, max_length=64)


class FieldUpdateIntentExtraction(BaseModel):
    """AI labels confirmed field evidence; every result still needs ADMIN review."""

    model_config = ConfigDict(extra="forbid")

    schemaVersion: Literal["field-update-intent.v1"]
    kind: FieldUpdateIntentKind
    confidence: float = Field(ge=0, le=1)
    sourceExcerpt: str = Field(min_length=1, max_length=1_000)
    requiresAdminVerification: Literal[True]
    facts: List[SituationExtractedFact] = Field(min_length=1, max_length=30)
    resolvedReferenceIds: List[str] = Field(default_factory=list, max_length=0)
    unresolvedReferences: List[str] = Field(default_factory=list, max_length=12)

    @model_validator(mode="after")
    def validate_fact_references(self) -> "FieldUpdateIntentExtraction":
        fact_ids = [fact.id for fact in self.facts]
        if len(fact_ids) != len(set(fact_ids)):
            raise ValueError("fact ids must be unique")
        known_ids = set(fact_ids)
        for fact in self.facts:
            if fact.provenance == "AI_INFERENCE" and not set(fact.basisFactIds).issubset(known_ids):
                raise ValueError("inference basisFactIds must reference returned facts")
        return self


class ExplainRequest(BaseModel):
    """Giải thích phương án — nhận dữ liệu ĐÃ TÍNH từ backend, AI chỉ diễn đạt."""
    context: str = Field(min_length=5, max_length=8000)


# ===== Incident Action Plan (Kế hoạch hành động cứu hộ) =====
# Nguyên tắc: số (severity, forecasts, vật tư, kho, %, ETA) do BACKEND chấm/tính
# rồi truyền vào context. LLM CHỈ viết phần diễn giải định tính (mục tiêu, phương
# án theo giai đoạn, cảnh báo, câu hỏi bổ sung). LLM không đổi số.

class ActionPlanRequest(BaseModel):
    """Context đã tính sẵn từ backend (JSON-serialized) để LLM sinh phần diễn giải."""
    context: str = Field(min_length=5, max_length=12000)


class ActionPlanNarrative(BaseModel):
    """Phần LLM VIẾT — chỉ định tính, không số liệu tồn kho.

    KHÔNG còn khoá `phases`: bản chia việc theo ba khung 0-2h / 2-6h / 6-24h đã bỏ
    khỏi kế hoạch cứu hộ. Ba khung đó cố định cho mọi tình huống nên nội dung sinh
    ra lặp lại gần như nguyên văn giữa các nhiệm vụ, trong khi mục tiêu và cảnh báo
    mới là phần bám vào tình huống thật. Bỏ luôn ở đây chứ không chỉ giấu trên giao
    diện: còn trong schema là còn bắt mô hình viết, tốn thêm lượt sinh cho một khối
    không ai đọc.
    """
    model_config = ConfigDict(extra="forbid")

    objectives: List[str] = Field(min_length=3, max_length=5)  # mục tiêu 6h đầu
    warnings: List[str] = Field(min_length=1)
    followUpQuestions: List[str] = Field(min_length=1)


# ===== Chatbot hỏi-đáp kho (context injection) =====
# Backend chụp snapshot JSON kho (tồn/readiness/sự cố) → LLM CHỈ trả lời dựa trên
# snapshot đó, ngoài phạm vi thì nói "không biết". Không tự bịa, không tra ngoài.

class AssistantRequest(BaseModel):
    question: str = Field(min_length=2, max_length=500)
    snapshot: str = Field(min_length=2, max_length=16000)  # JSON kho serialized


class AssistantAnswer(BaseModel):
    answer: str


class AssistantRagDraft(BaseModel):
    """LLM chỉ chọn câu evidence; ai-service render nguyên văn + nguồn thật."""

    model_config = ConfigDict(extra="forbid")
    evidenceIds: list[str] = Field(default_factory=list, max_length=8)


class AssistantPlainDraft(BaseModel):
    """Luồng không có RAG: cờ ngoài phạm vi giúp bỏ văn model thừa một cách chắc chắn."""

    answer: str = Field(min_length=1, max_length=4000)
    outOfScope: bool


class KnowledgeSearchRequest(BaseModel):
    query: str = Field(min_length=2, max_length=500)
    topK: int = Field(default=3, ge=1, le=5)


class KnowledgeSourceAnswer(BaseModel):
    title: str
    locator: str
    url: str
    accessedAt: str


class KnowledgeHitAnswer(BaseModel):
    id: str
    document: str
    heading: str
    score: float
    preview: str
    sources: list[KnowledgeSourceAnswer]


class KnowledgeSearchAnswer(BaseModel):
    available: bool
    reason: str | None = None
    indexVersion: int | None = None
    model: str | None = None
    hits: list[KnowledgeHitAnswer]


# ===== Xếp hạng catalog bằng embedding (B5 semantic search + B7 chuẩn hóa) =====

class SemanticCandidateInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1, max_length=128)
    text: str = Field(min_length=1, max_length=1000)


class SemanticRankRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    query: str = Field(min_length=2, max_length=500)
    candidates: list[SemanticCandidateInput] = Field(min_length=1, max_length=500)
    topK: int = Field(default=5, ge=1, le=20)
    minScore: float = Field(default=0.35, ge=-1, le=1)


class SemanticRankHitAnswer(BaseModel):
    id: str
    score: float


class SemanticRankAnswer(BaseModel):
    available: bool
    reason: str | None = None
    hits: list[SemanticRankHitAnswer]


class BriefingFactInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(pattern=r"^F\d+$")
    text: str = Field(min_length=1, max_length=1000)


class BriefingSelectRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    facts: list[BriefingFactInput] = Field(min_length=1, max_length=12)


class BriefingSelection(BaseModel):
    model_config = ConfigDict(extra="forbid")

    factIds: list[str] = Field(min_length=1, max_length=12)


# ===== Nhận dạng giọng nói (ASR) — PhoWhisper local, offline =====
# Frontend ghi âm → mã hoá WAV 16kHz mono → base64 → gửi lên. ai-service giải mã +
# chạy PhoWhisper (GPU nếu có). Text trả về để người dùng XEM LẠI & SỬA trước khi parse.

class TranscribeRequest(BaseModel):
    audioBase64: str = Field(min_length=16, max_length=20_000_000)  # ~15MB base64 ≈ vài chục giây audio
    mimeType: str = Field(default="audio/wav", max_length=64)


class TranscribeAnswer(BaseModel):
    text: str

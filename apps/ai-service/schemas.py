"""Schema Pydantic — validate output AI (không tin AI, §14)."""
from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, Field


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


class PhasePlan(BaseModel):
    window: str  # "0-2h" | "2-6h" | "6-24h"
    actions: List[str] = Field(min_length=1)


class ActionPlanNarrative(BaseModel):
    """Phần LLM VIẾT — chỉ định tính, không số liệu tồn kho."""
    objectives: List[str] = Field(min_length=1)  # mục tiêu 6h đầu
    phases: List[PhasePlan] = Field(min_length=1)  # phương án theo giai đoạn
    warnings: List[str] = Field(default_factory=list)  # cảnh báo nguy cơ
    followUpQuestions: List[str] = Field(default_factory=list)  # câu hỏi bổ sung

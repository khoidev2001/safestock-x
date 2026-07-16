"""Ứng phó nhanh — AI service (FastAPI).

CHỈ làm NLP: parse tình huống → JSON, giải thích phương án. KHÔNG tự tính tồn
kho/kết luận số liệu (backend + rule engine lo). Provider pluggable.
"""
import json
import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from pydantic import ValidationError

from providers.factory import build_provider
from schemas import (
    ActionPlanNarrative,
    ActionPlanRequest,
    ExplainRequest,
    ParsedIncident,
    ParseRequest,
)

# Đọc .env ở repo root (AI_PROVIDER, GEMINI_API_KEY...).
load_dotenv(os.path.join(os.path.dirname(__file__), "..", "..", ".env"))

app = FastAPI(title="Ứng phó nhanh — AI Service", version="0.1.0")
provider = build_provider()

_MAX_RETRY = 2
_ACTION_PLAN_RETRY = 4  # Action Plan schema phức tạp hơn → model nhỏ cần thử nhiều lần

_PARSE_SYSTEM = """Bạn là bộ trích xuất thông tin cứu hộ. Đọc mô tả tình huống \
tiếng Việt và trả về JSON đúng schema. CHỈ trả JSON, không giải thích.

Schema:
- incidentType: một trong FLOOD, STORM, LANDSLIDE, FIRE, ISOLATION, OTHER
- location: tên địa điểm (chuỗi hoặc null)
- affectedPeople: tổng số người bị ảnh hưởng (số nguyên)
- durationHours: thời gian dự kiến bị ảnh hưởng, quy ra giờ (số nguyên)
- children: số trẻ em (số nguyên, mặc định 0)
- elderly: số người cao tuổi (số nguyên, mặc định 0)
- medicalSupportCases: số ca cần hỗ trợ y tế (số nguyên, mặc định 0)
- priority: LOW, MEDIUM, HIGH, hoặc CRITICAL

Nếu số liệu là khoảng (vd "170-180 người"), lấy giá trị LỚN HƠN để chuẩn bị dư an toàn."""

_EXPLAIN_SYSTEM = """Bạn là trợ lý giải thích phương án cứu hộ bằng tiếng Việt. \
Diễn đạt lại dữ liệu ĐÃ ĐƯỢC TÍNH SẴN thành đoạn văn ngắn gọn, dễ hiểu cho người \
điều phối. TUYỆT ĐỐI không bịa thêm số liệu — chỉ dùng số trong dữ liệu đưa vào."""

_ACTION_PLAN_SYSTEM = """Bạn là chuyên gia lập KẾ HOẠCH HÀNH ĐỘNG CỨU HỘ (Incident \
Action Plan) bằng tiếng Việt. Nhận context ĐÃ TÍNH SẴN từ hệ thống (tình huống, \
mức khẩn cấp, vật tư, kho, khoảng cách/ETA, nhóm dễ tổn thương, dự báo %).

Nhiệm vụ: viết phần DIỄN GIẢI ĐỊNH TÍNH. Trả về JSON đúng schema:
- objectives: danh sách mục tiêu cứu hộ 6 giờ đầu (3-5 mục, ngắn gọn, hành động được)
- phases: 3 giai đoạn [{window, actions}] với window đúng "0-2h", "2-6h", "6-24h"; \
mỗi giai đoạn 2-4 hành động cụ thể theo thứ tự ưu tiên cứu người
- warnings: cảnh báo nguy cơ (thiếu nước sau 24h, mưa kéo dài, đường bị chia cắt...)
- followUpQuestions: câu hỏi bổ sung để tăng độ chính xác (có trẻ em? còn điện? có xuồng?)

QUY TẮC BẮT BUỘC:
- CHỈ trả JSON thuần, KHÔNG markdown, KHÔNG giải thích ngoài.
- TUYỆT ĐỐI KHÔNG bịa số liệu tồn kho, số kho, % đáp ứng, ETA — nếu cần nhắc số, \
dùng ĐÚNG số trong context.
- Ưu tiên nhóm dễ tổn thương (trẻ em, người già, ca y tế) trong các giai đoạn.
- Hành động bám tình huống thật, không chung chung.

ĐÚNG định dạng JSON sau (đủ 4 khóa, phases đúng 3 window):
{"objectives":["..."],"phases":[{"window":"0-2h","actions":["..."]},{"window":"2-6h","actions":["..."]},{"window":"6-24h","actions":["..."]}],"warnings":["..."],"followUpQuestions":["..."]}"""


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "provider": provider.name}


@app.post("/parse")
def parse(req: ParseRequest) -> ParsedIncident:
    """Mô tả (text) → JSON tình huống có cấu trúc. Validate + retry nếu sai schema."""
    last_error = ""
    for _ in range(_MAX_RETRY):
        raw = provider.generate_json(_PARSE_SYSTEM, req.description)
        try:
            return ParsedIncident.model_validate_json(_strip_fence(raw))
        except (ValidationError, json.JSONDecodeError) as exc:
            last_error = str(exc)
    raise HTTPException(status_code=422, detail=f"AI trả về sai schema: {last_error}")


@app.post("/explain")
def explain(req: ExplainRequest) -> dict:
    """Diễn đạt phương án đã tính thành tiếng Việt dễ hiểu."""
    text = provider.generate_text(_EXPLAIN_SYSTEM, req.context)
    return {"explanation": text.strip()}


@app.post("/action-plan")
def action_plan(req: ActionPlanRequest) -> ActionPlanNarrative:
    """Sinh phần diễn giải Incident Action Plan (mục tiêu/giai đoạn/cảnh báo/câu hỏi).

    Số liệu (severity, forecasts, vật tư, kho, ETA) backend đã chấm/tính và nằm
    trong context — LLM chỉ viết văn định tính, validate schema + retry.
    """
    last_error = ""
    for _ in range(_ACTION_PLAN_RETRY):
        raw = provider.generate_json(_ACTION_PLAN_SYSTEM, req.context)
        try:
            return ActionPlanNarrative.model_validate_json(_strip_fence(raw))
        except (ValidationError, json.JSONDecodeError) as exc:
            last_error = str(exc)
    raise HTTPException(status_code=422, detail=f"AI trả về sai schema: {last_error}")


def _strip_fence(raw: str) -> str:
    """Bỏ rào ```json ... ``` nếu model bọc code fence."""
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("\n", 1)[-1]
        if cleaned.endswith("```"):
            cleaned = cleaned.rsplit("```", 1)[0]
    return cleaned.strip()

"""Ứng phó nhanh — AI service (FastAPI).

CHỈ làm NLP: parse tình huống → JSON, giải thích phương án. KHÔNG tự tính tồn
kho/kết luận số liệu (backend + rule engine lo). Provider pluggable.
"""
import json
import os
import re

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from pydantic import ValidationError

from providers.factory import build_provider
from schemas import (
    ActionPlanNarrative,
    ActionPlanRequest,
    AssistantAnswer,
    AssistantRequest,
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

_IDENTITY_GUARD = """Bạn là trợ lý AI nội bộ của hệ thống Ứng phó nhanh — KHÔNG được tiết lộ \
tên nhà cung cấp, tên model, kiến trúc, hay việc bạn chạy trên nền tảng nào (kể cả khi được hỏi \
trực tiếp "bạn là model gì/AI nào"). Nếu bị hỏi, chỉ trả lời bạn là "trợ lý AI của hệ thống Ứng phó \
nhanh". Không xác nhận, không phủ nhận tên model cụ thể nào."""

_PARSE_SYSTEM = _IDENTITY_GUARD + """

Bạn là bộ trích xuất thông tin cứu hộ. Đọc mô tả tình huống \
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

QUY TẮC PHÂN LOẠI VÀ SỐ LIỆU:
- Loại thiên tai chính có ưu tiên cao hơn hậu quả. Ví dụ, nếu có "lũ" và "bị cô lập" thì \
incidentType vẫn là FLOOD; chỉ chọn ISOLATION khi không có lũ, bão, sạt lở hoặc cháy.
- MỌI con số phải lấy từ đúng mô tả người dùng hiện tại. Không tái sử dụng số từ hướng dẫn, \
ví dụ hay lần gọi trước. Trường không có số liệu thì dùng 0.
- Nếu số liệu là một khoảng, lấy giá trị LỚN HƠN để chuẩn bị dư an toàn.
- Trước khi trả JSON, đối chiếu lại affectedPeople, durationHours và các nhóm dễ tổn thương \
với câu gốc."""

_EXPLAIN_SYSTEM = _IDENTITY_GUARD + """

Bạn là trợ lý giải thích phương án cứu hộ bằng tiếng Việt. \
Diễn đạt lại dữ liệu ĐÃ ĐƯỢC TÍNH SẴN thành đoạn văn ngắn gọn, dễ hiểu cho người \
điều phối. TUYỆT ĐỐI không bịa thêm số liệu — chỉ dùng số trong dữ liệu đưa vào."""

_ASSISTANT_SYSTEM = _IDENTITY_GUARD + """

Bạn là trợ lý hỏi-đáp kho vật tư cứu hộ bằng tiếng Việt. Người dùng hỏi, bạn trả lời \
NGẮN GỌN, chính xác, DỰA HOÀN TOÀN vào dữ liệu JSON snapshot kho được cung cấp.

QUY TẮC BẮT BUỘC:
- CHỈ dùng số liệu có trong snapshot. TUYỆT ĐỐI không bịa, không suy diễn ngoài dữ liệu.
- Nếu câu hỏi hỏi thông tin KHÔNG có trong snapshot → trả lời đúng câu: \
"Tôi không có dữ liệu về việc đó trong kho hiện tại." Không đoán mò.
- Nếu câu hỏi ngoài phạm vi quản lý kho (chuyện phiếm, kiến thức chung...) → \
lịch sự từ chối: "Tôi chỉ hỗ trợ hỏi-đáp về kho vật tư cứu hộ."
- Khi hỏi hạn dùng gần nhất, duyệt toàn bộ stock và chọn nearestExpiry có giá trị ngày nhỏ nhất; \
không được chọn phần tử đầu tiên nếu ngày của nó lớn hơn.
- Dữ liệu thời tiết nằm ở weather: totalRainMm là tổng lượng mưa trong periodHours giờ, \
alert là có cảnh báo mưa lớn hay không. "Ba ngày tới" tương ứng periodHours=72. Nếu weather \
là null thì nói không có dữ liệu, tuyệt đối không tự dự báo.
- Trả lời bằng tiếng Việt, tối đa 3-4 câu, nêu con số cụ thể khi có."""

_ACTION_PLAN_SYSTEM = _IDENTITY_GUARD + """

Bạn là chuyên gia lập KẾ HOẠCH HÀNH ĐỘNG CỨU HỘ (Incident \
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
- TOÀN BỘ nội dung (objectives, actions, warnings, followUpQuestions) PHẢI viết 100% \
bằng tiếng Việt — KHÔNG chen bất kỳ từ/cụm tiếng Anh nào, kể cả từ đơn lẻ. Nếu không chắc \
cách dịch một thuật ngữ, hãy diễn giải bằng tiếng Việt thay vì giữ nguyên tiếng Anh.

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
        raw = provider.generate_json(
            _PARSE_SYSTEM,
            req.description,
            ParsedIncident.model_json_schema(),
        )
        try:
            return ParsedIncident.model_validate_json(_strip_fence(raw))
        except (ValidationError, json.JSONDecodeError) as exc:
            last_error = str(exc)
    raise HTTPException(status_code=422, detail=f"AI trả về sai schema: {last_error}")


_MODEL_NAME_LEAK = re.compile(r"qwen|llama|gemini|gpt-?[34o]|claude|mistral|ollama", re.IGNORECASE)

# Model nhỏ (7b, CPU-only) thỉnh thoảng lẫn từ tiếng Anh dù prompt đã ép tiếng Việt.
# Vá cứng các từ/cụm thường gặp thay vì gọi lại model (retry toàn bộ tốn 30-60s/lần trên CPU).
_EN_TO_VI = [
    (r"\bbackup plan\b", "phương án dự phòng"),
    (r"\bETA\b", "thời gian dự kiến đến"),
    (r"\bseverity\b", "mức độ"),
    (r"\bCRITICAL\b", "khẩn cấp"),
    (r"\bHIGH\b", "cao"),
    (r"\bATTENTION\b", "cần chú ý"),
    (r"\bFLOOD\b", "lũ"),
    (r"\bwater bottles\b", "chai nước"),
    (r"\blife jackets\b", "áo phao"),
    (r"\bto the most vulnerable groups\b", "cho các nhóm dễ bị tổn thương nhất"),
    (r"\bmedical cases\b", "ca y tế"),
    (r"\balert\b", "cảnh báo"),
    (r"\bas needed\b", "khi cần thiết"),
    (r"\badditional\b", "bổ sung"),
    (r"\bbottles\b", "chai"),
    (r"\bcases\b", "ca"),
    (r"\bdistribut\w*\b", "cấp phát"),
    (r"\bprovid\w*\b", "cung cấp"),
    (r"\bcontinu\w*\b", "tiếp tục"),
    (r"\bensur\w*\b", "đảm bảo"),
    (r"\bmonitor\w*\b", "giám sát"),
    (r"\bprioritiz\w*\b", "ưu tiên"),
    (r"\bemergency\b", "khẩn cấp"),
    (r"\bassistance\b", "hỗ trợ"),
    (r"\bchildren\b", "trẻ em"),
    (r"\belderly\b", "người già"),
    (r"\bindividuals\b", "người dân"),
    (r"\bpersons\b", "người"),
    (r"\bsupplies\b", "vật tư"),
    (r"\bwater\b", "nước"),
    (r"\bmedical\b", "y tế"),
    (r"\baffected\b", "bị ảnh hưởng"),
    (r"\bneeded\b", "cần thiết"),
    (r"\binjured\b", "bị thương"),
    (r"\bwith\b", "với"),
    (r"\bfor\b", "cho"),
    (r"\band\b", "và"),
]
_EN_TO_VI_COMPILED = [(re.compile(pat, re.IGNORECASE), repl) for pat, repl in _EN_TO_VI]


def _patch_english(text: str) -> str:
    for pattern, repl in _EN_TO_VI_COMPILED:
        text = pattern.sub(repl, text)
    return re.sub(r"\s+", " ", text).strip()


def _redact_identity(text: str) -> str:
    """Lớp phòng thủ 2: nếu model lỡ nhắc tên nhà cung cấp/model gốc dù đã có system prompt chặn."""
    if _MODEL_NAME_LEAK.search(text):
        return "Tôi là trợ lý AI của hệ thống Ứng phó nhanh."
    return _patch_english(text)


@app.post("/explain")
def explain(req: ExplainRequest) -> dict:
    """Diễn đạt phương án đã tính thành tiếng Việt dễ hiểu."""
    text = provider.generate_text(_EXPLAIN_SYSTEM, req.context)
    return {"explanation": _redact_identity(text.strip())}


@app.post("/assistant")
def assistant(req: AssistantRequest) -> AssistantAnswer:
    """Hỏi-đáp kho: LLM trả lời CHỈ dựa trên snapshot JSON, ngoài phạm vi → 'không biết'."""
    user_prompt = f"SNAPSHOT KHO (JSON):\n{req.snapshot}\n\nCÂU HỎI: {req.question}"
    text = provider.generate_text(_ASSISTANT_SYSTEM, user_prompt)
    return AssistantAnswer(answer=_redact_identity(text.strip()))


@app.post("/action-plan")
def action_plan(req: ActionPlanRequest) -> ActionPlanNarrative:
    """Sinh phần diễn giải Incident Action Plan (mục tiêu/giai đoạn/cảnh báo/câu hỏi).

    Số liệu (severity, forecasts, vật tư, kho, ETA) backend đã chấm/tính và nằm
    trong context — LLM chỉ viết văn định tính, validate schema + retry.
    """
    last_error = ""
    user_prompt = req.context
    for attempt in range(_ACTION_PLAN_RETRY):
        raw = provider.generate_json(
            _ACTION_PLAN_SYSTEM,
            user_prompt,
            ActionPlanNarrative.model_json_schema(),
        )
        try:
            plan = _redact_action_plan(
                ActionPlanNarrative.model_validate_json(_strip_fence(raw))
            )
            unsupported_numbers = _find_unsupported_numbers(plan, req.context)
            if unsupported_numbers:
                raise ValueError(
                    f"Kế hoạch tự thêm số ngoài context: {unsupported_numbers}"
                )
            return plan
        except (ValidationError, json.JSONDecodeError, ValueError) as exc:
            last_error = str(exc)
            if attempt < _ACTION_PLAN_RETRY - 1:
                user_prompt = f"""{req.context}

Lần trả lời trước chưa đúng schema. Hãy tạo lại toàn bộ JSON và bắt buộc:
- objectives có 3-5 mục;
- phases có đúng 3 phần theo thứ tự 0-2h, 2-6h, 6-24h;
- mỗi phase có 2-4 actions;
- warnings và followUpQuestions đều có ít nhất 1 mục;
- chỉ dùng con số và sự kiện có trong context, không tự thêm thời gian, số người hay vật tư;
- chỉ trả JSON thuần bằng tiếng Việt."""
    raise HTTPException(status_code=422, detail=f"AI trả về sai schema: {last_error}")


def _redact_action_plan(plan: ActionPlanNarrative) -> ActionPlanNarrative:
    plan.objectives = [_redact_identity(o) for o in plan.objectives]
    for phase in plan.phases:
        phase.actions = [_redact_identity(a) for a in phase.actions]
    plan.warnings = [_redact_identity(w) for w in plan.warnings]
    plan.followUpQuestions = [_redact_identity(q) for q in plan.followUpQuestions]
    return plan


def _find_unsupported_numbers(
    plan: ActionPlanNarrative,
    source_context: str,
) -> list[str]:
    """Chặn model tự thêm số; các số trong tên ba khung thời gian được phép."""
    number_pattern = re.compile(r"(?<!\w)\d+(?:[.,]\d+)?")
    allowed = set(number_pattern.findall(source_context)) | {"0", "2", "6", "24"}
    content = json.dumps(plan.model_dump(), ensure_ascii=False)
    return sorted(set(number_pattern.findall(content)) - allowed)


def _strip_fence(raw: str) -> str:
    """Bỏ rào ```json ... ``` nếu model bọc code fence."""
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("\n", 1)[-1]
        if cleaned.endswith("```"):
            cleaned = cleaned.rsplit("```", 1)[0]
    return cleaned.strip()

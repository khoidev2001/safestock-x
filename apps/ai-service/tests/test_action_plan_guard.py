"""Chốt chặn mảnh JSON lọt vào nội dung kế hoạch hành động.

Ollama sinh JSON theo văn phạm ràng buộc: khi model định mở khoá `warnings` trong
lúc còn đang ở giữa mảng `objectives`, văn phạm ép cụm đó thành một phần tử chuỗi
hợp lệ. Schema qua sạch, nhưng giao diện hiện ra một mục tiêu tên là `warnings ["`
— đúng lỗi đã gặp trên màn hình thật. Không schema nào bắt được, phải soi nội dung.
"""

from main import _find_broken_sentences
from schemas import ActionPlanNarrative

REAL_SENTENCE = "Đảm bảo an toàn tính mạng cho nhóm dễ tổn thương trong hai giờ đầu."


def _plan(objectives: list[str]) -> ActionPlanNarrative:
    return ActionPlanNarrative(
        objectives=objectives,
        warnings=["Nguy cơ thiếu nước uống sau hai mươi tư giờ."],
        followUpQuestions=["Khu vực còn điện lưới hay đã mất hoàn toàn?"],
    )


def test_catches_json_fragment_leaking_into_objectives():
    plan = _plan([REAL_SENTENCE, REAL_SENTENCE, REAL_SENTENCE, REAL_SENTENCE, 'warnings ["'])
    assert _find_broken_sentences(plan) == ['warnings ["']


def test_catches_bare_schema_key_as_objective():
    # Model buột ra tên khoá schema thay vì câu; ngắn cụt nên bị chặn.
    plan = _plan([REAL_SENTENCE, REAL_SENTENCE, "warnings"])
    assert _find_broken_sentences(plan) == ["warnings"]


def test_catches_brace_fragment_in_warnings():
    plan = _plan([REAL_SENTENCE, REAL_SENTENCE, REAL_SENTENCE])
    plan.warnings = ['Sơ tán {"muc": "gap"} tới nhà văn hoá thôn.']
    assert plan.warnings[0] in _find_broken_sentences(plan)


def test_clean_plan_reports_nothing():
    assert _find_broken_sentences(_plan([REAL_SENTENCE, REAL_SENTENCE, REAL_SENTENCE])) == []


def test_inspects_warnings_and_follow_up_questions_too():
    # Ba danh sách đều hiển thị ra màn hình nên đều phải được soi.
    plan = _plan([REAL_SENTENCE, REAL_SENTENCE, REAL_SENTENCE])
    plan.warnings = ["]"]
    plan.followUpQuestions = ["followUpQuestions ["]
    assert set(_find_broken_sentences(plan)) == {"]", "followUpQuestions ["}

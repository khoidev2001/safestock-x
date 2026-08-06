"""Chốt chặn mảnh JSON lọt vào nội dung kế hoạch hành động.

Ollama sinh JSON theo văn phạm ràng buộc: khi model định mở khoá `phases` trong
lúc còn đang ở giữa mảng `objectives`, văn phạm ép cụm đó thành một phần tử chuỗi
hợp lệ. Schema qua sạch, nhưng giao diện hiện ra một mục tiêu tên là `phases [{`
— đúng lỗi đã gặp trên màn hình thật. Không schema nào bắt được, phải soi nội dung.
"""

from main import _find_broken_sentences
from schemas import ActionPlanNarrative, PhasePlan

CAU_THAT = "Đảm bảo an toàn tính mạng cho nhóm dễ tổn thương trong hai giờ đầu."


def _ke_hoach(objectives: list[str]) -> ActionPlanNarrative:
    return ActionPlanNarrative(
        objectives=objectives,
        phases=[
            PhasePlan(window="0-2h", actions=[CAU_THAT, CAU_THAT]),
            PhasePlan(window="2-6h", actions=[CAU_THAT, CAU_THAT]),
            PhasePlan(window="6-24h", actions=[CAU_THAT, CAU_THAT]),
        ],
        warnings=["Nguy cơ thiếu nước uống sau hai mươi tư giờ."],
        followUpQuestions=["Khu vực còn điện lưới hay đã mất hoàn toàn?"],
    )


def test_bat_manh_json_lot_vao_muc_tieu():
    ke_hoach = _ke_hoach([CAU_THAT, CAU_THAT, CAU_THAT, CAU_THAT, "phases [{"])
    assert _find_broken_sentences(ke_hoach) == ["phases [{"]


def test_bat_ten_khoa_tro_troi():
    # Model buột ra tên khoá schema thay vì câu; ngắn cụt nên bị chặn.
    ke_hoach = _ke_hoach([CAU_THAT, CAU_THAT, "warnings"])
    assert _find_broken_sentences(ke_hoach) == ["warnings"]


def test_bat_dau_ngoac_trong_hanh_dong():
    ke_hoach = _ke_hoach([CAU_THAT, CAU_THAT, CAU_THAT])
    ke_hoach.phases[1].actions[0] = 'Sơ tán {"window": "2-6h"} tới nhà văn hoá thôn.'
    assert ke_hoach.phases[1].actions[0] in _find_broken_sentences(ke_hoach)


def test_ke_hoach_sach_thi_khong_bao_gi():
    assert _find_broken_sentences(_ke_hoach([CAU_THAT, CAU_THAT, CAU_THAT])) == []


def test_soi_ca_canh_bao_va_cau_hoi():
    # Bốn danh sách đều hiển thị ra màn hình nên đều phải được soi.
    ke_hoach = _ke_hoach([CAU_THAT, CAU_THAT, CAU_THAT])
    ke_hoach.warnings = ["]"]
    ke_hoach.followUpQuestions = ["followUpQuestions ["]
    assert set(_find_broken_sentences(ke_hoach)) == {"]", "followUpQuestions ["}

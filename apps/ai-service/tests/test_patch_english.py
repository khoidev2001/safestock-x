"""Lớp vá tiếng Anh không được ăn vào mã vật tư.

Lỗi thật đã gặp: model trả lời đúng "420 chai nước (SKU: WATER-01)", lớp vá đổi
thành "SKU: nước-01". Câu vẫn đọc xuôi tai nên không ai nghi, nhưng người trực
cầm mã đó đi tra thì không ra hàng nào.
"""

from main import _patch_english


def test_giu_nguyen_ma_vat_tu_co_tu_tieng_anh():
    ra = _patch_english("Tồn 420 chai nước (SKU: WATER-01) tại kho.")
    assert "WATER-01" in ra
    assert "nước-01" not in ra


def test_giu_nhieu_ma_cung_luc_khong_lan_thu_tu():
    ra = _patch_english("WATER-01 còn 420, LIFE-ADULT còn 88, FIRSTAID-01 còn 12.")
    assert "WATER-01" in ra and "LIFE-ADULT" in ra and "FIRSTAID-01" in ra


def test_van_con_va_chu_tieng_anh_ngoai_ma():
    # Che mã không được làm mất tác dụng của lớp vá với phần chữ còn lại.
    ra = _patch_english("Distribute water bottles to children.")
    assert "cấp phát" in ra.lower()
    assert "children" not in ra.lower()


def test_ma_dinh_tu_bi_va_o_giua():
    # HIGH nằm giữa mã: nếu không che, mã thành "PRIORITY-cao".
    ra = _patch_english("Ưu tiên lô PRIORITY-HIGH trước.")
    assert "PRIORITY-HIGH" in ra


def test_khong_dung_ky_tu_che_lam_ro_ri():
    # Ký tự che phải biến mất sạch, không được lọt ra câu trả lời người dùng đọc.
    ra = _patch_english("Kiểm WATER-01 và LIFE-ADULT.")
    assert "\x00" not in ra

"""Lớp vá tiếng Anh không được ăn vào mã vật tư.

Lỗi thật đã gặp: model trả lời đúng "420 chai nước (SKU: WATER-01)", lớp vá đổi
thành "SKU: nước-01". Câu vẫn đọc xuôi tai nên không ai nghi, nhưng người trực
cầm mã đó đi tra thì không ra hàng nào.
"""

from main import _patch_english


def test_keeps_item_code_containing_an_english_word():
    result = _patch_english("Tồn 420 chai nước (SKU: WATER-01) tại kho.")
    assert "WATER-01" in result
    assert "nước-01" not in result


def test_keeps_several_codes_without_mixing_their_order():
    result = _patch_english("WATER-01 còn 420, LIFE-ADULT còn 88, FIRSTAID-01 còn 12.")
    assert "WATER-01" in result and "LIFE-ADULT" in result and "FIRSTAID-01" in result


def test_still_patches_english_words_outside_codes():
    # Che mã không được làm mất tác dụng của lớp vá với phần chữ còn lại.
    result = _patch_english("Distribute water bottles to children.")
    assert "cấp phát" in result.lower()
    assert "children" not in result.lower()


def test_code_with_a_patched_word_in_the_middle():
    # HIGH nằm giữa mã: nếu không che, mã thành "PRIORITY-cao".
    result = _patch_english("Ưu tiên lô PRIORITY-HIGH trước.")
    assert "PRIORITY-HIGH" in result


def test_mask_character_never_leaks_into_output():
    # Ký tự che phải biến mất sạch, không được lọt ra câu trả lời người dùng đọc.
    result = _patch_english("Kiểm WATER-01 và LIFE-ADULT.")
    assert "\x00" not in result

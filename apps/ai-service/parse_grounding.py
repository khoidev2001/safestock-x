"""Neo số liệu /parse vào chữ có thật trong mô tả.

Model 4B chạy local đọc "12 hộ ... 3 trẻ em và 2 người già, trong 48 giờ" rồi trả
children=12, elderly=8, medicalSupportCases=4, durationHours=96 — ổn định 3/3 lần.
Ba con số cuối không hề xuất hiện trong câu. Web đưa kết quả parse thẳng vào bước
tính vật tư, nên một số bịa là phồng cả phương án cứu trợ.

Cách chữa không phải là dặn model kỹ hơn — prompt đã dặn "đối chiếu lại với câu gốc"
và nó vẫn sai. Máy tự đọc lại mô tả và tự lấy số. AI chỉ còn giữ phần nó thật sự làm
tốt: phân loại thiên tai, mức ưu tiên, và ước lượng khi câu chữ không nêu con số nào.

Cùng nguyên tắc đã dùng cho `_validate_situation_extraction`: không tin lời khai của
LLM khi có thể tự đối chiếu với nguồn.
"""
import re
import unicodedata

# Nhận diện mệnh đề chứa mưu toan lái prompt. Số nằm trong mệnh đề như vậy không
# được coi là số liệu người dân báo.
PROMPT_INJECTION_MARKERS = re.compile(
    r"\b(bo qua|ignore|system prompt|prompt|quy tac|huong dan|instruction|auto\s*(?:dispatch|approve))\b"
)


# Dấu phân cách hàng nghìn kiểu Việt Nam: "1.200 người".
#
# Không gộp lại thì `\b(\d{1,6})\s*nguoi\b` khớp vào đúng cụm "200 nguoi" — có
# ranh giới từ ngay sau dấu chấm — và một trận bão 1.200 người bị co xuống còn 200.
# Sai theo hướng nguy hiểm nhất: phương án ra thiếu 1.000 suất mà nhìn vẫn hợp lý.
#
# Chỉ gộp khi sau dấu có ĐÚNG ba chữ số rồi hết số. Nhờ vậy "1,5 lít" giữ nguyên là
# số thập phân, và toạ độ "13.3782428" cũng không bị dính (sau dấu là 7 chữ số).
_THOUSAND_SEPARATOR_RE = re.compile(r"(?<=\d)[.,](?=\d{3}(?!\d))")


def fold_report_text(value: str) -> str:
    """So khớp không phụ thuộc hoa/thường, dấu tiếng Việt và khoảng trắng thừa."""
    decomposed = unicodedata.normalize("NFD", value.casefold())
    without_marks = "".join(
        char for char in decomposed if not unicodedata.combining(char)
    ).replace("đ", "d")
    joined = _THOUSAND_SEPARATOR_RE.sub("", without_marks)
    return re.sub(r"\s+", " ", joined).strip()


def _clause_around(folded_report: str, match: "re.Match[str]") -> str:
    """Câu chứa `match`, cắt ở dấu chấm/chấm than/chấm hỏi/xuống dòng."""
    clause_start = (
        max(
            folded_report.rfind(".", 0, match.start()),
            folded_report.rfind("!", 0, match.start()),
            folded_report.rfind("?", 0, match.start()),
            folded_report.rfind("\n", 0, match.start()),
        )
        + 1
    )
    clause_end_candidates = [
        index
        for index in (
            folded_report.find(".", match.end()),
            folded_report.find("!", match.end()),
            folded_report.find("?", match.end()),
            folded_report.find("\n", match.end()),
        )
        if index >= 0
    ]
    clause_end = min(clause_end_candidates) if clause_end_candidates else len(folded_report)
    return folded_report[clause_start:clause_end]


def first_reported_number_match(pattern: str, folded_report: str) -> "re.Match[str] | None":
    """Bỏ qua số nằm trong mệnh đề có dấu hiệu tiêm lệnh."""
    for match in re.finditer(pattern, folded_report):
        if PROMPT_INJECTION_MARKERS.search(_clause_around(folded_report, match)):
            continue
        return match
    return None


# ===== Số viết bằng chữ =====
# Giọng nói qua PhoWhisper hay ra "ba trẻ em" thay vì "3 trẻ em". Đổi sang chữ số
# TRƯỚC khi bỏ dấu, vì bỏ dấu rồi thì "năm"/"nam" và "sáu"/"sau" lẫn vào nhau.
_NUMBER_WORDS = {
    "một": 1,
    "hai": 2,
    "ba": 3,
    "bốn": 4,
    "năm": 5,
    "sáu": 6,
    "bảy": 7,
    "tám": 8,
    "chín": 9,
    "mười": 10,
}

# Chỉ đổi khi ngay sau là một đơn vị đếm, để "năm 2026" không thành "5 2026".
_COUNT_SUBJECT = r"(?:trẻ|em|cháu|bé|người|cụ|ca|hộ|nạn nhân|giờ|tiếng|ngày|tuần)"
_NUMBER_WORD_RE = re.compile(
    r"\b(" + "|".join(_NUMBER_WORDS) + r")\s+(" + _COUNT_SUBJECT + r")",
    re.IGNORECASE,
)


# Bội số nói bằng chữ: "ba chục người", "hai trăm người".
#
# Đây là cách nói bình thường qua điện thoại — không ai đọc "hai trăm" thành "200".
# Bản trước chỉ đổi được một tới mười, nên mọi câu ước lượng bằng chữ đều tuột khỏi
# lớp neo và rơi về con số AI tự đoán.
#
# Chỉ đổi khi ngay sau là ĐƠN VỊ ĐẾM, cùng lý do với mẫu đơn lẻ: "năm 2026" không
# được thành "5 2026", và "ba trăm" trong tên riêng cũng không bị đụng tới.
# Hàng chục nói bằng chữ: "mười lăm", "hai mươi", "hai mươi ba", "ba mươi lăm".
#
# Không có nhánh này thì "hai mươi ba người" ra 3 — mẫu đơn lẻ chộp đúng chữ "ba"
# ở cuối. Đó là kiểu sai tệ nhất trong cả tệp: không phải bỏ sót để trống, mà là
# một con số nhỏ hơn mười lần con số thật, và nhìn vẫn hợp lý.
#
# "lăm" là cách đọc của "năm" ở hàng đơn vị sau hàng chục ("hai mươi lăm"), nên nó
# chỉ xuất hiện ở vế sau và mang giá trị 5.
_TENS_RE = re.compile(
    r"\b(?:(" + "|".join(k for k in _NUMBER_WORDS if k != "mười") + r")\s+mươi|(mười))"
    r"(?:\s+(" + "|".join(k for k in _NUMBER_WORDS if k != "mười") + r"|lăm))?"
    r"\s+(" + _COUNT_SUBJECT + r")",
    re.IGNORECASE,
)


def _tens_value(match: "re.Match[str]") -> str:
    tens = _NUMBER_WORDS[match.group(1).lower()] * 10 if match.group(1) else 10
    ones = 0
    if match.group(3):
        unit_word = match.group(3).lower()
        ones = 5 if unit_word == "lăm" else _NUMBER_WORDS[unit_word]
    return f"{tens + ones} {match.group(4)}"


_MULTIPLIERS = {"chục": 10, "trăm": 100, "nghìn": 1000, "ngàn": 1000}
_MULTIPLIED_NUMBER_RE = re.compile(
    r"\b(" + "|".join(_NUMBER_WORDS) + r")\s+(" + "|".join(_MULTIPLIERS) + r")\s+("
    + _COUNT_SUBJECT + r")",
    re.IGNORECASE,
)


def digitize_number_words(text: str) -> str:
    # Hàng chục TRƯỚC HẾT: "hai mươi ba người" phải được nuốt trọn, chứ để mẫu đơn
    # lẻ chạy trước thì nó chộp "ba người" và trả về 3.
    tens = _TENS_RE.sub(_tens_value, text)
    # Rồi tới bội số: "ba chục người" thành "30 người", chứ để mẫu đơn lẻ chạy
    # trước thì "ba" không đứng ngay trước đơn vị đếm nên chẳng khớp gì cả.
    joined = _MULTIPLIED_NUMBER_RE.sub(
        lambda m: (
            f"{_NUMBER_WORDS[m.group(1).lower()] * _MULTIPLIERS[m.group(2).lower()]} {m.group(3)}"
        ),
        tens,
    )
    return _NUMBER_WORD_RE.sub(
        lambda m: f"{_NUMBER_WORDS[m.group(1).lower()]} {m.group(2)}", joined
    )


# ===== Mẫu neo cho từng trường (chạy trên chuỗi đã bỏ dấu) =====
# "chau nho" / "dua nho" / "con nho" là cách trưởng thôn nói thường xuyên nhất
# ("11 người trong đó có 2 cháu nhỏ") mà bản trước không có mẫu nào bắt được, nên
# số trẻ em rơi về 0 và phần vật tư cho trẻ biến mất khỏi phương án.
# Xếp cụm DÀI TRƯỚC cụm ngắn: Python thử các nhánh theo đúng thứ tự viết, nên để
# "em" trần lên trước thì "5 em học sinh" khớp ngay ở "em" và hai chữ sau bị bỏ —
# vẫn ra 5 nên không ai thấy sai, cho tới hôm gặp một câu mà nó ra số khác.
#
# KHÔNG có "be" trần dù có "tre" và "chau" trần. Bỏ dấu xong thì "bé" và "bè" là
# một, mà "3 bè chuối" là câu hoàn toàn bình thường trong một báo cáo lũ — đếm bè
# chuối thành ba đứa trẻ là kiểu sai không cứu được bằng mắt thường.
_CHILDREN = (
    r"\b(\d{1,6})\s*"
    r"(?:tre em|tre nho|tre con|chau hoc sinh|chau nho|chau be|dua nho|dua be"
    r"|con nho|em hoc sinh|em nho|em be|be gai|be trai|be nho|hoc sinh"
    r"|tre|chau|em)\b"
)
# "bác" và "ông bà" là cách gọi người lớn tuổi thường gặp hơn cả "cụ" ở miền Trung,
# nhưng bản trước không có nhánh nào cho chúng.
#
# `(?!\s*si\b)` chặn "2 bác sĩ" — đó là người tới cứu chứ không phải người cần cứu,
# và đếm nhầm họ vào nhóm dễ tổn thương là phồng luôn phần vật tư ưu tiên.
_ELDERLY = (
    r"\b(\d{1,6})\s*"
    r"(?:nguoi cao tuoi|nguoi lon tuoi|nguoi gia|nguoi neo don|ong ba gia|ong ba"
    r"|bac cao tuoi|bac lon tuoi|bac gia|cu gia|cu ong|cu ba|ong cu|ba cu"
    r"|ba lao|ong lao|me gia|cha gia|bac|cu)\b(?!\s*si\b)"
)
# Không ai gọi điện báo "1 ca cần hỗ trợ y tế". Người ta nói cái đang thấy trước
# mắt: gãy chân, chảy máu, khó thở, ngất xỉu. Thiếu mấy chữ này thì phương án đi
# cứu người gãy chân mà không mang theo bộ sơ cứu nào.
#
# "ngất" phải viết là "ngất xỉu" hoặc "bị ngất": bỏ dấu xong "ngất" và "ngắt" là
# một, mà "ngắt cầu dao" là câu bình thường trong báo cáo mất điện.
_MEDICAL_SIGNS = (
    r"can ho tro y te|can cap cuu|can y te|cap cuu|bi thuong|ca y te"
    r"|gay chan|gay tay|gay xuong|chay mau|kho tho|ngat xiu|bi ngat"
    r"|nguy kich|thuong nang"
)
_MEDICAL = (
    r"\b(\d{1,6})\s*(?:ca|nguoi|nan nhan|truong hop)?\s*(?:" + _MEDICAL_SIGNS + r")\b"
)
# "2 người già" không phải "2 người bị ảnh hưởng" — chặn để khỏi cướp số của nhóm khác.
# "160 nhân khẩu" là cách xã ghi trong báo cáo chính thức, "210 khẩu" là cách nói
# gọn của cùng con số đó. Bản trước chỉ nhận "người" nên hai câu này tuột hết.
#
# NGƯỜI ĐÃ MẤT KHÔNG PHẢI SỐ NGƯỜI CẦN CỨU. "2 người chết" mà đọc thành 2 người
# ảnh hưởng thì phương án ra hai suất cứu trợ cho một thôn vừa mất hai người —
# vừa sai về số, vừa là thứ không ai muốn đọc trong một bản báo cáo. Không neo được
# thì để trống cho AI ước lượng, thà vậy còn hơn.
_PEOPLE = (
    r"\b(\d{1,6})\s*(?:nguoi|nhan khau|khau)\b"
    # "khẩu" còn là lượng từ của súng và pháo — "3 khẩu súng săn bị ướt" không phải
    # ba người cần cứu. Chặn ngay, vì đây đúng kiểu câu xuất hiện trong báo cáo kho.
    r"(?!\s*(?:gia|cao tuoi|lon tuoi|neo don|bi thuong|can cap cuu|can ho tro"
    r"|can y te|chet|tu vong|mat tich|bi nan|sung|phao))"
)
# "Bão vào lúc 3 giờ sáng" là MỐC ĐỒNG HỒ, không phải thời lượng cô lập. Bản trước
# đọc ra durationHours=3 và cả phương án tính theo một trận bão chỉ kéo dài 3 tiếng.
# Loại hai dấu hiệu chắc chắn là xem giờ: đứng sau "lúc", hoặc đứng trước buổi
# trong ngày / "rưỡi" / "kém".
# ===== Nhắc tới nhưng KHÔNG kèm số =====
#
# "có người bị thương ở chân" là bằng chứng chắc chắn có ít nhất một ca y tế, nhưng
# bản trước đòi phải có chữ số đứng trước nên trả về 0 — và phương án đi cứu một
# người bị thương mà không mang theo bộ sơ cứu nào. Cùng lỗi với "có mấy đứa nhỏ",
# "một bà cụ nằm liệt".
#
# Neo về 1 chứ KHÔNG đoán thêm: 1 nghĩa là "câu có nhắc, chưa rõ bao nhiêu". Đây vẫn
# là số đọc ra từ chữ có thật trong mô tả, đúng nguyên tắc của cả tệp này — chỉ khác
# là chữ đó không mang con số. Thà thiếu còn hơn thừa, và điều phối vẫn sửa tay được.
_CHILDREN_MENTION = (
    r"\b(?:tre em|tre nho|tre con|tre so sinh|so sinh|chau nho|chau be|dua nho"
    r"|con nho|em nho|em be|be nho|be gai|be trai|hoc sinh|mam non)\b"
)
_ELDERLY_MENTION = (
    r"\b(?:nguoi gia|nguoi cao tuoi|nguoi lon tuoi|nguoi neo don|ong ba gia|ong ba"
    r"|cu gia|cu ong|cu ba|ba cu|ong cu|bac gia|bac lon tuoi"
    r"|ba lao|ong lao|me gia|cha gia)\b"
)

# ===== Mẫu chạy trên chữ CÒN NGUYÊN DẤU =====
#
# "cụ Bảy 82 tuổi" không có chữ số nào đứng trước "cụ", nên chỉ mẫu "nhắc tới" mới
# bắt được — nhưng thêm "cu" trần vào danh sách bỏ dấu ở trên thì hỏng nặng: bỏ dấu
# xong "cụ", "cũ" và "củ" là một, và "nhà cũ", "nói cụ thể", "củ khoai" đều bỗng
# thành một người già.
#
# Chữ còn nguyên dấu thì "cụ" là "cụ", không lẫn vào đâu được. Đường nhập liệu nào
# cũng giữ được dấu: gõ tay thì hiển nhiên, còn PhoWhisper trả về chữ thường nhưng
# vẫn đủ dấu — thứ nó làm mất là chữ HOA, không phải dấu thanh.
#
# Chỉ còn "cụ thể" là trùng thật, chặn thẳng bằng lookahead.
_ELDERLY_MENTION_SPOKEN = r"\bcụ\b(?!\s*thể)"
_MEDICAL_MENTION = r"\b(?:" + _MEDICAL_SIGNS + r")\b"

# Phủ định chỉ tính trong VẾ CÂU của nó, cắt ở dấu phẩy.
#
# Lấy cả câu thì "không có điện, có người bị thương" bị coi là phủ định — chữ
# "không" của vế trước nói về điện, không nói về người bị thương. Mà đây đúng là
# kiểu câu trưởng thôn hay đọc: liệt kê nhiều vế ngăn bằng dấu phẩy.
_NEGATION_RE = re.compile(r"\b(?:khong|chua|chang)\b")
_SEGMENT_BREAKS = ",.;:!?\n"


def _mentioned_without_number(pattern: str, folded_report: str) -> bool:
    for match in re.finditer(pattern, folded_report):
        if PROMPT_INJECTION_MARKERS.search(_clause_around(folded_report, match)):
            continue
        segment_start = max(
            (folded_report.rfind(char, 0, match.start()) for char in _SEGMENT_BREAKS),
            default=-1,
        )
        if _NEGATION_RE.search(folded_report[segment_start + 1 : match.start()]):
            continue
        return True
    return False


_HOURS = (
    r"(?<!luc )\b(\d{1,5})\s*(?:gio|tieng|h)\b"
    r"(?!\s*(?:sang|trua|chieu|toi|dem|khuya|ruoi|kem|\d))"
)
_DAYS = r"\b(\d{1,4})\s*ngay\b"
_WEEKS = r"\b(\d{1,3})\s*tuan\b"

# "thôn Triêm Đức, 12 hộ..." → lấy cụm ngay sau danh xưng, dừng ở dấu ngắt câu.
#
# TÁCH LÀM HAI và thử THÔN TRƯỚC, có lý do. Hệ thống điều phối theo THÔN: chuỗi
# trả về đây được đối chiếu với danh mục thôn đã được ADMIN xác minh. Gộp chung
# "xã" vào một biểu thức thì câu "ở xã Đồng Xuân, có lụt ở thôn Tân Phước" khớp
# "xã" trước — vì nó đứng trước trong câu — rồi trả về tên XÃ. Tên xã không bao
# giờ có trong danh mục thôn, nên phương án bị chặn dù người dùng đã nói rõ thôn.
#
# Bắt "tối đa 60 ký tự KHÔNG phải dấu ngắt câu", chứ KHÔNG bắt "tối đa 60 ký tự
# rồi phải gặp dấu ngắt câu". Nghe thì giống nhau, nhưng cách sau hỏng nặng: câu
# nào có tên thôn cách dấu chấm xa hơn 60 ký tự là **không khớp gì cả** — không
# phải lấy thiếu, mà là mất trắng. Và câu người ta đọc bằng giọng nói thường dài
# đúng như thế, lại hiếm khi có dấu phẩy.
_HAMLET_RE = re.compile(r"(?i)\b(?:thôn|buôn|làng|xóm|khu phố|tổ)\s+([^,.;:\n]{1,60})")
_COMMUNE_RE = re.compile(r"(?i)\b(?:xã|phường|thị trấn)\s+([^,.;:\n]{1,60})")


def _grounded_int(pattern: str, folded: str) -> "int | None":
    match = first_reported_number_match(pattern, folded)
    return int(match.group(1)) if match else None


def extract_duration_hours(folded: str) -> "int | None":
    hours = _grounded_int(_HOURS, folded)
    if hours is not None:
        return hours
    days = _grounded_int(_DAYS, folded)
    if days is not None:
        return days * 24
    weeks = _grounded_int(_WEEKS, folded)
    return weeks * 168 if weeks is not None else None


# Chữ đầu tiên cho biết câu đã chuyển sang nói chuyện khác, không còn là tên thôn.
#
# Trước đây chỗ này cắt theo CHỮ HOA: giữ các từ viết hoa liền sau "thôn". Cách đó
# chết hẳn với giọng nói — PhoWhisper trả về chữ thường tuốt, nên "thôn long châu"
# dừng ngay từ đầu và không lấy được gì. Mà đọc bằng lời lại chính là đường nhập
# liệu app mời gọi người dùng nhất.
#
# Viết không dấu vì so khớp sau khi đã bỏ dấu; kèm số đếm bằng chữ vì lời nói hay
# ra "khoảng hai trăm người" chứ không ra "200".
#
# Từ nào TRÙNG ÂM TIẾT với tên địa danh có thật thì tuyệt đối không được cho vào.
# Đã dính hai lần: "phụ nữ" nuốt chữ "Phú" của thôn Phú Sơn và Tân Phú, "động đất"
# nuốt chữ "Đồng" của xã Đồng Xuân. Mỗi lần như vậy là một địa danh có thật biến
# mất khỏi hệ thống, mà thông báo lỗi lại chỉ nói chung chung "chưa xác nhận địa
# điểm" nên không ai lần ra được. Thêm từ vào đây thì chạy lại
# test_moi_ten_thon_that_deu_lay_duoc_ca_khi_khong_viet_hoa để chốt.
_LOCATION_STOP_WORDS = frozenset(
    """
    khoang chung uoc gan tren duoi hon co bi dang hien nay con va voi cung
    nhieu it toan ca deu can phai nen se da vua moi
    nguoi ho dan nha truong tram cho duong cau song suoi
    tre em gia benh thuong tat
    nuoc lu ngap mua bao sat lo chay lap thiet hai nang
    toc mai sap vui cuon troi
    tu tai o den ra vao theo truoc sau ke bat dau
    mat ne day oi nghe nghen a chua vai may tong
    thon xa buon lang xom
    sang chieu toi dem hom qua nay mai luc gio ngay
    mot hai ba bon nam sau bay tam chin muoi tram nghin ngan
    """.split()
)

# Tên thôn ở đây dài nhiều nhất ba tiếng ("Long Châu", "Triêm Đức", "Kỳ Đu").
# Lấy quá tay thì chuỗi không khớp danh mục thôn đã xác minh, cũng hỏng như lấy
# thiếu — nên chặn cứng, đừng nuốt cả câu.
_LOCATION_MAX_WORDS = 3


def extract_location(report: str) -> "str | None":
    # Nói tới thôn thì lấy thôn, kể cả khi tên xã đứng trước trong câu. Chỉ khi
    # không nhắc thôn nào mới đành lấy tên xã.
    match = _HAMLET_RE.search(report) or _COMMUNE_RE.search(report)
    if not match:
        return None
    kept: list[str] = []
    for word in match.group(1).split():
        clean = word.strip(" ,.;:")
        if not clean or clean[:1].isdigit():
            break
        # Từ dừng mà VIẾT HOA thì giữ lại — nó đang là một phần của tên riêng.
        #
        # "Xóm Gò Duối" từng bị cắt còn "Gò" vì "duối" trùng âm tiết với "dưới"
        # trong "xóm dưới" — mà "xóm dưới" là cách nói phải chặn thật. Hai nghĩa
        # trùng nhau sau khi bỏ dấu, không danh sách từ nào gỡ được.
        #
        # Chữ hoa gỡ đúng ca đó cho đường GÕ TAY, nơi người ta viết hoa tên riêng.
        # Đọc bằng giọng nói thì PhoWhisper trả về chữ thường tuốt, nên nhánh này
        # im lặng và hành vi giữ nguyên như cũ — không phá đường nhập kia.
        if fold_report_text(clean) in _LOCATION_STOP_WORDS and not clean[:1].isupper():
            break
        kept.append(clean)
        if len(kept) >= _LOCATION_MAX_WORDS:
            break
    return " ".join(kept).strip(" ,.;:") or None


def ground_parsed_incident(parsed: dict, description: str) -> dict:
    """Trả bản sao đã đối chiếu với mô tả gốc.

    - children / elderly / medicalSupportCases: máy quyết hoàn toàn. Neo được số thì
      lấy số neo; câu có NHẮC tới nhóm đó mà không nêu số thì neo về 1; không nhắc
      gì mới về 0. Đây là ba trường model bịa nhiều nhất và cũng là ba trường dễ
      đối chiếu nhất.
    - affectedPeople / durationHours / location: neo được thì số neo thắng; không
      nêu trong câu thì giữ ước lượng của AI (ví dụ "40 hộ" → suy ra số người, hay
      "khắc phục sớm" → đoán số giờ).
    - incidentType / priority: để nguyên, đây là phần phân loại chứ không phải đếm.
    """
    grounded = dict(parsed)
    folded = fold_report_text(digitize_number_words(description))

    # Chữ giữ nguyên dấu, chỉ hạ chữ thường và gom khoảng trắng: dùng cho mấy mẫu
    # mà việc bỏ dấu sẽ làm hai từ khác nghĩa dính vào nhau ("cụ" với "cũ").
    spoken = re.sub(r"\s+", " ", digitize_number_words(description).casefold()).strip()

    for field, counted, mentioned, mentioned_spoken in (
        ("children", _CHILDREN, _CHILDREN_MENTION, None),
        ("elderly", _ELDERLY, _ELDERLY_MENTION, _ELDERLY_MENTION_SPOKEN),
        ("medicalSupportCases", _MEDICAL, _MEDICAL_MENTION, None),
    ):
        value = _grounded_int(counted, folded)
        if value is None:
            # Có nhắc mà không nêu số thì neo về 1, không nêu gì mới về 0.
            found = _mentioned_without_number(mentioned, folded) or (
                mentioned_spoken is not None
                and _mentioned_without_number(mentioned_spoken, spoken)
            )
            value = 1 if found else 0
        grounded[field] = value

    people = _grounded_int(_PEOPLE, folded)
    if people is not None:
        grounded["affectedPeople"] = people

    hours = extract_duration_hours(folded)
    if hours is not None:
        grounded["durationHours"] = hours

    location = extract_location(description)
    if location:
        grounded["location"] = location

    return grounded

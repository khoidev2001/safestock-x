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


def fold_report_text(value: str) -> str:
    """So khớp không phụ thuộc hoa/thường, dấu tiếng Việt và khoảng trắng thừa."""
    decomposed = unicodedata.normalize("NFD", value.casefold())
    without_marks = "".join(
        char for char in decomposed if not unicodedata.combining(char)
    ).replace("đ", "d")
    return re.sub(r"\s+", " ", without_marks).strip()


def first_reported_number_match(pattern: str, folded_report: str) -> "re.Match[str] | None":
    """Bỏ qua số nằm trong mệnh đề có dấu hiệu tiêm lệnh."""
    for match in re.finditer(pattern, folded_report):
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
        if PROMPT_INJECTION_MARKERS.search(folded_report[clause_start:clause_end]):
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


def digitize_number_words(text: str) -> str:
    return _NUMBER_WORD_RE.sub(
        lambda m: f"{_NUMBER_WORDS[m.group(1).lower()]} {m.group(2)}", text
    )


# ===== Mẫu neo cho từng trường (chạy trên chuỗi đã bỏ dấu) =====
_CHILDREN = r"\b(\d{1,6})\s*(?:tre em|tre nho|em nho|chau be|em be|be gai|be trai|tre)\b"
_ELDERLY = r"\b(\d{1,6})\s*(?:nguoi cao tuoi|nguoi lon tuoi|nguoi gia|cu gia|cu ong|cu ba|cu)\b"
_MEDICAL = (
    r"\b(\d{1,6})\s*(?:ca|nguoi|nan nhan|truong hop)?\s*"
    r"(?:can ho tro y te|can cap cuu|can y te|cap cuu|bi thuong|ca y te)\b"
)
# "2 người già" không phải "2 người bị ảnh hưởng" — chặn để khỏi cướp số của nhóm khác.
_PEOPLE = (
    r"\b(\d{1,6})\s*nguoi\b"
    r"(?!\s*(?:gia|cao tuoi|lon tuoi|bi thuong|can cap cuu|can ho tro|can y te))"
)
_HOURS = r"\b(\d{1,5})\s*(?:gio|tieng|h)\b"
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
    tu tai o den ra vao theo truoc sau ke bat dau
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
        if fold_report_text(clean) in _LOCATION_STOP_WORDS:
            break
        kept.append(clean)
        if len(kept) >= _LOCATION_MAX_WORDS:
            break
    return " ".join(kept).strip(" ,.;:") or None


def ground_parsed_incident(parsed: dict, description: str) -> dict:
    """Trả bản sao đã đối chiếu với mô tả gốc.

    - children / elderly / medicalSupportCases: máy quyết hoàn toàn. Neo được thì
      lấy số neo, không neo được thì 0 — đúng như schema đã hứa "mặc định 0". Đây
      là ba trường model bịa nhiều nhất và cũng là ba trường dễ đối chiếu nhất.
    - affectedPeople / durationHours / location: neo được thì số neo thắng; không
      nêu trong câu thì giữ ước lượng của AI (ví dụ "40 hộ" → suy ra số người, hay
      "khắc phục sớm" → đoán số giờ).
    - incidentType / priority: để nguyên, đây là phần phân loại chứ không phải đếm.
    """
    grounded = dict(parsed)
    folded = fold_report_text(digitize_number_words(description))

    for field, pattern in (
        ("children", _CHILDREN),
        ("elderly", _ELDERLY),
        ("medicalSupportCases", _MEDICAL),
    ):
        value = _grounded_int(pattern, folded)
        grounded[field] = value if value is not None else 0

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

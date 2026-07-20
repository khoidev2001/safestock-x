"""Chạy 10 ca đánh giá Ollama/Qwen qua API thật của ai-service."""
import json
import re
import sys
import time
import urllib.error
import urllib.request


BASE_URL = "http://localhost:8000"
SNAPSHOT = {
    "warehouse": {"name": "Kho thôn Phú Xuân", "commune": "xã Hòa An"},
    "readiness": {"score": 73, "zone": "ATTENTION"},
    "weather": {"totalRainMm": 1.6, "alert": False, "periodHours": 72},
    "stock": [
        {
            "sku": "WATER-01",
            "itemName": "Nước uống đóng chai",
            "quantity": 120,
            "unit": "chai",
            "nearestExpiry": "2027-01-13",
        },
        {
            "sku": "LIFEJACKET-ADULT",
            "itemName": "Áo phao người lớn",
            "quantity": 15,
            "unit": "chiếc",
            "nearestExpiry": "2028-07-06",
        },
    ],
    "openIncidents": [
        {
            "kind": "POWER_OUTAGE",
            "severity": "HIGH",
            "title": "Mất điện khu B",
            "state": "OPEN",
        }
    ],
}


def post(path: str, payload: dict) -> tuple[dict, float]:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(
        f"{BASE_URL}{path}",
        data=body,
        headers={"Content-Type": "application/json; charset=utf-8"},
        method="POST",
    )
    started = time.perf_counter()
    with urllib.request.urlopen(request, timeout=180) as response:
        result = json.loads(response.read().decode("utf-8"))
    return result, round(time.perf_counter() - started, 2)


def contains_all(text: str, terms: list[str]) -> bool:
    lowered = text.lower()
    return all(term.lower() in lowered for term in terms)


def validate(case_id: int, response: dict) -> tuple[bool, str]:
    if case_id == 1:
        ok = contains_all(response["answer"], ["15", "áo phao người lớn"])
        return ok, "đúng số lượng 15"
    if case_id == 2:
        answer = response["answer"]
        ok = (
            "nước uống đóng chai" in answer.lower()
            and ("2027-01-13" in answer or "13/01/2027" in answer)
        )
        return ok, "đúng hạn gần nhất"
    if case_id == 3:
        answer = response["answer"].lower()
        ok = "mất điện" in answer and ("khu b" in answer or "khu vực b" in answer)
        return ok, "đúng sự cố đang mở"
    if case_id == 4:
        ok = "73" in response["answer"] and "96" not in response["answer"]
        return ok, "đúng readiness 73"
    if case_id == 5:
        answer = response["answer"]
        ok = ("1.6" in answer or "1,6" in answer) and "72" in answer
        return ok, "đúng dự báo thời tiết trong snapshot"
    if case_id == 6:
        ok = "chỉ hỗ trợ" in response["answer"].lower()
        return ok, "từ chối câu ngoài phạm vi"
    if case_id == 7:
        ok = (
            response.get("incidentType") == "FLOOD"
            and response.get("affectedPeople") == 180
            and response.get("durationHours") == 48
            and response.get("children") == 25
            and response.get("elderly") == 15
        )
        return ok, "parse lũ và lấy cận trên 180"
    if case_id == 8:
        ok = (
            response.get("incidentType") == "FIRE"
            and response.get("affectedPeople") == 40
            and response.get("medicalSupportCases") == 3
        )
        return ok, "parse cháy và ca y tế"
    if case_id == 9:
        text = response.get("explanation", "")
        ok = contains_all(text, ["180", "72%", "300", "50"])
        return ok, "giữ nguyên số điều phối"
    if case_id == 10:
        windows = [phase.get("window") for phase in response.get("phases", [])]
        serialized = json.dumps(response, ensure_ascii=False).lower()
        english_leaks = [
            "bottles",
            "life jackets",
            "additional",
            "as needed",
            "vulnerable groups",
            "cases",
            "backup plan",
            "eta",
            "critical",
            "flood",
        ]
        allowed_numbers = set(re.findall(r"(?<!\w)\d+(?:[.,]\d+)?", CASES[-1][3]["context"]))
        allowed_numbers.update({"0", "2", "6", "24"})
        generated_numbers = set(re.findall(r"(?<!\w)\d+(?:[.,]\d+)?", serialized))
        ok = (
            windows == ["0-2h", "2-6h", "6-24h"]
            and bool(response.get("objectives"))
            and bool(response.get("warnings"))
            and bool(response.get("followUpQuestions"))
            and not any(term in serialized for term in english_leaks)
            and generated_numbers <= allowed_numbers
        )
        return ok, "đúng schema, không bịa số và không lẫn tiếng Anh"
    return False, "không có validator"


def assistant_payload(question: str) -> dict:
    return {
        "question": question,
        "snapshot": json.dumps(SNAPSHOT, ensure_ascii=False),
    }


CASES = [
    (1, "Tồn kho", "/assistant", assistant_payload("Còn bao nhiêu áo phao người lớn?")),
    (2, "Hạn dùng", "/assistant", assistant_payload("Vật tư nào có hạn dùng gần nhất?")),
    (3, "Sự cố", "/assistant", assistant_payload("Kho đang có sự cố gì?")),
    (4, "Readiness", "/assistant", assistant_payload("Điểm sẵn sàng hiện tại là bao nhiêu?")),
    (5, "Thời tiết", "/assistant", assistant_payload("Ba ngày tới có mưa lớn không?")),
    (6, "Ngoài phạm vi", "/assistant", assistant_payload("Thủ đô nước Pháp là gì?")),
    (
        7,
        "Parse lũ",
        "/parse",
        {"description": "Lũ tại thôn Phú Xuân, khoảng 170-180 người bị cô lập 48 giờ, có 25 trẻ em và 15 người cao tuổi."},
    ),
    (
        8,
        "Parse cháy",
        "/parse",
        {"description": "Cháy lớn tại chợ Hòa An, 40 người bị ảnh hưởng trong 6 giờ, có 3 ca cần hỗ trợ y tế khẩn cấp."},
    ),
    (
        9,
        "Giải thích điều phối",
        "/explain",
        {"context": "Lũ ảnh hưởng 180 người. Mức đáp ứng 72%. Nước: cần 900 chai, cấp được 600 chai, thiếu 300 chai. Áo phao: cần 100 chiếc, cấp được 50 chiếc, thiếu 50 chiếc."},
    ),
    (
        10,
        "Action Plan",
        "/action-plan",
        {"context": "Tình huống FLOOD tại thôn Phú Xuân, 180 người, kéo dài 48 giờ, 25 trẻ em, 15 người già, 5 ca y tế. Mức nghiêm trọng CRITICAL 92/100. Mức đáp ứng 72%. Dự báo cô lập trên 24 giờ 85%, thiếu vật tư 28%, cần sơ tán 70%. Kho Phú Xuân cách 4 km, ETA 18 phút. Thiếu 300 chai nước và 50 áo phao."},
    ),
]


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    results = []
    for case_id, name, path, payload in CASES:
        try:
            response, seconds = post(path, payload)
            passed, criterion = validate(case_id, response)
            results.append(
                {
                    "id": case_id,
                    "name": name,
                    "passed": passed,
                    "seconds": seconds,
                    "criterion": criterion,
                    "response": response,
                }
            )
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError) as error:
            results.append({"id": case_id, "name": name, "passed": False, "error": str(error)})

    print(json.dumps(results, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

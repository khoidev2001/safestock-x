export interface AssistantSnapshot {
  warehouse: { name: string; commune: string };
  readiness: {
    score: number;
    zone: string;
    operationalStatus: "READY" | "NEEDS_ACTION" | "NOT_DISPATCHABLE";
    blockers: Array<{ title: string; reasons: string[] }>;
    recommendedActions: string[];
  } | null;
  weather: { totalRainMm: number; alert: boolean; periodHours: number } | null;
  stock: Array<{
    sku: string;
    itemName: string;
    quantity: number;
    unit: string;
    nearestExpiry: string | null;
  }>;
  openIncidents: Array<{
    kind: string;
    severity: string;
    title: string;
    state: string;
  }>;
}

const OPERATIONAL_STATUS_LABELS: Record<
  NonNullable<AssistantSnapshot["readiness"]>["operationalStatus"],
  string
> = {
  READY: "sẵn sàng điều phối",
  NEEDS_ACTION: "cần xử lý trước khi điều phối",
  NOT_DISPATCHABLE: "chưa thể điều phối",
};

// Nhãn tiếng Việt cho mức độ sự cố; fallback về chuỗi gốc viết thường nếu gặp giá trị lạ.
const SEVERITY_LABELS: Record<string, string> = {
  CRITICAL: "rất nghiêm trọng",
  HIGH: "nghiêm trọng",
  MEDIUM: "trung bình",
  LOW: "nhẹ",
};

/** Trả lời tức thì các câu tra cứu xác định; câu mở trả null để chuyển sang LLM. */
export function resolveAssistantFastAnswer(
  question: string,
  snapshot: AssistantSnapshot,
): string | null {
  const normalizedQuestion = normalizeVietnamese(question);

  if (isWeatherQuestion(question)) {
    return answerWeather(snapshot);
  }

  if (hasAny(normalizedQuestion, ["su co", "canh bao", "bat thuong"])) {
    return answerIncidents(snapshot);
  }

  if (
    hasAny(normalizedQuestion, [
      "readiness",
      "diem san sang",
      "muc san sang",
      "kho san sang",
      "san sang dap ung",
      "dap ung duoc chua",
      "kha nang dieu phoi",
    ])
  ) {
    return answerReadiness(snapshot);
  }

  if (hasAny(normalizedQuestion, ["sap het han", "het han", "han dung", "con han"])) {
    return answerExpiry(snapshot);
  }

  if (hasAny(normalizedQuestion, ["bao nhieu", "so luong", "con bao", "ton bao"])) {
    const stockItem = snapshot.stock.find((item) => {
      const normalizedName = normalizeVietnamese(item.itemName);
      return (
        normalizedQuestion.includes(normalizedName) ||
        normalizedQuestion.includes(item.sku.toLowerCase())
      );
    });

    if (stockItem) {
      const status =
        stockItem.quantity === 0
          ? `\n\n${stockItem.itemName} hiện đã cạn — anh/chị nên bổ sung sớm nếu cần điều phối.`
          : "";
      return `Dạ, ${snapshot.warehouse.name} hiện còn ${stockItem.quantity} ${stockItem.unit} ${stockItem.itemName}.${status}`;
    }
  }

  return null;
}

export function isWeatherQuestion(question: string): boolean {
  const normalizedQuestion = normalizeVietnamese(question);
  return hasAny(normalizedQuestion, ["thoi tiet", "mua lon", "luong mua", "du bao mua"]);
}

function answerWeather(snapshot: AssistantSnapshot): string {
  if (!snapshot.weather) {
    return `Dạ, hiện chưa có dữ liệu dự báo thời tiết cho ${snapshot.warehouse.name}.`;
  }

  const { periodHours, totalRainMm, alert } = snapshot.weather;
  const period = describePeriod(periodHours);
  const alertText = alert
    ? "\n\nĐang có cảnh báo mưa lớn — anh/chị nên rà soát phương án ứng phó và các điểm xung yếu."
    : "\n\nHiện chưa có cảnh báo mưa lớn.";
  return `Dạ, dự báo ${period} tại ${snapshot.warehouse.name} tổng lượng mưa khoảng ${totalRainMm} mm.${alertText}`;
}

function answerIncidents(snapshot: AssistantSnapshot): string {
  if (snapshot.openIncidents.length === 0) {
    return `Dạ, ${snapshot.warehouse.name} hiện không có sự cố nào đang mở. Tình hình đang ổn.`;
  }

  const total = snapshot.openIncidents.length;
  const incidentLines = snapshot.openIncidents
    .slice(0, 5)
    .map((incident) => `•  ${incident.title} — mức ${severityLabel(incident.severity)}`)
    .join("\n");
  const remaining = total - 5;
  const suffix =
    remaining > 0 ? `\n\nNgoài ra còn ${remaining} sự cố khác đang được theo dõi.` : "";
  return `Dạ, ${snapshot.warehouse.name} đang có ${total} sự cố mở:\n\n${incidentLines}${suffix}`;
}

function answerReadiness(snapshot: AssistantSnapshot): string {
  if (!snapshot.readiness) {
    return `Dạ, ${snapshot.warehouse.name} hiện chưa có dữ liệu điểm sẵn sàng.`;
  }

  const { score, operationalStatus, blockers, recommendedActions } = snapshot.readiness;
  const status = OPERATIONAL_STATUS_LABELS[operationalStatus];
  const blocker = blockers[0];
  const action = recommendedActions[0];

  const lead = `Dạ, ${snapshot.warehouse.name} hiện ${status}, điểm sẵn sàng tham khảo là ${score}/100.`;
  const detail = blocker
    ? `\n\nVướng mắc chính: ${blocker.title}${blocker.reasons[0] ? ` — ${blocker.reasons[0]}` : ""}.`
    : action
      ? `\n\nViệc nên làm ngay: ${action}`
      : "\n\nHiện không còn vướng mắc vận hành nào đang mở.";
  return `${lead}${detail}`;
}

function answerExpiry(snapshot: AssistantSnapshot): string {
  const datedItems = snapshot.stock
    .filter((item) => item.nearestExpiry)
    .sort((left, right) => left.nearestExpiry!.localeCompare(right.nearestExpiry!));

  if (datedItems.length === 0) {
    return `Dạ, ${snapshot.warehouse.name} hiện chưa có vật tư nào được ghi nhận hạn dùng.`;
  }

  const expiryLines = datedItems
    .slice(0, 5)
    .map((item) => `•  ${item.itemName} — hạn ${formatDate(item.nearestExpiry!)}`)
    .join("\n");
  const first = datedItems[0];
  const closing = `\n\nGần nhất là ${first.itemName} (hạn ${formatDate(
    first.nearestExpiry!,
  )}), anh/chị nên ưu tiên kiểm tra để kịp xử lý.`;
  return `Dạ, các vật tư có hạn dùng gần nhất tại ${snapshot.warehouse.name} như sau:\n\n${expiryLines}${closing}`;
}

function hasAny(value: string, terms: string[]): boolean {
  return terms.some((term) => value.includes(term));
}

function severityLabel(severity: string): string {
  return SEVERITY_LABELS[severity.toUpperCase()] ?? severity.toLowerCase();
}

/** ISO "2026-07-13" → "13/07/2026" cho dễ đọc; chuỗi lạ giữ nguyên. */
function formatDate(iso: string): string {
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : iso;
}

/** Quy giờ dự báo về cụm chữ tự nhiên: 72 → "3 ngày tới", 24 → "24 giờ tới". */
function describePeriod(hours: number): string {
  if (hours > 0 && hours % 24 === 0) {
    const days = hours / 24;
    return days === 1 ? "24 giờ tới" : `${days} ngày tới`;
  }
  return `${hours} giờ tới`;
}

function normalizeVietnamese(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

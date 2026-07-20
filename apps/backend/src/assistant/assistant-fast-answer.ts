export interface AssistantSnapshot {
  warehouse: { name: string; commune: string };
  readiness: { score: number; zone: string } | null;
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

const READINESS_ZONE_LABELS: Record<string, string> = {
  READY: "sẵn sàng",
  ATTENTION: "cần chú ý",
  DEGRADED: "suy giảm",
  CRITICAL: "nghiêm trọng",
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

  if (hasAny(normalizedQuestion, ["readiness", "diem san sang", "muc san sang"])) {
    return answerReadiness(snapshot);
  }

  if (hasAny(normalizedQuestion, ["sap het han", "het han", "han dung", "con han"])) {
    return answerExpiry(snapshot);
  }

  if (hasAny(normalizedQuestion, ["bao nhieu", "so luong", "con bao", "ton bao"])) {
    const stockItem = snapshot.stock.find((item) => {
      const normalizedName = normalizeVietnamese(item.itemName);
      return normalizedQuestion.includes(normalizedName) || normalizedQuestion.includes(item.sku.toLowerCase());
    });

    if (stockItem) {
      return `Trong ${snapshot.warehouse.name} hiện còn ${stockItem.quantity} ${stockItem.unit} ${stockItem.itemName}.`;
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
    return `Chưa có dữ liệu dự báo thời tiết cho ${snapshot.warehouse.name}.`;
  }

  const alertText = snapshot.weather.alert
    ? "Có cảnh báo mưa lớn."
    : "Chưa có cảnh báo mưa lớn.";
  return `Dự báo ${snapshot.weather.periodHours} giờ tới tại ${snapshot.warehouse.name}: tổng lượng mưa ${snapshot.weather.totalRainMm} mm. ${alertText}`;
}

function answerIncidents(snapshot: AssistantSnapshot): string {
  if (snapshot.openIncidents.length === 0) {
    return `${snapshot.warehouse.name} hiện không có sự cố đang mở.`;
  }

  const incidentList = snapshot.openIncidents
    .slice(0, 5)
    .map((incident) => `${incident.title} (${incident.severity.toLowerCase()})`)
    .join("; ");
  const remaining = snapshot.openIncidents.length - 5;
  const suffix = remaining > 0 ? `; và ${remaining} sự cố khác` : "";
  return `${snapshot.warehouse.name} đang có ${snapshot.openIncidents.length} sự cố mở: ${incidentList}${suffix}.`;
}

function answerReadiness(snapshot: AssistantSnapshot): string {
  if (!snapshot.readiness) {
    return `${snapshot.warehouse.name} chưa có dữ liệu điểm sẵn sàng.`;
  }

  const zone = READINESS_ZONE_LABELS[snapshot.readiness.zone] ?? snapshot.readiness.zone;
  return `Điểm sẵn sàng của ${snapshot.warehouse.name} hiện là ${snapshot.readiness.score}/100, mức ${zone}.`;
}

function answerExpiry(snapshot: AssistantSnapshot): string {
  const datedItems = snapshot.stock
    .filter((item) => item.nearestExpiry)
    .sort((left, right) => left.nearestExpiry!.localeCompare(right.nearestExpiry!));

  if (datedItems.length === 0) {
    return `${snapshot.warehouse.name} chưa có vật tư nào được ghi nhận hạn dùng.`;
  }

  const nearestItems = datedItems
    .slice(0, 5)
    .map((item) => `${item.itemName}: ${item.nearestExpiry}`)
    .join("; ");
  return `Các vật tư có hạn dùng gần nhất tại ${snapshot.warehouse.name}: ${nearestItems}.`;
}

function hasAny(value: string, terms: string[]): boolean {
  return terms.some((term) => value.includes(term));
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

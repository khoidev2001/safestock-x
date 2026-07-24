const HIGH_SIGNAL_EMERGENCY_TERMS = [
  "mac ket",
  "co lap",
  "can cuu",
  "can so tan",
  "bi chia cat",
  "mat tich",
  "sap nha",
];

const HAZARD_TERMS = [
  "mua to",
  "mua lon",
  "lu",
  "ngap",
  "sat lo",
  "bao so",
  "anh huong bao",
  "gio bao",
  "chay",
  "hoa hoan",
];

export function resolveEmergencyAnswer(question: string): string | null {
  const normalizedQuestion = normalizeVietnamese(question);
  if (!isEmergencyScenario(normalizedQuestion)) return null;

  const location = extractLocation(question);
  const affectedPeople = extractCount(normalizedQuestion, ["nguoi", "dan"]);
  const situation = describeSituation(normalizedQuestion, affectedPeople);
  const weather = describeWeather(normalizedQuestion);
  const priority = affectedPeople !== null && affectedPeople >= 50 ? "rất khẩn cấp" : "khẩn cấp";
  const facts = [situation, weather].filter(Boolean).join(", ");

  return [
    `Dạ, đã ghi nhận tình huống ${priority}${location ? ` tại ${location}` : ""}${facts ? `: ${facts}` : ""}.`,
    describeImmediateActions(normalizedQuestion),
    describeVulnerablePeople(normalizedQuestion),
  ].join("\n\n");
}

function isEmergencyScenario(normalizedQuestion: string): boolean {
  if (hasAny(normalizedQuestion, HIGH_SIGNAL_EMERGENCY_TERMS)) return true;

  const mentionsPeople = hasAny(normalizedQuestion, ["nguoi", "dan", "ho dan"]);
  return mentionsPeople && hasAny(normalizedQuestion, HAZARD_TERMS);
}

function extractLocation(question: string): string | null {
  const match = question.match(
    /\b((?:thôn|xã|ấp|bản|buôn|khu phố|tổ dân phố)\s+.+?)(?=,|;|\.|\n|\s+(?:có|đang|với|bị|cần)(?:\s|$)|$)/iu,
  );
  return match?.[1].trim() ?? null;
}

function extractCount(normalizedQuestion: string, nouns: string[]): number | null {
  for (const noun of nouns) {
    const match = normalizedQuestion.match(new RegExp(`\\b(\\d{1,7})\\s+${noun}\\b`));
    if (match) return Number(match[1]);
  }
  return null;
}

function describeSituation(normalizedQuestion: string, affectedPeople: number | null): string {
  if (normalizedQuestion.includes("mac ket")) {
    return affectedPeople === null
      ? "số người mắc kẹt chưa được xác định"
      : `${affectedPeople} người mắc kẹt`;
  }
  if (normalizedQuestion.includes("co lap") || normalizedQuestion.includes("bi chia cat")) {
    return affectedPeople === null
      ? "số người bị cô lập chưa được xác định"
      : `${affectedPeople} người bị cô lập`;
  }
  return affectedPeople === null
    ? "số người bị ảnh hưởng chưa được xác định"
    : `${affectedPeople} người bị ảnh hưởng`;
}

function describeWeather(normalizedQuestion: string): string | null {
  if (containsTerm(normalizedQuestion, "mua to")) return "đang mưa to";
  if (containsTerm(normalizedQuestion, "mua lon")) return "đang mưa lớn";
  if (containsTerm(normalizedQuestion, "sat lo")) return "có nguy cơ hoặc dấu hiệu sạt lở";
  if (containsTerm(normalizedQuestion, "ngap") || containsTerm(normalizedQuestion, "lu"))
    return "có ngập lụt";
  if (containsTerm(normalizedQuestion, "chay") || containsTerm(normalizedQuestion, "hoa hoan"))
    return "có cháy";
  if (hasAny(normalizedQuestion, ["bao so", "anh huong bao", "gio bao"])) {
    return "đang chịu ảnh hưởng của bão";
  }
  return null;
}

function describeImmediateActions(normalizedQuestion: string): string {
  let steps: string[];

  if (hasAny(normalizedQuestion, ["chay", "hoa hoan"])) {
    steps = [
      "Giữ liên lạc liên tục với khu vực.",
      "Xác minh vị trí, nguồn cháy, khói và lối thoát.",
      "Báo lực lượng chữa cháy; cô lập điện hoặc nguồn nhiên liệu nếu làm được an toàn.",
      "Đưa người dân ra khỏi hướng khói và chuẩn bị sơ cứu.",
    ];
  } else if (containsTerm(normalizedQuestion, "sat lo")) {
    steps = [
      "Giữ liên lạc liên tục với khu vực.",
      "Xác minh điểm sạt lở, vết nứt và nguy cơ sạt tiếp.",
      "Thiết lập vị trí tập kết ngoài chân dốc, huy động lực lượng chuyên trách.",
      "Chuẩn bị sơ cứu, chiếu sáng và thiết bị liên lạc.",
    ];
  } else if (hasAny(normalizedQuestion, ["mua to", "mua lon", "lu", "ngap"])) {
    steps = [
      "Giữ liên lạc liên tục với khu vực.",
      "Xác minh vị trí chính xác, mực nước và đường tiếp cận.",
      "Huy động lực lượng, phương tiện cứu hộ phù hợp.",
      "Chuẩn bị áo phao, sơ cứu và nước uống.",
    ];
  } else {
    steps = [
      "Giữ liên lạc liên tục với khu vực.",
      "Xác minh vị trí chính xác, mối nguy và đường tiếp cận.",
      "Huy động lực lượng, phương tiện cứu hộ phù hợp.",
      "Chuẩn bị sơ cứu, nước uống và thiết bị liên lạc.",
    ];
  }

  const lines = steps.map((step) => `•  ${step}`).join("\n");
  return `Việc cần làm ngay:\n${lines}`;
}

function describeVulnerablePeople(normalizedQuestion: string): string {
  const children = extractCount(normalizedQuestion, ["tre em", "tre"]);
  const elderly = extractCount(normalizedQuestion, ["nguoi gia", "nguoi cao tuoi"]);
  const explicitlyUnknown =
    normalizedQuestion.includes("chua ro") &&
    hasAny(normalizedQuestion, ["tre em", "nguoi gia", "nguoi cao tuoi"]);

  if (explicitlyUnknown) {
    return "Chưa rõ số người già và trẻ em — không được xem là 0; cần thống kê ngay cùng số người bị thương hoặc cần hỗ trợ y tế.";
  }

  const knownGroups = [
    children === null ? null : `${children} trẻ em`,
    elderly === null ? null : `${elderly} người già`,
  ].filter(Boolean);
  if (knownGroups.length > 0) {
    return `Nhóm dễ bị tổn thương đã ghi nhận: ${knownGroups.join(", ")}; cần tiếp tục xác minh người bị thương hoặc cần hỗ trợ y tế.`;
  }

  return "Cần xác minh ngay số trẻ em, người già, người bị thương và người cần hỗ trợ y tế; chưa có số liệu không có nghĩa là bằng 0.";
}

function hasAny(value: string, terms: string[]): boolean {
  return terms.some((term) => containsTerm(value, term));
}

function containsTerm(value: string, term: string): boolean {
  return ` ${value} `.includes(` ${term} `);
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

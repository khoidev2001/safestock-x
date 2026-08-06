export interface DailyBriefingSnapshot {
  date: string;
  warehouse: { name: string };
  readiness: {
    score: number | null;
    maxScore: 100;
    operationalStatus: string | null;
  };
  weather: {
    totalRainMm: number;
    periodHours: 72;
    alert: boolean;
    /** Mưa theo từng mốc giờ; rỗng khi nguồn chỉ có số liệu ngày. */
    horizons?: { hours: number; rainMm: number; maxWindKph: number | null }[];
  } | null;
  inventory: {
    lowStockCount: number;
    expiringBatchCount: number;
    weatherRiskCount: number;
  };
  incidents: {
    openCount: number;
    highOrCriticalCount: number;
  };
}

/** LLM chỉ được nhắc số đã có trong snapshot; sai hợp đồng thì dùng template. */
export function narrativeUsesOnlySnapshotNumbers(
  narrative: string,
  snapshot: DailyBriefingSnapshot,
): boolean {
  const numberPattern = /(?<![\p{L}\p{N}])\d+(?:[.,]\d+)?/gu;
  const allowed = new Set(
    (JSON.stringify(snapshot).match(numberPattern) ?? []).map(normalizeNumber),
  );
  return (narrative.match(numberPattern) ?? [])
    .map(normalizeNumber)
    .every((number) => allowed.has(number));
}

export function buildDailyBriefingTemplate(snapshot: DailyBriefingSnapshot): string {
  return buildDailyBriefingFacts(snapshot)
    .map((fact) => fact.text)
    .join(" ");
}

export function buildDailyBriefingFacts(
  snapshot: DailyBriefingSnapshot,
): { id: string; text: string }[] {
  const readiness =
    snapshot.readiness.score == null
      ? "chưa chấm điểm sẵn sàng"
      : `điểm sẵn sàng ${snapshot.readiness.score}/${snapshot.readiness.maxScore}`;
  const weather = snapshot.weather
    ? `Mưa dự báo ${snapshot.weather.periodHours} giờ là ${snapshot.weather.totalRainMm} mm`
    : "Chưa lấy được dữ liệu mưa 72 giờ";
  // Chỉ nêu các mốc CÓ mưa. Đọc ra "1 giờ 0 mm, 6 giờ 0 mm, 12 giờ 0 mm" là bốn
  // dòng không nói thêm được gì, trong khi mốc đầu tiên có mưa mới là tin đáng nghe.
  const wetHorizons = (snapshot.weather?.horizons ?? []).filter((item) => item.rainMm > 0);
  const windiest = (snapshot.weather?.horizons ?? []).reduce<number | null>(
    (max, item) =>
      item.maxWindKph == null
        ? max
        : max == null
          ? item.maxWindKph
          : Math.max(max, item.maxWindKph),
    null,
  );
  const statusLabel =
    {
      READY: "sẵn sàng điều phối",
      NEEDS_ACTION: "cần xử lý",
      NOT_DISPATCHABLE: "chưa thể điều phối",
    }[snapshot.readiness.operationalStatus ?? ""] ?? "chưa xác định";
  // Chỉ nói những gì CÓ. Bản tin cũ đọc ra "0 mặt hàng tồn thấp, 0 sự cố đang mở,
  // 0 mặt hàng có nguy cơ" — ba con số 0 chen giữa các dòng thật, làm loãng đúng
  // thứ cần chú ý. Không có vấn đề thì nói gọn một câu là hết.
  const facts = [
    {
      id: "F1",
      text: `${snapshot.warehouse.name}: ${readiness}, trạng thái ${statusLabel}.`,
    },
    {
      id: "F2",
      text:
        snapshot.inventory.weatherRiskCount > 0
          ? `${weather}; ${snapshot.inventory.weatherRiskCount} mặt hàng có nguy cơ thiếu do mưa.`
          : `${weather}; chưa mặt hàng nào có nguy cơ thiếu do mưa.`,
    },
  ];
  if (wetHorizons.length > 0) {
    facts.push({
      id: "F5",
      text: `Mưa theo mốc: ${wetHorizons
        .map((item) => `${item.hours} giờ tới ${item.rainMm} mm`)
        .join(", ")}.`,
    });
  }
  if (windiest != null) {
    facts.push({ id: "F6", text: `Gió mạnh nhất dự báo ${windiest} km/h.` });
  }
  const stock: string[] = [];
  if (snapshot.inventory.lowStockCount > 0) {
    stock.push(`${snapshot.inventory.lowStockCount} mặt hàng tồn thấp`);
  }
  if (snapshot.inventory.expiringBatchCount > 0) {
    stock.push(`${snapshot.inventory.expiringBatchCount} lô gần hết hạn`);
  }
  if (stock.length > 0) {
    facts.push({ id: "F3", text: `Cần rà soát ${stock.join(" và ")}.` });
  }
  if (snapshot.incidents.openCount > 0) {
    facts.push({
      id: "F4",
      text:
        snapshot.incidents.highOrCriticalCount > 0
          ? `Có ${snapshot.incidents.openCount} sự cố đang mở, trong đó ${snapshot.incidents.highOrCriticalCount} sự cố mức cao hoặc nghiêm trọng.`
          : `Có ${snapshot.incidents.openCount} sự cố đang mở.`,
    });
  }
  return facts;
}

export function buildDailyBriefingPriorities(
  snapshot: DailyBriefingSnapshot,
  weatherRisks: { itemName: string; shortage: number; unit: string }[],
): string[] {
  const priorities = weatherRisks
    .filter((item) => item.shortage > 0)
    .slice(0, 3)
    .map(
      (item) =>
        `Rà soát bổ sung ${item.itemName}: dự báo thiếu ${item.shortage} ${item.unit} trong 72 giờ.`,
    );
  if (snapshot.incidents.highOrCriticalCount > 0) {
    priorities.push(
      `Xử lý ${snapshot.incidents.highOrCriticalCount} sự cố mức cao hoặc nghiêm trọng đang mở.`,
    );
  } else if (snapshot.incidents.openCount > 0) {
    priorities.push(`Rà soát ${snapshot.incidents.openCount} sự cố đang mở.`);
  }
  if (snapshot.inventory.lowStockCount > 0) {
    priorities.push(`Rà soát ${snapshot.inventory.lowStockCount} mặt hàng tồn thấp.`);
  }
  if (snapshot.inventory.expiringBatchCount > 0) {
    priorities.push(
      `Xử lý ${snapshot.inventory.expiringBatchCount} lô gần hết hạn, ưu tiên lô hết hạn trước.`,
    );
  }
  if (snapshot.readiness.operationalStatus === "NOT_DISPATCHABLE") {
    priorities.push("Xử lý các vướng mắc đang chặn điều phối trước khi cấp phát vật tư.");
  }
  if (priorities.length === 0) {
    priorities.push("Duy trì kiểm kê, theo dõi thời tiết và xử lý cảnh báo mới trong ngày.");
  }
  return priorities.slice(0, 5);
}

function normalizeNumber(value: string): string {
  return value.replace(",", ".").replace(/^0+(?=\d)/, "");
}

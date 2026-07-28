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
      ? "chưa có điểm readiness mới nhất"
      : `readiness ${snapshot.readiness.score}/${snapshot.readiness.maxScore}`;
  const weather = snapshot.weather
    ? `Mưa dự báo ${snapshot.weather.periodHours} giờ là ${snapshot.weather.totalRainMm} mm`
    : "Chưa lấy được dữ liệu mưa 72 giờ";
  const statusLabel =
    {
      READY: "sẵn sàng điều phối",
      NEEDS_ACTION: "cần xử lý",
      NOT_DISPATCHABLE: "chưa thể điều phối",
    }[snapshot.readiness.operationalStatus ?? ""] ?? "chưa xác định";
  return [
    {
      id: "F1",
      text: `${snapshot.warehouse.name}: ${readiness}, trạng thái ${statusLabel}.`,
    },
    {
      id: "F2",
      text: `${weather}; ${snapshot.inventory.weatherRiskCount} mặt hàng có nguy cơ thiếu do mưa.`,
    },
    {
      id: "F3",
      text: `Cần rà soát ${snapshot.inventory.lowStockCount} mặt hàng tồn thấp và ${snapshot.inventory.expiringBatchCount} lô gần hết hạn.`,
    },
    {
      id: "F4",
      text: `Có ${snapshot.incidents.openCount} sự cố đang mở, trong đó ${snapshot.incidents.highOrCriticalCount} sự cố mức cao hoặc nghiêm trọng.`,
    },
  ];
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
    priorities.push(`Xử lý ${snapshot.inventory.expiringBatchCount} lô gần hết hạn theo FEFO.`);
  }
  if (snapshot.readiness.operationalStatus === "NOT_DISPATCHABLE") {
    priorities.push("Xử lý blocker readiness trước khi điều phối vật tư.");
  }
  if (priorities.length === 0) {
    priorities.push("Duy trì kiểm kê, theo dõi thời tiết và xử lý cảnh báo mới trong ngày.");
  }
  return priorities.slice(0, 5);
}

function normalizeNumber(value: string): string {
  return value.replace(",", ".").replace(/^0+(?=\d)/, "");
}

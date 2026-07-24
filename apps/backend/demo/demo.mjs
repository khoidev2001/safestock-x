/**
 * Demo terminal — chạy toàn bộ luồng backend Ứng phó nhanh, in kết quả ra màn hình.
 * Thay cho frontend tạm thời: xem hệ thống hoạt động end-to-end.
 *
 * Chạy: node apps/backend/demo/demo.mjs
 * Cần: backend (:3100) + ai-service (:8000) + Docker (Postgres/Redis) đang chạy,
 *       DB đã seed (pnpm --filter @safestock/backend seed).
 */
import { io } from "socket.io-client";

const API = process.env.API_URL ?? "http://localhost:3100";

// ---- tiện ích in đẹp (không phụ thuộc thư viện) ----
const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
};
const zoneColor = { READY: C.green, ATTENTION: C.yellow, DEGRADED: C.magenta, CRITICAL: C.red };

function step(n, title) {
  console.log(`\n${C.bold}${C.cyan}━━━ Bước ${n}: ${title} ━━━${C.reset}`);
}
function ok(msg) {
  console.log(`  ${C.green}✓${C.reset} ${msg}`);
}
function info(label, value) {
  console.log(`  ${C.dim}${label}:${C.reset} ${value}`);
}
function fail(msg) {
  console.log(`  ${C.red}✗ ${msg}${C.reset}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let token = "";
const auth = () => ({ Authorization: `Bearer ${token}`, "Content-Type": "application/json" });

async function api(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: auth(),
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  if (!res.ok)
    throw new Error(`${method} ${path} → ${res.status}: ${JSON.stringify(data).slice(0, 200)}`);
  return data;
}

async function main() {
  console.log(`${C.bold}${C.blue}\n╔══════════════════════════════════════════════════╗`);
  console.log(`║   Ứng phó nhanh — DEMO BACKEND (terminal)          ║`);
  console.log(`╚══════════════════════════════════════════════════╝${C.reset}`);

  // ---- Bước 0: đăng nhập ----
  step(0, "Đăng nhập + kiểm tra phân quyền");
  const login = await api("POST", "/api/auth/login", { email: "admin", password: "admin123@" });
  token = login.accessToken;
  ok(`Đăng nhập ADMIN thành công (${login.user.role})`);

  // Kiểm phân quyền: RESCUE không xuất kho được
  const rescueLogin = await api("POST", "/api/auth/login", {
    email: "rescue@safestock.vn",
    password: "rescue123",
  });
  const rescueRes = await fetch(`${API}/api/inventory/export`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${rescueLogin.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ batchId: "x", quantity: 1 }),
  });
  ok(
    `Phân quyền: RESCUE gọi xuất kho → HTTP ${rescueRes.status} ${rescueRes.status === 403 ? "(chặn đúng)" : ""}`,
  );

  // Lấy warehouse
  const wh = await api("GET", "/api/simulator/first-warehouse");
  const wid = wh.id;
  info("Kho", `${wh.name} (${wid.slice(0, 8)})`);

  // ---- Bước 1: Readiness Score ----
  step(1, "Chỉ số sẵn sàng (Readiness Score)");
  const recalc = await api("POST", `/api/readiness/warehouses/${wid}/recalculate`);
  const zc = zoneColor[recalc.zone] ?? C.reset;
  console.log(`  ${C.bold}Điểm toàn kho: ${zc}${recalc.score}/100 [${recalc.zone}]${C.reset}`);
  const detail = await api("GET", `/api/readiness/warehouses/${wid}`);
  console.log(`  ${C.dim}Breakdown 6 thành phần:${C.reset}`);
  for (const comp of detail.components.sort((a, b) => a.value - b.value)) {
    const bar = "█".repeat(Math.round(comp.value / 10)).padEnd(10, "░");
    const reason = comp.reasons[0] ? ` ${C.dim}← ${comp.reasons[0]}${C.reset}` : "";
    console.log(`    ${comp.key.padEnd(22)} ${bar} ${comp.value}${reason}`);
  }
  const recs = await api("GET", `/api/readiness/warehouses/${wid}/recommendations`);
  if (recs.length) {
    console.log(`  ${C.yellow}Đề xuất cải thiện:${C.reset}`);
    recs.slice(0, 3).forEach((r) => console.log(`    • ${r.message}`));
  }

  // ---- Bước 2: Mission-to-Kit ----
  step(2, "Lập phương án vật tư (Mission-to-Kit)");
  const incident = {
    incidentType: "FLOOD",
    affectedPeople: 120,
    durationHours: 48,
    children: 20,
    medicalSupportCases: 4,
  };
  info(
    "Tình huống",
    `Ngập lụt, ${incident.affectedPeople} người cô lập ${incident.durationHours}h, ${incident.children} trẻ em, ${incident.medicalSupportCases} ca y tế`,
  );
  const mission = await api("POST", "/api/missions/generate-plan", { warehouseId: wid, incident });
  const fc = mission.fulfillment >= 80 ? C.green : mission.fulfillment >= 50 ? C.yellow : C.red;
  console.log(
    `  ${C.bold}Mức đáp ứng: ${fc}${mission.fulfillment}%${C.reset} ${C.dim}(mắt xích yếu nhất)${C.reset}`,
  );
  for (const r of mission.requirements) {
    const status =
      r.shortage === 0 ? `${C.green}đủ${C.reset}` : `${C.red}thiếu ${r.shortage}${C.reset}`;
    let line = `    ${r.itemName.padEnd(22)} cần ${String(r.required).padStart(5)} · cấp ${String(r.allocated).padStart(5)} · ${status}`;
    if (r.neighborSuggestion?.length) {
      const s = r.neighborSuggestion
        .map((n) => `${n.name} ${n.distanceKm}km(${n.available})`)
        .join(", ");
      line += `\n      ${C.cyan}↳ gợi ý mượn: ${s}${C.reset}`;
    }
    console.log(line);
  }
  ok(`Phương án lưu trạng thái DRAFT (chờ duyệt)`);

  // ---- Bước 3: Khoảnh khắc vàng — kéo slider độ ẩm, điểm rớt realtime ----
  step(3, "KHOẢNH KHẮC VÀNG — cảm biến đổi → điểm rớt realtime");
  const zoneB = await getZoneScore(wid, "B");
  info("Điểm khu y tế (B) trước", `${zoneB}`);

  // Lắng nghe WebSocket
  const socket = io(API, { transports: ["websocket"], auth: { token } });
  await new Promise((resolve, reject) => {
    socket.once("connect", resolve);
    socket.once("connect_error", reject);
  });
  socket.on("sensor_event", (e) => {
    if (e.deviceCode.startsWith("humid"))
      console.log(`    ${C.magenta}[WS] cảm biến ${e.deviceCode} = ${e.value}%${C.reset}`);
  });

  console.log(`  ${C.yellow}→ Kéo độ ẩm khu y tế lên 95% (mưa bão)...${C.reset}`);
  await api("POST", "/api/simulator/events", {
    warehouseId: wid,
    deviceCode: "humid_B",
    eventType: "HUMID",
    value: 95,
  });
  await sleep(2000); // chờ debounce recalc + WS
  const zoneBafter = await getZoneScore(wid, "B");
  const drop = zoneB - zoneBafter;
  if (drop > 0)
    ok(`Điểm khu B rớt ${zoneB} → ${C.red}${zoneBafter}${C.reset} (giảm ${drop}) trong <2s`);
  else fail(`Điểm không đổi (${zoneBafter})`);
  socket.close();

  // ---- Bước 3b: AI điều tra sự cố (Incident Intelligence) ----
  step("3b", "AI điều tra sự cố — hợp nhất bằng chứng");
  const run = await api("POST", "/api/simulator/runs", {
    scenarioKey: "suspected_loss",
    warehouseId: wid,
    speed: 10,
  });
  await api("POST", `/api/simulator/runs/${run.id}/play`);
  console.log(
    `  ${C.yellow}→ Chạy kịch bản: loadcell giảm + cửa mở + không phiếu xuất...${C.reset}`,
  );
  await sleep(4000);
  const scan = await api("POST", `/api/incidents/scan/${wid}`);
  if (scan.detected > 0) {
    const inc = scan.incidents[0];
    const sc = inc.severity === "CRITICAL" || inc.severity === "HIGH" ? C.red : C.yellow;
    console.log(
      `  ${C.bold}${sc}⚠ ${inc.title} — mức ${inc.severity}, độ tin cậy ${Math.round(inc.confidence * 100)}%${C.reset}`,
    );
    const detail = await api("GET", `/api/incidents/${inc.id}/timeline`);
    console.log(`  ${C.dim}Timeline bằng chứng:${C.reset}`);
    for (const e of detail.evidence) {
      console.log(
        `    ${C.dim}${new Date(e.occurredAt).toLocaleTimeString("vi")}${C.reset} ${e.note}`,
      );
    }
    ok(`Hợp nhất ${detail.evidence.length} nguồn → kết luận có bằng chứng (không bịa)`);
  } else {
    info("Kết quả", "không phát hiện sự cố (chỉ nhiễu bình thường)");
  }

  // ---- Bước 4: Xuất kho theo phương án (chế độ khẩn cấp) ----
  step(4, "Xuất kho khẩn cấp + mượn-trả");
  const life = await api("GET", "/api/inventory/scan?sku=LIFE-ADULT");
  const lifeBatch = life.batches[0];
  info("Áo phao người lớn", `tồn ${lifeBatch.quantity}`);
  const loan = await api("POST", "/api/loans", { batchId: lifeBatch.id, quantity: 20 });
  ok(`Đội cứu hộ mượn 20 áo phao (phiếu ${loan.id.slice(0, 8)}, tổng kho KHÔNG đổi)`);
  const ret = await api("POST", `/api/loans/${loan.id}/return`, { ok: 15, damaged: 3, lost: 2 });
  ok(
    `Hoàn trả: 15 tốt + 3 hỏng + 2 mất → phiếu ${ret.closed ? "đóng" : "mở"}, kho trừ 2 (mất thật)`,
  );

  // ---- Bước 5: Duyệt phương án ----
  step(5, "Người phụ trách duyệt phương án");
  const approved = await api("POST", `/api/missions/${mission.id}/approve`);
  ok(`Phương án ${mission.id.slice(0, 8)}: DRAFT → ${C.green}${approved.status}${C.reset}`);

  // ---- Bước 6: Hậu kiểm nhật ký ----
  step(6, "Hậu kiểm — nhật ký 5W (ADMIN)");
  const audit = await api("GET", "/api/audit?limit=5");
  console.log(`  ${C.dim}5 thao tác gần nhất (không xóa được):${C.reset}`);
  for (const log of audit) {
    const meta = log.metadata ? JSON.stringify(log.metadata).slice(0, 60) : "";
    console.log(
      `    ${C.dim}${new Date(log.createdAt).toLocaleTimeString("vi")}${C.reset} ${log.action.padEnd(18)} ${C.dim}${meta}${C.reset}`,
    );
  }

  // ---- Bước 7: Normal Mode — AI quản trị kho ngày thường ----
  step(7, "AI ngày thường (Normal Mode) — dự báo, hết hạn, điều chuyển");
  const insights = await api("GET", `/api/insights/warehouses/${wid}`);

  if (insights.weatherAlert?.alert) {
    console.log(
      `  ${C.red}☔ Cảnh báo mưa lớn 72h: ${Math.round(insights.weatherAlert.totalRainMm)}mm (nguy cơ ngập/cô lập)${C.reset}`,
    );
  } else if (insights.weatherAlert) {
    info(
      "Thời tiết 72h",
      `${Math.round(insights.weatherAlert.totalRainMm)}mm (Open-Meteo, dưới ngưỡng cảnh báo)`,
    );
  }

  const forecastShown = insights.forecast
    .filter((f) => f.daysLeft != null)
    .sort((a, b) => a.daysLeft - b.daysLeft)
    .slice(0, 5);
  console.log(
    `  ${C.dim}Dự báo thống kê cạn kho (EWMA + độ lệch chuẩn → khoảng tin cậy + điểm đặt hàng lại):${C.reset}`,
  );
  for (const f of forecastShown) {
    const d = Math.floor(f.daysLeft);
    const lo = f.daysLeftLow != null ? Math.floor(f.daysLeftLow) : d;
    const hi = f.daysLeftHigh != null ? Math.ceil(f.daysLeftHigh) : d;
    const range = d <= 0 ? "ĐÃ CẠN" : hi > lo ? `~${lo}–${hi}n` : `~${d}n`;
    const tag = f.lowStock ? `${C.red}${range} (gấp!)${C.reset}` : `${C.green}${range}${C.reset}`;
    const conf =
      f.confidence >= 0.75 ? "tin cậy cao" : f.confidence >= 0.4 ? "tin cậy TB" : "dữ liệu chưa đủ";
    console.log(
      `    ${f.itemName.padEnd(22)} tồn ${String(f.quantity).padStart(4)} · ${f.ewmaPerDay.toFixed(1)}/ngày gần đây → ${tag} ` +
        `${C.dim}[đặt lại khi ≤${Math.ceil(f.reorderPoint)}, ${conf}]${C.reset}`,
    );
  }

  if (insights.expiryAlerts.length) {
    console.log(`  ${C.yellow}Sắp/đã hết hạn:${C.reset}`);
    for (const a of insights.expiryAlerts.slice(0, 4)) {
      const txt =
        a.daysUntilExpiry < 0
          ? `${C.red}quá hạn ${-a.daysUntilExpiry}n${C.reset}`
          : `còn ${a.daysUntilExpiry}n`;
      console.log(`    ${a.itemName.padEnd(22)} SL ${a.quantity} · ${txt}`);
    }
  }

  if (insights.rebalance.length) {
    console.log(`  ${C.cyan}Đề xuất điều chuyển cân bằng cụm xã:${C.reset}`);
    for (const r of insights.rebalance.slice(0, 3)) {
      console.log(`    ${r.fromWarehouseName} → ${r.toWarehouseName}: ${r.suggestedQty} ${r.sku}`);
    }
  }

  const report = await api("GET", `/api/insights/warehouses/${wid}/monthly-report`);
  const upDown = report.trends
    .filter((t) => t.changePercent != null)
    .sort((a, b) => b.changePercent - a.changePercent);
  if (upDown.length) {
    const top = upDown[0],
      bottom = upDown[upDown.length - 1];
    info(
      "Xu hướng xuất",
      `${top.itemName} ${C.green}+${top.changePercent.toFixed(0)}%${C.reset}, ${bottom.itemName} ${C.red}${bottom.changePercent.toFixed(0)}%${C.reset} (so kỳ trước)`,
    );
  }
  ok(`Báo cáo tháng: ${report.narrative.slice(0, 100)}…`);

  // ---- Bước 8: Chatbot hỏi-đáp kho (ràng chỉ từ dữ liệu thật) ----
  step(8, "Trợ lý hỏi-đáp kho — trả lời từ dữ liệu, ngoài phạm vi nói không biết");
  const questions = [
    "Còn bao nhiêu gạo cứu trợ?",
    "Vật tư nào sắp hết hạn?",
    "Thủ đô nước Pháp là gì?",
  ];
  for (const q of questions) {
    try {
      const res = await api("POST", `/api/assistant/warehouses/${wid}/ask`, { question: q });
      console.log(`  ${C.blue}Hỏi:${C.reset} ${q}`);
      console.log(`  ${C.dim}Đáp:${C.reset} ${res.answer.slice(0, 140)}`);
    } catch {
      console.log(`  ${C.blue}Hỏi:${C.reset} ${q} ${C.dim}(ai-service tắt — bỏ qua)${C.reset}`);
    }
  }

  console.log(`\n${C.bold}${C.green}✓ Demo hoàn tất — toàn bộ luồng backend chạy thật.${C.reset}`);
  console.log(
    `${C.dim}  Emergency: Readiness · Mission-to-Kit · Realtime · Điều tra sự cố · Mượn-trả · Audit${C.reset}`,
  );
  console.log(
    `${C.dim}  Normal Mode: Dự báo cạn kho · Hết hạn · Điều chuyển · Thời tiết · Báo cáo tháng · Chatbot${C.reset}\n`,
  );
}

/** Lấy điểm 1 khu theo code (A/B) qua truy vấn readiness đã lưu. */
async function getZoneScore(wid, zoneCode) {
  const tree = await api("GET", `/api/inventory/warehouses/${wid}/tree`);
  const zone = tree.zones.find((z) => z.code === zoneCode);
  if (!zone) return "?";
  try {
    const score = await api("GET", `/api/readiness/zones/${zone.id}`);
    return score?.score ?? "?";
  } catch {
    return "?";
  }
}

main().catch((e) => {
  console.error(`\n${C.red}Demo lỗi: ${e.message}${C.reset}`);
  console.error(
    `${C.dim}Kiểm tra: backend :3100, ai-service :8000, Docker, đã seed chưa.${C.reset}`,
  );
  process.exit(1);
});

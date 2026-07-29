import { useCallback, useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import {
  getAccessToken,
  getBase,
  getSessionVersion,
  login,
  logout,
  logoutServer,
  refreshAccessToken,
  setBase,
  type AuthUser,
} from "./lib/api";
import {
  createRun,
  emitEvent,
  firstWarehouse,
  getReadiness,
  listDevices,
  listIncidents,
  listScenarios,
  playRun,
  resetRun,
  type Incident,
  type ReadinessScore,
  type Scenario,
  type VirtualDevice,
  type Warehouse,
} from "./lib/backend";
import {
  ADJUSTABLE_TYPES,
  formatDeviceName,
  operationalStatusLabels,
  severityLabels,
  severityTone,
  sliderConfigByType,
} from "./lib/labels";
import { connectSocket } from "./lib/socket";

interface LogLine {
  id: number;
  at: string;
  text: string;
  tone?: "info" | "sensor" | "alert";
}

// Không hard-code credential trong source. Prefill (tuỳ chọn) chỉ đến từ biến môi
// trường build-time cho tiện demo local; production/đóng gói không đặt biến này nên
// ô nhập rỗng và người dùng tự nhập tài khoản.
const DEFAULT_ADMIN_EMAIL = import.meta.env.RENDERER_VITE_ADMIN_EMAIL ?? "";
const DEFAULT_ADMIN_PASSWORD = import.meta.env.RENDERER_VITE_ADMIN_PASSWORD ?? "";

export function App() {
  const [host, setHost] = useState("localhost:3100");
  const [email, setEmail] = useState(DEFAULT_ADMIN_EMAIL);
  const [password, setPassword] = useState(DEFAULT_ADMIN_PASSWORD);
  const [authed, setAuthed] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [warehouse, setWarehouse] = useState<Warehouse | null>(null);
  const [devices, setDevices] = useState<VirtualDevice[]>([]);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [readiness, setReadiness] = useState<ReadinessScore | null>(null);
  const [incidents, setIncidents] = useState<Incident[]>([]);

  const [wsConnected, setWsConnected] = useState(false);
  const [log, setLog] = useState<LogLine[]>([]);
  const logSeq = useRef(0);
  const socketRef = useRef<Socket | null>(null);

  // Giá trị slider cục bộ (khởi tạo từ currentValue thiết bị).
  const [sliderValues, setSliderValues] = useState<Record<string, number>>({});

  const [scenarioKey, setScenarioKey] = useState("");
  const [speed, setSpeed] = useState<1 | 10>(1);
  const [runId, setRunId] = useState<string | null>(null);

  const pushLog = useCallback((text: string, tone: LogLine["tone"] = "info") => {
    const at = new Intl.DateTimeFormat("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(new Date());
    setLog((prev) => [{ id: logSeq.current++, at, text, tone }, ...prev].slice(0, 60));
  }, []);

  const refreshReactions = useCallback(async (warehouseId: string) => {
    const [score, incs] = await Promise.all([
      getReadiness(warehouseId).catch(() => null),
      listIncidents(warehouseId).catch(() => [] as Incident[]),
    ]);
    setReadiness(score);
    setIncidents(incs);
  }, []);

  // ---- Đăng nhập + nạp danh mục + mở WS ----
  async function handleLogin() {
    if (!email.trim() || !password) {
      setLoginError("Nhập email và mật khẩu admin để đăng nhập.");
      return;
    }
    setBusy(true);
    setLoginError(null);
    try {
      setBase(host);
      const u = await login(email.trim(), password);
      pushLog(`Đăng nhập thành công (${u.role}).`);

      // Nạp toàn bộ trạng thái nền TRƯỚC khi chuyển sang màn hình đã đăng nhập. Nếu bất kỳ
      // bước nào hỏng thì catch sẽ thu hồi phiên → tránh kẹt ở trạng thái "đăng nhập một
      // nửa" (authed=true nhưng chưa có kho/thiết bị).
      const wh = await firstWarehouse();
      if (!wh) throw new Error("Không tìm thấy kho nào");

      const [devs, scns] = await Promise.all([listDevices(wh.id), listScenarios()]);

      const initValues: Record<string, number> = {};
      for (const d of devs) {
        if (ADJUSTABLE_TYPES.includes(d.type)) initValues[d.code] = d.currentValue ?? 0;
      }

      setUser(u);
      setWarehouse(wh);
      pushLog(`Mở kho: ${wh.name}`);
      setDevices(devs);
      setScenarios(scns);
      if (scns[0]) setScenarioKey(scns[0].key);
      setSliderValues(initValues);
      setAuthed(true);

      await refreshReactions(wh.id);
      openSocket(wh.id);
    } catch (err) {
      // Bootstrap hỏng sau khi login: xoá phiên cục bộ để không mắc kẹt nửa vời.
      logout();
      setAuthed(false);
      setUser(null);
      setWarehouse(null);
      setLoginError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function openSocket(warehouseId: string) {
    socketRef.current?.disconnect();
    socketRef.current = connectSocket(
      getBase(),
      getAccessToken,
      getSessionVersion,
      refreshAccessToken,
      {
        onConnect: () => {
          setWsConnected(true);
          pushLog("WebSocket đã kết nối — nghe realtime.");
        },
        onDisconnect: () => setWsConnected(false),
        onConnectError: (message) => {
          setWsConnected(false);
          pushLog(`WebSocket rejected: ${message}`, "alert");
        },
        onSensorEvent: (p) => {
          const deviceCode = p.deviceCode;
          const value = p.value;
          if (deviceCode && typeof value === "number") {
            setSliderValues((prev) => ({ ...prev, [deviceCode]: value }));
            setDevices((prev) =>
              prev.map((device) =>
                device.code === deviceCode ? { ...device, currentValue: value } : device,
              ),
            );
          }
          pushLog(
            `[realtime] ${p.deviceCode ?? "?"} = ${p.value ?? "?"}${p.unit ?? ""} (${p.eventType ?? ""})`,
            "sensor",
          );
          // Kịch bản đổi cảm biến → readiness/incident có thể đổi → refetch (debounce nhẹ).
          scheduleReactionRefresh(warehouseId);
        },
        onNotification: (p) => {
          // Backend đẩy 2 lần cùng 1 cảnh báo: bản rule-based (nổ ngay) rồi bản enrich
          // (body thêm " — <giải thích AI>"). Tách để dòng AI hiện rõ là tin nhắn AI.
          const body = p.body ?? "";
          const sep = body.indexOf(" — ");
          if (sep >= 0) {
            pushLog(`🤖 AI cảnh báo: ${p.title ?? ""} — ${body.slice(sep + 3)}`, "alert");
          } else {
            pushLog(`⚠️ CẢNH BÁO: ${p.title ?? ""} — ${body}`, "alert");
          }
          scheduleReactionRefresh(warehouseId);
        },
      },
    );
  }

  // Gộp nhiều tín hiệu realtime thành 1 lần refetch (tránh gọi API dồn dập).
  const reactionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleReactionRefresh = useCallback(
    (warehouseId: string) => {
      if (reactionTimer.current) clearTimeout(reactionTimer.current);
      reactionTimer.current = setTimeout(() => refreshReactions(warehouseId), 800);
    },
    [refreshReactions],
  );

  useEffect(
    () => () => {
      socketRef.current?.disconnect();
      if (reactionTimer.current) clearTimeout(reactionTimer.current);
    },
    [],
  );

  // ---- Gửi 1 event từ slider ----
  async function sendSlider(device: VirtualDevice, value: number) {
    if (!warehouse) return;
    const cfg = sliderConfigByType[device.type];
    if (!cfg) return;
    setSliderValues((prev) => ({ ...prev, [device.code]: value }));
    try {
      await emitEvent({
        warehouseId: warehouse.id,
        deviceCode: device.code,
        eventType: cfg.eventType,
        value,
      });
      // Backend phát sensor_event cho cả chỉnh tay; callback realtime cập nhật UI và phản ứng.
    } catch (err) {
      pushLog(`Gửi lỗi: ${(err as Error).message}`, "alert");
    }
  }

  // ---- Kịch bản ----
  async function handleRunScenario() {
    if (!warehouse || !scenarioKey) return;
    setBusy(true);
    try {
      const run = await createRun(scenarioKey, warehouse.id, speed);
      setRunId(run.id);
      await playRun(run.id);
      pushLog(`Chạy kịch bản "${scenarioKey}" (x${speed}).`);
    } catch (err) {
      pushLog(`Chạy kịch bản lỗi: ${(err as Error).message}`, "alert");
    } finally {
      setBusy(false);
    }
  }

  async function handleResetScenario() {
    if (!runId) return;
    try {
      await resetRun(runId);
      // Reset chỉ đưa con trỏ run về 0 (IDLE) để chạy lại; KHÔNG xoá sensor event / tồn kho
      // đã sinh. Muốn dữ liệu sạch hoàn toàn thì tạo run mới hoặc seed lại kho demo.
      pushLog("Đã reset con trỏ kịch bản (dữ liệu đã sinh vẫn giữ). Tạo run mới nếu cần dữ liệu sạch.");
      if (warehouse) refreshReactions(warehouse.id);
    } catch (err) {
      pushLog(`Reset lỗi: ${(err as Error).message}`, "alert");
    }
  }

  function handleLogout() {
    socketRef.current?.disconnect();
    void logoutServer();
    setAuthed(false);
    setUser(null);
    setWarehouse(null);
    setDevices([]);
    setReadiness(null);
    setIncidents([]);
    setWsConnected(false);
    setLog([]);
  }

  const adjustableDevices = devices.filter((d) => ADJUSTABLE_TYPES.includes(d.type));

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <h1>Ứng phó nhanh · Giả lập cảm biến</h1>
          <p className="sub">Chỉnh thông số → xem app phản ứng (readiness + cảnh báo sự cố)</p>
        </div>
        <div className="conn">
          <span className={`dot ${wsConnected ? "on" : "off"}`} />
          <span className="conn-label">{wsConnected ? "Realtime đang chạy" : "Chưa kết nối"}</span>
          {authed && (
            <button className="btn ghost" onClick={handleLogout}>
              Đăng xuất
            </button>
          )}
        </div>
      </header>

      {!authed ? (
        <section className="card login">
          <h2>Kết nối backend</h2>
          <label className="field">
            <span>Địa chỉ máy chủ</span>
            <input
              value={host}
              onChange={(e) => setHost(e.target.value)}
              placeholder="localhost:3100 hoặc 192.168.1.x"
            />
          </label>
          <label className="field">
            <span>Email admin</span>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              placeholder="admin@safestock.local"
            />
          </label>
          <label className="field">
            <span>Mật khẩu</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleLogin();
              }}
              placeholder="••••••••"
            />
          </label>
          <p className="hint">
            Nhập tài khoản admin do người tổ chức cấp — app chỉ dùng để demo/test.
          </p>
          {loginError && <p className="error">{loginError}</p>}
          <button className="btn primary" onClick={handleLogin} disabled={busy}>
            {busy ? "Đang kết nối…" : "Đăng nhập admin"}
          </button>
        </section>
      ) : (
        <main className="grid">
          {/* Khối điều khiển */}
          <section className="card">
            <div className="card-head">
              <h2>Bảng điều khiển cảm biến</h2>
              <span className="muted">{warehouse?.name}</span>
            </div>

            {adjustableDevices.length === 0 ? (
              <p className="muted">Kho chưa có cảm biến điều chỉnh được.</p>
            ) : (
              <div className="sliders">
                {adjustableDevices.map((d) => {
                  const cfg = sliderConfigByType[d.type]!;
                  const value = sliderValues[d.code] ?? d.currentValue ?? 0;
                  return (
                    <div className="slider-row" key={d.id}>
                      <div className="slider-head">
                        <span className="slider-name">{formatDeviceName(d.code, d.type)}</span>
                        <span className="slider-value">
                          {value}
                          <em>{cfg.unit}</em>
                        </span>
                      </div>
                      <input
                        type="range"
                        min={cfg.min}
                        max={cfg.max}
                        step={cfg.step}
                        value={value}
                        onChange={(e) =>
                          setSliderValues((prev) => ({ ...prev, [d.code]: Number(e.target.value) }))
                        }
                        onMouseUp={(e) =>
                          sendSlider(d, Number((e.target as HTMLInputElement).value))
                        }
                        onKeyUp={(e) => sendSlider(d, Number((e.target as HTMLInputElement).value))}
                      />
                      {cfg.hint && <span className="slider-hint">{cfg.hint}</span>}
                    </div>
                  );
                })}
              </div>
            )}

            <div className="scenario">
              <h3>Kịch bản</h3>
              <div className="scenario-row">
                <select value={scenarioKey} onChange={(e) => setScenarioKey(e.target.value)}>
                  {scenarios.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <div className="speed">
                  <button
                    className={`btn tiny ${speed === 1 ? "active" : ""}`}
                    onClick={() => setSpeed(1)}
                  >
                    x1
                  </button>
                  <button
                    className={`btn tiny ${speed === 10 ? "active" : ""}`}
                    onClick={() => setSpeed(10)}
                  >
                    x10
                  </button>
                </div>
              </div>
              <div className="scenario-actions">
                <button className="btn primary" onClick={handleRunScenario} disabled={busy}>
                  Chạy
                </button>
                <button className="btn ghost" onClick={handleResetScenario} disabled={!runId}>
                  Reset
                </button>
              </div>
            </div>
          </section>

          {/* Khối phản ứng */}
          <section className="card">
            <div className="card-head">
              <h2>Phản ứng của hệ thống</h2>
            </div>

            <div className="readiness">
              <div className="readiness-score">
                <span className="score-num">
                  {readiness?.score != null ? Math.round(readiness.score) : "--"}
                </span>
                <span className="score-label">Điểm sẵn sàng</span>
              </div>
              <div className="readiness-meta">
                {readiness?.operationalStatus && (
                  <span className="badge">
                    {operationalStatusLabels[readiness.operationalStatus] ??
                      readiness.operationalStatus}
                  </span>
                )}
                {readiness?.zone && <span className="muted">Vùng: {readiness.zone}</span>}
                {warehouse && (
                  <button className="btn tiny" onClick={() => refreshReactions(warehouse.id)}>
                    Làm mới
                  </button>
                )}
              </div>
            </div>

            <div className="incidents">
              <h3>Cảnh báo sự cố ({incidents.length})</h3>
              {incidents.length === 0 ? (
                <p className="muted">
                  Chưa có cảnh báo. Kéo độ ẩm &gt; 85% hoặc nhiệt &gt; 35°C để thử.
                </p>
              ) : (
                <ul>
                  {incidents.slice(0, 6).map((inc) => {
                    // Giải thích AI tự sinh khi sự cố mới bật (backend enrich) → list() trả sẵn.
                    const explanation = inc.explanation ?? null;
                    return (
                      <li key={inc.id} className="incident">
                        <span
                          className="sev"
                          style={{ background: severityTone[inc.severity] ?? "#888" }}
                        />
                        <div className="incident-body">
                          <p className="incident-title">{inc.title}</p>
                          <p className="incident-meta">
                            {severityLabels[inc.severity] ?? inc.severity} · độ tin cậy{" "}
                            {Math.round(inc.confidence * 100)}% · {inc.state}
                          </p>

                          {explanation ? (
                            <div className="ai-explain">
                              <span className="ai-tag">AI</span>
                              <p>{explanation}</p>
                            </div>
                          ) : (
                            <p className="ai-pending">AI đang phân tích cảnh báo…</p>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </section>

          {/* Nhật ký */}
          <section className="card log-card">
            <div className="card-head">
              <h2>Nhật ký realtime</h2>
              <span className="muted">{user?.role}</span>
            </div>
            <ol className="log">
              {log.map((l) => (
                <li key={l.id} className={`log-line ${l.tone ?? ""}`}>
                  <time>{l.at}</time>
                  <span>{l.text}</span>
                </li>
              ))}
            </ol>
          </section>
        </main>
      )}
    </div>
  );
}

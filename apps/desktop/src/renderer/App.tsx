import { useCallback, useEffect, useRef, useState } from "react";
import { login, logout, logoutServer, setBase, type AuthUser } from "./lib/api";
import {
  acknowledgeAlarm,
  firstWarehouse,
  getAlarmPolicy,
  getReadiness,
  listDevices,
  listIncidents,
  submitSnapshot,
  type Incident,
  type ReadinessScore,
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
import {
  cacheAlarmPolicy,
  enqueueOperation,
  evaluateAlarmPolicy,
  getCachedAlarmPolicy,
  getPendingOperations,
  removePendingOperation,
  type SimulatorAlarmPolicy,
} from "./lib/simulator-queue";
import { useAlarmBell } from "./lib/use-alarm-bell";
import { alarmTitleFor, selectAlarmingIncidents } from "./lib/incident-alarm";
import { useIncidentStream } from "./lib/use-incident-stream";

interface LogLine {
  id: number;
  at: string;
  text: string;
  tone?: "info" | "sensor" | "alert";
}

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
  const [readiness, setReadiness] = useState<ReadinessScore | null>(null);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [policy, setPolicy] = useState<SimulatorAlarmPolicy | null>(null);
  const [draftValues, setDraftValues] = useState<Record<string, number>>({});
  const [dirtyCodes, setDirtyCodes] = useState<Record<string, true>>({});
  const [backendReachable, setBackendReachable] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [log, setLog] = useState<LogLine[]>([]);
  const [alarmTitle, setAlarmTitle] = useState<string | null>(null);

  const logSeq = useRef(0);
  const flushRunning = useRef(false);
  const activeAlarmSubmissionKeys = useRef(new Set<string>());
  /** Sự cố đã kéo chuông ở lượt trước — dùng để chỉ báo cái thực sự mới. */
  const knownIncidentIds = useRef(new Set<string>());
  /** Lượt tải đầu sau đăng nhập chỉ ghi nhận hiện trạng, không hú vì chuyện cũ. */
  const incidentBaselineReady = useRef(false);
  /** Sự cố đang kéo chuông và cần gửi xác nhận tắt lên server. */
  const activeAlarmIncidentIds = useRef(new Set<string>());
  const {
    isRinging: isAlarmRinging,
    prime: primeAlarmBell,
    start: startAlarmBell,
    stop: stopAlarmBell,
  } = useAlarmBell();

  const pushLog = useCallback((text: string, tone: LogLine["tone"] = "info") => {
    const at = new Intl.DateTimeFormat("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(new Date());
    setLog((previous) => [{ id: logSeq.current++, at, text, tone }, ...previous].slice(0, 60));
  }, []);

  const refreshPendingCount = useCallback((ownerUserId: string, warehouseId: string) => {
    setPendingCount(getPendingOperations(ownerUserId, warehouseId).length);
  }, []);

  const refreshDashboard = useCallback(
    async (warehouseId: string) => {
      try {
        const [nextDevices, score, nextIncidents] = await Promise.all([
          listDevices(warehouseId),
          getReadiness(warehouseId),
          listIncidents(warehouseId),
        ]);
        setDevices(nextDevices);
        setReadiness(score);
        setIncidents(nextIncidents);
        setBackendReachable(true);

        // Chuông kêu vì CÓ SỰ CỐ, bất kể nguồn nào sinh ra: người vận hành kéo
        // thanh trượt hay cảm biến thật tự báo đều đi qua đúng nhánh này.
        const selection = selectAlarmingIncidents(
          nextIncidents,
          knownIncidentIds.current,
          incidentBaselineReady.current,
        );
        knownIncidentIds.current = selection.knownIds;
        incidentBaselineReady.current = true;
        if (selection.ringing.length > 0) {
          for (const incident of selection.ringing) {
            activeAlarmIncidentIds.current.add(incident.id);
          }
          setAlarmTitle(alarmTitleFor(selection.ringing));
          startAlarmBell();
          pushLog(
            `🔔 Chuông kho đã bật do sự cố mới: ${alarmTitleFor(selection.ringing)}.`,
            "alert",
          );
        }
      } catch {
        setBackendReachable(false);
      }
    },
    [pushLog, startAlarmBell],
  );

  const flushPending = useCallback(
    async (ownerUserId: string, warehouseId: string) => {
      if (flushRunning.current) return;
      flushRunning.current = true;
      try {
        const pending = getPendingOperations(ownerUserId, warehouseId);
        for (const operation of pending) {
          try {
            if (operation.kind === "snapshot") {
              const response = await submitSnapshot({
                warehouseId: operation.warehouseId,
                idempotencyKey: operation.idempotencyKey,
                observedAt: operation.observedAt,
                readings: operation.readings,
              });
              removePendingOperation(operation);
              setDevices((current) =>
                current.map((device) => {
                  const reading = operation.readings.find(
                    (item) => item.deviceCode === device.code,
                  );
                  return reading
                    ? {
                        ...device,
                        currentValue: reading.value,
                        currentAt: response.submission.observedAt,
                      }
                    : device;
                }),
              );
              pushLog(
                response.duplicate
                  ? "Xác nhận trước đó đã được máy chủ ghi nhận (không tạo trùng)."
                  : `Đã gửi xác nhận ${operation.readings.length} thông số về máy chủ.`,
                "sensor",
              );
            } else {
              const response = await acknowledgeAlarm({
                warehouseId: operation.warehouseId,
                ...(operation.submissionKey ? { submissionKey: operation.submissionKey } : {}),
                ...(operation.incidentIds?.length ? { incidentIds: operation.incidentIds } : {}),
                acknowledgementKey: operation.acknowledgementKey,
                acknowledgedAt: operation.acknowledgedAt,
              });
              if (!response.pending) {
                removePendingOperation(operation);
                if (response.acknowledgedIncidentIds.length > 0) {
                  pushLog("Đã lưu thao tác tắt chuông vào lịch sử sự cố.", "sensor");
                }
              }
            }
            setBackendReachable(true);
          } catch (error) {
            setBackendReachable(false);
            pushLog(`Đang giữ trong hàng chờ cục bộ: ${(error as Error).message}`, "alert");
            break;
          }
        }
      } finally {
        refreshPendingCount(ownerUserId, warehouseId);
        flushRunning.current = false;
      }
    },
    [pushLog, refreshPendingCount],
  );

  async function handleLogin() {
    if (!email.trim() || !password) {
      setLoginError("Nhập email và mật khẩu để đăng nhập.");
      return;
    }
    primeAlarmBell();
    setBusy(true);
    setLoginError(null);
    // Phiên mới bắt đầu từ hiện trạng: lượt tải đầu chỉ ghi nhận, không kéo chuông
    // cho những sự cố đã mở từ trước khi người này ngồi vào máy.
    knownIncidentIds.current = new Set();
    incidentBaselineReady.current = false;
    activeAlarmIncidentIds.current.clear();
    try {
      setBase(host);
      const nextUser = await login(email.trim(), password);
      const nextWarehouse = await firstWarehouse();
      if (!nextWarehouse) throw new Error("Không tìm thấy kho nào trong phạm vi tài khoản.");

      const [nextDevices, fetchedPolicy] = await Promise.all([
        listDevices(nextWarehouse.id),
        getAlarmPolicy(nextWarehouse.id).catch(() => null),
      ]);
      const nextPolicy = fetchedPolicy ?? getCachedAlarmPolicy(nextWarehouse.id);
      if (fetchedPolicy) cacheAlarmPolicy(nextWarehouse.id, fetchedPolicy);

      const initialDraft: Record<string, number> = {};
      for (const device of nextDevices) {
        const config = sliderConfigByType[device.type];
        if (config) initialDraft[device.code] = device.currentValue ?? config.defaultValue;
      }

      setUser(nextUser);
      setWarehouse(nextWarehouse);
      setDevices(nextDevices);
      setDraftValues(initialDraft);
      setDirtyCodes({});
      setPolicy(nextPolicy);
      setAuthed(true);
      setBackendReachable(true);
      refreshPendingCount(nextUser.userId, nextWarehouse.id);
      pushLog(`Đăng nhập thành công (${nextUser.role}); kho: ${nextWarehouse.name}.`);
      if (!nextPolicy) {
        pushLog(
          "Chưa tải được chính sách chuông; xác nhận vẫn được xếp hàng, backend vẫn kiểm tra chuẩn.",
          "alert",
        );
      }
      await flushPending(nextUser.userId, nextWarehouse.id);
      await refreshDashboard(nextWarehouse.id);
    } catch (error) {
      logout();
      setAuthed(false);
      setUser(null);
      setWarehouse(null);
      setLoginError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!authed || !warehouse) return;
    const timer = window.setInterval(() => {
      void refreshDashboard(warehouse.id);
      if (user) void flushPending(user.userId, warehouse.id);
    }, 10_000);
    return () => window.clearInterval(timer);
  }, [authed, flushPending, refreshDashboard, user, warehouse]);

  // Realtime chỉ rút ngắn thời gian chờ; vòng polling ở trên vẫn là lưới an toàn
  // khi kênh này đứt, nên mất kết nối không đồng nghĩa với mất cảnh báo.
  useIncidentStream(
    authed && warehouse ? warehouse.id : null,
    useCallback(() => {
      if (warehouse) void refreshDashboard(warehouse.id);
    }, [refreshDashboard, warehouse]),
  );

  function handleDraftChange(deviceCode: string, value: number) {
    setDraftValues((current) => ({ ...current, [deviceCode]: value }));
    setDirtyCodes((current) => ({ ...current, [deviceCode]: true }));
  }

  async function handleConfirm() {
    if (!warehouse || !user) return;
    const readings = devices
      .filter((device) => dirtyCodes[device.code] && ADJUSTABLE_TYPES.includes(device.type))
      .map((device) => ({ deviceCode: device.code, value: draftValues[device.code] ?? 0 }));
    if (readings.length === 0) {
      pushLog("Chưa có thông số nào thay đổi để xác nhận.");
      return;
    }

    const idempotencyKey = createOperationKey("snapshot");
    const observedAt = new Date().toISOString();
    const operation = {
      kind: "snapshot" as const,
      idempotencyKey,
      ownerUserId: user.userId,
      warehouseId: warehouse.id,
      observedAt,
      policyVersion: policy?.version ?? null,
      readings,
    };
    if (!enqueueOperation(operation)) {
      pushLog("Không thể lưu hàng chờ cục bộ; chưa gửi xác nhận để tránh mất dữ liệu.", "alert");
      return;
    }

    const effectiveReadings = devices
      .filter((device) => ADJUSTABLE_TYPES.includes(device.type))
      .map((device) => ({
        code: device.code,
        type: device.type,
        value: dirtyCodes[device.code]
          ? (draftValues[device.code] ?? device.currentValue ?? 0)
          : (device.currentValue ??
            draftValues[device.code] ??
            sliderConfigByType[device.type]!.defaultValue),
      }));
    const breaches = evaluateAlarmPolicy(policy, effectiveReadings);
    if (breaches.length > 0) {
      activeAlarmSubmissionKeys.current.add(idempotencyKey);
      setAlarmTitle(breaches.map((breach) => breach.title).join(" · "));
      startAlarmBell();
      pushLog("🔔 Chuông kho đã bật theo ngưỡng cục bộ; chỉ tắt khi bấm nút Tắt chuông.", "alert");
    } else if (!policy) {
      pushLog(
        "Không có policy cục bộ để đánh giá chuông; backend sẽ kiểm tra khi nhận snapshot.",
        "alert",
      );
    }

    setDirtyCodes({});
    refreshPendingCount(user.userId, warehouse.id);
    pushLog(
      `Đã xác nhận ${readings.length} thông số; đang gửi hoặc giữ an toàn trong hàng chờ.`,
      "sensor",
    );
    await flushPending(user.userId, warehouse.id);
    await refreshDashboard(warehouse.id);
  }

  const handleStopAlarm = useCallback(() => {
    stopAlarmBell();
    setAlarmTitle(null);
    if (user && warehouse) {
      const now = new Date().toISOString();
      // Hai đường xác nhận, cùng một hàng chờ offline: lô số liệu do chính máy
      // này gửi, và sự cố nhận qua realtime (nguồn phần cứng, không có lô nào ở đây).
      const operations = [
        ...[...activeAlarmSubmissionKeys.current].map((submissionKey) => ({
          kind: "alarm-ack" as const,
          acknowledgementKey: createOperationKey("alarm-ack"),
          submissionKey,
          ownerUserId: user.userId,
          warehouseId: warehouse.id,
          acknowledgedAt: now,
        })),
        ...(activeAlarmIncidentIds.current.size > 0
          ? [
              {
                kind: "alarm-ack" as const,
                acknowledgementKey: createOperationKey("alarm-ack"),
                incidentIds: [...activeAlarmIncidentIds.current],
                ownerUserId: user.userId,
                warehouseId: warehouse.id,
                acknowledgedAt: now,
              },
            ]
          : []),
      ];
      for (const operation of operations) {
        if (!enqueueOperation(operation)) {
          pushLog(
            "Không thể lưu xác nhận tắt chuông; chuông đã tắt tại chỗ nhưng cần thử lại khi có bộ nhớ.",
            "alert",
          );
        }
      }
      activeAlarmSubmissionKeys.current.clear();
      activeAlarmIncidentIds.current.clear();
      refreshPendingCount(user.userId, warehouse.id);
      void flushPending(user.userId, warehouse.id);
    }
    pushLog("🔕 Đã tắt chuông theo xác nhận của người vận hành.");
  }, [flushPending, pushLog, refreshPendingCount, stopAlarmBell, user, warehouse]);

  function handleLogout() {
    stopAlarmBell();
    activeAlarmSubmissionKeys.current.clear();
    activeAlarmIncidentIds.current.clear();
    knownIncidentIds.current = new Set();
    // Tài khoản/kho mới phải mồi lại hiện trạng, nếu không sẽ dội chuông cho
    // toàn bộ sự cố cũ ngay khi vừa đăng nhập.
    incidentBaselineReady.current = false;
    void logoutServer();
    setAuthed(false);
    setUser(null);
    setWarehouse(null);
    setDevices([]);
    setReadiness(null);
    setIncidents([]);
    setPolicy(null);
    setDraftValues({});
    setDirtyCodes({});
    setBackendReachable(false);
    setPendingCount(0);
    setLog([]);
  }

  const adjustableDevices = devices.filter((device) => ADJUSTABLE_TYPES.includes(device.type));
  const connectionLabel = pendingCount
    ? `${backendReachable ? "Đang có mạng" : "Ngoại tuyến"} · ${pendingCount} thao tác chờ gửi`
    : backendReachable
      ? "Đã kết nối API"
      : "Ngoại tuyến";

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <h1>Ứng phó nhanh · Giả lập cảm biến</h1>
          <p className="sub">Chỉnh thông số cục bộ, bấm Xác nhận để gửi một snapshot đã chốt.</p>
        </div>
        <div className="conn">
          <span className={`dot ${backendReachable ? "on" : "off"}`} />
          <span className="conn-label">{connectionLabel}</span>
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
              onChange={(event) => setHost(event.target.value)}
              placeholder="ungphonhanh.life, tên LAN hoặc 192.168.1.x"
            />
          </label>
          <label className="field">
            <span>Email</span>
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="username"
              placeholder="admin@safestock.local"
            />
          </label>
          <label className="field">
            <span>Mật khẩu</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              onKeyDown={(event) => {
                if (event.key === "Enter") void handleLogin();
              }}
              placeholder="••••••••"
            />
          </label>
          <p className="hint">
            Nhập <strong>ungphonhanh.life</strong> khi đi qua Internet; nhập hostname/IP LAN khi
            mạng ngoài bị mất.
          </p>
          {loginError && <p className="error">{loginError}</p>}
          <button className="btn primary" onClick={() => void handleLogin()} disabled={busy}>
            {busy ? "Đang kết nối…" : "Đăng nhập"}
          </button>
        </section>
      ) : (
        <main className="grid">
          {isAlarmRinging && (
            <section className="alarm-banner" role="alert" aria-live="assertive">
              <div className="alarm-copy">
                <span className="alarm-icon" aria-hidden="true">
                  🔔
                </span>
                <div>
                  <strong>CHUÔNG CẢNH BÁO ĐANG KÊU</strong>
                  <p>{alarmTitle ?? "Thông số xác nhận đã vượt ngưỡng cảnh báo."}</p>
                </div>
              </div>
              <button className="btn alarm-stop" onClick={handleStopAlarm}>
                Tắt chuông
              </button>
            </section>
          )}

          <section className="card">
            <div className="card-head">
              <h2>Bảng điều khiển cảm biến</h2>
              <span className="muted">{warehouse?.name}</span>
            </div>
            {adjustableDevices.length === 0 ? (
              <p className="muted">
                Kho chưa có cảm biến điều chỉnh được trong phạm vi của tài khoản.
              </p>
            ) : (
              <div className="sliders">
                {adjustableDevices.map((device) => {
                  const config = sliderConfigByType[device.type]!;
                  const value =
                    draftValues[device.code] ?? device.currentValue ?? config.defaultValue;
                  return (
                    <div className="slider-row" key={device.id}>
                      <div className="slider-head">
                        <span className="slider-name">
                          {formatDeviceName(device.code, device.type)}
                        </span>
                        <span className="slider-value">
                          {value}
                          <em>{config.unit}</em>
                        </span>
                      </div>
                      <input
                        type="range"
                        min={config.min}
                        max={config.max}
                        step={config.step}
                        value={value}
                        onChange={(event) =>
                          handleDraftChange(device.code, Number(event.target.value))
                        }
                      />
                      {config.hint && <span className="slider-hint">{config.hint}</span>}
                    </div>
                  );
                })}
              </div>
            )}
            <div className="confirm-row">
              <span className="muted">
                {Object.keys(dirtyCodes).length} thông số đã chỉnh, chưa gửi.
              </span>
              <button
                className="btn primary"
                onClick={() => void handleConfirm()}
                disabled={Object.keys(dirtyCodes).length === 0}
              >
                Xác nhận và gửi
              </button>
            </div>
          </section>

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
                  <button className="btn tiny" onClick={() => void refreshDashboard(warehouse.id)}>
                    Làm mới
                  </button>
                )}
              </div>
            </div>
            <div className="incidents">
              <h3>Cảnh báo sự cố ({incidents.length})</h3>
              {incidents.length === 0 ? (
                <p className="muted">
                  Chưa có cảnh báo. Khi nhiệt độ &gt; 35°C hoặc độ ẩm &gt; 85%, bấm Xác nhận để thử
                  chuông.
                </p>
              ) : (
                <ul>
                  {incidents.slice(0, 6).map((incident) => (
                    <li key={incident.id} className="incident">
                      <span
                        className="sev"
                        style={{ background: severityTone[incident.severity] ?? "#888" }}
                      />
                      <div className="incident-body">
                        <p className="incident-title">{incident.title}</p>
                        <p className="incident-meta">
                          {severityLabels[incident.severity] ?? incident.severity} · độ tin cậy{" "}
                          {Math.round(incident.confidence * 100)}% · {incident.state}
                        </p>
                        {incident.explanation ? (
                          <div className="ai-explain">
                            <span className="ai-tag">AI</span>
                            <p>{incident.explanation}</p>
                          </div>
                        ) : (
                          <p className="ai-pending">Phân tích hỗ trợ đang được chuẩn bị…</p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <section className="card log-card">
            <div className="card-head">
              <h2>Nhật ký xác nhận</h2>
              <span className="muted">{user?.role}</span>
            </div>
            <ol className="log">
              {log.map((line) => (
                <li key={line.id} className={`log-line ${line.tone ?? ""}`}>
                  <time>{line.at}</time>
                  <span>{line.text}</span>
                </li>
              ))}
            </ol>
          </section>
        </main>
      )}
    </div>
  );
}

function createOperationKey(prefix: string): string {
  const id =
    globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}:${id}`;
}

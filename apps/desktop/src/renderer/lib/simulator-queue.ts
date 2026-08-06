const QUEUE_STORAGE_KEY = "ung-pho-nhanh.simulator.pending-v1";
const POLICY_STORAGE_PREFIX = "ung-pho-nhanh.simulator.policy-v1:";

export interface PendingReading {
  deviceCode: string;
  value: number;
}

export interface PendingSnapshot {
  kind: "snapshot";
  idempotencyKey: string;
  ownerUserId: string;
  warehouseId: string;
  observedAt: string;
  policyVersion: string | null;
  readings: PendingReading[];
}

/**
 * Xác nhận tắt chuông. Trỏ tới lô số liệu do chính máy này gửi (`submissionKey`)
 * HOẶC tới các sự cố nhận qua realtime (`incidentIds`) — chuông do cảm biến thật
 * kích hoạt không đi kèm lô nào của máy này.
 */
export interface PendingAlarmAcknowledgement {
  kind: "alarm-ack";
  acknowledgementKey: string;
  submissionKey?: string;
  incidentIds?: string[];
  ownerUserId: string;
  warehouseId: string;
  acknowledgedAt: string;
}

export type PendingSimulatorOperation = PendingSnapshot | PendingAlarmAcknowledgement;

export interface SimulatorAlarmRule {
  id: string;
  deviceType: "TEMPERATURE" | "HUMIDITY";
  operator: "GT";
  threshold: number;
  title: string;
}

export interface SimulatorAlarmPolicy {
  version: string;
  rules: SimulatorAlarmRule[];
}

export interface AlarmBreach {
  title: string;
  deviceCode: string;
  value: number;
  threshold: number;
}

export function getPendingOperations(
  ownerUserId: string,
  warehouseId: string,
): PendingSimulatorOperation[] {
  return readQueue().filter(
    (operation) => operation.ownerUserId === ownerUserId && operation.warehouseId === warehouseId,
  );
}

export function enqueueOperation(operation: PendingSimulatorOperation): boolean {
  // Chặn ngay thứ ghi được nhưng đọc lại không được.
  //
  // readQueue() lọc bỏ mọi bản ghi không qua isOperation, nên một thao tác thiếu
  // ownerUserId sẽ ghi thành công rồi biến mất lặng lẽ ở lượt đọc kế tiếp — đúng
  // lỗi đã xảy ra thật. Từ chối tại đây thì người dùng thấy báo lỗi, còn hơn tưởng
  // đã gửi xong.
  if (!isOperation(operation)) return false;
  const operations = readQueue();
  if (
    operations.some(
      (existing) =>
        (operation.kind === "snapshot" &&
          existing.kind === "snapshot" &&
          existing.idempotencyKey === operation.idempotencyKey) ||
        (operation.kind === "alarm-ack" &&
          existing.kind === "alarm-ack" &&
          existing.acknowledgementKey === operation.acknowledgementKey),
    )
  ) {
    return true;
  }
  return writeQueue([...operations, operation]);
}

export function removePendingOperation(operation: PendingSimulatorOperation): void {
  writeQueue(
    readQueue().filter((candidate) => {
      if (operation.kind === "snapshot" && candidate.kind === "snapshot") {
        return candidate.idempotencyKey !== operation.idempotencyKey;
      }
      if (operation.kind === "alarm-ack" && candidate.kind === "alarm-ack") {
        return candidate.acknowledgementKey !== operation.acknowledgementKey;
      }
      return true;
    }),
  );
}

export function cacheAlarmPolicy(warehouseId: string, policy: SimulatorAlarmPolicy): void {
  try {
    window.localStorage.setItem(`${POLICY_STORAGE_PREFIX}${warehouseId}`, JSON.stringify(policy));
  } catch {
    // The confirmation queue remains useful even if browser storage is disabled.
  }
}

export function getCachedAlarmPolicy(warehouseId: string): SimulatorAlarmPolicy | null {
  try {
    return parsePolicy(window.localStorage.getItem(`${POLICY_STORAGE_PREFIX}${warehouseId}`));
  } catch {
    return null;
  }
}

export function evaluateAlarmPolicy(
  policy: SimulatorAlarmPolicy | null,
  readings: { code: string; type: string; value: number }[],
): AlarmBreach[] {
  if (!policy) return [];
  return policy.rules.flatMap((rule) =>
    readings
      .filter((reading) => reading.type === rule.deviceType && reading.value > rule.threshold)
      .map((reading) => ({
        title: rule.title,
        deviceCode: reading.code,
        value: reading.value,
        threshold: rule.threshold,
      })),
  );
}

function readQueue(): PendingSimulatorOperation[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(QUEUE_STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter(isOperation) : [];
  } catch {
    return [];
  }
}

function writeQueue(operations: PendingSimulatorOperation[]): boolean {
  try {
    window.localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(operations));
    return true;
  } catch {
    return false;
  }
}

function isOperation(value: unknown): value is PendingSimulatorOperation {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  const common =
    typeof item.ownerUserId === "string" &&
    typeof item.warehouseId === "string" &&
    typeof item.kind === "string";
  if (!common) return false;
  if (item.kind === "snapshot") {
    return (
      typeof item.idempotencyKey === "string" &&
      typeof item.observedAt === "string" &&
      Array.isArray(item.readings)
    );
  }
  if (item.kind !== "alarm-ack") return false;
  if (typeof item.acknowledgementKey !== "string" || typeof item.acknowledgedAt !== "string") {
    return false;
  }
  // Phải trỏ tới ít nhất một mục tiêu, nếu không thì đây là bản ghi vô nghĩa sẽ
  // kẹt vĩnh viễn trong hàng chờ.
  const hasSubmission = typeof item.submissionKey === "string" && item.submissionKey.length > 0;
  const hasIncidents =
    Array.isArray(item.incidentIds) &&
    item.incidentIds.length > 0 &&
    item.incidentIds.every((id) => typeof id === "string" && id.length > 0);
  return hasSubmission || hasIncidents;
}

function parsePolicy(value: string | null): SimulatorAlarmPolicy | null {
  if (!value) return null;
  const parsed: unknown = JSON.parse(value);
  if (!parsed || typeof parsed !== "object") return null;
  const policy = parsed as Record<string, unknown>;
  if (typeof policy.version !== "string" || !Array.isArray(policy.rules)) return null;
  const rules = policy.rules.filter((rule): rule is SimulatorAlarmRule => {
    if (!rule || typeof rule !== "object") return false;
    const item = rule as Record<string, unknown>;
    return (
      typeof item.id === "string" &&
      (item.deviceType === "TEMPERATURE" || item.deviceType === "HUMIDITY") &&
      item.operator === "GT" &&
      typeof item.threshold === "number" &&
      typeof item.title === "string"
    );
  });
  return rules.length === policy.rules.length ? { version: policy.version, rules } : null;
}

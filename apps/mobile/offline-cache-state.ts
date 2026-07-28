interface OfflineEnvelope<T> {
  version: 1;
  userId: string;
  storedAt: string;
  data: T;
}

export interface ParsedOfflineEnvelope<T> {
  data: T;
  storedAt: string;
  ageMs: number;
}

export function serializeOfflineEnvelope<T>(
  userId: string,
  data: T,
  storedAt = new Date().toISOString(),
): string {
  return JSON.stringify({
    version: 1,
    userId,
    storedAt,
    data,
  } satisfies OfflineEnvelope<T>);
}

export function parseOfflineEnvelope<T = unknown>(
  value: string | null,
  expectedUserId: string,
  now = new Date(),
): ParsedOfflineEnvelope<T> | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<OfflineEnvelope<T>>;
    const storedTime = Date.parse(parsed.storedAt ?? "");
    if (
      parsed.version !== 1 ||
      parsed.userId !== expectedUserId ||
      !Number.isFinite(storedTime) ||
      parsed.data === undefined
    ) {
      return null;
    }
    return {
      data: parsed.data,
      storedAt: parsed.storedAt as string,
      ageMs: Math.max(0, now.getTime() - storedTime),
    };
  } catch {
    return null;
  }
}

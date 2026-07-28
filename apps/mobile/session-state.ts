export interface StoredSessionUser {
  id: string;
  email: string;
  role: string;
  fullName?: string | null;
  phone?: string | null;
  warehouseId?: string | null;
  warehouseName?: string | null;
  unitName?: string | null;
}

export interface StoredSession {
  accessToken: string;
  refreshToken: string;
  user: StoredSessionUser;
}

interface SessionEnvelope extends StoredSession {
  version: 1;
}

export function serializeSession(session: StoredSession): string {
  return JSON.stringify({ version: 1, ...session } satisfies SessionEnvelope);
}

export function parseStoredSession(value: string | null): StoredSession | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<SessionEnvelope>;
    if (
      parsed.version !== 1 ||
      !nonEmpty(parsed.accessToken) ||
      !nonEmpty(parsed.refreshToken) ||
      !parsed.user ||
      !nonEmpty(parsed.user.id) ||
      !nonEmpty(parsed.user.email) ||
      !nonEmpty(parsed.user.role)
    ) {
      return null;
    }
    return {
      accessToken: parsed.accessToken,
      refreshToken: parsed.refreshToken,
      user: {
        id: parsed.user.id,
        email: parsed.user.email,
        role: parsed.user.role,
        ...(parsed.user.fullName !== undefined
          ? { fullName: optionalString(parsed.user.fullName) }
          : {}),
        ...(parsed.user.phone !== undefined
          ? { phone: optionalString(parsed.user.phone) }
          : {}),
        ...(parsed.user.warehouseId !== undefined
          ? { warehouseId: optionalString(parsed.user.warehouseId) }
          : {}),
        ...(parsed.user.warehouseName !== undefined
          ? { warehouseName: optionalString(parsed.user.warehouseName) }
          : {}),
        ...(parsed.user.unitName !== undefined
          ? { unitName: optionalString(parsed.user.unitName) }
          : {}),
      },
    };
  } catch {
    return null;
  }
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function optionalString(value: unknown): string | null {
  return nonEmpty(value) ? value : null;
}

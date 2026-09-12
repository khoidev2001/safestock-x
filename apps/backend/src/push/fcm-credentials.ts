import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";

/**
 * Lấy access token gọi FCM HTTP v1 từ service account, không kéo thêm thư viện.
 *
 * Google chỉ đòi một JWT tự ký bằng khoá riêng của service account rồi đổi lấy
 * access token. Chừng đó việc `node:crypto` làm được, nên không cần thêm một
 * phụ thuộc nữa vào máy chủ đặt tại xã — mỗi thư viện thêm vào là một thứ nữa
 * phải vá khi có lỗ hổng, trên một cái máy không ai trực.
 */

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
/** Xin token mới sớm hơn hạn một phút, tránh gửi bằng token vừa hết hạn giữa chừng. */
const EXPIRY_SAFETY_MS = 60_000;

export interface ServiceAccount {
  projectId: string;
  clientEmail: string;
  privateKey: string;
}

/**
 * Đọc service account từ cấu hình.
 *
 * Nhận cả đường dẫn file lẫn JSON dán thẳng vào biến môi trường: máy chủ tại xã
 * thì để file cho dễ thay, còn khi chạy trong container thì dán chuỗi tiện hơn.
 * Không có cấu hình thì trả null — hệ thống vẫn chạy, chỉ là không gửi được thông
 * báo đẩy, và chỗ gọi phải nói rõ điều đó thay vì sập.
 */
export function loadServiceAccount(env: NodeJS.ProcessEnv = process.env): ServiceAccount | null {
  const raw = env.FCM_SERVICE_ACCOUNT_JSON?.trim();
  const file = env.FCM_SERVICE_ACCOUNT_FILE?.trim();
  let text: string | null = null;
  if (raw) text = raw;
  else if (file) {
    try {
      text = readFileSync(file, "utf8");
    } catch {
      return null;
    }
  }
  if (!text) return null;

  try {
    const parsed = JSON.parse(text) as {
      project_id?: string;
      client_email?: string;
      private_key?: string;
    };
    if (!parsed.project_id || !parsed.client_email || !parsed.private_key) return null;
    return {
      projectId: parsed.project_id,
      clientEmail: parsed.client_email,
      // Biến môi trường một dòng nên xuống dòng bị viết thành "\n" hai ký tự;
      // khoá RSA giữ nguyên như vậy thì không ký được.
      privateKey: parsed.private_key.replace(/\\n/g, "\n"),
    };
  } catch {
    return null;
  }
}

function base64Url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** JWT tự ký (RS256) — đầu vào để đổi lấy access token của Google. */
export function buildAssertion(account: ServiceAccount, now = Date.now()): string {
  const issuedAt = Math.floor(now / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64Url(
    JSON.stringify({
      iss: account.clientEmail,
      scope: SCOPE,
      aud: TOKEN_ENDPOINT,
      iat: issuedAt,
      exp: issuedAt + 3600,
    }),
  );
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${payload}`);
  signer.end();
  return `${header}.${payload}.${base64Url(signer.sign(account.privateKey))}`;
}

export interface CachedToken {
  value: string;
  expiresAt: number;
}

export function isExpired(token: CachedToken | null, now = Date.now()): boolean {
  return token == null || token.expiresAt - EXPIRY_SAFETY_MS <= now;
}

export async function requestAccessToken(
  account: ServiceAccount,
  now = Date.now(),
): Promise<CachedToken> {
  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: buildAssertion(account, now),
    }),
  });
  if (!response.ok) {
    throw new Error(`Google từ chối cấp access token (HTTP ${response.status})`);
  }
  const body = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!body.access_token) throw new Error("Google trả về phản hồi không có access_token");
  return {
    value: body.access_token,
    expiresAt: now + (body.expires_in ?? 3600) * 1000,
  };
}

export { TOKEN_ENDPOINT };

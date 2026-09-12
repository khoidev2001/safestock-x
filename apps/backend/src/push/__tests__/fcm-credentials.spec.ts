import { createVerify, generateKeyPairSync } from "node:crypto";
import { buildAssertion, isExpired, loadServiceAccount } from "../fcm-credentials";

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});

const account = {
  projectId: "ung-pho-nhanh",
  clientEmail: "push@ung-pho-nhanh.iam.gserviceaccount.com",
  privateKey,
};

function decodeSegment(segment: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(segment, "base64url").toString("utf8"));
}

describe("buildAssertion", () => {
  it("ký được JWT mà khoá công khai tương ứng xác minh lại đúng", () => {
    const assertion = buildAssertion(account);
    const [header, payload, signature] = assertion.split(".");
    const verifier = createVerify("RSA-SHA256");
    verifier.update(`${header}.${payload}`);
    verifier.end();
    expect(verifier.verify(publicKey, Buffer.from(signature, "base64url"))).toBe(true);
  });

  it("khai đúng người ký, phạm vi và hạn dùng một giờ", () => {
    const now = 1_700_000_000_000;
    const [, payload] = buildAssertion(account, now).split(".");
    const claims = decodeSegment(payload);
    expect(claims.iss).toBe(account.clientEmail);
    expect(claims.scope).toBe("https://www.googleapis.com/auth/firebase.messaging");
    expect(claims.exp).toBe(Math.floor(now / 1000) + 3600);
  });
});

describe("loadServiceAccount", () => {
  it("không có cấu hình thì trả null, không ném lỗi", () => {
    expect(loadServiceAccount({})).toBeNull();
  });

  it("JSON hỏng cũng trả null — máy chủ vẫn phải khởi động được", () => {
    expect(loadServiceAccount({ FCM_SERVICE_ACCOUNT_JSON: "{ khong-phai-json" })).toBeNull();
  });

  it("thiếu một trường bắt buộc thì coi như chưa cấu hình", () => {
    const raw = JSON.stringify({ project_id: "x", client_email: "y" });
    expect(loadServiceAccount({ FCM_SERVICE_ACCOUNT_JSON: raw })).toBeNull();
  });

  it("khôi phục xuống dòng bị biến thành \\n khi khoá nằm trong biến môi trường", () => {
    const raw = JSON.stringify({
      project_id: "ung-pho-nhanh",
      client_email: "push@example.com",
      private_key: "-----BEGIN PRIVATE KEY-----\\nAAAA\\n-----END PRIVATE KEY-----\\n",
    });
    const loaded = loadServiceAccount({ FCM_SERVICE_ACCOUNT_JSON: raw });
    expect(loaded?.privateKey).toContain("\n");
    expect(loaded?.privateKey).not.toContain("\\n");
  });
});

describe("isExpired", () => {
  const now = 1_700_000_000_000;

  it("chưa có token thì coi như hết hạn", () => {
    expect(isExpired(null, now)).toBe(true);
  });

  it("còn hơn một phút thì vẫn dùng được", () => {
    expect(isExpired({ value: "t", expiresAt: now + 120_000 }, now)).toBe(false);
  });

  it("còn dưới một phút thì xin token mới, không đợi hết hạn hẳn", () => {
    expect(isExpired({ value: "t", expiresAt: now + 30_000 }, now)).toBe(true);
  });
});

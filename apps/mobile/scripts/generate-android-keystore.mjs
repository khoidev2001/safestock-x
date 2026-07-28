import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const mobileRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const androidRoot = path.resolve(mobileRoot, "android");
const keystorePath = path.resolve(
  androidRoot,
  "app",
  "safestock-release.keystore",
);
const propertiesPath = path.resolve(androidRoot, "keystore.properties");

if (existsSync(keystorePath) && existsSync(propertiesPath)) {
  console.log("Release keystore đã tồn tại; không ghi đè.");
  process.exit(0);
}
if (existsSync(keystorePath) || existsSync(propertiesPath)) {
  throw new Error(
    "Keystore/properties đang thiếu một nửa. Kiểm tra thủ công trước khi tạo lại.",
  );
}

const javaHome =
  process.env.JAVA_HOME ?? "C:\\Program Files\\Java\\jdk-17";
const keytool = path.resolve(
  javaHome,
  "bin",
  process.platform === "win32" ? "keytool.exe" : "keytool",
);
if (!existsSync(keytool)) {
  throw new Error(`Không tìm thấy keytool JDK 17 tại ${keytool}.`);
}

const password = randomBytes(32).toString("base64url");
const alias = "safestock";
const result = spawnSync(
  keytool,
  [
    "-genkeypair",
    "-keyalg",
    "RSA",
    "-keysize",
    "4096",
    "-validity",
    "10000",
    "-alias",
    alias,
    "-keystore",
    keystorePath,
    "-storepass",
    password,
    "-keypass",
    password,
    "-dname",
    "CN=SafeStock X, OU=Mobile, O=Ung Pho Nhanh, L=Dak Lak, ST=Dak Lak, C=VN",
  ],
  { encoding: "utf8" },
);
if (result.error) throw result.error;
if (result.status !== 0) {
  throw new Error(result.stderr || "Không tạo được Android release keystore.");
}

await writeFile(
  propertiesPath,
  [
    "storeFile=safestock-release.keystore",
    `storePassword=${password}`,
    `keyAlias=${alias}`,
    `keyPassword=${password}`,
    "",
  ].join("\n"),
  { encoding: "utf8", mode: 0o600 },
);
console.log(
  "Đã tạo release keystore riêng. Hãy sao lưu keystore.properties và file .keystore ở nơi an toàn.",
);

/**
 * Chạy MÁY CHỦ THỨ HAI — máy chủ của các xã lân cận.
 *
 * Mượn — trả liên xã được thiết kế cho hai xã ở hai MÁY CHỦ khác nhau, mỗi bên
 * một cơ sở dữ liệu riêng và không ai đọc được của ai; sợi dây duy nhất giữa hai
 * bên là mấy lời gọi HTTP có kèm khoá chia sẻ. Muốn thử được luồng đó thì phải có
 * hai máy chủ thật, chứ hai tài khoản trong cùng một cơ sở dữ liệu chỉ thử được
 * phần giao diện.
 *
 * Cùng mã nguồn, khác cấu hình: `.env.lan-can` trỏ sang cơ sở dữ liệu khác và
 * cổng khác, và khai `COMMUNE_PEER_DONG_XUAN` để biết đường gọi ngược về.
 *
 *   pnpm be:db:lan-can    # tạo bảng + seed cho cơ sở dữ liệu của máy chủ thứ hai
 *   pnpm be:dev:lan-can   # chạy máy chủ thứ hai ở cổng 3101
 *
 * Viết bằng Node thay vì đặt thẳng `SAFESTOCK_ENV_FILE=... pnpm ...` vào package.json:
 * cú pháp gán biến trước lệnh là của shell POSIX, cmd.exe trên Windows không hiểu —
 * mà dự án này đã có `dev-all.mjs` chạy được ở cả hai nền, không có lý do gì để một
 * script mới lại chỉ chạy được một nửa số máy.
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envFile = path.join(repoRoot, ".env.lan-can");
/** Đường dẫn tương đối tính từ `apps/backend` — đúng gốc mà ConfigModule tra. */
const ENV_FILE_FOR_BACKEND = "../../.env.lan-can";
const isWindows = process.platform === "win32";
const pnpm = isWindows ? "pnpm.cmd" : "pnpm";

const command = process.argv[2];
if (command !== "dev" && command !== "db") {
  console.error("Dùng: node scripts/peer-commune-server.mjs <dev|db>");
  process.exit(2);
}

if (!existsSync(envFile)) {
  console.error(
    `Thiếu ${path.relative(repoRoot, envFile)}. Chép từ .env.lan-can.example rồi điền DATABASE_URL,\n` +
      "API_PORT và COMMUNE_PEER_DONG_XUAN (khoá phải trùng khoá khai trong .env).",
  );
  process.exit(1);
}

/**
 * Các lượt chạy nối đuôi nhau, dừng ngay ở lượt đầu tiên hỏng.
 *
 * `db` gồm ba bước phụ thuộc nhau: dựng bảng → seed xã Đồng Xuân (lấy danh mục vật
 * dụng) → dựng các xã lân cận. Chạy tiếp sau khi một bước hỏng chỉ đẻ ra lỗi thứ hai
 * che mất lỗi thật.
 */
const steps =
  command === "dev"
    ? [{ label: "máy chủ xã lân cận (cổng 3101)", args: ["--filter", "@safestock/backend", "start:dev"] }]
    : [
        { label: "dựng bảng", args: ["--filter", "@safestock/backend", "prisma:push"] },
        { label: "seed danh mục và xã Đồng Xuân", args: ["--filter", "@safestock/backend", "seed"] },
        { label: "dựng các xã lân cận", args: ["--filter", "@safestock/backend", "prisma:communes"] },
      ];

/**
 * Biến môi trường cho tiến trình con.
 *
 * `SAFESTOCK_ENV_FILE` là đường Nest đọc cấu hình. Nhưng Prisma KHÔNG đi qua Nest:
 * nó đọc `DATABASE_URL` thẳng từ môi trường, và nó tự nạp tệp `.env` nằm cạnh thư
 * mục chạy TRƯỚC khi Nest kịp nạp `.env.lan-can`. Mà dotenv không bao giờ ghi đè
 * một biến đã có sẵn — nên chuỗi kết nối của xã lân cận thua, im lặng.
 *
 * Hậu quả đã xảy ra thật: `pnpm be:dev:lan-can` dựng máy chủ ở cổng 3101, log báo
 * khởi động sạch sẽ, nhưng nó đọc ghi CƠ SỞ DỮ LIỆU CỦA ĐỒNG XUÂN. Hai xã đáng lẽ
 * tách hẳn nhau lại dùng chung một kho dữ liệu, và không có dấu hiệu nào trên màn
 * hình cho biết điều đó — yêu cầu mượn gửi sang "xã Xuân Thọ" rơi vào bảng của
 * chính máy chủ vừa gửi.
 *
 * Vì vậy CẢ HAI lệnh đều phải truyền thẳng chuỗi kết nối, không riêng `db`. Đây là
 * biến môi trường thật nên nó thắng mọi tệp `.env` mà thư viện nào đó tự nạp.
 */
function environmentFor() {
  const databaseUrl = readEnvValue(envFile, "DATABASE_URL");
  if (!databaseUrl) {
    throw new Error(`${path.relative(repoRoot, envFile)} chưa khai DATABASE_URL`);
  }
  return { ...process.env, SAFESTOCK_ENV_FILE: ENV_FILE_FOR_BACKEND, DATABASE_URL: databaseUrl };
}

/**
 * Đọc MỘT khoá từ tệp .env, không kéo theo thư viện nào.
 *
 * Cố ý sơ sài: chỉ cần đúng `KEY=value` một dòng, đúng dạng mà `.env.lan-can`
 * đang có. Không xử lý nháy kép hay xuống dòng nhiều lần — thêm những thứ đó là
 * viết lại dotenv trong một script chỉ cần lấy đúng một chuỗi kết nối.
 */
function readEnvValue(filePath, key) {
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator < 0) continue;
    if (trimmed.slice(0, separator).trim() !== key) continue;
    return trimmed.slice(separator + 1).trim();
  }
  return null;
}

function run(args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(pnpm, args, {
      cwd: repoRoot,
      env,
      stdio: "inherit",
      shell: false,
      windowsHide: true,
    });
    child.once("error", reject);
    child.once("exit", (code, signal) =>
      code === 0 ? resolve() : reject(new Error(`thoát với mã ${code ?? signal}`)),
    );
  });
}

for (const step of steps) {
  console.log(`\n▸ ${step.label}`);
  try {
    await run(step.args, environmentFor());
  } catch (error) {
    console.error(`Hỏng ở bước “${step.label}”: ${error.message}`);
    process.exit(1);
  }
}

if (command === "db") {
  console.log(
    "\nXong. Chạy `pnpm be:dev:lan-can` rồi đăng nhập bằng tài khoản xã lân cận tại http://127.0.0.1:3101/api.",
  );
}

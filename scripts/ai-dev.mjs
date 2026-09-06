// Chạy ai-service (FastAPI + uvicorn) bằng Python trong .venv — CHẠY ĐƯỢC CẢ WINDOWS LẪN POSIX.
// Windows đặt python ở .venv\Scripts\python.exe, còn macOS/Linux ở .venv/bin/python; script tự chọn
// đúng đường dẫn theo OS để `pnpm ai:dev` không phụ thuộc shell. Không có venv → báo cách tạo.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const serviceDir = join(root, "apps", "ai-service");
const isWindows = process.platform === "win32";
const python = isWindows
  ? join(serviceDir, ".venv", "Scripts", "python.exe")
  : join(serviceDir, ".venv", "bin", "python");

if (!existsSync(python)) {
  console.error(
    `Không tìm thấy Python trong .venv: ${python}\n` +
      `Tạo môi trường trước:\n` +
      `  cd apps/ai-service && python -m venv .venv && ` +
      `${isWindows ? ".venv\\Scripts\\pip" : ".venv/bin/pip"} install -r requirements.txt`,
  );
  process.exit(1);
}

// M5: mặc định loopback (ai-service không có auth riêng). Muốn phục vụ LAN phải cố ý
// đặt AI_SERVICE_HOST=0.0.0.0. Không còn phơi 0.0.0.0 mặc định trên dev launcher.
const host = process.env.AI_SERVICE_HOST?.trim() || "127.0.0.1";
const port = process.env.AI_SERVICE_PORT?.trim() || "8000";
const args = ["-m", "uvicorn", "main:app", "--host", host, "--port", port];

// Nạp lại khi sửa .py — PHẢI TỰ BẬT bằng AI_SERVICE_RELOAD=1.
//
// Không bật mặc định vì mỗi lần nạp lại là một lần hâm nóng PhoWhisper (xem
// `_ham_nong_nhan_dang_giong_noi` trong main.py): nạp model torch mất vài chục
// giây, gõ sửa liên tục thì máy dev nghẹt.
//
// Nhưng không có nó thì cái bẫy ngược lại còn tệ hơn và đã dính thật: sửa xong
// logic Python, test xanh hết, mà service vẫn chạy bản cũ trong bộ nhớ — nhìn ra
// y hệt "đã sửa mà vẫn lỗi", và mất cả một vòng thử nghiệm mới lần ra.
// Đang sửa Python thì bật cờ này; kèm PHOWHISPER_WARM=false cho nhẹ.
if (process.env.AI_SERVICE_RELOAD?.trim() === "1") {
  args.push("--reload");
  console.log("[ai-dev] --reload BẬT: sửa .py là service tự nạp lại.");
}
// stdio kế thừa để log uvicorn hiện trực tiếp; cwd = ai-service để uvicorn thấy main.py.
const child = spawn(python, args, { cwd: serviceDir, stdio: "inherit" });

// Chuyển tiếp Ctrl+C / kill để uvicorn tắt sạch, không để tiến trình con mồ côi.
const forward = (signal) => child.kill(signal);
process.on("SIGINT", () => forward("SIGINT"));
process.on("SIGTERM", () => forward("SIGTERM"));
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});

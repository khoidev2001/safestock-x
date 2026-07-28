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

const args = ["-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"];
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

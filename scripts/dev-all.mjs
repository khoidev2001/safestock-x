import { spawn } from "node:child_process";
import net from "node:net";
import process from "node:process";

const isWindows = process.platform === "win32";
const pnpm = isWindows ? "pnpm.cmd" : "pnpm";
const args = new Set(process.argv.slice(2));

if (args.has("-h") || args.has("--help")) {
  console.log("pnpm dev:all [--no-mobile] [--no-ollama]");
  process.exit(0);
}

const allowedArgs = new Set(["--no-mobile", "--no-ollama"]);
const invalidArg = [...args].find((arg) => !allowedArgs.has(arg));
if (invalidArg) {
  console.error(`Tham số không nhận diện: ${invalidArg} (dùng --help để xem trợ giúp)`);
  process.exit(2);
}

const services = [
  { name: "ai-service", port: 8000, command: pnpm, args: ["ai:dev"] },
  { name: "backend", port: 3100, command: pnpm, args: ["be:dev"] },
  { name: "frontend", port: 3200, command: pnpm, args: ["fe:dev"] },
];

if (!args.has("--no-ollama")) {
  services.unshift({ name: "ollama", port: 11434, command: "ollama", args: ["serve"] });
}
if (!args.has("--no-mobile")) {
  services.push({ name: "mobile", command: pnpm, args: ["mobile:dev"] });
}

const children = [];
let stopping = false;

function isPortBusy(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: "127.0.0.1", port });
    socket.setTimeout(500);
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    const unavailable = () => {
      socket.destroy();
      resolve(false);
    };
    socket.once("error", unavailable);
    socket.once("timeout", unavailable);
  });
}

function prefixOutput(stream, name, target) {
  let pending = "";
  stream.setEncoding("utf8");
  stream.on("data", (chunk) => {
    pending += chunk;
    const lines = pending.split(/\r?\n/);
    pending = lines.pop() ?? "";
    for (const line of lines) target.write(`[${name}] ${line}\n`);
  });
  stream.on("end", () => {
    if (pending) target.write(`[${name}] ${pending}\n`);
  });
}

async function stopChild(child) {
  if (child.exitCode != null || child.killed) return;
  if (isWindows) {
    await new Promise((resolve) => {
      const killer = spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
        stdio: "ignore",
        windowsHide: true,
      });
      killer.once("exit", resolve);
      killer.once("error", resolve);
    });
  } else {
    child.kill("SIGTERM");
  }
}

async function stopAll() {
  if (stopping) return;
  stopping = true;
  console.log("\nĐang dừng các service...");
  await Promise.all(children.map(stopChild));
}

process.once("SIGINT", () => void stopAll().then(() => process.exit(0)));
process.once("SIGTERM", () => void stopAll().then(() => process.exit(0)));

console.log("SafeStock — khởi động môi trường dev");
for (const service of services) {
  if (service.port && (await isPortBusy(service.port))) {
    console.log(`[${service.name}] Cổng ${service.port} đã có service — bỏ qua.`);
    continue;
  }
  const child = spawn(service.command, service.args, {
    cwd: process.cwd(),
    env: process.env,
    shell: false,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.push(child);
  prefixOutput(child.stdout, service.name, process.stdout);
  prefixOutput(child.stderr, service.name, process.stderr);
  child.once("error", (error) => console.error(`[${service.name}] Không khởi động được: ${error.message}`));
  child.once("exit", (code) => {
    if (!stopping) console.log(`[${service.name}] Đã dừng (exit ${code ?? "signal"}).`);
  });
  console.log(`[${service.name}] PID ${child.pid}`);
}

if (children.length === 0) {
  console.log("Không có service nào cần khởi động.");
  process.exit(0);
}

console.log(`Đang chạy ${children.length} service. Nhấn Ctrl+C để dừng tất cả.`);

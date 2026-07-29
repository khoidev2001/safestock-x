import { app, BrowserWindow } from "electron";
import { join } from "node:path";

// App demo local: 1 cửa sổ, không menu phức tạp. Renderer gọi API/WS tới backend
// (mặc định http://localhost:3100) qua fetch + socket.io-client, không qua IPC.
function createWindow(): void {
  const win = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 940,
    minHeight: 640,
    title: "Ứng phó nhanh — Giả lập cảm biến",
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      // Bật sandbox: preload không dùng Node API nào (chỉ giữ contextIsolation), renderer
      // chạy như web app thuần (fetch + socket.io tới backend). Sandbox chặn renderer/preload
      // truy cập Node → giảm bề mặt tấn công nếu nội dung web bị lợi dụng.
      sandbox: true,
      contextIsolation: true,
    },
  });

  // Dev: electron-vite cấp URL dev server (HMR). Prod: load file build nội bộ.
  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    win.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

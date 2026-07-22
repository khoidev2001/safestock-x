import { defineConfig } from "electron-vite";
import react from "@vitejs/plugin-react";

// electron-vite chia 3 build: main (Node), preload (bridge), renderer (React).
// Renderer tái dùng React 19 khớp frontend; không router/state phức tạp (app demo tối giản).
export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    plugins: [react()],
  },
});

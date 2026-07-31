// Desktop (Electron + React qua electron-vite). main/preload = Node; renderer = browser + React.
import globals from "globals";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import { base, ignores } from "../../eslint.config.base.mjs";

export default [
  // .test-out là JS đã biên dịch của test state — lint mã nguồn, không lint sản phẩm build.
  { ignores: [...ignores, ".test-out/**"] },
  ...base,
  {
    // Test state chạy bằng node --test.
    files: ["__tests__/**/*.ts"],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  {
    // Tiến trình main + preload chạy trong Node.
    files: ["src/main/**/*.ts", "src/preload/**/*.ts"],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  {
    // Renderer chạy trong Chromium + React.
    files: ["src/renderer/**/*.{ts,tsx}"],
    plugins: { react, "react-hooks": reactHooks },
    languageOptions: {
      globals: { ...globals.browser },
    },
    settings: { react: { version: "detect" } },
    rules: {
      ...react.configs.recommended.rules,
      ...react.configs["jsx-runtime"].rules,
      ...reactHooks.configs.recommended.rules,
    },
  },
];

// Backend (NestJS, Node). Spread base + node globals; nới rule cho file test (jest, nhiều `as never`/`!`).
import globals from "globals";
import { base, ignores } from "../../eslint.config.base.mjs";

export default [
  { ignores },
  ...base,
  {
    files: ["**/*.ts"],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  {
    // Script Node ESM (demo, mjs) — global process/console/fetch/setTimeout.
    files: ["**/*.mjs"],
    languageOptions: {
      sourceType: "module",
      globals: { ...globals.node },
    },
  },
  {
    // Config Node CommonJS (jest.config.js, jest-e2e.config.js) — global module/require.
    files: ["**/*.js", "**/*.cjs"],
    languageOptions: {
      sourceType: "commonjs",
      globals: { ...globals.node },
    },
  },
  {
    // Test dùng jest globals + nhiều mock ép kiểu — không bắt no-explicit-any / non-null ở đây.
    files: ["**/*.spec.ts", "test/**/*.ts"],
    languageOptions: {
      globals: { ...globals.jest },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
];

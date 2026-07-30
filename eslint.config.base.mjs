// Base ESLint flat config dùng chung cho toàn monorepo (trừ mobile — Expo SDK 52 còn dùng legacy .eslintrc).
// Mỗi package có eslint.config.mjs riêng spread base này (flat config KHÔNG cascade theo thư mục con).
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

// Thư mục build/vendor không lint — dùng chung mọi package.
export const ignores = [
  "**/dist/**",
  "**/.next/**",
  "**/.next-*/**",
  "**/out/**",
  "**/build/**",
  "**/release/**",
  "**/coverage/**",
  "**/node_modules/**",
  "**/.prisma/**",
  "**/*.min.js",
  "**/.venv/**",
  "**/__pycache__/**",
  "**/.claude/**",
  "apps/ai-service/**",
];

// Quy ước Arrow: chỉ callback + one-liner (không ép func-style; giữ `function` cho component/hook/helper lớn).
export const arrowRules = {
  "prefer-arrow-callback": "error",
  "arrow-body-style": ["error", "as-needed"],
};

// Biến/tham số/biến catch có tiền tố `_` là cố ý bỏ (vd destructure để strip field) — không báo unused.
export const unusedVarsRule = {
  "@typescript-eslint/no-unused-vars": [
    "error",
    { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
  ],
};

// Preset "strict recommended": js recommended + typescript-eslint recommended + arrow rules.
// prettier đặt CUỐI để tắt mọi rule format xung đột Prettier.
export const base = [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      ...arrowRules,
      ...unusedVarsRule,
    },
  },
  prettier,
];

export default base;

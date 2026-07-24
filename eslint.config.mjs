// Config gốc: chỉ lint script hạ tầng .mjs ở gốc + infrastructure/ (Node ESM thuần).
// Các workspace package tự lint qua eslint.config.mjs riêng của chúng (pnpm -r lint).
import globals from "globals";
import { base, ignores } from "./eslint.config.base.mjs";

export default [
  {
    ignores: [
      ...ignores,
      // Package con tự lint riêng — không lint chồng từ gốc.
      "apps/**",
      "packages/**",
    ],
  },
  ...base,
  {
    files: ["**/*.mjs", "**/*.js"],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
];

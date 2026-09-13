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
      // Công cụ dựng bộ slide thuyết trình (CommonJS chạy tay bằng node), không
      // phải mã sản phẩm và không đi vào bản build nào. Ép nó theo luật ESM của
      // ứng dụng là phải viết lại cả bộ dựng slide mà không làm app an toàn hơn.
      "slide-ung-pho-nhanh/**",
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

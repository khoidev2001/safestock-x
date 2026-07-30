// Frontend (Next.js 15). eslint-config-next chưa export flat config nên nạp qua FlatCompat.
// next/core-web-vitals + next/typescript đã gồm react, react-hooks, jsx-a11y, @next/next, @typescript-eslint.
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";
import prettier from "eslint-config-prettier";
import { arrowRules, ignores } from "../../eslint.config.base.mjs";

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

const config = [
  {
    // `.next-*/**` bắt cả build tách biệt qua NEXT_DIST_DIR (demo/preflight),
    // là artifact sinh ra như `.next/` — không lint.
    ignores: [...ignores, ".next/**", ".next-*/**", "out/**", "next-env.d.ts"],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: { ...arrowRules },
  },
  prettier,
];

export default config;

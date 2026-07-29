// shared-types: TS thuần. Spread base chung.
import globals from "globals";
import { base, ignores } from "../../eslint.config.base.mjs";

export default [
  { ignores },
  ...base,
  {
    files: ["tests/**/*.cjs"],
    languageOptions: { globals: globals.node },
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
];

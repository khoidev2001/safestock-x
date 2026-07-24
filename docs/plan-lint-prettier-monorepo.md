# Kế hoạch: Chuẩn hoá ESLint 9 + Prettier toàn monorepo (strict recommended + Arrow rules)

## Context (vì sao làm)
Trước khi commit đợt "operational-readiness", user muốn code đạt **chuẩn lint + Arrow function**.
Khảo sát cho thấy **cả monorepo chưa có một file config ESLint/Prettier nào ở cấp dự án**
(chỉ có trong `node_modules`). Frontend vẫn dùng `next lint` (đã bị Next 16 gỡ);
backend/desktop/mobile/packages **không có script lint nào**. Vì vậy đây là lần thiết lập
tooling lint/format **từ đầu** cho toàn dự án, không phải chỉ chỉnh vài rule.

Quyết định đã chốt với user:
- Cài **ESLint 9 (flat config) + Prettier** cho **toàn bộ** workspace (trừ `apps/ai-service` là Python — ngoài phạm vi).
- Mức rule: **strict — bật full recommended làm ERROR** (`@eslint/js` + `typescript-eslint` recommended + next/expo recommended). `pnpm lint` chỉ pass khi sạch lỗi.
- Arrow convention: **chỉ callback + one-liner** → `prefer-arrow-callback` + `arrow-body-style: as-needed` (KHÔNG ép `func-style`; giữ nguyên `function` cho component/hook/helper lớn — khớp `skills/CODING-STANDARDS.md §3.1`).
- Làm lint/format **ngay**, **không tách commit**: chấp nhận diff trộn với 3 gap bảo mật A/B/C đang dở (đã xong + xanh test, chưa commit).

Kết quả mong muốn: mỗi app có `pnpm lint` / `pnpm format`, chạy `pnpm -r lint` ở gốc sạch lỗi;
toàn bộ code được Prettier format nhất quán; commit về sau có lưới lint bảo vệ.

## Ràng buộc kỹ thuật đã xác minh (từ docs chính thức)
- **Next 15**: flat config qua `FlatCompat` với `eslint-config-next` (`next/core-web-vitals` + `next/typescript`). Gỡ `next lint`, chuyển sang `eslint .`.
- **Expo SDK 52**: **KHÔNG** hỗ trợ flat config. Bắt buộc `.eslintrc.js` legacy `extends: ["expo","prettier"]`, chạy qua `expo lint` (Expo tự dùng ESLint 8 tương thích, cô lập trong `apps/mobile/node_modules` nhờ pnpm). Flat config chỉ từ SDK 53+.
- **Flat config KHÔNG cascade theo thư mục con** như `.eslintrc`. Chạy `eslint .` ở gốc chỉ đọc config gốc. ⇒ Mỗi workspace package phải có config riêng, và **orchestrate bằng `pnpm -r lint`** (chạy lint trong từng package).

## Kiến trúc config
Một **base dùng chung** ở gốc + **config riêng mỗi package** import base đó (mobile là ngoại lệ legacy).

```
eslint.config.base.mjs        # (MỚI) base: js+ts recommended, arrow rules, prettier-off, ignores
eslint.config.mjs             # (MỚI, gốc) lint file gốc + infrastructure/*.mjs, spread base
.prettierrc.json              # (MỚI) config Prettier chung
.prettierignore               # (MỚI)
apps/backend/eslint.config.mjs        # (MỚI) base + node globals + override cho *.spec/*.e2e (jest)
apps/frontend/eslint.config.mjs       # (MỚI) FlatCompat(next/core-web-vitals + next/typescript) + arrow + prettier
apps/desktop/eslint.config.mjs        # (MỚI) base + react/react-hooks; override main/preload=node, renderer=browser
apps/mobile/.eslintrc.js              # (MỚI, LEGACY) extends ["expo","prettier"]
packages/shared-types/eslint.config.mjs      # (MỚI) base
packages/scenario-definitions/eslint.config.mjs  # (MỚI) base
```

### `eslint.config.base.mjs` (nội dung)
- `import js from "@eslint/js"; import tseslint from "typescript-eslint"; import prettier from "eslint-config-prettier";`
- Export mảng: `js.configs.recommended`, `...tseslint.configs.recommended`, một object rule chung:
  - `"prefer-arrow-callback": "error"`
  - `"arrow-body-style": ["error", "as-needed"]`
- `prettier` (đặt **cuối** để tắt mọi rule format xung đột Prettier).
- `globalIgnores`: `**/dist/`, `**/.next/`, `**/out/`, `**/build/`, `**/release/`, `**/coverage/`, `**/node_modules/`, `**/.prisma/`, `apps/ai-service/`, `**/*.min.js`, `**/.venv/`, `**/__pycache__/`, `**/public/sim.html` (asset).
- Dùng `tseslint.config(...)` helper để type-safe khi cần.
- **Không** bật `recommendedTypeChecked` (khỏi cần `parserOptions.project`, tránh cấu hình nặng + chậm toàn monorepo). "Strict recommended" = preset `recommended`.

### Backend (`apps/backend/eslint.config.mjs`)
- Spread base. Thêm `languageOptions.globals = { ...globals.node }`.
- Override cho `**/*.spec.ts`, `test/**/*.ts`: thêm `globals.jest`; nới `@typescript-eslint/no-explicit-any` và `no-non-null-assertion` xuống `"off"` cho test (test hiện dùng nhiều `as never`, `!`).
- Có 48 spec/e2e làm lưới an toàn → fix ERROR ở `src/` an tâm, chạy lại `pnpm --filter @safestock/backend test`.

### Frontend (`apps/frontend/eslint.config.mjs`)
- Dùng `FlatCompat` (`@eslint/eslintrc`) để nạp `next/core-web-vitals` + `next/typescript` (đã gồm react, react-hooks, jsx-a11y, @next/next).
- Thêm object arrow rules (như base) + `eslint-config-prettier` cuối.
- **Không** spread base tseslint để tránh double-register plugin `@typescript-eslint` với next/typescript.
- Sửa script: `"lint": "eslint ."` (bỏ `next lint`). Ignores next: `.next/`, `out/`, `next-env.d.ts`.
- 0 test → verify bằng `pnpm --filter @safestock/frontend build` (next build có type-check) sau khi fix.

### Desktop (`apps/desktop/eslint.config.mjs`)
- Spread base + `eslint-plugin-react` (`react/recommended`, `react/jsx-runtime`) + `eslint-plugin-react-hooks` cho `src/renderer/**`.
- File overrides theo môi trường:
  - `src/main/**`, `src/preload/**` → `globals.node`
  - `src/renderer/**` → `globals.browser` + react settings `{ react: { version: "detect" } }`
- Thêm script `"lint": "eslint ."`. 0 test → verify bằng `pnpm --filter @safestock/desktop typecheck` + `build`.

### Mobile (`apps/mobile/.eslintrc.js`) — LEGACY
- `module.exports = { extends: ["expo", "prettier"], ignorePatterns: ["/dist","/.expo","/node_modules"] };`
- Declare devDeps riêng trong `apps/mobile/package.json`: `eslint@^8.57`, `eslint-config-expo` (bản cho SDK 52), `eslint-config-prettier`. pnpm cô lập ESLint 8 tại đây, không đụng ESLint 9 ở gốc.
- Script `"lint": "expo lint"` (Expo tự set `ESLINT_USE_FLAT_CONFIG=false`). 0 test → verify `pnpm --filter @safestock/mobile exec tsc --noEmit` (dùng tsconfig expo base) sau fix.

### Packages (shared-types, scenario-definitions)
- `eslint.config.mjs` chỉ spread base (TS thuần, node globals). Thêm script `"lint": "eslint ."` vào `package.json` mỗi package.

## Prettier
- `.prettierrc.json` khớp style quan sát được ở backend (double-quote, 2 space, semicolon, trailing comma):
  ```json
  { "printWidth": 100, "singleQuote": false, "semi": true, "tabWidth": 2, "trailingComma": "all", "arrowParens": "always", "endOfLine": "lf" }
  ```
- `.prettierignore`: `dist`, `.next`, `out`, `build`, `release`, `coverage`, `node_modules`, `**/.prisma`, `apps/ai-service`, `pnpm-lock.yaml`, `package-lock.json`, `*.md` (giữ nguyên docs tiếng Việt khỏi reflow — tuỳ chọn), `apps/backend/public/sim.html`.
- **Trước khi apply**: chạy `pnpm exec prettier --check .` để đo churn. Nếu `printWidth: 100` gây reflow lớn bất thường ở app nào, cân nhắc điều chỉnh — nhưng mặc định 100 khớp style hiện tại (backend nhiều dòng ~90–95 ký tự không bị wrap).

## Scripts (root `package.json`)
```jsonc
"lint": "pnpm -r --if-present lint",
"lint:fix": "pnpm -r --if-present lint:fix",
"format": "prettier --write .",
"format:check": "prettier --check ."
```
- Mỗi app thêm `"lint:fix"` tương ứng (`eslint . --fix`; mobile `expo lint -- --fix`).

## Thứ tự thực thi (sau khi approve)
0. **Lưu plan vào repo** (theo yêu cầu lưu-plan-md của user): file này (`docs/plan-lint-prettier-monorepo.md`).
1. **Cài devDeps ở gốc**: `eslint@^9`, `@eslint/js`, `typescript-eslint`, `eslint-config-prettier`, `eslint-plugin-react`, `eslint-plugin-react-hooks`, `globals`, `@eslint/eslintrc` (FlatCompat), `prettier`.
2. **Cài per-app**: frontend `eslint-config-next@15`; mobile `eslint@^8.57 eslint-config-expo eslint-config-prettier`.
3. Tạo toàn bộ file config + `.prettierrc.json` + `.prettierignore`; sửa scripts.
4. **Format trước**: `pnpm exec prettier --check .` → xem churn → `prettier --write .` (diff format thuần, review nhanh).
5. **Auto-fix ESLint từng app**: chạy `lint:fix` (arrow rules + fixable tự vá).
6. **Fix thủ công theo app**, verify riêng từng app ngay sau khi fix:
   - backend: `pnpm --filter @safestock/backend lint` sạch → `... test` (48 suite) vẫn xanh.
   - frontend: `... lint` sạch → `... build`.
   - desktop: `... lint` sạch → `... typecheck` + `build`.
   - mobile: `... lint` (expo) sạch → `tsc --noEmit`.
   - packages: `... lint` sạch → build nếu có.
7. **Chốt toàn cục**: ở gốc `pnpm -r lint` exit 0 và `pnpm format:check` sạch.

## Verification (end-to-end)
- `pnpm -r --if-present lint` → **exit 0**, không còn ERROR ở mọi package.
- `pnpm format:check` → **sạch**.
- Backend regression: `pnpm --filter @safestock/backend test` giữ **48 suite / 328 test pass** (không tụt so với baseline) + e2e `report-approve-atomic` 9/9 (Postgres :55433) nếu chạm loan/report.
- Build guard cho app không test: frontend `next build` OK; desktop `typecheck` + `electron-vite build` OK; mobile `tsc --noEmit` OK.
- Xác nhận Arrow rules hoạt động: callback ẩn danh `function(){}` → cảnh báo/tự sửa thành arrow; `() => { return x }` → rút thành `() => x`. `function` declaration của component/hook **không** bị đụng.

## Rủi ro & cách xử lý
- **Strict trên 3 app không test**: nhiều `no-explicit-any`/`no-unused-vars` có thể phải sửa thủ công nhiều chỗ. Giảm rủi ro bằng verify `tsc`/`build` sau mỗi app; nếu một rule gây sửa rủi ro diện rộng không đáng (vd `no-explicit-any` ở lớp adapter), cân nhắc hạ **rule đó** xuống `warn` có ghi chú — báo user trước khi hạ.
- **Xung đột ESLint 8 (mobile) vs 9 (gốc)**: cô lập bằng devDeps riêng của mobile + chạy qua `expo lint`; không hoist ESLint 9 đè.
- **Diff lớn trộn với gap A/B/C**: đúng như user chấp nhận (không tách commit). Sẽ review diff theo nhóm (format-only vs logic) trước khi user commit.
- **`package-lock.json` lạc** ở gốc (repo dùng pnpm): đưa vào `.prettierignore`; việc xoá nó **ngoài phạm vi** plan này.
- **`apps/ai-service` (Python)**: ngoài phạm vi ESLint/Prettier. Có thể thêm ruff/black ở plan khác nếu user muốn.

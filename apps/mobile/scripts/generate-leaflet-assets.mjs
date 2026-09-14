// Sinh `leaflet-assets.ts`: Leaflet 1.9.4 nhúng thẳng vào app.
//
// VÌ SAO: bản đồ nhiệm vụ trước đây tải Leaflet từ unpkg. Mất mạng là không có
// thư viện, bản đồ trắng — dù tile vệ tinh đã lưu sẵn trong máy. Nhúng vào bundle
// thì mở bản đồ không cần mạng.
//
// Chạy lại khi nâng Leaflet: node scripts/generate-leaflet-assets.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, "..", "..", "frontend", "package.json"));
const leafletDir = dirname(require.resolve("leaflet/package.json"));
const version = JSON.parse(readFileSync(join(leafletDir, "package.json"), "utf8")).version;
if (version !== "1.9.4")
  throw new Error(`Leaflet ${version}: kiểm lại createTile/_getZoomForUrl trước khi nâng`);

// Trang nhúng chuỗi này vào <script>/<style>: chặn "</" để không đóng thẻ sớm.
const safe = (text) => JSON.stringify(text.replace(/<\//g, "<\\/"));
const js = readFileSync(join(leafletDir, "dist", "leaflet.js"), "utf8").replace(
  /\n\/\/# sourceMappingURL=.*$/m,
  "",
);
const css = readFileSync(join(leafletDir, "dist", "leaflet.css"), "utf8");
const license = readFileSync(join(leafletDir, "LICENSE"), "utf8");

writeFileSync(
  join(here, "..", "leaflet-assets.ts"),
  `/* eslint-disable */
// TỆP SINH TỰ ĐỘNG bởi scripts/generate-leaflet-assets.mjs — đừng sửa tay.
// Leaflet ${version}, giấy phép gốc:
${license
  .trim()
  .split("\n")
  .map((line) => `// ${line}`.trimEnd())
  .join("\n")}

export const LEAFLET_VERSION = ${JSON.stringify(version)};
export const LEAFLET_JS: string = ${safe(js)};
export const LEAFLET_CSS: string = ${safe(css)};
`,
);
console.log("leaflet-assets.ts", version, js.length, css.length);

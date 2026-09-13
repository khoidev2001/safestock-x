#!/usr/bin/env node
/**
 * Sinh lại `supply-images.ts` từ những tệp ảnh có thật trong `assets/supplies/`.
 *
 * Vì sao phải sinh chứ không viết tay: Metro gom ảnh theo `require()` tĩnh, nên
 * một dòng `require` trỏ vào tệp chưa tồn tại là lỗi đóng gói chứ không phải
 * thiếu ảnh im lặng. Quét thư mục rồi sinh đúng những gì đang có thì app luôn
 * dựng được, và món nào chưa có ảnh tự quay về icon emoji như cũ.
 *
 * Quy ước tên tệp: mã vật tư viết thường, đuôi nào cũng được.
 *   WATER-01  ->  assets/supplies/water-01.jpg
 *   BOOT-01   ->  assets/supplies/boot-01.png
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MOBILE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const IMAGE_DIR = join(MOBILE_ROOT, "assets", "supplies");
const OUTPUT_FILE = join(MOBILE_ROOT, "supply-images.ts");
const SEED_DATA_FILE = resolve(MOBILE_ROOT, "..", "backend", "prisma", "seed-data.ts");

/** Đuôi ảnh Metro đóng gói được. */
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);

/** Mã vật tư chuẩn, đọc từ seed để không phải chép tay danh sách ở hai nơi. */
function readCatalogSkus() {
  try {
    const source = readFileSync(SEED_DATA_FILE, "utf8");
    const skus = [...source.matchAll(/sku:\s*"([A-Z0-9][A-Z0-9-]*)"/g)].map((match) => match[1]);
    return [...new Set(skus)].sort();
  } catch {
    return [];
  }
}

function readImageFiles() {
  let entries = [];
  try {
    entries = readdirSync(IMAGE_DIR, { withFileTypes: true });
  } catch {
    return { images: [], ignored: [] };
  }

  const images = [];
  const ignored = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const extension = extname(entry.name).toLowerCase();
    if (!IMAGE_EXTENSIONS.has(extension)) {
      if (entry.name !== "README.md") ignored.push(entry.name);
      continue;
    }
    const sku = entry.name.slice(0, -extension.length).toUpperCase();
    images.push({ sku, fileName: entry.name });
  }
  return { images: images.sort((a, b) => a.sku.localeCompare(b.sku)), ignored };
}

function renderModule(images) {
  const lines = images.map(
    ({ sku, fileName }) => `  "${sku}": require("./assets/supplies/${fileName}"),`,
  );
  const body = lines.length > 0 ? `\n${lines.join("\n")}\n` : "";

  return `/**
 * TỆP SINH TỰ ĐỘNG — đừng sửa tay.
 *
 * Sinh lại sau khi thêm/bớt ảnh trong \`assets/supplies/\`:
 *   pnpm --filter @safestock/mobile supply-images
 *
 * Ảnh thật của từng món vật tư, tra theo mã vật tư. Món nào chưa có ảnh thì
 * không có trong bảng này, và ô nhận diện quay về icon emoji của nhóm.
 */
import type { ImageSourcePropType } from "react-native";

const SUPPLY_IMAGES: Record<string, ImageSourcePropType> = {${body}};

/** Ảnh thật của một mã vật tư, hoặc \`undefined\` nếu chưa có ảnh. */
export function supplyImageOf(sku: string): ImageSourcePropType | undefined {
  return SUPPLY_IMAGES[sku?.toUpperCase?.() ?? ""];
}

/** Số món đã có ảnh — dùng trong test và kiểm tra nhanh. */
export const SUPPLY_IMAGE_COUNT = ${images.length};
`;
}

const { images, ignored } = readImageFiles();
writeFileSync(OUTPUT_FILE, renderModule(images), "utf8");

console.log(`supply-images.ts: ${images.length} món đã có ảnh.`);
for (const { sku, fileName } of images) console.log(`  ✓ ${sku} → ${fileName}`);

const catalog = readCatalogSkus();
const withImage = new Set(images.map((image) => image.sku));
const missing = catalog.filter((sku) => !withImage.has(sku));
if (missing.length > 0) {
  console.log(`\nCòn ${missing.length} món chưa có ảnh (vẫn dùng icon emoji):`);
  for (const sku of missing) console.log(`  · ${sku} → cần ${sku.toLowerCase()}.jpg`);
}

const unknown = images.filter((image) => catalog.length > 0 && !catalog.includes(image.sku));
if (unknown.length > 0) {
  console.log(`\nCảnh báo — tên tệp không khớp mã vật tư nào trong seed:`);
  for (const { fileName } of unknown) console.log(`  ! ${fileName}`);
}

if (ignored.length > 0) {
  console.log(`\nBỏ qua (không phải ảnh): ${ignored.join(", ")}`);
}

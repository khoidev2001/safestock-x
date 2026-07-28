import { createWriteStream } from "node:fs";
import { mkdir, open, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { sha256File } from "./osrm-artifact.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const dataDirectory = path.resolve(scriptDirectory, "data");
const outputPath = path.resolve(dataDirectory, "dong-xuan.osm");
const temporaryPath = `${outputPath}.download`;
const endpoint =
  process.env.OSRM_OVERPASS_URL ??
  "https://overpass-api.de/api/interpreter";
const bbox = [108.6, 13.1, 109.3, 13.7];
const [west, south, east, north] = bbox;
const query = `[out:xml][timeout:300];
(
  way["highway"](${south},${west},${north},${east});
  relation["type"="restriction"](${south},${west},${north},${east});
);
(._;>;);
out meta;`;

await mkdir(dataDirectory, { recursive: true });
await rm(temporaryPath, { force: true });

try {
  console.log(`Đang tải road extract Đồng Xuân/vùng đệm từ ${endpoint}...`);
  const body = new URLSearchParams({ data: query });
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
      "user-agent": "SafeStock-X-OSRM-Builder/1.0",
    },
    body,
    signal: AbortSignal.timeout(360_000),
  });
  if (!response.ok || !response.body) {
    throw new Error(`Overpass HTTP ${response.status}: ${await response.text()}`);
  }

  await pipeline(response.body, createWriteStream(temporaryPath, { flags: "wx" }));
  const handle = await open(temporaryPath, "r");
  const signature = Buffer.alloc(256);
  await handle.read(signature, 0, signature.length, 0);
  await handle.close();
  if (!signature.toString("utf8").includes("<osm")) {
    throw new Error("Source tải về không phải OSM XML hợp lệ.");
  }

  await rename(temporaryPath, outputPath);
  const generatedAt = new Date().toISOString();
  const sha256 = await sha256File(outputPath);
  await writeFile(
    `${outputPath}.source.json`,
    `${JSON.stringify(
      {
        name: path.basename(outputPath),
        url: endpoint,
        bbox,
        query,
        generatedAt,
        sha256,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  console.log(`Đã lưu ${outputPath} (sha256=${sha256}).`);
} catch (error) {
  await rm(temporaryPath, { force: true });
  throw error;
}

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";

export const OSRM_ALGORITHM = "mld";
export const OSRM_GRAPH_BASENAME = "dong-xuan.osrm";
export const OSRM_IMAGE =
  "ghcr.io/project-osrm/osrm-backend:v5.27.1@sha256:855614a38f464b0558a2ad6eaa7cb8c139f39887da9b38b485ce453c6e6e6124";

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const PLACEHOLDER_VERSION_PATTERN =
  /(unconfigured|placeholder|unknown|replace[-_ ]?me|todo)/i;

function assertGraphVersion(graphVersion) {
  if (
    typeof graphVersion !== "string" ||
    graphVersion.length < 3 ||
    !/^[a-z0-9][a-z0-9._-]+$/i.test(graphVersion) ||
    PLACEHOLDER_VERSION_PATTERN.test(graphVersion)
  ) {
    throw new Error("Graph version không hợp lệ hoặc vẫn là placeholder.");
  }
}

function assertBbox(bbox) {
  if (
    !Array.isArray(bbox) ||
    bbox.length !== 4 ||
    !bbox.every(Number.isFinite)
  ) {
    throw new Error("Bbox phải gồm bốn tọa độ hữu hạn.");
  }

  const [west, south, east, north] = bbox;
  if (
    west < -180 ||
    east > 180 ||
    south < -90 ||
    north > 90 ||
    west >= east ||
    south >= north
  ) {
    throw new Error("Bbox không hợp lệ.");
  }
}

function assertSource(source) {
  if (
    !source ||
    typeof source.name !== "string" ||
    !source.name.trim() ||
    !SHA256_PATTERN.test(source.sha256) ||
    typeof source.generatedAt !== "string" ||
    Number.isNaN(Date.parse(source.generatedAt))
  ) {
    throw new Error("Thông tin source OSRM không hợp lệ.");
  }
}

function assertSafeArtifactName(name) {
  if (
    typeof name !== "string" ||
    path.basename(name) !== name ||
    !name.startsWith(`${OSRM_GRAPH_BASENAME}.`)
  ) {
    throw new Error(`Tên graph file không hợp lệ: ${String(name)}`);
  }
}

export async function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);

    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

async function graphFiles(dataDirectory) {
  const entries = await readdir(dataDirectory, { withFileTypes: true });
  const names = entries
    .filter(
      (entry) =>
        entry.isFile() &&
        entry.name.startsWith(`${OSRM_GRAPH_BASENAME}.`) &&
        entry.name !== `${OSRM_GRAPH_BASENAME}.manifest.json`,
    )
    .map((entry) => entry.name)
    .sort();

  if (names.length === 0) {
    throw new Error(`Không tìm thấy graph files ${OSRM_GRAPH_BASENAME}.*.`);
  }

  return Promise.all(
    names.map(async (name) => {
      const filePath = path.join(dataDirectory, name);
      const metadata = await stat(filePath);
      return {
        name,
        size: metadata.size,
        sha256: await sha256File(filePath),
      };
    }),
  );
}

export async function createGraphManifest({
  dataDirectory,
  graphVersion,
  source,
  bbox,
}) {
  assertGraphVersion(graphVersion);
  assertBbox(bbox);
  assertSource(source);

  const files = await graphFiles(dataDirectory);
  return {
    schemaVersion: 1,
    graphVersion,
    algorithm: OSRM_ALGORITHM,
    image: OSRM_IMAGE,
    bbox: [...bbox],
    source: { ...source },
    generatedAt: new Date().toISOString(),
    files,
  };
}

export async function verifyGraphArtifact(dataDirectory, manifest) {
  if (!manifest || manifest.schemaVersion !== 1) {
    throw new Error("Manifest OSRM không đúng schema version.");
  }

  assertGraphVersion(manifest.graphVersion);
  assertBbox(manifest.bbox);
  assertSource(manifest.source);

  if (manifest.algorithm !== OSRM_ALGORITHM) {
    throw new Error(`Thuật toán OSRM phải là ${OSRM_ALGORITHM}.`);
  }
  if (manifest.image !== OSRM_IMAGE) {
    throw new Error("OSRM image không khớp digest đã khóa.");
  }
  if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
    throw new Error("Manifest OSRM không có graph files.");
  }

  for (const file of manifest.files) {
    assertSafeArtifactName(file?.name);
    if (!Number.isSafeInteger(file.size) || file.size < 0) {
      throw new Error(`Kích thước graph file không hợp lệ: ${file.name}`);
    }
    if (!SHA256_PATTERN.test(file.sha256)) {
      throw new Error(`Checksum không hợp lệ: ${file.name}`);
    }

    const filePath = path.join(dataDirectory, file.name);
    let metadata;
    try {
      metadata = await stat(filePath);
    } catch {
      throw new Error(`Thiếu graph file: ${file.name}`);
    }

    if (!metadata.isFile()) {
      throw new Error(`Graph artifact không phải file: ${file.name}`);
    }

    const checksum = await sha256File(filePath);
    if (checksum !== file.sha256) {
      throw new Error(`Checksum không khớp: ${file.name}`);
    }
    if (metadata.size !== file.size) {
      throw new Error(`Kích thước không khớp: ${file.name}`);
    }
  }

  return {
    graphVersion: manifest.graphVersion,
    filesVerified: manifest.files.length,
  };
}

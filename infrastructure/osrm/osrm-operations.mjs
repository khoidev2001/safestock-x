import path from "node:path";
import { OSRM_IMAGE } from "./osrm-artifact.mjs";

const SOURCE_NAMES = new Set(["dong-xuan.osm", "dong-xuan.osm.pbf"]);

export function parseBbox(value) {
  const bbox =
    typeof value === "string" ? value.split(",").map((part) => Number(part.trim())) : value;

  if (!Array.isArray(bbox) || bbox.length !== 4 || !bbox.every(Number.isFinite)) {
    throw new Error("Bbox phải có dạng west,south,east,north.");
  }

  const [west, south, east, north] = bbox;
  if (west < -180 || east > 180 || south < -90 || north > 90 || west >= east || south >= north) {
    throw new Error("Bbox không hợp lệ.");
  }
  return bbox;
}

export function buildGraphDockerCommands({ dataDirectory, sourceName }) {
  if (!SOURCE_NAMES.has(sourceName)) {
    throw new Error(
      "Source phải tên dong-xuan.osm hoặc dong-xuan.osm.pbf để tạo đúng graph basename.",
    );
  }

  const mount = `${path.resolve(dataDirectory)}:/data`;
  const dockerPrefix = ["run", "--rm", "--volume", mount, OSRM_IMAGE];

  return [
    {
      stage: "extract",
      command: "docker",
      args: [...dockerPrefix, "osrm-extract", "-p", "/opt/car.lua", `/data/${sourceName}`],
    },
    {
      stage: "partition",
      command: "docker",
      args: [...dockerPrefix, "osrm-partition", "/data/dong-xuan.osrm"],
    },
    {
      stage: "customize",
      command: "docker",
      args: [...dockerPrefix, "osrm-customize", "/data/dong-xuan.osrm"],
    },
  ];
}

export function buildOfflineAcceptanceCommand({ dataDirectory }) {
  const mount = `${path.resolve(dataDirectory)}:/data:ro`;
  const probe = `set -euo pipefail
osrm-routed --algorithm mld /data/dong-xuan.osrm >/tmp/osrm.log 2>&1 &
server_pid=$!
trap 'kill "$server_pid" 2>/dev/null || true' EXIT
for attempt in {1..30}; do
  if exec 3<>/dev/tcp/127.0.0.1/5000; then
    printf 'GET /route/v1/driving/109.0333,13.3667;109.0800,13.4200?overview=false HTTP/1.0\\r\\nHost: localhost\\r\\nConnection: close\\r\\n\\r\\n' >&3
    if grep -q '"code":"Ok"' <&3; then
      echo 'OSRM offline acceptance OK (network=none).'
      exit 0
    fi
  fi
  sleep 0.2
done
cat /tmp/osrm.log
exit 1`;

  return {
    command: "docker",
    args: [
      "run",
      "--rm",
      "--network",
      "none",
      "--read-only",
      "--tmpfs",
      "/tmp:size=16m,noexec,nosuid",
      "--security-opt",
      "no-new-privileges:true",
      "--volume",
      mount,
      OSRM_IMAGE,
      "bash",
      "-ec",
      probe,
    ],
  };
}

export async function verifyLiveRoute({
  baseUrl,
  graphVersion,
  origin,
  destination,
  fetchImpl = fetch,
}) {
  if (!baseUrl || !graphVersion) {
    throw new Error("Thiếu local routing URL hoặc graph version.");
  }

  const coordinates = `${origin.lng},${origin.lat};${destination.lng},${destination.lat}`;
  const url =
    `${baseUrl.replace(/\/$/, "")}/route/v1/driving/${coordinates}` +
    "?overview=full&geometries=geojson&steps=false";
  const response = await fetchImpl(url, {
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) {
    throw new Error(`OSRM live verify lỗi HTTP ${response.status}.`);
  }

  const payload = await response.json();
  const route = payload?.routes?.[0];
  const coordinatesList = route?.geometry?.coordinates;
  if (
    payload?.code !== "Ok" ||
    !route ||
    !Number.isFinite(route.distance) ||
    route.distance <= 0 ||
    !Number.isFinite(route.duration) ||
    route.duration <= 0 ||
    route.geometry?.type !== "LineString" ||
    !Array.isArray(coordinatesList) ||
    coordinatesList.length < 2
  ) {
    throw new Error(`OSRM không trả route đường bộ hợp lệ (${payload?.code ?? "unknown"}).`);
  }

  return {
    graphVersion,
    distanceMeters: route.distance,
    durationSeconds: route.duration,
    geometryPoints: coordinatesList.length,
  };
}

// Đơn giản hoá polygon GeoJSON bằng Douglas-Peucker (xử lý đúng ring khép kín).
// Giảm số đỉnh để Leaflet vẽ mượt mà vẫn giữ hình dạng ranh giới.
// Chạy: node scripts/simplify-geojson.mjs <input.geojson> [epsilon]
import fs from "node:fs/promises";

const input = process.argv[2] ?? "public/geo/daklak-communes.geojson";
const eps = Number(process.argv[3] ?? 0.0006); // ~65m ở vĩ độ này
const PRECISION = 5;

// DP trên một chuỗi hở (giữ 2 đầu). Lặp bằng stack để tránh tràn đệ quy.
function dpOpen(points) {
  const n = points.length;
  if (n < 3) return points.slice();
  const keep = new Array(n).fill(false);
  keep[0] = keep[n - 1] = true;
  const stack = [[0, n - 1]];
  while (stack.length) {
    const [s, e] = stack.pop();
    const [x1, y1] = points[s];
    const [x2, y2] = points[e];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const denom = Math.hypot(dx, dy) || 1e-12;
    let dmax = 0;
    let idx = -1;
    for (let i = s + 1; i < e; i++) {
      const [x0, y0] = points[i];
      const d = Math.abs(dy * x0 - dx * y0 + x2 * y1 - y2 * x1) / denom;
      if (d > dmax) {
        dmax = d;
        idx = i;
      }
    }
    if (idx !== -1 && dmax > eps) {
      keep[idx] = true;
      stack.push([s, idx], [idx, e]);
    }
  }
  const out = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(points[i]);
  return out;
}

// Ring khép kín: tách tại đỉnh xa điểm đầu nhất thành 2 chuỗi hở rồi ghép lại.
function simplifyRing(ring) {
  if (ring.length <= 5) return round(ring);
  const [x0, y0] = ring[0];
  let far = 1;
  let farD = -1;
  for (let i = 1; i < ring.length - 1; i++) {
    const d = (ring[i][0] - x0) ** 2 + (ring[i][1] - y0) ** 2;
    if (d > farD) {
      farD = d;
      far = i;
    }
  }
  const a = dpOpen(ring.slice(0, far + 1));
  const b = dpOpen(ring.slice(far));
  let r = a.slice(0, -1).concat(b);
  if (r.length < 4)
    r = [
      ring[0],
      ring[Math.floor(ring.length / 3)],
      ring[Math.floor((2 * ring.length) / 3)],
      ring[0],
    ];
  if (r[0][0] !== r[r.length - 1][0] || r[0][1] !== r[r.length - 1][1]) r.push(r[0]);
  return round(r);
}

const round = (ring) =>
  ring.map(([x, y]) => [Number(x.toFixed(PRECISION)), Number(y.toFixed(PRECISION))]);

function simplifyGeometry(geom) {
  if (geom.type === "Polygon") {
    return { type: geom.type, coordinates: geom.coordinates.map(simplifyRing) };
  }
  if (geom.type === "MultiPolygon") {
    return {
      type: geom.type,
      coordinates: geom.coordinates.map((poly) => poly.map(simplifyRing)),
    };
  }
  return geom;
}

function countVertices(g) {
  const flat = (c) => (typeof c[0] === "number" ? 1 : c.reduce((n, x) => n + flat(x), 0));
  return g.features.reduce((n, f) => n + flat(f.geometry.coordinates), 0);
}

const g = JSON.parse(await fs.readFile(input, "utf8"));
const before = countVertices(g);
for (const f of g.features) f.geometry = simplifyGeometry(f.geometry);
const after = countVertices(g);
await fs.writeFile(input, `${JSON.stringify(g)}\n`, "utf8");
const kb = ((await fs.stat(input)).size / 1024).toFixed(1);
console.log(
  `Đỉnh: ${before} → ${after} (${((100 * after) / before).toFixed(0)}%), ${kb} KB, ${g.features.length} xã, eps=${eps}`,
);

/**
 * Chọn tile bản đồ cần lưu xuống máy cho một nhiệm vụ — phần tính toán thuần.
 *
 * VÌ SAO CẦN: chi tiết nhiệm vụ đã lưu offline được, nhưng bản đồ vẫn tải ảnh vệ
 * tinh từ Internet nên mất sóng là chỉ còn nền xám. App tải trước các ô ảnh phủ
 * vùng nhiệm vụ (điểm nạn + các kho + tuyến) để lúc không có mạng vẫn nhìn được.
 *
 * Các con số phải khớp với trang Leaflet trong `mission-map-html.ts`:
 * - Ảnh vệ tinh Esri bật `detectRetina`, nên ở mức nhìn `d` trang xin ô mức `d+1`,
 *   trần 18 (maxNativeZoom 17 + 1).
 * - Lớp chữ CARTO xin đúng mức `d`, bản `@2x`.
 * Tải lệch mức là tải thừa hàng trăm ô mà trang không bao giờ đọc tới.
 */

export type MapTileLayer = "imagery" | "labels";

export interface MapTile {
  layer: MapTileLayer;
  z: number;
  x: number;
  y: number;
}

export interface MapTilePoint {
  lat: number;
  lng: number;
}

/** Mức phóng lớn nhất trang dùng khi tự canh khung (`fitBounds` maxZoom). */
export const FIT_MAX_ZOOM = 17;
/** Chỉ có một điểm thì trang đặt mức 16. */
export const SINGLE_POINT_ZOOM = 16;
/** Trần mức ô ảnh vệ tinh Esri còn ảnh thật ở vùng này. */
export const IMAGERY_MAX_URL_ZOOM = 18;
export const LABELS_MAX_URL_ZOOM = 19;

/**
 * Khung bản đồ giả định, điểm ảnh CSS. Chiều cao lấy khung PHÓNG TO (460), rộng lấy
 * máy lớn, để phóng to khung ra vẫn không lộ viền xám.
 */
const VIEW_WIDTH = 420;
const VIEW_HEIGHT = 460;
/** Khung ban đầu thấp hơn (260) và có lề 42px — dùng để tính mức canh khung. */
const FIT_WIDTH = 340;
const FIT_HEIGHT = 260;
const FIT_PADDING = 42;

/**
 * Trần số ô cho MỘT nhiệm vụ (khoảng 20 KB/ô → vài MB).
 *
 * Các nhiệm vụ cùng xã phủ lên nhau gần hết, ô đã có trên máy thì không tải lại,
 * nên thực tế tổng dung lượng tăng chậm hơn nhiều so với số nhiệm vụ.
 */
export const MAX_TILES_PER_MISSION = 500;

const TILE_SIZE = 256;

function worldPixel(point: MapTilePoint, zoom: number): { x: number; y: number } {
  const scale = TILE_SIZE * 2 ** zoom;
  const lat = Math.max(-85.0511, Math.min(85.0511, point.lat));
  const sin = Math.sin((lat * Math.PI) / 180);
  return {
    x: ((point.lng + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale,
  };
}

/** Mức nhìn ban đầu của trang — cùng cách `fitBounds` của Leaflet làm tròn xuống. */
export function initialViewZoom(points: MapTilePoint[]): number {
  if (points.length === 0) return 15;
  if (points.length === 1) return SINGLE_POINT_ZOOM;
  for (let zoom = FIT_MAX_ZOOM; zoom > 0; zoom -= 1) {
    const pixels = points.map((point) => worldPixel(point, zoom));
    const width = Math.max(...pixels.map((p) => p.x)) - Math.min(...pixels.map((p) => p.x));
    const height = Math.max(...pixels.map((p) => p.y)) - Math.min(...pixels.map((p) => p.y));
    if (width <= FIT_WIDTH - 2 * FIT_PADDING && height <= FIT_HEIGHT - 2 * FIT_PADDING) {
      return zoom;
    }
  }
  return 0;
}

function tilesCovering(
  layer: MapTileLayer,
  center: MapTilePoint,
  viewZoom: number,
  urlZoom: number,
  halfWidth: number,
  halfHeight: number,
): MapTile[] {
  // Vùng nhìn tính ở mức nhìn rồi quy ra toạ độ ô ở mức URL: detectRetina xin ô mức
  // sâu hơn nhưng vẽ nửa khung, nên cùng một vùng đất ứng với gấp đôi số ô mỗi chiều.
  const factor = 2 ** (urlZoom - viewZoom);
  const c = worldPixel(center, viewZoom);
  const toTile = (pixel: number) => Math.floor((pixel * factor) / TILE_SIZE);
  const limit = 2 ** urlZoom - 1;
  const clamp = (value: number) => Math.max(0, Math.min(limit, value));
  const x0 = clamp(toTile(c.x - halfWidth));
  const x1 = clamp(toTile(c.x + halfWidth));
  const y0 = clamp(toTile(c.y - halfHeight));
  const y1 = clamp(toTile(c.y + halfHeight));
  const tiles: MapTile[] = [];
  for (let x = x0; x <= x1; x += 1) {
    for (let y = y0; y <= y1; y += 1) tiles.push({ layer, z: urlZoom, x, y });
  }
  return tiles;
}

/**
 * Danh sách ô cần có để xem bản đồ nhiệm vụ khi mất mạng.
 *
 * Lấy vùng khung nhìn ban đầu (to hơn một chút), lưu từ mức nhìn thấp hơn 2 bậc
 * (thu nhỏ ra xem xung quanh) tới sâu hơn 2 bậc (phóng vào xem nhà). Mức sâu nhất
 * tốn ô nhất, nên dừng thêm mức khi chạm trần số ô — mức nông hơn luôn được giữ.
 */
export function planMissionMapTiles(points: MapTilePoint[]): MapTile[] {
  const valid = points.filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng));
  if (valid.length === 0) return [];
  const fit = initialViewZoom(valid);
  const pixels = valid.map((point) => worldPixel(point, fit));
  const minX = Math.min(...pixels.map((p) => p.x));
  const maxX = Math.max(...pixels.map((p) => p.x));
  const minY = Math.min(...pixels.map((p) => p.y));
  const maxY = Math.max(...pixels.map((p) => p.y));
  const scale = TILE_SIZE * 2 ** fit;
  const centerPixel = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
  const center = {
    lng: (centerPixel.x / scale) * 360 - 180,
    lat: (Math.atan(Math.sinh(Math.PI * (1 - (2 * centerPixel.y) / scale))) * 180) / Math.PI,
  };

  const tiles: MapTile[] = [];
  const seen = new Set<string>();
  for (let view = Math.max(0, fit - 2); view <= fit + 2; view += 1) {
    // Mức sâu hơn: giữ nguyên vùng đất, nên nửa khung tính bằng pixel của mức đó lớn
    // gấp 2^k. Mức nông hơn: phủ nguyên một khung màn hình — thu nhỏ ra là để nhìn
    // rộng hơn, mà ô ở mức nông thì rẻ.
    const grow = Math.max(1, 2 ** (view - fit));
    const halfWidth = (VIEW_WIDTH / 2) * grow;
    const halfHeight = (VIEW_HEIGHT / 2) * grow;
    const level = [
      ...tilesCovering(
        "imagery",
        center,
        view,
        Math.min(view + 1, IMAGERY_MAX_URL_ZOOM),
        halfWidth,
        halfHeight,
      ),
      ...tilesCovering(
        "labels",
        center,
        view,
        Math.min(view, LABELS_MAX_URL_ZOOM),
        halfWidth,
        halfHeight,
      ),
    ].filter((tile) => {
      const key = mapTileKey(tile);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (tiles.length > 0 && tiles.length + level.length > MAX_TILES_PER_MISSION) break;
    tiles.push(...level);
  }
  return tiles;
}

/** Đường dẫn tương đối của ô trong thư mục lưu — trang Leaflet dựng đúng mẫu này. */
export function mapTileKey(tile: MapTile): string {
  return `${tile.layer}/${tile.z}/${tile.x}/${tile.y}.${tile.layer === "imagery" ? "jpg" : "png"}`;
}

export function mapTileRemoteUrl(tile: MapTile): string {
  return tile.layer === "imagery"
    ? `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${tile.z}/${tile.y}/${tile.x}`
    : `https://a.basemaps.cartocdn.com/rastertiles/voyager_only_labels/${tile.z}/${tile.x}/${tile.y}@2x.png`;
}

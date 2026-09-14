import * as FileSystem from "expo-file-system";
import { Platform } from "react-native";
import {
  mapTileKey,
  mapTileRemoteUrl,
  planMissionMapTiles,
  type MapTile,
  type MapTilePoint,
} from "./map-tile-plan";

/**
 * Kho ô bản đồ trên bộ nhớ điện thoại.
 *
 * Nằm ở `documentDirectory`, KHÔNG phải `cacheDirectory`: Android dọn thư mục cache
 * khi máy đầy bộ nhớ mà không báo, đúng lúc người dùng đang ở vùng không có sóng để
 * tải lại. Ô bản đồ là ảnh vệ tinh công khai, không chứa dữ liệu nhiệm vụ, nên
 * không cần mã hoá như bản lưu chi tiết — nhưng vẫn xoá khi đăng xuất cho gọn.
 */
const TILE_DIR = FileSystem.documentDirectory ? `${FileSystem.documentDirectory}map-tiles/` : null;

/** Bốn luồng: ô ảnh nhỏ, mở rộng hơn thì tranh băng thông với màn hình đang dùng. */
const CONCURRENCY = 4;

/**
 * Thư mục gốc mà trang Leaflet đọc ô từ đó (`file://.../map-tiles/`).
 * Trình duyệt Expo Web không có bộ nhớ này → null, trang chỉ dùng mạng.
 */
export function offlineMapTileRoot(): string | null {
  return Platform.OS === "web" ? null : TILE_DIR;
}

/** Thư mục cha của mọi trang bản đồ — WebView cần nó làm `baseUrl` để đọc được file. */
export function offlineMapBaseUrl(): string | null {
  return Platform.OS === "web" ? null : (FileSystem.documentDirectory ?? null);
}

/**
 * Tải những ô còn thiếu để xem bản đồ nhiệm vụ khi mất mạng.
 *
 * Trả `true` khi đã có đủ mọi ô. Mất sóng giữa chừng thì dừng và trả `false`; lượt
 * sau chỉ tải tiếp phần còn thiếu vì ô đã có được giữ nguyên.
 */
export async function ensureMissionMapTiles(points: MapTilePoint[]): Promise<boolean> {
  const root = offlineMapTileRoot();
  if (!root) return false;
  const queue = planMissionMapTiles(points);
  let failed = false;
  const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
    for (let tile = queue.shift(); tile && !failed; tile = queue.shift()) {
      try {
        await ensureTile(root, tile);
      } catch {
        failed = true;
      }
    }
  });
  await Promise.all(workers);
  return !failed;
}

async function ensureTile(root: string, tile: MapTile): Promise<void> {
  const target = `${root}${mapTileKey(tile)}`;
  const info = await FileSystem.getInfoAsync(target);
  if (info.exists && !info.isDirectory && (info.size ?? 0) > 0) return;

  const folder = target.slice(0, target.lastIndexOf("/") + 1);
  await FileSystem.makeDirectoryAsync(folder, { intermediates: true }).catch(() => undefined);
  // Tải ra tệp tạm rồi mới đổi tên: mất sóng giữa chừng để lại một ảnh cụt mang đúng
  // tên ô, lần sau thấy "đã có" nên không tải lại, và bản đồ có một mảng vỡ mãi.
  const partial = `${target}.part`;
  try {
    const result = await FileSystem.downloadAsync(mapTileRemoteUrl(tile), partial);
    if (result.status !== 200) {
      // Máy chủ ảnh trả lỗi cho riêng ô này (ví dụ ngoài vùng có ảnh): bỏ qua ô,
      // không coi là mất mạng.
      await FileSystem.deleteAsync(partial, { idempotent: true });
      return;
    }
    await FileSystem.moveAsync({ from: partial, to: target });
  } catch (error) {
    await FileSystem.deleteAsync(partial, { idempotent: true }).catch(() => undefined);
    throw error;
  }
}

/** Xoá toàn bộ ô bản đồ đã lưu (đăng xuất). */
export async function clearOfflineMapTiles(): Promise<void> {
  const root = offlineMapTileRoot();
  if (!root) return;
  await FileSystem.deleteAsync(root, { idempotent: true });
}

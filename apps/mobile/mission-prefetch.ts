import {
  fetchMissionWarehouseRoutes,
  fetchWarehouseMaterialRequests,
  type MissionDetail,
  type WarehouseMaterialRequest,
} from "./api";
import {
  missionFingerprint,
  planMissionPrefetch,
  pruneMissionIndex,
  type PrefetchIndex,
} from "./mission-prefetch-state";
import { fetchMissionForViewer } from "./mission-viewer";
import { ensureMissionMapTiles } from "./offline-map-tiles";
import { readOfflineCache, removeOfflineCache, writeOfflineCache } from "./offline-cache";

/** Chỉ mục: nhiệm vụ nào đã lưu chi tiết, lúc nào, ứng với vân tay nào. */
const INDEX_SCOPE = "mission-prefetch-index";

/**
 * Hai luồng song song.
 *
 * Tải ngầm chạy cùng lúc người dùng đang bấm; mở hết cỡ là tranh băng thông với
 * chính thao tác họ đang chờ, mà mạng vùng lũ thì vốn đã yếu. Hai luồng vẫn lưu
 * xong ba chục nhiệm vụ trong vài giây khi sóng tốt.
 */
const CONCURRENCY = 2;

/**
 * Lượt đang chạy của từng tài khoản.
 *
 * Danh sách tự làm mới mỗi 15 giây. Lượt trước chưa xong mà lượt sau chen vào thì
 * cùng một nhiệm vụ bị tải hai lần và hai bên ghi đè chỉ mục của nhau.
 */
const running = new Map<string, Promise<void>>();

/**
 * Tự lưu chi tiết các nhiệm vụ trong danh sách xuống máy, để mất mạng vẫn xem được.
 *
 * Chạy ngầm, im lặng: hỏng giữa chừng thì chỉ mất bản lưu của nhiệm vụ đó, không
 * được làm phiền người đang dùng — màn hình họ đang xem đã có dữ liệu thật rồi.
 * Mọi bản lưu vẫn đi qua `writeOfflineCache`, tức vẫn mã hoá và vẫn bị xoá sạch
 * khi đăng xuất.
 */
export function prefetchMissionsForOffline(input: {
  token: string;
  userId: string;
  role: string;
  missions: MissionDetail[];
}): Promise<void> {
  const current = running.get(input.userId);
  if (current) return current;
  const job = runPrefetch(input)
    .catch(() => undefined)
    .finally(() => running.delete(input.userId));
  running.set(input.userId, job);
  return job;
}

async function runPrefetch({
  token,
  userId,
  role,
  missions,
}: {
  token: string;
  userId: string;
  role: string;
  missions: MissionDetail[];
}): Promise<void> {
  if (missions.length === 0) return;
  const stored = await readOfflineCache<PrefetchIndex>(userId, INDEX_SCOPE).catch(() => null);
  let index: PrefetchIndex = stored?.data ?? {};

  const fingerprints = new Map(
    missions.map((mission) => [mission.id, missionFingerprint(mission)]),
  );
  const ids = planMissionPrefetch(missions, fingerprints, index, Date.now());

  if (ids.length > 0) {
    // Kho: tải phiếu của kho MỘT lần cho cả lượt. Hỏng thì bỏ cả lượt — lưu chi
    // tiết thiếu phiếu của kho mình là lưu một màn hình sai.
    let ownRequests: WarehouseMaterialRequest[] | undefined;
    if (role === "WAREHOUSE") ownRequests = await fetchWarehouseMaterialRequests(token);

    const queue = [...ids];
    const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
      for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
        try {
          const detail = await fetchMissionForViewer(token, id, role, ownRequests);
          await writeOfflineCache(userId, `mission.${id}`, detail);
          // Tuyến đường tới từng kho: thiếu thì màn chi tiết vẫn mở được, chỉ mất
          // quãng đường. Nên hỏng phần này không làm hỏng bản lưu chi tiết.
          const routes = await fetchMissionWarehouseRoutes(token, id).catch(() => null);
          if (routes) {
            await writeOfflineCache(userId, `mission.${id}.routes`, routes).catch(() => undefined);
          }
          // Ô bản đồ vùng nhiệm vụ: điểm nạn + các kho. Không lấy được tuyến thì vẫn
          // tải quanh điểm nạn; bản lưu cũ quá 30 phút sẽ lấy lại cả hai.
          const points = [
            ...(detail.incidentLat != null && detail.incidentLng != null
              ? [{ lat: detail.incidentLat, lng: detail.incidentLng }]
              : []),
            ...(routes ?? []).map((route) => ({ lat: route.lat, lng: route.lng })),
          ];
          const mapTiles = await ensureMissionMapTiles(points).catch(() => false);
          index = {
            ...index,
            [id]: { fingerprint: fingerprints.get(id) ?? "", storedAt: Date.now(), mapTiles },
          };
        } catch {
          // Mất sóng giữa lượt: dừng hẳn, lượt làm mới sau sẽ lưu tiếp phần còn lại.
          queue.length = 0;
        }
      }
    });
    await Promise.all(workers);
  }

  const pruned = pruneMissionIndex(
    index,
    missions.map((mission) => mission.id),
  );
  for (const id of pruned.removedIds) {
    await removeOfflineCache(userId, `mission.${id}`).catch(() => undefined);
    await removeOfflineCache(userId, `mission.${id}.routes`).catch(() => undefined);
  }
  await writeOfflineCache(userId, INDEX_SCOPE, pruned.index);
}

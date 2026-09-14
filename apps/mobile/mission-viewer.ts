import {
  fetchMission,
  fetchWarehouseMaterialRequests,
  type MissionDetail,
  type WarehouseMaterialRequest,
} from "./api";

/**
 * Tải nhiệm vụ theo đúng cách màn chi tiết cần cho vai người xem.
 *
 * Kho dùng phiếu riêng của mình (có đủ trường để thao tác xuất/ký nhận), nhưng
 * vẫn giữ lại phiếu của MỌI kho trong `allWarehouseRequests` — danh sách hoàn
 * trả theo kho cần xem được vật tư của cả kho khác.
 *
 * Dùng chung cho màn chi tiết và cho lượt tự lưu ngoại tuyến: hai nơi lưu ra
 * CÙNG một hình dạng dữ liệu, nên bản tải ngầm mở ra y hệt bản người dùng tự mở.
 *
 * `ownRequests` truyền sẵn được: lượt tự lưu tải phiếu của kho MỘT lần cho cả
 * chục nhiệm vụ, thay vì gọi lại đúng lời gọi đó cho từng nhiệm vụ.
 */
export async function fetchMissionForViewer(
  token: string,
  missionId: string,
  role: string,
  ownRequests?: WarehouseMaterialRequest[],
): Promise<MissionDetail> {
  const latest = await fetchMission(token, missionId);
  latest.allWarehouseRequests = latest.warehouseRequests ?? [];
  if (role === "WAREHOUSE") {
    const own = ownRequests ?? (await fetchWarehouseMaterialRequests(token));
    latest.warehouseRequests = own.filter((request) => request.missionId === missionId);
  }
  return latest;
}

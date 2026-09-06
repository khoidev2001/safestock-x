import { MissionWarehouseRequestStatus } from "@prisma/client";
import {
  EXPORTED_REQUEST_STATUSES,
  UNEXPORTED_REQUEST_STATUSES,
  isRequestExported,
} from "../mission-request-status";

describe("mission request status", () => {
  it("đã ký nhận vẫn tính là kho đã xuất", () => {
    // Chính chỗ này là lỗi cũ: PICKED_UP rơi ra khỏi phép đếm nên tiến độ kho
    // đứng im ở 0/2 và nhiệm vụ kẹt ở PENDING_WAREHOUSE.
    expect(isRequestExported(MissionWarehouseRequestStatus.PICKED_UP)).toBe(true);
    expect(isRequestExported(MissionWarehouseRequestStatus.PREPARED)).toBe(true);
    expect(isRequestExported(MissionWarehouseRequestStatus.ACCEPTED)).toBe(false);
    expect(isRequestExported(MissionWarehouseRequestStatus.PENDING)).toBe(false);
  });

  it("hai danh sách phủ kín enum — thêm trạng thái mới là phải xếp chỗ cho nó", () => {
    // Không có phép kiểm này thì lần tới ai đó thêm một trạng thái sẽ lặp đúng lỗi
    // cũ: trạng thái mới rơi ra ngoài cả hai danh sách và biến mất khỏi tiến độ.
    const covered = [...EXPORTED_REQUEST_STATUSES, ...UNEXPORTED_REQUEST_STATUSES].sort();
    expect(covered).toEqual(Object.values(MissionWarehouseRequestStatus).sort());
  });
});

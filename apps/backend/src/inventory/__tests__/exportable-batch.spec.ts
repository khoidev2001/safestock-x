import { ItemCondition, ItemStatus } from "@prisma/client";
import {
  EXPORTABLE_CONDITIONS,
  EXPORTABLE_STATUSES,
  exportableBatchWhere,
} from "../exportable-batch";

/**
 * Vì sao kiểm cả bốn điều kiện chứ không chỉ đọc lại hằng số: cái hỏng ngoài đời
 * là chỗ CHỌN lô bỏ sót điều kiện so với chỗ CHẶN. Phép thử chỉ nhìn danh sách
 * trạng thái thì bỏ sót đúng kiểu sai đó — bản vá lần đầu chép mỗi `status` và
 * lần chạy sau vấp ngay chốt hạn dùng.
 */
describe("exportableBatchWhere", () => {
  const MOC = new Date("2026-09-12T00:00:00.000Z");

  it("chặn đủ bốn điều kiện mà bulkExport sẽ kiểm", () => {
    const w = exportableBatchWhere(MOC);

    expect(w.status).toEqual({ in: [...EXPORTABLE_STATUSES] });
    expect(w.condition).toEqual({ in: [...EXPORTABLE_CONDITIONS] });
    expect(w.shelf).toEqual({ is: { isLocked: false } });
    expect(w.OR).toEqual([{ expiryDate: null }, { expiryDate: { gt: MOC } }]);
  });

  it("lô không có hạn dùng vẫn xuất được", () => {
    // Áo phao, xuồng cứu hộ... không có hạn. Loại chúng ra là tự chặn phần lớn
    // vật tư tái sử dụng.
    expect(exportableBatchWhere(MOC).OR).toContainEqual({ expiryDate: null });
  });

  it("chỉ AVAILABLE và EXPIRING_SOON mới xuất được", () => {
    expect([...EXPORTABLE_STATUSES].sort()).toEqual(
      [ItemStatus.AVAILABLE, ItemStatus.EXPIRING_SOON].sort(),
    );
    // Bốn trạng thái từng làm kẹt khoản mượn ngoài đời.
    for (const xau of [
      ItemStatus.MAINTENANCE,
      ItemStatus.DAMAGED,
      ItemStatus.INSPECTION_OVERDUE,
      ItemStatus.INACCESSIBLE,
    ]) {
      expect(EXPORTABLE_STATUSES.has(xau)).toBe(false);
    }
  });

  it("chỉ NEW và USED mới xuất được", () => {
    expect([...EXPORTABLE_CONDITIONS].sort()).toEqual(
      [ItemCondition.NEW, ItemCondition.USED].sort(),
    );
  });

  it("so hạn dùng với mốc truyền vào, không với đồng hồ hệ thống", () => {
    const khac = new Date("2030-01-01T00:00:00.000Z");
    expect(exportableBatchWhere(khac).OR).toContainEqual({ expiryDate: { gt: khac } });
  });
});

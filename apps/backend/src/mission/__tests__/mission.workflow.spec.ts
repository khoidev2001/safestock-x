import { MissionStatus } from "@prisma/client";
import { assertTransition, canTransition } from "../mission.workflow";

describe("mission workflow state machine", () => {
  it("cho phép chuỗi hợp lệ ADMIN→RESCUE→WAREHOUSE→hoàn thành", () => {
    expect(canTransition(MissionStatus.DRAFT, MissionStatus.PENDING_RESCUE)).toBe(true);
    expect(canTransition(MissionStatus.PENDING_RESCUE, MissionStatus.RESCUE_CONFIRMED)).toBe(true);
    expect(canTransition(MissionStatus.RESCUE_CONFIRMED, MissionStatus.PENDING_WAREHOUSE)).toBe(
      true,
    );
    expect(canTransition(MissionStatus.PENDING_WAREHOUSE, MissionStatus.READY)).toBe(true);
    expect(canTransition(MissionStatus.READY, MissionStatus.COMPLETED)).toBe(true);
  });

  it("chặn nhảy cóc (DRAFT → READY không hợp lệ)", () => {
    expect(canTransition(MissionStatus.DRAFT, MissionStatus.READY)).toBe(false);
  });

  it("chặn RESCUE xác nhận khi chưa PENDING_RESCUE", () => {
    expect(canTransition(MissionStatus.DRAFT, MissionStatus.RESCUE_CONFIRMED)).toBe(false);
  });

  it("cho phép từ chối ở các bước cho phép", () => {
    expect(canTransition(MissionStatus.PENDING_RESCUE, MissionStatus.REJECTED)).toBe(true);
    expect(canTransition(MissionStatus.PENDING_WAREHOUSE, MissionStatus.REJECTED)).toBe(true);
  });

  it("assertTransition ném lỗi rõ ràng khi sai", () => {
    expect(() => assertTransition(MissionStatus.READY, MissionStatus.PENDING_RESCUE)).toThrow(
      /Không thể chuyển/,
    );
  });

  it("trạng thái cuối COMPLETED không đi tiếp", () => {
    expect(canTransition(MissionStatus.COMPLETED, MissionStatus.READY)).toBe(false);
    expect(canTransition(MissionStatus.COMPLETED, MissionStatus.CANCELLED)).toBe(false);
    expect(canTransition(MissionStatus.COMPLETED, MissionStatus.REJECTED)).toBe(false);
  });

  describe("huỷ bởi ADMIN trước khi kho xuất vật tư", () => {
    it("cho phép huỷ từ mọi trạng thái đang chạy (chưa động tồn kho)", () => {
      for (const from of [
        MissionStatus.DRAFT,
        MissionStatus.PENDING_RESCUE,
        MissionStatus.RESCUE_CONFIRMED,
        MissionStatus.PENDING_WAREHOUSE,
      ]) {
        expect(canTransition(from, MissionStatus.CANCELLED)).toBe(true);
      }
    });

    it("chặn huỷ sau khi kho đã xuất vật tư (READY cần hoàn kho — ngoài phạm vi)", () => {
      expect(canTransition(MissionStatus.READY, MissionStatus.CANCELLED)).toBe(false);
    });
  });

  describe("đội cứu hộ rút sau khi đã nhận", () => {
    it("cho phép rút (REJECTED) từ RESCUE_CONFIRMED và PENDING_WAREHOUSE", () => {
      expect(canTransition(MissionStatus.RESCUE_CONFIRMED, MissionStatus.REJECTED)).toBe(true);
      expect(canTransition(MissionStatus.PENDING_WAREHOUSE, MissionStatus.REJECTED)).toBe(true);
    });

    it("chặn rút sau khi kho đã sẵn sàng (READY)", () => {
      expect(canTransition(MissionStatus.READY, MissionStatus.REJECTED)).toBe(false);
    });
  });

  describe("READY → COMPLETED là chuyển tiếp hợp lệ duy nhất từ READY", () => {
    it("chỉ COMPLETED, không có đích nào khác", () => {
      expect(canTransition(MissionStatus.READY, MissionStatus.COMPLETED)).toBe(true);
      expect(canTransition(MissionStatus.READY, MissionStatus.PENDING_WAREHOUSE)).toBe(false);
    });
  });

  describe("vòng xử lý đơn từ chối của ADMIN", () => {
    it("REJECTED → DEFERRED hoặc CANCELLED", () => {
      expect(canTransition(MissionStatus.REJECTED, MissionStatus.DEFERRED)).toBe(true);
      expect(canTransition(MissionStatus.REJECTED, MissionStatus.CANCELLED)).toBe(true);
    });

    it("DEFERRED → gửi lại PENDING_RESCUE hoặc CANCELLED", () => {
      expect(canTransition(MissionStatus.DEFERRED, MissionStatus.PENDING_RESCUE)).toBe(true);
      expect(canTransition(MissionStatus.DEFERRED, MissionStatus.CANCELLED)).toBe(true);
    });
  });

  it("trạng thái cuối CANCELLED không đi tiếp", () => {
    for (const to of [
      MissionStatus.PENDING_RESCUE,
      MissionStatus.DEFERRED,
      MissionStatus.READY,
      MissionStatus.COMPLETED,
    ]) {
      expect(canTransition(MissionStatus.CANCELLED, to)).toBe(false);
    }
  });
});

import { MissionStatus } from "@prisma/client";
import { assertTransition, canTransition } from "../mission.workflow";

describe("mission workflow state machine", () => {
  it("cho phép ADMIN phát hành thẳng tới kho mà không chờ phân công", () => {
    expect(canTransition(MissionStatus.DRAFT, MissionStatus.PENDING_WAREHOUSE)).toBe(true);
    expect(canTransition(MissionStatus.PENDING_WAREHOUSE, MissionStatus.READY)).toBe(true);
  });

  it("chặn nhảy cóc từ DRAFT tới READY", () => {
    expect(canTransition(MissionStatus.DRAFT, MissionStatus.READY)).toBe(false);
  });

  it("không kích hoạt các chuyển tiếp phân công legacy", () => {
    expect(canTransition(MissionStatus.DRAFT, MissionStatus.PENDING_RESCUE)).toBe(false);
    expect(canTransition(MissionStatus.DRAFT, MissionStatus.RESCUE_CONFIRMED)).toBe(false);
    expect(canTransition(MissionStatus.PENDING_RESCUE, MissionStatus.RESCUE_CONFIRMED)).toBe(false);
    expect(canTransition(MissionStatus.PENDING_WAREHOUSE, MissionStatus.REJECTED)).toBe(false);
  });

  it("assertTransition ném lỗi rõ ràng khi sai", () => {
    expect(() => assertTransition(MissionStatus.READY, MissionStatus.PENDING_RESCUE)).toThrow(
      /Không thể chuyển/,
    );
  });

  it("cho phép ADMIN huỷ trước khi kho xuất vật tư", () => {
    expect(canTransition(MissionStatus.DRAFT, MissionStatus.CANCELLED)).toBe(true);
    expect(canTransition(MissionStatus.PENDING_WAREHOUSE, MissionStatus.CANCELLED)).toBe(true);
  });

  it("cho phép ADMIN đóng dữ liệu lịch sử đang ở bước phân công cũ", () => {
    expect(canTransition(MissionStatus.PENDING_RESCUE, MissionStatus.CANCELLED)).toBe(true);
    expect(canTransition(MissionStatus.RESCUE_CONFIRMED, MissionStatus.CANCELLED)).toBe(true);
    expect(canTransition(MissionStatus.REJECTED, MissionStatus.CANCELLED)).toBe(true);
    expect(canTransition(MissionStatus.DEFERRED, MissionStatus.CANCELLED)).toBe(true);
  });

  it("người đi giao đóng nhiệm vụ bằng kết quả thực tế", () => {
    // Không có bước này thì nhiệm vụ nằm mãi ở READY: vật tư đã trừ khỏi kho mà
    // không ai biết hàng tới nơi hay chưa.
    expect(canTransition(MissionStatus.READY, MissionStatus.COMPLETED)).toBe(true);
  });

  it("vật tư đã xuất kho thì không huỷ hay từ chối ngược được nữa", () => {
    // Huỷ sau khi kho đã trừ tồn sẽ để lại hàng lơ lửng ngoài sổ sách; muốn đóng
    // thì phải báo kết quả giao, kể cả là giao thất bại.
    expect(canTransition(MissionStatus.READY, MissionStatus.CANCELLED)).toBe(false);
    expect(canTransition(MissionStatus.READY, MissionStatus.REJECTED)).toBe(false);
  });

  it.each([MissionStatus.COMPLETED, MissionStatus.CANCELLED])(
    "trạng thái cuối %s không đi tiếp",
    (from) => {
      for (const to of [
        MissionStatus.PENDING_RESCUE,
        MissionStatus.PENDING_WAREHOUSE,
        MissionStatus.DEFERRED,
        MissionStatus.READY,
        MissionStatus.COMPLETED,
      ]) {
        expect(canTransition(from, to)).toBe(false);
      }
    },
  );
});

import { MissionStatus } from "@prisma/client";
import { assertTransition, canTransition } from "../mission.workflow";

describe("mission workflow state machine", () => {
  it("cho phép chuỗi hợp lệ ADMIN→RESCUE→WAREHOUSE→hoàn thành", () => {
    expect(canTransition(MissionStatus.DRAFT, MissionStatus.PENDING_RESCUE)).toBe(true);
    expect(canTransition(MissionStatus.PENDING_RESCUE, MissionStatus.RESCUE_CONFIRMED)).toBe(true);
    expect(canTransition(MissionStatus.RESCUE_CONFIRMED, MissionStatus.PENDING_WAREHOUSE)).toBe(true);
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
  });
});

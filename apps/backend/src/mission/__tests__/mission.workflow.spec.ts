import { MissionStatus } from "@prisma/client";
import { assertTransition, canTransition } from "../mission.workflow";

describe("mission workflow state machine", () => {
  it("bản tham mưu phải đi qua hiện trường trước khi tới kho", () => {
    expect(canTransition(MissionStatus.DRAFT, MissionStatus.PENDING_FIELD_DECISION)).toBe(true);
    expect(
      canTransition(MissionStatus.PENDING_FIELD_DECISION, MissionStatus.FIELD_DECIDED),
    ).toBe(true);
    expect(canTransition(MissionStatus.FIELD_DECIDED, MissionStatus.PENDING_WAREHOUSE)).toBe(true);
    expect(canTransition(MissionStatus.PENDING_WAREHOUSE, MissionStatus.READY)).toBe(true);
  });

  it("KHÔNG còn đường phát hành thẳng từ bản tham mưu tới kho", () => {
    // Đây là chuyển tiếp của luồng cũ. Để hở là nhiệm vụ ra tới kho với số lượng
    // chưa ai ngoài định mức nhìn qua — đúng thứ chặng hiện trường sinh ra để chặn.
    expect(canTransition(MissionStatus.DRAFT, MissionStatus.PENDING_WAREHOUSE)).toBe(false);
  });

  it("hiện trường báo không cần lấy gì thì bỏ hẳn chặng kho", () => {
    // Không có việc nào cho kho làm; bắt họ bấm "đã chuẩn bị xong" cho một danh
    // sách rỗng chỉ tổ dạy người ta bấm bừa qua các ô xác nhận.
    expect(canTransition(MissionStatus.FIELD_DECIDED, MissionStatus.READY)).toBe(true);
  });

  it("ADMIN thu hồi được bản tham mưu khi hiện trường chưa trả lời", () => {
    expect(canTransition(MissionStatus.PENDING_FIELD_DECISION, MissionStatus.DRAFT)).toBe(true);
    // Nhưng đã chốt xong thì không lùi được nữa: số của hiện trường đã là căn cứ
    // để tính kho, sửa ngược là bỏ đi cái vừa hỏi người ta.
    expect(canTransition(MissionStatus.FIELD_DECIDED, MissionStatus.DRAFT)).toBe(false);
  });

  it("chặn nhảy cóc qua các chặng", () => {
    expect(canTransition(MissionStatus.DRAFT, MissionStatus.READY)).toBe(false);
    expect(canTransition(MissionStatus.DRAFT, MissionStatus.FIELD_DECIDED)).toBe(false);
    expect(
      canTransition(MissionStatus.PENDING_FIELD_DECISION, MissionStatus.PENDING_WAREHOUSE),
    ).toBe(false);
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
    expect(canTransition(MissionStatus.PENDING_FIELD_DECISION, MissionStatus.CANCELLED)).toBe(true);
    expect(canTransition(MissionStatus.FIELD_DECIDED, MissionStatus.CANCELLED)).toBe(true);
    expect(canTransition(MissionStatus.PENDING_WAREHOUSE, MissionStatus.CANCELLED)).toBe(true);
  });

  it("cho phép ADMIN đóng dữ liệu lịch sử đang ở bước phân công cũ", () => {
    expect(canTransition(MissionStatus.PENDING_RESCUE, MissionStatus.CANCELLED)).toBe(true);
    expect(canTransition(MissionStatus.RESCUE_CONFIRMED, MissionStatus.CANCELLED)).toBe(true);
    expect(canTransition(MissionStatus.REJECTED, MissionStatus.CANCELLED)).toBe(true);
    expect(canTransition(MissionStatus.DEFERRED, MissionStatus.CANCELLED)).toBe(true);
  });

  it("dữ liệu lịch sử ở chặng cũ không lẻn vào được luồng mới", () => {
    // Nhiệm vụ cũ đang nằm ở PENDING_RESCUE không có cột quyết định nào của hiện
    // trường, nên đẩy nó tiếp là đẩy một nhiệm vụ rỗng qua các bước mới.
    expect(canTransition(MissionStatus.PENDING_RESCUE, MissionStatus.FIELD_DECIDED)).toBe(false);
    expect(canTransition(MissionStatus.RESCUE_CONFIRMED, MissionStatus.PENDING_WAREHOUSE)).toBe(
      false,
    );
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
        MissionStatus.PENDING_FIELD_DECISION,
        MissionStatus.FIELD_DECIDED,
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

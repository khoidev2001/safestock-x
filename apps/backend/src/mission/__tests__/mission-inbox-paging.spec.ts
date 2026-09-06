import { MissionStatus, UserRole } from "@prisma/client";
import { missionOrderBy, needsActionStatuses } from "../mission.service";

describe("needsActionStatuses", () => {
  it("điều phối lo bản nháp và các đơn bị trả về", () => {
    expect(needsActionStatuses(UserRole.ADMIN)).toEqual([
      MissionStatus.DRAFT,
      MissionStatus.REJECTED,
      MissionStatus.DEFERRED,
    ]);
  });

  it("kho chỉ lo nhiệm vụ đã phát hành đang chờ xuất", () => {
    expect(needsActionStatuses(UserRole.WAREHOUSE)).toEqual([MissionStatus.PENDING_WAREHOUSE]);
  });

  it("lực lượng hiện trường chỉ đọc nên không có việc nào", () => {
    // Họ chỉ có MISSION_VIEW + MISSION_FIELD_UPDATE, không đổi trạng thái nhiệm vụ.
    expect(needsActionStatuses(UserRole.RESCUE)).toEqual([]);
  });
});

describe("missionOrderBy", () => {
  it("hai cách xếp theo thời gian đảo chiều nhau", () => {
    expect(missionOrderBy("newest")).toEqual([{ createdAt: "desc" }, { missionNo: "desc" }]);
    expect(missionOrderBy("oldest")).toEqual([{ createdAt: "asc" }, { missionNo: "asc" }]);
  });

  it("xếp theo số người luôn chốt thêm bằng thời gian", () => {
    // 100 người là số mặc định của form nên trùng số là chuyện thường; thiếu mốc
    // phá hoà thì cùng một truy vấn có thể trả hai thứ tự khác nhau, và trang 2
    // lặp lại đúng nhiệm vụ vừa thấy ở trang 1.
    expect(missionOrderBy("most-people")).toEqual([
      { affectedPeople: "desc" },
      { createdAt: "desc" },
      { missionNo: "desc" },
    ]);
    expect(missionOrderBy("fewest-people")).toEqual([
      { affectedPeople: "asc" },
      { createdAt: "desc" },
      { missionNo: "desc" },
    ]);
  });

  it("mọi cách xếp đều kết bằng số hiệu — thế hoà phải bị cắt hẳn", () => {
    // createdAt trùng nhau là chuyện có thật; để hoà thì phân trang lặp dòng này
    // và bỏ sót dòng kia.
    for (const sort of ["newest", "oldest", "most-people", "fewest-people"] as const) {
      const order = missionOrderBy(sort);
      expect(Object.keys(order[order.length - 1])).toEqual(["missionNo"]);
    }
  });
});

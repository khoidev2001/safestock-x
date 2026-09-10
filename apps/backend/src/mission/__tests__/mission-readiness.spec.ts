import { Allocation } from "../mission.compute";
import {
  assessMissionReadiness,
  fulfillmentFromSnapshot,
  withCurrentFulfillment,
} from "../mission-readiness";

function allocation(sku: string, required: number, allocated: number): Allocation {
  return {
    sku,
    itemName: sku,
    unit: "đơn vị",
    required,
    allocated,
    shortage: required - allocated,
    batches: [],
  };
}

describe("assessMissionReadiness", () => {
  it("returns ready when every required item is fully allocated", () => {
    const result = assessMissionReadiness([
      allocation("WATER-01", 100, 100),
      allocation("LIFEJACKET-ADULT", 20, 20),
    ]);

    expect(result.status).toBe("READY");
    expect(result.fulfillment).toBe(100);
    expect(result.blockers).toHaveLength(0);
  });

  it("returns needs action when an item is only partially fulfilled", () => {
    const result = assessMissionReadiness([
      allocation("WATER-01", 100, 80),
      allocation("LIFEJACKET-ADULT", 20, 20),
    ]);

    expect(result.status).toBe("NEEDS_ACTION");
    // Trung bình theo loại: nước 80% + áo phao 100% = 90%. Con số này nói "còn
    // thiếu bao nhiêu"; việc "chưa đi được" do `status` nói.
    expect(result.fulfillment).toBe(90);
    expect(result.items[0]).toEqual(
      expect.objectContaining({ sku: "WATER-01", status: "NEEDS_ACTION", shortage: 20 }),
    );
  });

  it("blocks dispatch when an essential item has no eligible stock", () => {
    const result = assessMissionReadiness(
      [allocation("LIFEJACKET-ADULT", 20, 0)],
      new Map([["LIFEJACKET-ADULT", ["Lô hiện có nằm trên kệ bị khóa", "Lô khác đã hết hạn"]]]),
    );

    expect(result.status).toBe("NOT_DISPATCHABLE");
    expect(result.fulfillment).toBe(0);
    expect(result.blockers[0]).toEqual(expect.objectContaining({ sku: "LIFEJACKET-ADULT" }));
    expect(result.blockers[0].reasons).toContain("Lô hiện có nằm trên kệ bị khóa");
  });
});

describe("assessMissionReadiness — lý do cho loại thiếu MỘT PHẦN", () => {
  const partiallyShort = [
    {
      sku: "LIFE-ADULT",
      itemName: "Áo phao người lớn",
      unit: "chiếc",
      required: 100,
      allocated: 13,
      shortage: 87,
      batches: [],
    },
  ];

  it("giữ lại lý do đã tính thay vì vứt đi", () => {
    // Ca thật đã lên màn hình: mười mấy kho đang có áo phao, phương án chỉ lấy được
    // 13 cái, và người trực không được nói cho biết vì sao.
    const assessment = assessMissionReadiness(
      partiallyShort,
      new Map([
        [
          "LIFE-ADULT",
          ["Kho xã Đồng Xuân: còn 120 nhưng đã hứa 314 cho nhiệm vụ khác chưa xuất"],
        ],
      ]),
    );

    expect(assessment.blockers).toHaveLength(1);
    expect(assessment.blockers[0].reasons[0]).toContain("đã hứa 314");
  });

  it("thiếu một phần vẫn ĐIỀU PHỐI ĐƯỢC — có lý do không có nghĩa là bị chặn", () => {
    const assessment = assessMissionReadiness(partiallyShort);

    expect(assessment.status).toBe("NEEDS_ACTION");
  });

  it("loại lấy được 0 xếp TRƯỚC, vì câu báo lỗi điều phối đọc blockers[0]", () => {
    const assessment = assessMissionReadiness([
      ...partiallyShort,
      {
        sku: "TORCH-01",
        itemName: "Đèn pin",
        unit: "chiếc",
        required: 10,
        allocated: 0,
        shortage: 10,
        batches: [],
      },
    ]);

    expect(assessment.status).toBe("NOT_DISPATCHABLE");
    expect(assessment.blockers[0].sku).toBe("TORCH-01");
  });
});

describe("tính lại % đáp ứng cho ảnh chụp đã lưu", () => {
  const snapshot = {
    status: "NOT_DISPATCHABLE",
    // Con số công thức CŨ (min qua loại) để lại trong cơ sở dữ liệu.
    fulfillment: 0,
    items: [
      { sku: "WATER-01", required: 200, allocated: 200 },
      { sku: "RICE-01", required: 35, allocated: 35 },
      { sku: "LIFE-ADULT", required: 150, allocated: 0 },
      { sku: "BOAT-01", required: 4, allocated: 0 },
    ],
  };

  it("đọc lại tỉ lệ từ items chứ không tin con số đã lưu", () => {
    expect(fulfillmentFromSnapshot(snapshot)).toBe(50);
  });

  it("trả null khi ảnh chụp không đọc được, để bên gọi giữ số cũ", () => {
    expect(fulfillmentFromSnapshot(null)).toBeNull();
    expect(fulfillmentFromSnapshot({})).toBeNull();
    expect(fulfillmentFromSnapshot({ items: [] })).toBeNull();
    expect(fulfillmentFromSnapshot({ items: [{ sku: "X" }] })).toBeNull();
  });

  it("sửa cả cột fulfillment lẫn con số trong ảnh chụp, không để lệch nhau", () => {
    const mission = { fulfillment: 0, readinessAssessment: snapshot, missionNo: 777 };
    const fixed = withCurrentFulfillment(mission);

    expect(fixed.fulfillment).toBe(50);
    expect(fixed.readinessAssessment.fulfillment).toBe(50);
    // Phần còn lại của ảnh chụp phải nguyên vẹn: các kho đang cầm phiếu theo nó.
    expect(fixed.readinessAssessment.items).toEqual(snapshot.items);
    expect(fixed.readinessAssessment.status).toBe("NOT_DISPATCHABLE");
    expect(fixed.missionNo).toBe(777);
  });

  it("không đụng vào nhiệm vụ không có ảnh chụp", () => {
    const mission = { fulfillment: 42, readinessAssessment: null };
    expect(withCurrentFulfillment(mission)).toBe(mission);
  });
});

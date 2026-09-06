import assert from "node:assert/strict";
import test from "node:test";
import {
  missionDeepLink,
  missionIsPublished,
  missionLocationLabel,
  missionNeedsAction,
  missionNoFromSlug,
  missionNumberLink,
  missionStageLabel,
  type MissionInboxItem,
} from "../mission-inbox-state";

test("deep-link trỏ sang trang riêng của nhiệm vụ, id được encode", () => {
  // Encode để id có dấu gạch chéo không tự đẻ thêm một tầng route.
  assert.equal(missionDeepLink("mission/with spaces"), "/mission/mission%2Fwith%20spaces");
});

test("deep-link giữ evidence hiện trường cần ADMIN xem lại sau refresh", () => {
  assert.equal(
    missionDeepLink("mission/with spaces", "field update/1"),
    "/mission/mission%2Fwith%20spaces?fieldUpdate=field%20update%2F1",
  );
});

test("không có id thì về lại danh sách, không dựng đường dẫn rỗng", () => {
  assert.equal(missionDeepLink("   "), "/missions");
});

const locationBase: MissionInboxItem = {
  id: "m",
  warehouseId: "warehouse-a",
  incidentType: "FLOOD",
  affectedPeople: 10,
  status: "DRAFT",
  createdAt: "2026-09-05T08:00:00.000Z",
};

test("có tên thôn thì thẻ hiện đúng tên đó", () => {
  assert.equal(
    missionLocationLabel({ ...locationBase, location: "Thôn Long Châu" }),
    "Địa điểm: Thôn Long Châu",
  );
  // Không có ô location nhưng nhiệm vụ gắn với thôn đã xác minh.
  assert.equal(
    missionLocationLabel({ ...locationBase, hamletName: "Tân Bình" }),
    "Địa điểm: Tân Bình",
  );
});

test("ghim tay trên bản đồ là ĐÃ có địa điểm, dù không mang tên", () => {
  // Đúng ca mà tính năng ghim sinh ra để phục vụ; trước đây thẻ báo "chưa ghi địa điểm".
  assert.equal(
    missionLocationLabel({ ...locationBase, incidentLat: 13.38, incidentLng: 109.1 }),
    "Địa điểm: Đã ghim trên bản đồ",
  );
});

test("tên thôn được ưu tiên hơn điểm ghim", () => {
  assert.equal(
    missionLocationLabel({
      ...locationBase,
      location: "Long Hoà",
      incidentLat: 13.38,
      incidentLng: 109.1,
    }),
    "Địa điểm: Long Hoà",
  );
});

test("toạ độ lẻ một nửa không tính là đã ghim", () => {
  assert.equal(missionLocationLabel({ ...locationBase, incidentLat: 13.38 }), "");
});

test("báo cáo thô chưa phân tích thì lấy lời kể làm dòng nhận diện", () => {
  assert.equal(
    missionLocationLabel({ ...locationBase, reportText: "  Nước   ngập ngang ngực  " }),
    "Nước ngập ngang ngực",
  );
});

test("lời kể dài bị cắt ngay tại đây, không để thẻ vỡ", () => {
  const label = missionLocationLabel({ ...locationBase, reportText: "a".repeat(300) });
  assert.equal(label.length, 121);
  assert.ok(label.endsWith("…"));
});

test("không có gì để nói thì không bịa ra câu thiếu dữ liệu", () => {
  assert.equal(missionLocationLabel(locationBase), "");
  assert.equal(missionLocationLabel({ ...locationBase, location: "   ", reportText: "" }), "");
});

test("lời kể không bị gắn nhãn “Địa điểm” — nó không phải một nơi chốn", () => {
  const label = missionLocationLabel({ ...locationBase, reportText: "Nước ngập ngang ngực" });
  assert.equal(label, "Nước ngập ngang ngực");
  assert.equal(label.startsWith("Địa điểm:"), false);
});

const stageBase: MissionInboxItem = {
  id: "m",
  warehouseId: "warehouse-a",
  incidentType: "FLOOD",
  affectedPeople: 10,
  status: "DRAFT",
  createdAt: "2026-09-05T08:00:00.000Z",
};

test("ba bước đầu đều là DRAFT nhưng phải đọc ra ba giai đoạn khác nhau", () => {
  // Đây là lỗi gốc: status đứng yên nên cả ba bước cùng hiện "Bản nháp".
  assert.equal(missionStageLabel(stageBase), "Bản nháp");
  assert.equal(
    missionStageLabel({ ...stageBase, hasCoordinationAnalysis: true }),
    "Đã lập bản tham mưu",
  );
  assert.equal(
    missionStageLabel({ ...stageBase, hasCoordinationAnalysis: true, actionPlan: { steps: [] } }),
    "Đã lập kế hoạch cứu hộ",
  );
});

test("có kế hoạch cứu hộ thì thắng, kể cả khi thiếu cờ tham mưu", () => {
  // Dữ liệu cũ có thể thiếu snapshot; bước muộn nhất còn dấu vết mới là bước đúng.
  assert.equal(missionStageLabel({ ...stageBase, actionPlan: {} }), "Đã lập kế hoạch cứu hộ");
});

test("phát hành rồi thì ghi rõ việc đang nằm ở đâu", () => {
  assert.equal(
    missionStageLabel({ ...stageBase, status: "PENDING_WAREHOUSE" }),
    "Đã duyệt và phát hành (đang đợi kho chuẩn bị và xuất)",
  );
  assert.equal(
    missionStageLabel({ ...stageBase, status: "READY" }),
    "Đã duyệt và phát hành (kho đã soạn đủ, chờ đội tới lấy)",
  );
});

test("nhiều kho cùng góp thì đếm ra còn mấy kho nữa", () => {
  const label = missionStageLabel({
    ...stageBase,
    status: "PENDING_WAREHOUSE",
    warehousePreparations: [
      { warehouseId: "w1", preparedAt: "2026-09-05T09:00:00.000Z" },
      { warehouseId: "w2", preparedAt: null },
      { warehouseId: "w3", preparedAt: null },
    ],
  });
  assert.equal(label, "Đã duyệt và phát hành (đang đợi kho chuẩn bị và xuất — 1/3 kho đã xong)");
});

test("chưa kho nào xuất thì không ghi 0/3 cho rối", () => {
  assert.equal(
    missionStageLabel({
      ...stageBase,
      status: "PENDING_WAREHOUSE",
      warehousePreparations: [{ warehouseId: "w1", preparedAt: null }],
    }),
    "Đã duyệt và phát hành (đang đợi kho chuẩn bị và xuất)",
  );
});

test("hiện trường báo kết quả xong thì nhiệm vụ đã đóng, không còn là chặng phát hành", () => {
  assert.equal(missionStageLabel({ ...stageBase, status: "COMPLETED" }), "Đã hoàn thành");
  // Dấu vết của các bước trước không được kéo nhãn ngược về giai đoạn cũ.
  assert.equal(
    missionStageLabel({
      ...stageBase,
      status: "COMPLETED",
      hasCoordinationAnalysis: true,
      actionPlan: {},
      warehousePreparations: [{ warehouseId: "w1", preparedAt: null }],
    }),
    "Đã hoàn thành",
  );
});

test("huỷ là kết thúc, không mang theo giai đoạn cũ", () => {
  // Huỷ một nhiệm vụ đã lập kế hoạch vẫn phải đọc ra "Đã huỷ", không phải bước cũ.
  assert.equal(missionStageLabel({ ...stageBase, status: "CANCELLED" }), "Đã huỷ");
  assert.equal(missionStageLabel({ ...stageBase, status: "CANCELLED", actionPlan: {} }), "Đã huỷ");
});

test("đã phát hành hay chưa — một chỗ định nghĩa cho cả nhãn lẫn huy hiệu", () => {
  assert.equal(missionIsPublished(stageBase), false);
  assert.equal(missionIsPublished({ ...stageBase, status: "PENDING_WAREHOUSE" }), true);
  assert.equal(missionIsPublished({ ...stageBase, status: "COMPLETED" }), true);
});

test("huỷ không tính là đã phát hành", () => {
  // Huỷ được cả khi còn nháp, nên không suy ra được nhiệm vụ đã ra tới kho chưa.
  assert.equal(missionIsPublished({ ...stageBase, status: "CANCELLED" }), false);
});

test("bị hiện trường từ chối vừa là đã phát hành, vừa là việc phải xử lý", () => {
  // Thẻ phải ưu tiên huy hiệu "Cần xử lý" trong đúng ca chồng lấn này.
  const rejected: MissionInboxItem = { ...stageBase, status: "REJECTED" };
  assert.equal(missionIsPublished(rejected), true);
  assert.equal(missionNeedsAction(rejected, "ADMIN"), true);
});

test("đường dẫn chính tắc mang số hiệu, không mang cuid", () => {
  assert.equal(missionNumberLink(98), "/missions/nhiem-vu-98");
  assert.equal(
    missionNumberLink(98, "field update/1"),
    "/missions/nhiem-vu-98?fieldUpdate=field%20update%2F1",
  );
});

test("đọc số hiệu từ slug, chỉ nhận đúng khuôn", () => {
  assert.equal(missionNoFromSlug("nhiem-vu-98"), 98);
  assert.equal(missionNoFromSlug("  nhiem-vu-1  "), 1);
});

test("slug lệch khuôn thì trả null chứ không đoán bừa", () => {
  // Bắt lỏng thì "nhiem-vu-98-abc" cũng lọt, và hai đường dẫn khác nhau cùng mở
  // một nhiệm vụ.
  assert.equal(missionNoFromSlug("nhiem-vu-98-abc"), null);
  assert.equal(missionNoFromSlug("nhiemvu98"), null);
  assert.equal(missionNoFromSlug("nhiem-vu-"), null);
  assert.equal(missionNoFromSlug("nhiem-vu-0"), null);
  assert.equal(missionNoFromSlug(""), null);
});

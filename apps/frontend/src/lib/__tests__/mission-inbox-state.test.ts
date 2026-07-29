import assert from "node:assert/strict";
import test from "node:test";
import {
  filterMissionInbox,
  missionDeepLink,
  missionNeedsAction,
  type MissionInboxItem,
} from "../mission-inbox-state";

const missions: MissionInboxItem[] = [
  {
    id: "mission-waiting",
    warehouseId: "warehouse-a",
    incidentType: "FLOOD",
    location: "Thôn Tân Bình",
    affectedPeople: 80,
    status: "PENDING_WAREHOUSE",
    createdAt: "2026-07-27T08:00:00.000Z",
    warehousePreparations: [
      {
        warehouseId: "warehouse-b",
        preparedAt: null,
      },
    ],
  },
  {
    id: "mission-ready",
    warehouseId: "warehouse-a",
    incidentType: "STORM",
    location: "Thôn Phú Hội",
    affectedPeople: 20,
    status: "READY",
    createdAt: "2026-07-27T09:00:00.000Z",
    warehousePreparations: [],
  },
  {
    id: "mission-completed",
    warehouseId: "warehouse-a",
    incidentType: "FIRE",
    location: "Thôn Long Mỹ",
    affectedPeople: 10,
    status: "COMPLETED",
    createdAt: "2026-07-27T10:00:00.000Z",
    warehousePreparations: [],
  },
];

test("lọc mission đang xử lý và đã kết thúc thành hai inbox riêng", () => {
  assert.deepEqual(
    filterMissionInbox(missions, {
      view: "active",
      search: "",
      role: "ADMIN",
      warehouseId: null,
    }).map((mission) => mission.id),
    ["mission-ready", "mission-waiting"],
  );
  assert.deepEqual(
    filterMissionInbox(missions, {
      view: "closed",
      search: "",
      role: "ADMIN",
      warehouseId: null,
    }).map((mission) => mission.id),
    ["mission-completed"],
  );
});

test("ưu tiên mission mà vai trò hiện tại cần hành động", () => {
  assert.deepEqual(
    filterMissionInbox(missions, {
      view: "active",
      search: "",
      role: "WAREHOUSE",
      warehouseId: "warehouse-b",
    }).map((mission) => mission.id),
    ["mission-waiting", "mission-ready"],
  );
  assert.equal(
    missionNeedsAction(missions[0], "WAREHOUSE", "warehouse-b"),
    true,
  );
  assert.equal(
    missionNeedsAction(missions[0], "WAREHOUSE", "warehouse-a"),
    false,
  );
  // Lực lượng hiện trường chỉ đọc → không bao giờ gắn cờ "Cần xử lý".
  assert.equal(missionNeedsAction(missions[1], "RESCUE", null), false);
});

test("tìm kiếm không phân biệt dấu theo địa điểm hoặc loại tình huống", () => {
  assert.deepEqual(
    filterMissionInbox(missions, {
      view: "active",
      search: "tan binh",
      role: "ADMIN",
      warehouseId: null,
    }).map((mission) => mission.id),
    ["mission-waiting"],
  );
  assert.deepEqual(
    filterMissionInbox(missions, {
      view: "active",
      search: "bao",
      role: "ADMIN",
      warehouseId: null,
    }).map((mission) => mission.id),
    ["mission-ready"],
  );
});

test("deep-link encode mission id để giữ lựa chọn qua refresh/tab mới", () => {
  assert.equal(
    missionDeepLink("mission/with spaces"),
    "/mission?mission=mission%2Fwith%20spaces",
  );
});

test("deep-link giữ evidence hiện trường cần ADMIN xem lại sau refresh", () => {
  assert.equal(
    missionDeepLink("mission/with spaces", "field update/1"),
    "/mission?mission=mission%2Fwith%20spaces&fieldUpdate=field%20update%2F1",
  );
});

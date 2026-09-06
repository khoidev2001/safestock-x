import assert from "node:assert/strict";
import { test } from "node:test";

import { matchNavRoute } from "./nav-route-match";

const TABS = [
  { path: "/overall" },
  { path: "/mission" },
  { path: "/missions", subPaths: ["/mission/"] },
  { path: "/inventory" },
];

test("trùng khít thì không suy đoán gì thêm", () => {
  assert.equal(matchNavRoute(TABS, "/mission")?.path, "/mission");
  assert.equal(matchNavRoute(TABS, "/missions")?.path, "/missions");
});

test("trang chi tiết một nhiệm vụ thuộc tab Nhiệm vụ, KHÔNG phải tab Điều phối", () => {
  // Đây là cái bẫy: "/mission/abc" bắt đầu bằng "/mission/" nên so khớp theo
  // tiền tố sẽ trao nó cho tab Điều phối cứu hộ. Sai chỗ này kéo theo bốn hậu
  // quả một lúc: sáng nhầm tab, tiêu đề nhầm, số trên tab Nhiệm vụ không xoá
  // được, và người không có quyền lập phương án bị đẩy văng khỏi trang.
  assert.equal(matchNavRoute(TABS, "/mission/abc")?.path, "/missions");
  assert.equal(matchNavRoute(TABS, "/mission/abc?fieldUpdate=x")?.path, "/missions");
});

test("trang con vô danh mượn tab cha có tiền tố dài nhất", () => {
  assert.equal(matchNavRoute(TABS, "/inventory/lo-hang-1")?.path, "/inventory");
});

test("đường dẫn lạ thì không thuộc tab nào", () => {
  assert.equal(matchNavRoute(TABS, "/khong-co-that"), undefined);
  // "/missionsomething" KHÔNG được tính là con của "/mission" hay "/missions".
  assert.equal(matchNavRoute(TABS, "/missionsomething"), undefined);
});

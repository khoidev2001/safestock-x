import assert from "node:assert/strict";
import { test } from "node:test";

import { formatDayMonthYear, formatHourMinute, formatTimeAndDate } from "../date-format";

// Giờ địa phương, dựng bằng đối số rời để không phụ thuộc múi giờ máy chạy test.
const mocThoiGian = new Date(2026, 8, 6, 15, 31);

test("ngày luôn là dd/mm/yyyy, đủ hai chữ số và bốn chữ số năm", () => {
  assert.equal(formatDayMonthYear(mocThoiGian), "06/09/2026");
});

test("ngày và tháng một chữ số vẫn được đệm số 0", () => {
  // "6/9/26" của Intl là thứ đang phải thay: hai máy đọc ra hai kiểu.
  assert.equal(formatDayMonthYear(new Date(2026, 0, 5, 8, 4)), "05/01/2026");
});

test("giờ theo 24 tiếng, không SA/CH", () => {
  assert.equal(formatHourMinute(mocThoiGian), "15:31");
  assert.equal(formatHourMinute(new Date(2026, 8, 6, 8, 4)), "08:04");
});

test("dòng nhật ký ghép giờ trước, ngày sau", () => {
  assert.equal(formatTimeAndDate(mocThoiGian), "15:31 06/09/2026");
});

test("nhận cả chuỗi ISO, không chỉ Date", () => {
  const iso = new Date(2026, 8, 6, 15, 31).toISOString();
  assert.equal(formatTimeAndDate(iso), "15:31 06/09/2026");
});

test("mốc thời gian hỏng thì nói rõ, không in Invalid Date", () => {
  // Dữ liệu cũ hoặc trường rỗng vẫn phải ra một dòng người đọc hiểu được.
  assert.equal(formatDayMonthYear("khong-phai-ngay"), "Không rõ ngày");
  assert.equal(formatHourMinute(""), "--:--");
  assert.equal(formatTimeAndDate("khong-phai-ngay"), "Không rõ thời gian");
});

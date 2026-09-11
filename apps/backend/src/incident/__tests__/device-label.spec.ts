import { describeDevice } from "../device-label";
import { detectPredictiveWarning, detectStatisticalAnomaly } from "../anomaly.rules";
import type { SensorSignal } from "../incident.rules";

describe("describeDevice", () => {
  it.each([
    ["SMOKE", "smoke_main", "cảm biến khói khu chính"],
    ["TEMPERATURE", "temp_A", "cảm biến nhiệt độ khu A"],
    ["HUMIDITY", "humid_B", "cảm biến độ ẩm khu B"],
    ["LOADCELL", "scale_C3", "cân tải kệ C3"],
    ["DOOR", "door_main", "cảm biến cửa kho khu chính"],
    ["GATEWAY", "gateway_01", "bộ kết nối số 01"],
  ])("%s/%s đọc thành %s", (type, code, mong) => {
    expect(describeDevice(type, code)).toBe(mong);
  });

  it("loại thiết bị chưa khai thì giữ nguyên mã, không bịa tên", () => {
    expect(describeDevice("LOAI_CHUA_KHAI", "abc_xyz")).toBe("abc_xyz");
  });

  it("biết loại nhưng đuôi mã lạ thì kèm mã trong ngoặc để còn phân biệt được", () => {
    expect(describeDevice("SMOKE", "smoke_tang-ham-2")).toBe("cảm biến khói (smoke_tang-ham-2)");
  });
});

/**
 * Vì sao kiểm cả tiêu đề chứ không chỉ hàm dịch: mã kỹ thuật lọt ra ngoài là lỗi
 * ở CHỖ GHÉP CHUỖI, không phải ở hàm dịch. Kiểm riêng hàm thì ai đó ghép thẳng
 * `deviceCode` vào tiêu đề mới là phép thử vẫn xanh.
 */
describe("tiêu đề sự cố không được lộ mã kỹ thuật", () => {
  const luc = (phut: number) => new Date(Date.UTC(2026, 8, 10, 0, phut, 0));
  const tinHieu = (value: number, phut: number): SensorSignal => ({
    deviceCode: "smoke_main",
    deviceType: "SMOKE",
    eventType: "SMOKE_READING",
    value,
    occurredAt: luc(phut),
  });

  it("cảnh báo sớm gọi tên cảm biến bằng tiếng Việt", () => {
    // Bốn điểm tăng đều, còn dưới ngưỡng nguy hiểm -> đúng điều kiện báo trước.
    const lichSu = [tinHieu(4, 0), tinHieu(8, 5), tinHieu(12, 10), tinHieu(16, 15)];
    const [suCo] = detectPredictiveWarning(lichSu);

    expect(suCo).toBeDefined();
    expect(suCo.title).toBe("Dự đoán cảm biến khói khu chính sẽ vượt ngưỡng");
    expect(suCo.title).not.toContain("smoke_main");
    // Mã vẫn phải còn trong bằng chứng để người kỹ thuật tra được thiết bị.
    expect(suCo.evidence[0].deviceCode).toBe("smoke_main");
  });

  it("bất thường thống kê cũng gọi tên bằng tiếng Việt", () => {
    // Baseline phẳng 10 điểm rồi một điểm vọt hẳn lên -> z-score vượt ngưỡng.
    const nen = Array.from({ length: 10 }, (_, i) => tinHieu(5 + (i % 2), i));
    const [suCo] = detectStatisticalAnomaly([...nen, tinHieu(80, 20)]);

    expect(suCo).toBeDefined();
    expect(suCo.title).toBe("Bất thường ở cảm biến khói khu chính");
    expect(suCo.title).not.toContain("smoke_main");
  });
});

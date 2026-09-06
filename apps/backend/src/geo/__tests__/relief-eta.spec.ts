import { RELIEF_ETA_DEFAULTS, reliefEtaAssumptions, reliefEtaMinutes } from "../relief-eta";

describe("reliefEtaMinutes", () => {
  it("không còn trả về con số vô lý cho cự ly ngắn", () => {
    // Đúng hai trường hợp người dùng báo: OSRM nói 0,7km hết 1 phút (≈42km/h) và
    // 4,3km hết 5 phút (≈52km/h).
    expect(reliefEtaMinutes(0.7, 60)).toBe(6);
    expect(reliefEtaMinutes(4.3, 300)).toBe(13);
  });

  it("giữ ước lượng của OSRM khi OSRM đã chậm hơn trần", () => {
    // 2,45km trong 480s = 18,4km/h: tuyến toàn đường xấu. OSRM biết hạng đường,
    // cái trần thì không, nên lấy số của OSRM.
    expect(reliefEtaMinutes(2.45, 480)).toBe(12);
  });

  it("chặn tốc độ tự do của profile xe con", () => {
    // 10km trong 6 phút = 100km/h. Trần 30km/h → 20 phút chạy + 4 phút phụ phí.
    expect(reliefEtaMinutes(10, 360)).toBe(24);
  });

  it("kho nằm ngay tại điểm nạn vẫn mất thời gian ra xe và mang hàng tới chỗ giao", () => {
    expect(reliefEtaMinutes(0, 0)).toBe(4);
    expect(reliefEtaMinutes(0, null)).toBe(4);
  });

  it("thiếu duration thì tính theo trần, không bỏ trắng ETA", () => {
    expect(reliefEtaMinutes(9, null)).toBe(22);
  });

  it("cự ly không dùng được thì trả null chứ không đoán", () => {
    expect(reliefEtaMinutes(null, 300)).toBeNull();
    expect(reliefEtaMinutes(Number.NaN, 300)).toBeNull();
    expect(reliefEtaMinutes(-1, 300)).toBeNull();
  });

  it("không bao giờ trả 0 phút", () => {
    expect(reliefEtaMinutes(0.01, 1, { maxAverageSpeedKmh: 30, tripOverheadMinutes: 0 })).toBe(1);
  });

  it("giả định sai kiểu thì lùi về mặc định thay vì chia cho 0", () => {
    expect(
      reliefEtaMinutes(6, null, { maxAverageSpeedKmh: 0, tripOverheadMinutes: Number.NaN }),
    ).toBe(reliefEtaMinutes(6, null, RELIEF_ETA_DEFAULTS));
  });
});

describe("reliefEtaAssumptions", () => {
  const read = (values: Record<string, unknown>) => (key: string) => values[key];

  it("ưu tiên trần riêng của tuyến local", () => {
    expect(
      reliefEtaAssumptions(
        read({ LOCAL_ROUTING_CONVOY_SPEED_KMH: "25", GEO_ASSUMED_SPEED_KMH: "30" }),
      ).maxAverageSpeedKmh,
    ).toBe(25);
  });

  it("chưa cấu hình riêng thì dùng chung giả định với đường Haversine", () => {
    expect(reliefEtaAssumptions(read({ GEO_ASSUMED_SPEED_KMH: "22" })).maxAverageSpeedKmh).toBe(22);
  });

  it("cấu hình rác thì lùi về mặc định, không ném giữa lúc điều phối", () => {
    for (const bad of ["", "  ", "nhanh", "0", "-5", undefined, null]) {
      expect(
        reliefEtaAssumptions(read({ LOCAL_ROUTING_CONVOY_SPEED_KMH: bad })).maxAverageSpeedKmh,
      ).toBe(RELIEF_ETA_DEFAULTS.maxAverageSpeedKmh);
    }
  });

  it("phụ phí 0 là hợp lệ, khác với chưa cấu hình", () => {
    expect(
      reliefEtaAssumptions(read({ LOCAL_ROUTING_TRIP_OVERHEAD_MIN: "0" })).tripOverheadMinutes,
    ).toBe(0);
    expect(reliefEtaAssumptions(read({})).tripOverheadMinutes).toBe(
      RELIEF_ETA_DEFAULTS.tripOverheadMinutes,
    );
  });
});

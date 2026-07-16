import { estimateEtaMinutes, haversineKm, LatLng } from "../haversine";

// Toạ độ thật quanh TP Buôn Ma Thuột (Đắk Lắk) để kiểm chứng.
const bmt: LatLng = { lat: 12.6667, lng: 108.0382 };
const eaKao: LatLng = { lat: 12.6265, lng: 108.0855 }; // ~ vài km

describe("haversineKm", () => {
  it("khoảng cách điểm trùng = 0", () => {
    expect(haversineKm(bmt, bmt)).toBe(0);
  });

  it("khoảng cách BMT → Ea Kao xấp xỉ 6-7 km", () => {
    const km = haversineKm(bmt, eaKao);
    expect(km).toBeGreaterThan(5);
    expect(km).toBeLessThan(8);
  });

  it("đối xứng: d(a,b) = d(b,a)", () => {
    expect(haversineKm(bmt, eaKao)).toBeCloseTo(haversineKm(eaKao, bmt), 6);
  });

  it("1 độ vĩ tuyến ≈ 111 km", () => {
    const km = haversineKm({ lat: 0, lng: 0 }, { lat: 1, lng: 0 });
    expect(km).toBeGreaterThan(110);
    expect(km).toBeLessThan(112);
  });
});

describe("estimateEtaMinutes", () => {
  it("10km @ 30km/h + detour 1.3 = 26 phút", () => {
    expect(estimateEtaMinutes(10, 30, 1.3)).toBe(26);
  });

  it("khoảng cách 0 → 0 phút", () => {
    expect(estimateEtaMinutes(0, 30)).toBe(0);
  });

  it("tốc độ ≤ 0 → ném lỗi", () => {
    expect(() => estimateEtaMinutes(10, 0)).toThrow();
  });
});

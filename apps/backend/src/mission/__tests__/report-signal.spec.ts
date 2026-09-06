import { readReportSignal } from "../report-signal";

const hamlets = [
  { id: "h-tan-an", name: "Tân An", aliases: ["tan an", "thon tan an"] },
  { id: "h-tan-phu", name: "Tân Phú", aliases: ["tan phu"] },
  { id: "h-tan-phuoc", name: "Tân Phước", aliases: ["tan phuoc"] },
];

describe("readReportSignal", () => {
  it("đọc đủ ba dữ kiện từ đúng câu trưởng thôn hay gửi", () => {
    const signal = readReportSignal(
      "Thôn Tân An ngập do triều cường kết hợp mưa lớn, 260 người bị ảnh hưởng, trong đó 55 trẻ em.",
      hamlets,
    );

    expect(signal).toEqual({
      incidentType: "FLOOD",
      affectedPeople: 260,
      locationName: "Tân An",
    });
  });

  it("lấy số đứng ngay trước chữ 'người', không lấy con số gặp đầu tiên", () => {
    // "ngập 2 mét" mà nhận thành 2 người thì thẻ báo một vụ nhỏ xíu.
    const signal = readReportSignal("Ngập 2 mét ở đầu thôn, 180 người phải sơ tán", hamlets);

    expect(signal.affectedPeople).toBe(180);
  });

  it("không nhầm số trẻ em thành tổng số người", () => {
    const signal = readReportSignal("Sạt lở, 45 người mắc kẹt, trong đó 12 trẻ em", hamlets);

    expect(signal.affectedPeople).toBe(45);
    expect(signal.incidentType).toBe("LANDSLIDE");
  });

  it("cháy được xét trước mưa: một câu nhắc cả hai thì cháy là việc phải làm trước", () => {
    const signal = readReportSignal("Mưa lớn nhưng có cháy nhà ở Tân Phú, 8 người", hamlets);

    expect(signal.incidentType).toBe("FIRE");
  });

  it("cô lập do ngập vẫn là lũ lụt, cô lập đứng một mình mới là cô lập", () => {
    expect(readReportSignal("Nước dâng nên cả xóm bị cô lập", hamlets).incidentType).toBe("FLOOD");
    expect(readReportSignal("Đường sập, thôn bị chia cắt từ sáng", hamlets).incidentType).toBe(
      "ISOLATION",
    );
  });

  it("so theo ranh giới từ nên 'lúa' không thành 'lũ'", () => {
    // "lu" nằm gọn trong "lua"; so kiểu chứa chuỗi thì báo mất mùa thành báo lũ.
    expect(readReportSignal("Lúa ngoài đồng bị đổ sau đêm qua", hamlets).incidentType).toBeNull();
  });

  it("bỏ dấu làm 'báo' thành 'bão', nên từ dễ đụng phải so khi còn nguyên dấu", () => {
    // Ba câu này từng bị nhận nhầm: "báo cáo" → bão, "nước chảy" → cháy,
    // "giống như" → giông.
    expect(readReportSignal("Xin báo cáo tình hình sáng nay", hamlets).incidentType).toBeNull();
    expect(readReportSignal("Nước chảy xiết qua cầu", hamlets).incidentType).toBeNull();
    expect(readReportSignal("Tình hình giống như hôm qua", hamlets).incidentType).toBeNull();
  });

  it("lời kể gõ không dấu vẫn bắt được qua các cụm không đụng từ nào khác", () => {
    expect(readReportSignal("chay nha o dau thon, 3 nguoi bi bong", hamlets)).toEqual({
      incidentType: "FIRE",
      affectedPeople: 3,
      locationName: null,
    });
    expect(readReportSignal("gio giat toc mai 12 nguoi", hamlets).incidentType).toBe("STORM");
  });

  it("không đoán bừa: câu không nói gì rõ thì trả null hết", () => {
    expect(readReportSignal("Xin báo cáo tình hình sáng nay", hamlets)).toEqual({
      incidentType: null,
      affectedPeople: null,
      locationName: null,
    });
  });

  it("nhắc từ hai thôn trở lên thì KHÔNG chọn thôn nào", () => {
    // Cùng quy tắc với findHamletInReport: đoán bừa là dán nhầm địa điểm lên thẻ.
    const signal = readReportSignal("Ngập ở Tân An và Tân Phú, 90 người", hamlets);

    expect(signal.locationName).toBeNull();
    expect(signal.incidentType).toBe("FLOOD");
  });

  it("số hàng nghìn viết có dấu chấm vẫn đọc đúng", () => {
    expect(readReportSignal("Bão, 1.200 người phải sơ tán", hamlets).affectedPeople).toBe(1200);
  });

  it("lời kể rỗng thì không dựng dữ kiện nào", () => {
    expect(readReportSignal("   ", hamlets)).toEqual({
      incidentType: null,
      affectedPeople: null,
      locationName: null,
    });
  });
});

/**
 * Ảnh minh hoạ và chú giải vị trí cho từng khu của kho tổng.
 *
 * Sơ đồ kho trước đây chỉ có mã kệ và số lô: người trực đọc "B2 — 5 lô" không
 * hình dung được đi tới đâu trong kho và bốc thứ gì. Mỗi khu giờ kèm một ảnh
 * bố trí và chú giải theo đúng thứ nhìn thấy trong ảnh — kệ nào đứng ở đâu,
 * tầng trên tầng dưới xếp vật tư gì — để người mới vào ca vẫn tìm đúng chỗ.
 *
 * Khoá tra cứu là TÊN khu (kho tổng seed ba khu A/B/C với đúng ba tên này).
 * Kho thôn chỉ có một khu gộp ("Điểm vật tư thôn", "Khu A — hàng cứu trợ") nên
 * không khớp khoá nào và vẫn hiển thị dạng danh sách kệ như cũ.
 */

export interface ShelfGuide {
  /** Kệ này đứng ở đâu trong ảnh — để đối chiếu ảnh với thực địa. */
  position: string;
  /**
   * Chỗ ghim nhãn mã kệ lên ảnh, tính theo % chiều rộng/chiều cao ảnh.
   *
   * Ghim theo % chứ không theo pixel vì cùng một ảnh hiển thị ở ba khổ khác
   * nhau: một cột trên điện thoại, hai cột ở màn rộng, và trong khối gập của
   * trang vật tư. Nhãn được dịch về tâm nên toạ độ là điểm giữa nhãn.
   */
  hotspot: { left: number; top: number };
  /** Vật tư trên kệ, mô tả theo đúng thứ nhìn thấy trong ảnh. */
  contents: { level: string; items: string }[];
}

export interface ZoneGuide {
  image: string;
  alt: string;
  /** Màu nhận dạng khu, dùng cho chip mã khu và nhãn kệ trên ảnh. */
  accent: string;
  /** Chú giải theo mã kệ trong dữ liệu kho. */
  shelves: Record<string, ShelfGuide>;
}

const ZONE_GUIDES: Record<string, ZoneGuide> = {
  "Nước sạch và lương thực": {
    image: "/kho/khu-a.webp",
    accent: "oklch(0.55 0.15 250)",
    alt: "Khu A: kệ bên trái xếp bình nước và bao vật tư, kệ bên phải xếp thùng carton lương thực, vạch vàng chia lối đi giữa hai kệ.",
    shelves: {
      A1: {
        position: "Kệ bên trái, dọc tường phía tây — ô gần cửa nhất",
        hotspot: { left: 30, top: 17 },
        contents: [
          {
            level: "Tầng trên",
            items: "Nước uống đóng chai, bình xếp kín hai hàng; lấy theo lô có hạn gần nhất trước.",
          },
          {
            level: "Tầng dưới",
            items: "Can nước 20 lít và bộ vệ sinh gia đình đóng bao xếp cạnh.",
          },
          {
            level: "Pallet sát sàn",
            items: "Nước lốc nhỏ và viên khử khuẩn nước, phần soạn sẵn chờ xuất.",
          },
        ],
      },
      A2: {
        position: "Kệ bên phải, dọc tường phía bắc",
        hotspot: { left: 68, top: 18 },
        contents: [
          {
            level: "Tầng trên",
            items: "Thùng mì tôm và lương khô, carton xếp ba lớp trên pallet.",
          },
          {
            level: "Tầng dưới",
            items: "Thùng sữa hộp cho trẻ em, thùng nhựa niêm phong và bao gạo cứu trợ.",
          },
          {
            level: "Pallet sát sàn",
            items: "Carton mới nhập, chờ kiểm đếm trước khi lên kệ.",
          },
        ],
      },
    },
  },

  "Cứu sinh và che chắn": {
    image: "/kho/khu-b.webp",
    accent: "oklch(0.62 0.17 55)",
    alt: "Khu B: kệ bên trái treo phao cứu sinh tròn và áo phao, kệ bên phải xếp chăn, bạt và hòm nhựa.",
    shelves: {
      B1: {
        position: "Kệ bên trái, dọc tường phía tây",
        hotspot: { left: 30, top: 17 },
        contents: [
          {
            level: "Tầng trên",
            items:
              "Phao cứu sinh tròn dựng thành hàng, áo phao người lớn và trẻ em xếp chồng bên cạnh.",
          },
          {
            level: "Tầng dưới",
            items: "Cuộn dây cứu hộ 30 mét và bạt che gấp vuông.",
          },
          {
            level: "Pallet sát sàn",
            items: "Cuộn dây dự phòng để sát lối đi, đội cứu hộ vác đi luôn không cần mở kệ.",
          },
        ],
      },
      B2: {
        position: "Kệ bên phải, dọc tường phía bắc",
        hotspot: { left: 68, top: 18 },
        contents: [
          {
            level: "Tầng trên",
            items: "Chăn cứu trợ gấp thành khối và thùng nhựa đựng màn chống muỗi.",
          },
          {
            level: "Tầng dưới",
            items: "Hòm nhựa đựng áo mưa và ủng lội nước, bạt che chống thấm gấp xếp bên phải.",
          },
          {
            level: "Pallet sát sàn",
            items: "Hòm nhựa đã niêm phong, hàng vừa kiểm tra xong chờ xếp lên kệ.",
          },
        ],
      },
    },
  },

  "Y tế, điện và liên lạc": {
    image: "/kho/khu-c.webp",
    accent: "oklch(0.52 0.16 300)",
    alt: "Khu C: kệ bên trái xếp hộp sơ cứu dấu chữ thập đỏ, kệ bên phải xếp bộ đàm, đèn pin và cuộn dây; góc phải là pallet máy phát điện.",
    shelves: {
      C1: {
        position: "Kệ bên trái, dọc tường phía tây",
        hotspot: { left: 30, top: 17 },
        contents: [
          {
            level: "Tầng trên",
            items: "Bộ sơ cứu hộp cứng dấu chữ thập đỏ, carton băng gạc xếp cạnh.",
          },
          {
            level: "Tầng dưới",
            items: "Bộ sơ cứu cỡ lớn và hòm nhựa đựng cáng cứu thương gấp.",
          },
          {
            level: "Pallet sát sàn",
            items: "Hai hộp sơ cứu để thấp, lấy được ngay mà không cần thang.",
          },
        ],
      },
      C2: {
        position: "Kệ bên phải, dọc tường phía bắc",
        hotspot: { left: 68, top: 18 },
        contents: [
          {
            level: "Tầng trên",
            items: "Bộ đàm cầm tay dựng thành hàng, hai cuộn dây tín hiệu bó gọn.",
          },
          {
            level: "Tầng dưới",
            items:
              "Hòm thiết bị liên lạc, dãy đèn pin, can nhựa đựng bộ pin và pin sạc dự phòng; loa cầm tay để đầu kệ.",
          },
        ],
      },
      C3: {
        position: "Pallet sàn góc phải, ngoài hai kệ — chỗ để đồ nặng và ít lượt xuất",
        hotspot: { left: 88, top: 44 },
        contents: [
          {
            level: "Trên pallet",
            items: "Máy phát điện mini 2kVA và cuộn cáp điện, xẻng xúc bùn dựng sát tường.",
          },
          {
            level: "Góc chờ xử lý",
            items:
              "Lô bộ sơ cứu hết hạn, bạt hỏng và bộ đàm cần kiểm — để riêng, không tính vào hàng khả dụng.",
          },
        ],
      },
    },
  },
};

export function getZoneGuide(zoneName: string): ZoneGuide | undefined {
  return ZONE_GUIDES[zoneName];
}

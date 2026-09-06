import { IncidentType, LITERS_PER_WATER_BOTTLE } from "@safestock/shared-types";

/**
 * Bảng định mức vật tư cứu hộ.
 *
 * ⚠️ ĐỊNH MỨC THAM KHẢO PHỤC VỤ NGHIÊN CỨU, không phải hướng dẫn nghiệp vụ
 * chính thức. Dẫn nguồn:
 *  - Sphere Handbook (chuẩn cứu trợ nhân đạo quốc tế): nước tối thiểu 15
 *    lít/người/ngày; thực phẩm ~2100 kcal/người/ngày.
 *  - Tiêu chuẩn Hội Chữ thập đỏ + quy định phòng chống thiên tai VN.
 *
 * Sẽ đọc từ DB (bảng cấu hình) ở lát tích hợp — giữ hằng số code cho MVP.
 */

/**
 * Thể tích một chai nước cứu trợ, tính bằng lít.
 *
 * Chuẩn Sphere ghi nhu cầu nước theo LÍT, nhưng kho xuất và trưởng thôn đếm theo
 * CHAI — không ai bốc "15 lít" ra khỏi kệ, người ta bốc mười chai. Ghi định mức
 * theo lít rồi để người xuất kho tự chia là đẩy phép tính sang đúng lúc đang vội,
 * và mỗi người chia một kiểu.
 *
 * Giữ hằng số ở đây để đổi cỡ chai chỉ phải sửa một chỗ, và để phép quy đổi luôn
 * nhìn thấy được thay vì nằm ẩn trong một con số đã nhân sẵn.
 */
// Cỡ chai lấy từ gói dùng chung: web hiện lại số lít từ đúng hằng số này, mỗi
// bên giữ một bản là hai màn hình nói hai con số cho cùng một đống hàng.
export { LITERS_PER_WATER_BOTTLE };

/**
 * NƯỚC UỐNG đóng chai: lít/người/ngày.
 *
 * Sphere ghi 15 lít/người/ngày, nhưng đó là TỔNG lượng nước cho cả ăn uống lẫn
 * vệ sinh — phần lớn do bồn, giếng và can 20 lít gánh, không phải nước đóng chai.
 * Riêng phần uống và nấu, Sphere đặt mức sinh tồn 2,5–3 lít/người/ngày.
 *
 * Kho xã phát MỘT CHAI 1,5 lít cho một người một ngày: đây là phần nước cứu trợ
 * cầm tay, phát cho người đang mắc kẹt uống ngay, không phải toàn bộ nước sinh
 * hoạt của họ. Phần còn lại của mức sinh tồn do nước đun, nước bồn và nguồn tại
 * chỗ gánh. Đặt định mức bằng cả 3 lít thì mỗi đợt phát phải bốc gấp đôi số chai
 * — vượt sức chở của xe và vượt xa tồn kho, trong khi phần vượt đó không phải
 * thứ chai nhựa phải gánh.
 *
 * Đổi con số này là đổi TOÀN BỘ nhu cầu nước của mọi nhiệm vụ; chạy lại
 * `mission.compute.spec.ts` để chốt.
 */
export const WATER_LITERS_PER_PERSON_PER_DAY = LITERS_PER_WATER_BOTTLE;

/** Lít/người/ngày → số chai, giữ nguyên phần lẻ để tổng mới làm tròn. */
function bottlesFromLiters(litersPerDay: number): number {
  return litersPerDay / LITERS_PER_WATER_BOTTLE;
}

/** 1 dòng định mức: mỗi SKU cần bao nhiêu, tính theo yếu tố nào. */
export interface NormRule {
  sku: string;
  itemName: string;
  unit: string;
  /** Hệ số nhân với "cơ sở" (người/trẻ em/người già/ngày). */
  perUnit: number;
  basis: NormBasis;
}

export type NormBasis =
  | "PER_PERSON" // mỗi người bị ảnh hưởng
  | "PER_ADULT" // mỗi người lớn = số người ảnh hưởng trừ trẻ em
  | "PER_CHILD" // mỗi trẻ em
  | "PER_PERSON_PER_DAY" // mỗi người mỗi ngày (nhân số ngày)
  | "PER_MEDICAL_CASE" // mỗi ca cần y tế
  // Cả chuyến đi cần bấy nhiêu, không nhân với ai. Đồ dùng CHUNG của đội: loa,
  // dây, xẻng, bộ đàm — một trận lũ 20 người và một trận 200 người đều cần đúng
  // một cái loa. Trước đây phải giả PER_PERSON với hệ số bé tí để lách, và hệ số
  // đó vỡ ở hai đầu: nhiệm vụ nhỏ ra 0 (không mang loa), nhiệm vụ lớn ra hàng chục.
  | "PER_MISSION";

/**
 * Định mức nước uống dùng chung cho mọi loại tình huống.
 *
 * Người bị lũ và người bị cháy uống như nhau — nhu cầu uống là nhu cầu sinh tồn,
 * không đổi theo loại thiên tai. Phần khác nhau giữa các tình huống nằm ở SỐ NGÀY
 * (durationHours) chứ không nằm ở lít mỗi ngày.
 */
const DRINKING_WATER_NORM: NormRule = {
  sku: "WATER-01",
  itemName: "Nước uống đóng chai",
  unit: "chai",
  perUnit: bottlesFromLiters(WATER_LITERS_PER_PERSON_PER_DAY),
  basis: "PER_PERSON_PER_DAY",
};

/**
 * Định mức dùng lại ở nhiều loại tình huống.
 *
 * Gom thành hằng số thay vì chép lại từng dòng: bộ sơ cứu và đèn pin có mặt ở gần
 * như mọi loại, chép tay thì sớm muộn cũng có chỗ lệch hệ số mà không ai thấy.
 */
const FIRST_AID_NORM: NormRule = {
  sku: "FIRSTAID-01",
  itemName: "Bộ sơ cứu",
  unit: "bộ",
  perUnit: 1,
  basis: "PER_MEDICAL_CASE",
};

/**
 * MÌ TÔM: 2 gói/người/ngày, thùng 30 gói → 2/30 thùng.
 *
 * Ghi hệ số theo THÙNG vì kho xuất theo thùng, nhưng đặt phép chia ngay tại đây để
 * người đọc thấy được nó từ đâu ra — nhét sẵn 0,0667 vào thì sửa cỡ thùng về sau là
 * phải đi dò ngược một con số không nói lên điều gì.
 */
const NOODLE_PACKS_PER_CARTON = 30;
const NOODLE_PACKS_PER_PERSON_PER_DAY = 2;
const INSTANT_NOODLE_NORM: NormRule = {
  sku: "NOODLE-01",
  itemName: "Mì tôm cứu trợ",
  unit: "thùng",
  perUnit: NOODLE_PACKS_PER_PERSON_PER_DAY / NOODLE_PACKS_PER_CARTON,
  basis: "PER_PERSON_PER_DAY",
};

/** Lương khô: 0,3 kg/người/ngày — phần ăn ngay khi chưa nấu nướng được. */
const DRY_RATION_NORM: NormRule = {
  sku: "FOOD-RATION-01",
  itemName: "Lương khô cứu trợ",
  unit: "kg",
  perUnit: 0.3,
  basis: "PER_PERSON_PER_DAY",
};

/**
 * Viên khử khuẩn nước: 2 viên/người/ngày.
 *
 * Một viên xử lý 20 lít. Sphere đặt nhu cầu nước SINH HOẠT ở 15 lít/người/ngày —
 * phần này do giếng, bồn và nước sông gánh, và sau lũ thì cả ba đều nhiễm bẩn. Hai
 * viên phủ 40 lít, dư một nhịp cho phần nấu nướng và rửa ráy.
 */
const WATER_PURIFICATION_NORM: NormRule = {
  sku: "AQUATAB-01",
  itemName: "Viên khử khuẩn nước",
  unit: "viên",
  perUnit: 2,
  basis: "PER_PERSON_PER_DAY",
};

/** Chăn: 1 chiếc cho 2 người — người ướt và lạnh, không phải ai cũng nằm riêng. */
const BLANKET_NORM: NormRule = {
  sku: "BLANKET-01",
  itemName: "Chăn cứu trợ",
  unit: "tấm",
  perUnit: 0.5,
  basis: "PER_PERSON",
};

/** Bộ vệ sinh gia đình: 1 bộ cho 4 người, tức xấp xỉ một hộ. */
const HYGIENE_NORM: NormRule = {
  sku: "HYGIENE-KIT-01",
  itemName: "Bộ vệ sinh gia đình",
  unit: "bộ",
  perUnit: 0.25,
  basis: "PER_PERSON",
};

/** Áo mưa: phát cho người phải di chuyển, sơ tán — không phải cả thôn. */
const RAINCOAT_NORM: NormRule = {
  sku: "RAINCOAT-01",
  itemName: "Áo mưa cứu trợ",
  unit: "chiếc",
  perUnit: 0.5,
  basis: "PER_PERSON",
};

const TORCH_NORM: NormRule = {
  sku: "TORCH-01",
  itemName: "Đèn pin",
  unit: "chiếc",
  perUnit: 0.1,
  basis: "PER_PERSON",
};

/** Pin đi kèm đèn: cùng hệ số với đèn, để không có đèn nào ra khỏi kho mà không pin. */
const BATTERY_NORM: NormRule = {
  sku: "BATT-01",
  itemName: "Bộ pin",
  unit: "bộ",
  perUnit: 0.1,
  basis: "PER_PERSON",
};

/** Loa cầm tay: gọi sơ tán. Một chiếc cho cả chuyến, bất kể đông hay vắng. */
const MEGAPHONE_NORM: NormRule = {
  sku: "MEGAPHONE-01",
  itemName: "Loa cầm tay",
  unit: "chiếc",
  perUnit: 1,
  basis: "PER_MISSION",
};

/**
 * Định mức theo loại tình huống.
 *
 * MỞ RỘNG sau đợt chạy thử 20 kịch bản bão/lũ/sạt lở. Bản trước chỉ hỏi tới 6 SKU
 * trong danh mục 17 món, nên 11 món nằm im trong kho mà không nhiệm vụ nào lấy được
 * — kể cả xuồng cứu hộ. Trưởng thôn báo "cần áo phao với xuồng gấp", phương án lập
 * ra không có dòng xuồng nào, và nhìn từ ngoài thì y hệt như kho hết hàng.
 *
 * Nguyên tắc xếp dòng: thứ CỨU MẠNG trước, ăn uống sau, rồi mới tới che chắn và
 * liên lạc. Bảng nhu cầu hiện theo đúng thứ tự này nên người trực đọc từ trên xuống
 * là gặp thứ gấp nhất trước.
 */
export const MISSION_NORMS: Record<IncidentType, NormRule[]> = {
  // LŨ: người mắc kẹt trong nước. Cứu người ra trước, nuôi sau.
  [IncidentType.FLOOD]: [
    {
      sku: "LIFE-ADULT",
      itemName: "Áo phao người lớn",
      unit: "chiếc",
      perUnit: 1,
      // PER_ADULT chứ không phải PER_PERSON: ô "Số người" là TỔNG số người ảnh
      // hưởng, đã bao gồm trẻ em. Tính theo tổng thì mỗi trẻ em được phát hai áo
      // phao — một cỡ trẻ em và một cỡ người lớn không ai mặc.
      basis: "PER_ADULT",
    },
    {
      sku: "LIFE-CHILD",
      itemName: "Áo phao trẻ em",
      unit: "chiếc",
      perUnit: 1,
      basis: "PER_CHILD",
    },
    {
      sku: "BOAT-01",
      itemName: "Xuồng cứu hộ",
      unit: "chiếc",
      // 1 xuồng cho 50 người. Xuồng CHỞ NHIỀU LƯỢT chứ không phát cho từng người
      // như áo phao, nên hệ số phải bé — để bằng áo phao thì một trận 200 người
      // đòi 200 chiếc, vượt xa cả sức chứa lẫn số xuồng có trên đời ở một xã.
      // Vẫn đủ để nhiệm vụ nhỏ nhất ra 1 chiếc, nhờ computeRequirements làm tròn lên.
      perUnit: 0.02,
      basis: "PER_PERSON",
    },
    {
      sku: "RING-01",
      itemName: "Phao cứu sinh tròn",
      unit: "chiếc",
      // Hai phao ném mỗi xuồng.
      perUnit: 0.04,
      basis: "PER_PERSON",
    },
    {
      sku: "ROPE-01",
      itemName: "Dây cứu hộ 30 mét",
      unit: "cuộn",
      perUnit: 2,
      basis: "PER_MISSION",
    },
    DRINKING_WATER_NORM,
    WATER_PURIFICATION_NORM,
    INSTANT_NOODLE_NORM,
    DRY_RATION_NORM,
    FIRST_AID_NORM,
    RAINCOAT_NORM,
    BLANKET_NORM,
    HYGIENE_NORM,
    TORCH_NORM,
    BATTERY_NORM,
    MEGAPHONE_NORM,
  ],

  // BÃO: tốc mái, mất điện. Không ngập nên không cần xuồng, nhưng cần che chắn
  // ngay trong đêm và cần cách nghe thông tin khi điện lưới đã tắt.
  [IncidentType.STORM]: [
    {
      sku: "CANVAS-01",
      itemName: "Bạt che chống thấm",
      unit: "tấm",
      perUnit: 0.2,
      basis: "PER_PERSON",
    },
    {
      sku: "ROPE-01",
      itemName: "Dây cứu hộ 30 mét",
      unit: "cuộn",
      // Chằng mái, buộc bạt — việc của đội, không chia theo đầu người.
      perUnit: 3,
      basis: "PER_MISSION",
    },
    DRINKING_WATER_NORM,
    INSTANT_NOODLE_NORM,
    DRY_RATION_NORM,
    FIRST_AID_NORM,
    RAINCOAT_NORM,
    BLANKET_NORM,
    {
      sku: "MOSQUITO-NET-01",
      itemName: "Màn chống muỗi",
      unit: "chiếc",
      perUnit: 0.25,
      basis: "PER_PERSON",
    },
    HYGIENE_NORM,
    TORCH_NORM,
    BATTERY_NORM,
    {
      sku: "POWERBANK-01",
      itemName: "Pin sạc dự phòng",
      unit: "chiếc",
      // Mất điện diện rộng: điện thoại là đường liên lạc duy nhất còn lại của dân.
      perUnit: 0.05,
      basis: "PER_PERSON",
    },
    {
      sku: "RADIO-01",
      itemName: "Bộ đàm cầm tay",
      unit: "chiếc",
      perUnit: 2,
      basis: "PER_MISSION",
    },
    MEGAPHONE_NORM,
  ],

  // SẠT LỞ: vùi lấp và thương vong. Phần lớn vật tư ở đây là của ĐỘI ĐÀO BỚI, nên
  // tính theo chuyến chứ không theo số người gặp nạn.
  [IncidentType.LANDSLIDE]: [
    FIRST_AID_NORM,
    {
      sku: "STRETCHER-01",
      itemName: "Cáng cứu thương",
      unit: "chiếc",
      // Mỗi ca thương một cáng: người bị vùi không tự đi ra được.
      perUnit: 1,
      basis: "PER_MEDICAL_CASE",
    },
    {
      sku: "SHOVEL-01",
      itemName: "Xẻng xúc bùn đất",
      unit: "chiếc",
      perUnit: 8,
      basis: "PER_MISSION",
    },
    {
      sku: "ROPE-01",
      itemName: "Dây cứu hộ 30 mét",
      unit: "cuộn",
      perUnit: 3,
      basis: "PER_MISSION",
    },
    { sku: "BOOT-01", itemName: "Ủng lội nước", unit: "đôi", perUnit: 10, basis: "PER_MISSION" },
    DRINKING_WATER_NORM,
    INSTANT_NOODLE_NORM,
    DRY_RATION_NORM,
    {
      sku: "CANVAS-01",
      itemName: "Bạt che chống thấm",
      unit: "tấm",
      perUnit: 0.2,
      basis: "PER_PERSON",
    },
    RAINCOAT_NORM,
    BLANKET_NORM,
    // Đào bới ban đêm: hệ số đèn gấp đôi các tình huống khác.
    { sku: "TORCH-01", itemName: "Đèn pin", unit: "chiếc", perUnit: 0.2, basis: "PER_PERSON" },
    { sku: "BATT-01", itemName: "Bộ pin", unit: "bộ", perUnit: 0.2, basis: "PER_PERSON" },
    MEGAPHONE_NORM,
  ],

  // CHÁY: mất nhà chứ không mất đường. Nhu cầu dồn vào chỗ ở tạm và đồ dùng thay
  // thế cho thứ đã cháy — không cần dụng cụ cứu hộ nặng.
  [IncidentType.FIRE]: [
    FIRST_AID_NORM,
    DRINKING_WATER_NORM,
    INSTANT_NOODLE_NORM,
    DRY_RATION_NORM,
    {
      sku: "CANVAS-01",
      itemName: "Bạt che chống thấm",
      unit: "tấm",
      perUnit: 0.2,
      basis: "PER_PERSON",
    },
    BLANKET_NORM,
    HYGIENE_NORM,
    TORCH_NORM,
    MEGAPHONE_NORM,
  ],

  // CÔ LẬP: đường bị chia cắt nhiều ngày. Người không bị thương, cái thiếu là ĂN.
  // Đây là loại duy nhất có GẠO: cô lập dài ngày thì bà con vẫn nấu được, mà ăn mì
  // gói cả tuần thì không sống nổi. Các loại cấp tính khác chỉ phát đồ ăn liền.
  [IncidentType.ISOLATION]: [
    DRINKING_WATER_NORM,
    WATER_PURIFICATION_NORM,
    {
      sku: "RICE-01",
      itemName: "Gạo cứu trợ",
      unit: "kg",
      perUnit: 0.4,
      basis: "PER_PERSON_PER_DAY",
    },
    INSTANT_NOODLE_NORM,
    DRY_RATION_NORM,
    {
      sku: "MILK-01",
      itemName: "Sữa hộp cho trẻ em",
      unit: "thùng",
      // Thùng 48 hộp; 0,1 thùng ≈ 5 hộp cho một trẻ trong đợt tiếp tế.
      perUnit: 0.1,
      basis: "PER_CHILD",
    },
    FIRST_AID_NORM,
    HYGIENE_NORM,
    {
      sku: "MOSQUITO-NET-01",
      itemName: "Màn chống muỗi",
      unit: "chiếc",
      perUnit: 0.25,
      basis: "PER_PERSON",
    },
    TORCH_NORM,
    BATTERY_NORM,
    {
      sku: "RADIO-01",
      itemName: "Bộ đàm cầm tay",
      unit: "chiếc",
      perUnit: 2,
      basis: "PER_MISSION",
    },
  ],

  // KHÁC: chưa phân loại được thì cấp phần nền ai cũng cần, không đoán thêm.
  [IncidentType.OTHER]: [DRINKING_WATER_NORM, INSTANT_NOODLE_NORM, FIRST_AID_NORM, TORCH_NORM],
};

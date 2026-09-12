import type { MissionStatus } from "./mission-api";

export type MissionInboxRole = "ADMIN" | "RESCUE" | "WAREHOUSE";

export interface MissionInboxPreparation {
  warehouseId: string;
  preparedAt: string | null;
}

export interface MissionInboxItem {
  id: string;
  /** Số hiệu ổn định, không bao giờ dùng lại — xem `missionNo` ở backend. */
  missionNo?: number;
  warehouseId: string;
  incidentType: string;
  location?: string | null;
  hamletName?: string | null;
  /** Ghim tay trên bản đồ: có toạ độ là đã có địa điểm, chỉ là nó không mang tên. */
  incidentLat?: number | null;
  incidentLng?: number | null;
  /** Lời kể thô của trưởng thôn, khi báo cáo chưa được phân tích thành số liệu. */
  reportText?: string | null;
  affectedPeople: number;
  status: MissionStatus;
  createdAt: string;
  warehousePreparations?: MissionInboxPreparation[];
  /**
   * Đã lập bản tham mưu chưa — backend đếm snapshot BASELINE rồi trả về cờ này.
   *
   * Không suy ra được từ `requirements`: nhu cầu vật tư tính xong trước bản tham
   * mưu, nên nhiều nhiệm vụ có nhu cầu mà chưa hề tham mưu.
   */
  hasCoordinationAnalysis?: boolean;
  /**
   * Có vật tư tái sử dụng nào đang nằm ngoài kho không — backend tính từ phần đội
   * đã ký nhận mang đi.
   *
   * `false` là KHÔNG CẦN TRẢ: nhiệm vụ chỉ phát đồ tiêu hao. Để trống nghĩa là
   * bên gọi chưa có thông tin, và nhãn phải đọc theo cách thận trọng — nói "không
   * cần trả" khi thật ra chưa biết là xoá một khoản nợ có thể đang tồn tại.
   */
  hasReturnableSupplies?: boolean;
  /** Chỉ cần biết CÓ hay KHÔNG; hình dạng kế hoạch là việc của màn hình chi tiết. */
  actionPlan?: unknown;
}

/**
 * Dòng địa điểm trên thẻ nhiệm vụ.
 *
 * Trước đây chỉ đọc tên thôn, nên nhiệm vụ ghim tay trên bản đồ — không thuộc thôn
 * nào, đúng cái ca mà tính năng ghim sinh ra để phục vụ — hiện "Chưa ghi địa điểm".
 * Người trực nhìn thẻ tưởng chưa ai chỉ chỗ, trong khi toạ độ đã có đủ để vẽ tuyến
 * và tính nhu cầu. Có toạ độ là ĐÃ có địa điểm, chỉ là nó không mang tên.
 *
 * Báo cáo thô của trưởng thôn chưa phân tích thì chưa có cả tên lẫn toạ độ. Lúc đó
 * lấy chính lời kể làm dòng nhận diện: thẻ vẫn nói được "việc này là việc gì", thay
 * vì một câu thông báo thiếu dữ liệu chẳng giúp phân biệt thẻ này với thẻ kia.
 */
export function missionLocationLabel(mission: MissionInboxItem): string {
  const named = mission.location?.trim() || mission.hamletName?.trim();
  if (named) return `Địa điểm: ${named}`;
  if (mission.incidentLat != null && mission.incidentLng != null) {
    return "Địa điểm: Đã ghim trên bản đồ";
  }
  // Lời kể KHÔNG mang nhãn "Địa điểm": nó là lời kể, gắn nhãn đó vào là nói sai
  // hẳn nội dung — người trực đọc lướt sẽ tưởng cả đoạn văn kia là tên một nơi.
  //
  // Lời kể có thể dài cả đoạn; thẻ chỉ có một dòng nên cắt ở đây luôn thay vì để
  // CSS giấu đi — chuỗi ngắn thì trình duyệt khỏi phải dựng cả đoạn rồi mới cắt.
  const reported = mission.reportText?.trim().replace(/\s+/g, " ");
  if (reported) return reported.length > 120 ? `${reported.slice(0, 120)}…` : reported;
  return "";
}

/**
 * Nhiệm vụ đang ở giai đoạn nào — nói đủ để người trực biết việc kế tiếp là gì.
 *
 * `MissionStatus` của backend ĐỨNG YÊN ở DRAFT suốt ba bước đầu: khai số liệu,
 * lập bản tham mưu, lập kế hoạch cứu hộ. Nên thẻ nhiệm vụ trước đây ghi "Bản
 * nháp" cho cả ba — bấm lập kế hoạch xong quay ra vẫn thấy "Bản nháp", không có
 * cách nào biết mình đã làm tới đâu, và người trực bấm lại đúng việc vừa xong.
 *
 * Ba bước đó phân biệt bằng DẤU VẾT còn lại chứ không bằng status: có bản tham
 * mưu chưa, có kế hoạch cứu hộ chưa. Từ lúc phát hành trở đi status mới thật sự
 * chạy, nên phần trong ngoặc đọc thẳng từ nó.
 */
/**
 * Nhiệm vụ đã qua bước duyệt và phát hành chưa.
 *
 * Một chỗ định nghĩa cho cả nhãn giai đoạn lẫn huy hiệu trên thẻ: hai bên tự suy
 * riêng thì sẽ có lúc thẻ ghi "Đã duyệt" mà nhãn bên dưới vẫn nói còn nháp.
 *
 * Huỷ KHÔNG tính là đã phát hành: huỷ được cả khi còn nháp, nên không suy ra được
 * nhiệm vụ đã từng ra tới kho hay chưa.
 */
export function missionIsPublished(mission: MissionInboxItem): boolean {
  return mission.status !== "DRAFT" && mission.status !== "CANCELLED";
}

export function missionStageLabel(mission: MissionInboxItem): string {
  if (mission.status === "CANCELLED") return "Đã huỷ";

  // Hiện trường báo kết quả xong là NHIỆM VỤ ĐÓNG, không còn là một chặng của
  // "đã duyệt và phát hành". Ghi tiếp câu phát hành ở đây thì người trực đọc lướt
  // danh sách vẫn tưởng việc đang chạy và còn phải theo dõi, trong khi không còn
  // ai phải làm gì nữa. `COMPLETED` chỉ được đặt ở đúng một chỗ — bước hiện trường
  // xác nhận đã giao (mission.service.ts `confirmDelivery`) — nên đọc thẳng ra
  // "đã hoàn thành" là đúng, không cần dò thêm dấu vết nào.
  //
  // RETURNED xét TRƯỚC vì nó là mốc sau: xét ngược lại thì nhiệm vụ đã khép sổ
  // vẫn rơi vào nhánh COMPLETED và bước cuối không bao giờ hiện ra ở đâu.
  //
  // Cả hai mốc cuối đều là "đã hoàn thành" — khác nhau ở chỗ hàng đã về hay chưa,
  // nên phần đó nằm trong ngoặc chứ không thay luôn cả câu. Trước đây RETURNED
  // đọc ra "Đã hoàn trả vật tư", một câu không hề nói nhiệm vụ đã giao xong; còn
  // COMPLETED chỉ có "Đã hoàn thành", không ai biết còn mấy cái áo phao ngoài kia.
  if (mission.status === "RETURNED" || mission.status === "COMPLETED") {
    // "Không cần trả" xét TRƯỚC cả RETURNED. Nhiệm vụ chỉ phát mì tôm mà đọc ra
    // "đã trả vật tư" là ghi vào sổ một lượt thu hồi chưa từng xảy ra — đúng lỗi
    // đã gặp: kho bấm xác nhận cho xong, và nhiệm vụ khai đã nhận lại một thứ
    // không ai mang đi.
    //
    // Chỉ nói "không cần trả" khi backend đã khẳng định là KHÔNG. Cờ để trống là
    // chưa biết, mà đoán bừa ở đây là xoá sổ một khoản nợ có thể đang tồn tại.
    if (mission.hasReturnableSupplies === false) return "Đã hoàn thành (không cần trả vật tư)";
    return mission.status === "RETURNED"
      ? "Đã hoàn thành (đã trả vật tư)"
      : "Đã hoàn thành (chưa hoàn vật tư)";
  }

  // Còn nháp: đọc dấu vết, muộn nhất thắng.
  if (!missionIsPublished(mission)) {
    if (mission.actionPlan) return "Đã lập kế hoạch cứu hộ";
    if (mission.hasCoordinationAnalysis) return "Đã lập bản tham mưu";
    return "Bản nháp";
  }

  return `Đã duyệt và phát hành (${publishedStageDetail(mission)})`;
}

/**
 * Phần trong ngoặc của "Đã duyệt và phát hành": việc đang nằm ở ai.
 *
 * Phát hành xong thì nhiệm vụ còn đi qua kho rồi mới tới hiện trường; gộp tất cả
 * vào một chữ "đã phát hành" là giấu mất đúng phần người trực cần biết để gọi
 * điện thúc đúng chỗ.
 */
function publishedStageDetail(mission: MissionInboxItem): string {
  const preparations = mission.warehousePreparations ?? [];
  switch (mission.status) {
    case "PENDING_WAREHOUSE": {
      // Có nhiều kho cùng góp hàng thì "đang đợi kho" chưa đủ: đợi kho nào, còn
      // mấy kho nữa. Đếm ra thì biết ngay còn xa hay sắp xong.
      const done = preparations.filter((item) => item.preparedAt).length;
      if (preparations.length > 0 && done > 0) {
        return `đang đợi kho chuẩn bị và xuất — ${done}/${preparations.length} kho đã xong`;
      }
      return "đang đợi kho chuẩn bị và xuất";
    }
    case "READY":
      // "Đã soạn" chứ không phải "đã xuất": READY chỉ nói mọi kho soạn xong phần
      // của mình, hàng vẫn nằm trên sân kho cho tới khi đội tới ký nhận. Gọi là
      // "đã xuất" thì người trực tưởng hàng đang trên đường tới hiện trường.
      return "kho đã soạn đủ, chờ đội tới lấy";
    case "REJECTED":
      return "lực lượng hiện trường từ chối, chờ điều phối xử lý";
    case "DEFERRED":
      return "tạm hoãn, chờ điều phối sửa rồi gửi lại";
    // Hai trạng thái của luồng cũ: không nhiệm vụ mới nào rơi vào nữa, nhưng dữ
    // liệu lịch sử vẫn còn nên vẫn phải đọc ra được.
    case "PENDING_RESCUE":
      return "chờ lực lượng hiện trường nhận";
    case "RESCUE_CONFIRMED":
      return "lực lượng hiện trường đã nhận";
    default:
      return "đang xử lý";
  }
}

export function missionNeedsAction(
  mission: MissionInboxItem,
  role?: MissionInboxRole | string,
  warehouseId?: string | null,
) {
  if (role === "ADMIN") {
    return ["DRAFT", "REJECTED", "DEFERRED"].includes(mission.status);
  }

  // Lực lượng hiện trường CHỈ ĐỌC: chỉ có MISSION_VIEW + MISSION_FIELD_UPDATE, không đổi
  // trạng thái nhiệm vụ nào. Vì vậy không gắn cờ "Cần xử lý" — họ không có hành động điều
  // phối để thực hiện, chỉ nhận thông tin và gửi cập nhật hiện trường.
  if (role === "RESCUE") {
    return false;
  }

  if (role !== "WAREHOUSE" || mission.status !== "PENDING_WAREHOUSE" || !warehouseId) {
    return false;
  }

  const preparations = mission.warehousePreparations ?? [];
  if (preparations.length === 0) {
    return mission.warehouseId === warehouseId;
  }

  return preparations.some(
    (preparation) => preparation.warehouseId === warehouseId && preparation.preparedAt === null,
  );
}

/**
 * Đường dẫn trang chi tiết theo SỐ HIỆU: /missions/nhiem-vu-98.
 *
 * Đây là dạng chính tắc. `id` là cuid — đúng cho máy nhưng nhìn trên thanh địa
 * chỉ thì không nói lên điều gì, nên người trực mở vài nhiệm vụ là không còn
 * biết tab nào đang là nhiệm vụ nào. Số hiệu vốn là thứ họ gọi cho nhau.
 */
export function missionNumberLink(missionNo: number, fieldUpdateId?: string | null) {
  const normalizedFieldUpdateId = fieldUpdateId?.trim();
  const query = normalizedFieldUpdateId
    ? `?fieldUpdate=${encodeURIComponent(normalizedFieldUpdateId)}`
    : "";
  return `/missions/nhiem-vu-${missionNo}${query}`;
}

/**
 * Số hiệu đọc ra từ slug; slug hỏng thì trả null để trang báo không tìm thấy.
 *
 * Chỉ nhận đúng khuôn "nhiem-vu-<số>". Bắt lỏng bằng cách quét chữ số cuối chuỗi
 * thì "nhiem-vu-98-abc" cũng lọt, và hai đường dẫn khác nhau cùng mở một nhiệm
 * vụ — bấy nhiêu đủ để phần thống kê lượt xem về sau đếm sai.
 */
export function missionNoFromSlug(slug: string): number | null {
  const matched = /^nhiem-vu-(\d+)$/.exec(slug.trim());
  if (!matched) return null;
  const parsed = Number.parseInt(matched[1], 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function missionDeepLink(missionId: string, fieldUpdateId?: string | null) {
  const normalizedId = missionId.trim();
  // Không có id thì về DANH SÁCH nhiệm vụ, không phải form khai vụ mới: người
  // bấm một thông báo hỏng chỉ muốn xem còn nhiệm vụ nào, chứ không muốn bị
  // đặt vào giữa một biểu mẫu trống.
  if (!normalizedId) return "/missions";
  const normalizedFieldUpdateId = fieldUpdateId?.trim();
  const target = normalizedFieldUpdateId
    ? `?fieldUpdate=${encodeURIComponent(normalizedFieldUpdateId)}`
    : "";
  // Trang riêng cho từng nhiệm vụ, không còn là tham số trên tab điều phối: một
  // nhiệm vụ đang chạy kéo theo cả chục khối thông tin, để chung với form khai
  // tình huống mới thì trang dài lê thê mà hai việc chẳng liên quan gì nhau.
  return `/mission/${encodeURIComponent(normalizedId)}${target}`;
}

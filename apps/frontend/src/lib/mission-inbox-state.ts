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
  /** Hiện trường báo không cần lấy gì từ kho — chặng kho được bỏ qua. */
  warehouseStageSkipped?: boolean;
  createdAt: string;
  warehousePreparations?: MissionInboxPreparation[];
  /**
   * Đã lập bản tham mưu chưa — backend đếm snapshot BASELINE rồi trả về cờ này.
   *
   * Không suy ra được từ `requirements`: nhu cầu vật tư tính xong trước bản tham
   * mưu, nên nhiều nhiệm vụ có nhu cầu mà chưa hề tham mưu.
   */
  hasCoordinationAnalysis?: boolean;
  /** Chỉ cần biết CÓ hay KHÔNG; hình dạng kế hoạch là việc của màn hình chi tiết. */
  actionPlan?: unknown;
  /**
   * Sổ tạm giữ của chính nhiệm vụ này — CHỈ trạng thái từng khoản.
   *
   * Đủ để trả lời câu duy nhất danh sách cần hỏi: đóng rồi mà còn nợ vật tư
   * không. Bản ghi cũ (trước khi có sổ tạm giữ) không có trường này.
   */
  supplyHoldings?: { status: string }[];
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
  // Hai chặng mới nằm TRƯỚC lúc phát hành: bản tham mưu đang được hiện trường
  // xem, chưa kho nào nhận lệnh. Gọi chúng là "đã phát hành" thì thẻ nhiệm vụ nói
  // một việc chưa xảy ra, và người trực thôi không rà lại danh sách nữa.
  return !UNPUBLISHED_STATUSES.includes(mission.status) && mission.status !== "CANCELLED";
}

/** Các chặng còn nằm trong tay điều phối và hiện trường, trước khi tới kho. */
const UNPUBLISHED_STATUSES = ["DRAFT", "PENDING_FIELD_DECISION", "FIELD_DECIDED"];

/**
 * Đội còn cầm vật tư của nhiệm vụ này chưa trả về kho.
 *
 * Đọc từ chính các dòng tạm giữ chứ không từ một cột trạng thái riêng: cột
 * denormalized thì hai đường (trả từng phần, chuyển sang nhiệm vụ khác) đều phải
 * nhớ lật nó, và chỉ cần một bên quên là màn hình nói sai.
 *
 * Không có trường (bản ghi cũ, hoặc endpoint chưa trả) thì coi như KHÔNG nợ —
 * đoán ngược lại là gắn cảnh báo cho mọi nhiệm vụ lịch sử.
 */
export function missionSupplyPending(mission: MissionInboxItem): boolean {
  return (mission.supplyHoldings ?? []).some((holding) => holding.status === "HELD");
}

export function missionStageLabel(mission: MissionInboxItem): string {
  if (mission.status === "CANCELLED") return "Đã huỷ";

  // Hiện trường báo kết quả xong là NHIỆM VỤ ĐÓNG, không còn là một chặng của
  // "đã duyệt và phát hành". Ghi tiếp câu phát hành ở đây thì người trực đọc lướt
  // danh sách vẫn tưởng việc đang chạy và còn phải theo dõi, trong khi không còn
  // ai phải làm gì nữa.
  //
  // Nhưng "đã hoàn thành" TRƠ MỘT MÌNH thì lại giấu mất khoản duy nhất còn treo:
  // vật tư tái sử dụng đội chưa chở về kho. Sổ ghi nhiệm vụ xong, tồn kho hiện
  // thiếu đúng số hàng đang nằm trên xe, và chỉ tới đợt kiểm kê sau mới lòi ra.
  // Nên nói luôn trong ngoặc — cả hai vế, để "đã trả" cũng là một câu khẳng định
  // đọc được chứ không phải sự vắng mặt của cảnh báo.
  if (mission.status === "COMPLETED") {
    return missionSupplyPending(mission)
      ? "Đã hoàn thành (chưa trả vật tư)"
      : "Đã hoàn thành (đã trả vật tư)";
  }

  // Chưa phát hành: đọc dấu vết, muộn nhất thắng.
  if (!missionIsPublished(mission)) {
    if (mission.status === "PENDING_FIELD_DECISION") {
      return "Chờ lực lượng hiện trường chốt số cần lấy";
    }
    if (mission.status === "FIELD_DECIDED") {
      return mission.actionPlan
        ? "Hiện trường đã chốt — chờ phát hành"
        : "Hiện trường đã chốt — chờ lập kế hoạch cứu hộ";
    }
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
      // Nhiệm vụ bỏ qua chặng kho thì KHÔNG có gì để soạn và không ai phải tới
      // lấy — nói "chờ đội tới lấy" là chỉ người trực đi thúc một việc không tồn
      // tại, còn thủ kho thì đi tìm một phiếu không có.
      if (mission.warehouseStageSkipped) return "không cần xuất kho, chờ hiện trường báo kết quả";
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
    // FIELD_DECIDED là ĐÚNG lúc điều phối phải bấm lập kế hoạch rồi phát hành.
    // Thiếu nó thì nhiệm vụ rơi khỏi danh sách việc cần làm đúng lúc cần người nhất.
    return ["DRAFT", "FIELD_DECIDED", "REJECTED", "DEFERRED"].includes(mission.status);
  }

  // Lực lượng hiện trường CHỈ ĐỌC: chỉ có MISSION_VIEW + MISSION_FIELD_UPDATE, không đổi
  // trạng thái nhiệm vụ nào. Vì vậy không gắn cờ "Cần xử lý" — họ không có hành động điều
  // phối để thực hiện, chỉ nhận thông tin và gửi cập nhật hiện trường.
  if (role === "RESCUE") {
    // Từ nay họ CÓ một việc trong khâu điều phối: chốt xem từng món phải lấy bao
    // nhiêu từ kho. Ngoài lúc đó thì vẫn chỉ đọc.
    return mission.status === "PENDING_FIELD_DECISION";
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

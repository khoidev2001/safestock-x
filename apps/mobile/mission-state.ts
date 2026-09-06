export type MissionAction = "complete";

export const MISSION_STATUS_LABEL: Record<string, string> = {
  DRAFT: "Nháp",
  PENDING_RESCUE: "Chờ bạn nhận lệnh",
  RESCUE_CONFIRMED: "Đã nhận · chờ kho",
  PENDING_WAREHOUSE: "Kho đang chuẩn bị",
  READY: "Kho đã sẵn sàng · chờ giao",
  COMPLETED: "Hoàn thành",
  REJECTED: "Đã từ chối",
  DEFERRED: "Tạm hoãn",
  CANCELLED: "Đã huỷ",
};

/**
 * Việc lực lượng hiện trường được làm với một lệnh, theo đúng trạng thái của nó.
 *
 * Xã phát hành phương án thẳng tới kho, nên hiện trường không tham gia bước phát
 * hành. Vật tư đã sẵn ở kho thì việc còn lại là đi giao và báo kết quả thực tế.
 *
 * Chỉ hiện nút khi thao tác thực sự đi được: nút bấm vào là báo lỗi còn tệ hơn
 * không có nút, nhất là với người đang đứng ngoài mưa.
 */
export function fieldForceActionsFor(status: string): MissionAction[] {
  return status === "READY" ? ["complete"] : [];
}

/** Lệnh còn đang chạy thì xếp lên trước; việc đã đóng đẩy xuống dưới. */
const CLOSED_STATUSES = new Set(["COMPLETED", "REJECTED", "CANCELLED"]);

export function isMissionOpen(status: string): boolean {
  return !CLOSED_STATUSES.has(status);
}

export interface SortableMission {
  id?: string;
  status: string;
  createdAt?: string | null;
}

/**
 * Xếp danh sách lệnh: việc cần làm ngay lên đầu, rồi tới việc đang chạy, cuối
 * cùng là việc đã đóng. Trong cùng nhóm thì mới nhất trước.
 *
 * CHÚ Ý: đây KHÔNG phải xếp theo thời gian. Một nhiệm vụ vừa nhận nhưng kho chưa
 * xuất hàng thì chưa có việc gì cho đội cứu hộ làm, nên nó nằm dưới nhiệm vụ cũ
 * hơn đang chờ người đi lấy. Nhìn vào tưởng danh sách xếp sai, nhưng đổi sang xếp
 * thuần theo giờ thì việc đang cần người lại trôi xuống dưới đống việc chưa tới lượt.
 *
 * `pinnedMissionId` — nhiệm vụ VỪA XEM — đứng trên tất cả.
 *
 * Người trực mở một nhiệm vụ, thoát ra làm việc khác rồi quay lại tìm đúng nó.
 * Không ghim thì họ phải cuộn đi tìm giữa sáu chục thẻ trông na ná nhau, mà thẻ
 * họ cần lại là thẻ vừa rời khỏi vài giây trước. Chỉ ghim MỘT: ghim mọi thẻ đã
 * xem thì sau nửa buổi trực, thứ tự danh sách thành lịch sử duyệt web chứ không
 * còn nói được việc nào cần làm trước.
 */
export function sortMissionsForFieldForce<T extends SortableMission>(
  missions: T[],
  options?: { pinnedMissionId?: string | null },
): T[] {
  const pinnedId = options?.pinnedMissionId ?? null;
  const rank = (mission: T): number => {
    if (pinnedId && mission.id === pinnedId) return -1;
    if (fieldForceActionsFor(mission.status).length > 0) return 0;
    return isMissionOpen(mission.status) ? 1 : 2;
  };
  return [...missions].sort((left, right) => {
    const byRank = rank(left) - rank(right);
    if (byRank !== 0) return byRank;
    const leftAt = Date.parse(left.createdAt ?? "");
    const rightAt = Date.parse(right.createdAt ?? "");
    if (!Number.isFinite(leftAt) || !Number.isFinite(rightAt)) return 0;
    return rightAt - leftAt;
  });
}

export function missionStatusLabel(status: string): string {
  return MISSION_STATUS_LABEL[status] ?? status;
}

/**
 * Kết quả giao, viết như người trực nói với nhau.
 *
 * Để chung một chỗ với nhãn trạng thái vì hai màn hình cùng đọc: danh sách
 * nhiệm vụ và biên nhận trong màn chi tiết. Mỗi bên giữ một bản là hai màn hình
 * gọi cùng một kết quả bằng hai cái tên.
 */
export const DELIVERY_OUTCOME_LABEL: Record<string, string> = {
  DELIVERED: "Giao đủ",
  PARTIAL: "Giao một phần",
  FAILED: "Không giao được",
};

export function deliveryOutcomeLabel(outcome: string | null | undefined): string {
  if (!outcome) return "Chưa ghi kết quả";
  return DELIVERY_OUTCOME_LABEL[outcome] ?? outcome;
}

/** Chặng của nhiệm vụ theo góc nhìn người đi giao: chờ kho → tới lấy → đã cầm hàng. */
export type MissionPickupStage = "WAITING_WAREHOUSE" | "READY_FOR_PICKUP" | "PICKED_UP";

/**
 * Người đi giao đang ở chặng nào — ba câu trả lời, ba việc khác hẳn nhau.
 *
 * Trạng thái nhiệm vụ một mình KHÔNG đủ. `READY` chỉ nói "kho đã xuất hàng ra
 * khỏi sổ", nó không nói hàng đã sang tay ai. Giữa hai mốc đó là quãng người đi
 * giao phải chạy tới kho — và báo "đã giao xong" trong quãng đó là ký vào một
 * việc chưa xảy ra.
 *
 * Nên mốc mở ô báo cáo là CHỮ KÝ NHẬN của kho, không phải lúc kho xuất.
 *
 * Nhiệm vụ cũ không có yêu cầu theo từng vật tư (dữ liệu trước khi tách phiếu)
 * thì không có chữ ký nào để chờ: coi như đã cầm hàng, nếu không chúng kẹt lại
 * vĩnh viễn ở một chặng không bao giờ qua được.
 */
export function missionPickupStage(
  status: string,
  requests?: { status: string }[],
): MissionPickupStage {
  if (!fieldForceActionsFor(status).includes("complete")) return "WAITING_WAREHOUSE";
  if (!requests || requests.length === 0) return "PICKED_UP";
  return requests.every((request) => request.status === "PICKED_UP")
    ? "PICKED_UP"
    : "READY_FOR_PICKUP";
}

/**
 * Chặng công việc của một nhiệm vụ, chung cho cả hai bên nhìn vào nó.
 *
 * Một chuỗi việc, hai người theo dõi: kho soạn hàng rồi giao tay, đội cứu hộ
 * nhận hàng rồi đi giao. Cùng một mốc nhưng mỗi bên phải làm một việc khác nhau,
 * nên chặng tính CHUNG còn chữ hiện lên thì tính theo vai.
 */
export type MissionWorkStage =
  "PENDING_ACCEPT" | "PENDING_PREPARE" | "PREPARED" | "PICKED_UP" | "COMPLETED";

/**
 * Nhiệm vụ đang nằm ở mốc nào, tính từ các phiếu vật tư của nó.
 *
 * Lấy phiếu CHẬM NHẤT làm mốc, không phải phiếu nhanh nhất: một nhiệm vụ cần
 * năm mã hàng mà mới tiếp nhận bốn thì việc còn lại vẫn là tiếp nhận. Báo theo
 * phiếu nhanh nhất là màn hình nói xong trong khi kho còn một mã chưa ai đụng.
 *
 * Nhiệm vụ không có phiếu nào (dữ liệu trước khi tách phiếu theo vật tư) thì
 * không có chữ ký nào để chờ — coi như hàng đã sang tay, giống cách
 * `missionPickupStage` xử lý, nếu không chúng kẹt vĩnh viễn ở mốc đầu tiên.
 */
export function missionWorkStage(
  missionStatus: string,
  requests: { status: string }[] | null | undefined,
): MissionWorkStage {
  if (missionStatus === "COMPLETED") return "COMPLETED";
  if (!requests || requests.length === 0) return "PICKED_UP";
  if (requests.some((request) => request.status === "PENDING")) return "PENDING_ACCEPT";
  if (requests.some((request) => request.status === "ACCEPTED")) return "PENDING_PREPARE";
  if (requests.some((request) => request.status === "PREPARED")) return "PREPARED";
  return "PICKED_UP";
}

/**
 * Chữ hiện trên thẻ nhiệm vụ, viết theo VIỆC CỦA NGƯỜI ĐANG ĐỌC.
 *
 * Cùng mốc "kho đã xuất hàng": trưởng thôn đọc ra "chờ đội cứu hộ lấy" (xong
 * phần mình, đừng đụng vào nữa), còn đội cứu hộ đọc ra "cần tới lấy" (tới lượt
 * mình, đi ngay). Một câu chữ dùng chung cho cả hai thì luôn sai với một bên.
 *
 * KHÔNG dùng mức nguy hiểm ở đây. Thẻ trước đây gắn nhãn kiểu "CHƯA NGUY CẤP",
 * đọc như xếp hạng mạng người; nhiệm vụ nào cũng phải làm, khác nhau là đang
 * nằm ở mốc nào.
 */
const WAREHOUSE_STAGE_LABEL: Record<MissionWorkStage, string> = {
  PENDING_ACCEPT: "Cần tiếp nhận",
  PENDING_PREPARE: "Cần xuất kho",
  PREPARED: "Chờ đội cứu hộ lấy",
  PICKED_UP: "Đội cứu hộ đã lấy",
  COMPLETED: "Đã hoàn thành",
};

const FIELD_FORCE_STAGE_LABEL: Record<MissionWorkStage, string> = {
  PENDING_ACCEPT: "Đợi tiếp nhận",
  PENDING_PREPARE: "Đợi xuất kho",
  PREPARED: "Cần tới lấy",
  PICKED_UP: "Cần báo cáo kết quả",
  COMPLETED: "Đã hoàn thành",
};

export function missionStageLabel(role: string, stage: MissionWorkStage): string {
  return role === "RESCUE" ? FIELD_FORCE_STAGE_LABEL[stage] : WAREHOUSE_STAGE_LABEL[stage];
}

/**
 * Mốc này có đang chờ CHÍNH người đọc làm gì không.
 *
 * Dùng để tô màu: việc của mình thì bật lên, việc của người khác thì để nguội.
 * Không có nó thì năm dòng chữ nhìn giống hệt nhau và người trực phải đọc từng
 * chữ mới biết thẻ nào tới lượt mình.
 */
export function missionStageNeedsAction(role: string, stage: MissionWorkStage): boolean {
  if (role === "RESCUE") return stage === "PREPARED" || stage === "PICKED_UP";
  return stage === "PENDING_ACCEPT" || stage === "PENDING_PREPARE";
}

/**
 * Chặng của nhiệm vụ NHÌN TỪ VAI ĐANG ĐĂNG NHẬP.
 *
 * Đội cứu hộ đọc chặng chung của cả nhiệm vụ: họ chờ TOÀN BỘ kho xuất xong mới đi
 * lấy, nên một kho còn nợ là chặng của họ vẫn chưa tới.
 *
 * Trưởng thôn thì chỉ được tính theo PHIẾU CỦA CHÍNH KHO MÌNH. Một nhiệm vụ lớn
 * huy động năm kho; lấy chung cả năm thì kho đã xuất xong phần của mình vẫn thấy
 * "Cần xuất kho" chỉ vì kho hàng xóm chưa làm — họ đi kiểm lại kệ, không thấy gì
 * để xuất, rồi mất niềm tin vào cả dòng chữ đó.
 *
 * `status` vẫn được truyền vào cho cả hai vai: hiện trường báo giao xong là nhiệm
 * vụ đóng, và trưởng thôn phải đọc ra "Đã hoàn thành" chứ không dừng ở phiếu cuối
 * cùng của kho mình.
 */
export function missionStageForViewer(
  mission: {
    status: string;
    warehouseRequests?: { status: string; warehouseId: string }[] | null;
  },
  role: string,
  warehouseId?: string | null,
): MissionWorkStage {
  if (role !== "WAREHOUSE" || !warehouseId) {
    return missionWorkStage(mission.status, mission.warehouseRequests);
  }
  const own = (mission.warehouseRequests ?? []).filter(
    (request) => request.warehouseId === warehouseId,
  );
  // Không có phiếu nào của kho mình thì không có chữ ký nào để chờ — cùng cách
  // `missionWorkStage` xử lý nhiệm vụ chưa tách phiếu, nếu không kho sẽ kẹt vĩnh
  // viễn ở mốc "Cần tiếp nhận" cho một việc chẳng liên quan tới họ.
  return missionWorkStage(mission.status, own.length > 0 ? own : null);
}

/**
 * Lọc danh sách nhiệm vụ theo SỐ HIỆU.
 *
 * Cùng quy ước với ô tìm ở hộp thông báo: chỉ giữ chữ số trong từ khoá ("số 193",
 * "#193" và "193" là một ý), và so theo kiểu CHỨA để người gõ dở chừng vẫn thấy
 * danh sách thu hẹp dần.
 *
 * Khác một chỗ: ở đây KHÔNG dò tiêu đề như bên thông báo. Nhiệm vụ luôn có số
 * hiệu thật, nên không cần đoán từ chữ — mà đoán thì "120 chai" sẽ khớp "12".
 */
export function filterMissionsByNo<T extends { missionNo?: number | null }>(
  missions: T[],
  query: string,
): T[] {
  const digits = query.replace(/\D/g, "");
  if (!digits) return missions;
  return missions.filter(
    (mission) => mission.missionNo != null && String(mission.missionNo).includes(digits),
  );
}

/**
 * Nơi xảy ra sự việc, MỘT quy tắc cho mọi màn hình.
 *
 * Trước đây mỗi chỗ đọc một kiểu: bản đồ lấy `hamletName` rồi mới tới `location`,
 * còn thẻ đầu màn chi tiết chỉ đọc `location`. Cùng một nhiệm vụ mà thẻ ghi
 * "Long Châu" trong khi bản đồ ghi tên khác là thứ khiến người trực nghi ngờ cả
 * hai. Danh sách thì không hiện nơi nào cả — mở ra mới biết đi đâu.
 *
 * Tên thôn đã xác minh đứng TRƯỚC: nó là tên cơ quan điều phối chốt lúc lập
 * phương án, còn `location` là lời người báo viết ra, có thể chỉ là "gần cầu".
 */
export function missionPlaceLabel(mission: {
  hamletName?: string | null;
  location?: string | null;
}): string | null {
  return mission.hamletName?.trim() || mission.location?.trim() || null;
}

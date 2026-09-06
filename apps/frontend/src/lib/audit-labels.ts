/**
 * Dịch mã kỹ thuật của nhật ký hậu kiểm sang tiếng Việt.
 *
 * Bảng `AuditLog` lưu `action` và `entity` dưới dạng mã máy (`INVENTORY_EXPORT`,
 * `MissionAnalysisSnapshot`) vì đó là thứ ổn định để truy vấn và lọc. Trước đây màn
 * hình chỉ hạ chữ thường rồi bỏ gạch dưới, nên người trực đọc ra "Inventory Export"
 * và "Mission Analysis Saved" — tiếng Anh nguyên xi giữa một trang tiếng Việt.
 *
 * Đây là NHẬT KÝ HẬU KIỂM: nó tồn tại để về sau đối chiếu ai đã làm gì với lô hàng
 * nào. Người phải đọc nó là cán bộ xã, không phải lập trình viên — một dòng họ không
 * đọc được thì cả bản ghi coi như không có.
 *
 * Tách khỏi component để khoá bằng test: thêm nghiệp vụ mới ở backend mà quên dịch
 * thì có chỗ để phát hiện, thay vì lặng lẽ rơi ra tiếng Anh trên màn hình.
 */

/**
 * Việc đã làm.
 *
 * Viết theo lối NGƯỜI TA KỂ LẠI, không dịch từng chữ khỏi mã: `INVENTORY_EXPORT`
 * dịch sát là "xuất kho hàng tồn", nhưng thứ vừa xảy ra là "xuất vật tư khỏi kho".
 *
 * Thêm hành động mới ở backend thì thêm một dòng vào đây; danh sách đầy đủ nằm ở
 * các lệnh `auditLog.create` và `audit.record` bên `apps/backend/src`.
 */
export const AUDIT_ACTION_LABELS: Record<string, string> = {
  // Kho — sinh từ `INVENTORY_${TransactionType}` trong inventory.service.
  INVENTORY_IMPORT: "Nhập vật tư vào kho",
  INVENTORY_EXPORT: "Xuất vật tư khỏi kho",
  INVENTORY_TRANSFER: "Điều chuyển giữa hai kho",
  INVENTORY_RETURN: "Nhận lại vật tư trả về",
  INVENTORY_ADJUST: "Điều chỉnh số lượng tồn",
  INVENTORY_COUNT: "Ghi nhận kiểm đếm",
  INVENTORY_CONDITION: "Đổi tình trạng vật tư",
  INVENTORY_RECONCILE: "Áp kiểm đếm vào tồn kho",
  INVENTORY_CREATE_ITEM: "Thêm mặt hàng mới",
  INVENTORY_RECEIVE_BATCH: "Tiếp nhận lô hàng mới",
  INVENTORY_LOAN_OUT_INTERXA: "Cho xã khác mượn vật tư",
  INVENTORY_LOAN_IN: "Mượn vật tư từ xã khác",

  // Mượn - trả trong xã.
  LOAN_BORROW: "Lập phiếu mượn vật tư",
  LOAN_RETURN: "Ghi nhận trả vật tư",

  // Báo cáo kiểm kê tháng của kho thôn.
  REPORT_SUBMIT: "Trưởng thôn gửi báo cáo tháng",
  REPORT_APPROVE: "Duyệt báo cáo tháng",
  REPORT_REJECT: "Từ chối báo cáo tháng",

  // Cấu hình bản đồ và danh mục thôn.
  WAREHOUSE_LOCATION_UPDATE: "Cập nhật vị trí kho",
  HAMLET_CREATE: "Thêm thôn mới",
  HAMLET_UPDATE: "Cập nhật thông tin thôn",

  // Nhiệm vụ cứu hộ.
  MISSION_ANALYSIS_SAVED: "Lưu bản tham mưu nhiệm vụ",
  MISSION_WHAT_IF_SAVED: "Lưu kịch bản giả định",
  MISSION_FIELD_UPDATE_RECORDED: "Ghi nhận cập nhật từ hiện trường",
  MISSION_FIELD_UPDATE_INTENT_SAVED: "Lưu đề xuất từ hiện trường",

  // Biên nhận chống ghi trùng khi mạng chập chờn — hiếm khi người dùng phải đọc,
  // nhưng vẫn phải đọc được nếu nó hiện ra.
  MUTATION_RECEIPT: "Biên nhận thao tác (chống ghi trùng)",

  // Ghi một lần lúc dựng dữ liệu khởi tạo (prisma/seed.ts).
  SEED_STANDARD_DATASET: "Nạp bộ dữ liệu chuẩn ban đầu",
};

/**
 * Loại bản ghi bị tác động.
 *
 * Cùng bảng dùng cho cả nhãn dòng lẫn nút lọc phía trên, để hai chỗ không gọi cùng
 * một thứ bằng hai cái tên.
 */
export const AUDIT_ENTITY_LABELS: Record<string, string> = {
  ItemBatch: "Lô vật tư",
  Item: "Mặt hàng",
  LoanRecord: "Phiếu mượn",
  MonthlyStockReport: "Báo cáo tháng",
  Warehouse: "Kho",
  Hamlet: "Thôn",
  Mission: "Nhiệm vụ",
  Incident: "Sự cố",
  MissionAnalysisSnapshot: "Bản tham mưu nhiệm vụ",
  MissionFieldUpdate: "Cập nhật hiện trường",
  Organization: "Đơn vị",
};

/** Trạng thái báo cáo tháng, hiện ở cặp "Trước/sau" của dòng nhật ký. */
export const AUDIT_STATUS_LABELS: Record<string, string> = {
  PENDING: "Chờ duyệt",
  APPROVED: "Đã duyệt",
  REJECTED: "Đã từ chối",
};

/**
 * Mã lạ thì nói thẳng là chưa đặt tên, KÈM mã gốc.
 *
 * Không bịa ra một câu tiếng Việt nghe xuôi tai từ mã máy: đoán sai nghĩa của một
 * dòng hậu kiểm còn tệ hơn thừa nhận là chưa dịch. Giữ mã gốc để người báo lỗi có
 * thứ cụ thể mà chỉ vào, và để tra ngược ra chỗ sinh ra nó trong mã nguồn.
 */
export function auditActionLabel(action: string): string {
  return AUDIT_ACTION_LABELS[action] ?? `Thao tác chưa đặt tên (${action})`;
}

export function auditEntityLabel(entity: string): string {
  return AUDIT_ENTITY_LABELS[entity] ?? `Loại bản ghi khác (${entity})`;
}

/** Trạng thái lạ thì giữ nguyên mã — vẫn hơn là để trống một vế của "Trước/sau". */
export function auditStatusLabel(status: string): string {
  return AUDIT_STATUS_LABELS[status] ?? status;
}

/**
 * Câu "Lý do" của những bản ghi ĐÃ NẰM TRONG DB từ trước.
 *
 * Backend sinh câu này rồi lưu thẳng vào `metadata.reason`, nên sửa mã nguồn chỉ ăn
 * vào bản ghi mới — hơn một trăm dòng cũ vẫn đọc ra "Lưu snapshot phân tích…".
 *
 * Dịch LÚC HIỂN THỊ chứ không đi sửa dữ liệu cũ. Nhật ký hậu kiểm có giá trị chính
 * ở chỗ không ai sửa lại được nó; chạy một lệnh UPDATE lên trăm dòng lịch sử để đổi
 * cách hành văn là phá đúng thứ khiến nó đáng tin, dù nội dung sự việc không đổi.
 * Bản ghi trên đĩa giữ nguyên, chỉ màn hình đọc nó ra bằng tiếng Việt.
 *
 * Bảng này CHỈ để dọn nợ cũ. Câu mới đã là tiếng Việt sẵn, không thêm dòng nào nữa.
 */
const LEGACY_REASONS: Record<string, string> = {
  "Lưu snapshot phân tích để truy vết phương án do con người xem xét":
    "Lưu bản chụp phân tích để truy vết phương án do con người xem xét",
  "AI gắn nhãn evidence hiện trường để ADMIN xem xét":
    "AI gắn nhãn bằng chứng hiện trường để ADMIN xem xét",
};

/** Câu lý do đọc ra màn hình; bản ghi cũ được dịch tại chỗ, bản mới giữ nguyên. */
export function auditReasonLabel(reason: string): string {
  return LEGACY_REASONS[reason.trim()] ?? reason;
}

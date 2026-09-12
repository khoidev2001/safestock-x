import { StyleSheet } from "react-native";

/** Bảng màu light mode: nền sáng, tương phản cao và nhất quán với nhận diện xanh/cam. */
export const c = {
  bg: "#FFFFFF",
  surface: "#FFFFFF",
  surfaceAlt: "#EEF3F8",
  border: "#D9E2EC",
  text: "#102A43",
  muted: "#62748A",
  primary: "#0B5FC6",
  primarySoft: "#E8F1FF",
  amber: "#EA7A12",
  amberSoft: "#FFF1E5",
  green: "#15803D",
  red: "#DC2626",
};

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
    backgroundColor: c.surface,
  },
  title: { color: c.text, fontSize: 20, fontWeight: "700" },
  subtitle: { color: c.muted, fontSize: 13, marginTop: 2 },

  // Connection pill
  pill: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  pillText: { color: c.muted, fontSize: 12, fontWeight: "600" },

  // Đăng nhập
  loginContainer: {
    flex: 1,
    width: "100%",
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 28,
  },
  brandLogo: { width: "100%", height: 168, marginBottom: 18 },
  restoreLogo: { width: 252, height: 142, marginBottom: 18 },
  loginCard: {
    width: "100%",
    backgroundColor: c.surface,
    borderColor: c.border,
    borderWidth: 1,
    borderRadius: 20,
    padding: 20,
    shadowColor: "#17324D",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 3,
  },
  label: {
    color: c.text,
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 6,
    alignSelf: "flex-start",
  },
  input: {
    width: "100%",
    backgroundColor: c.surfaceAlt,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 12,
    color: c.text,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    marginBottom: 18,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
    backgroundColor: c.surfaceAlt,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 12,
  },
  searchInput: { flex: 1, color: c.text, fontSize: 15, paddingVertical: 10 },
  button: {
    width: "100%",
    backgroundColor: c.primary,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: "center",
  },
  buttonText: { color: "#FFFFFF", fontSize: 15, fontWeight: "800" },
  errorText: { color: c.red, fontSize: 13, marginBottom: 12, textAlign: "center" },

  // ===== Thẻ nhiệm vụ (nổi bật) =====
  // Card có sọc màu nguy hiểm bên trái; bố cục nhấn: loại thiên tai · mức nguy hiểm · số người.
  missionCard: {
    flexDirection: "row",
    backgroundColor: c.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: c.border,
    marginBottom: 12,
    overflow: "hidden",
    shadowColor: "#17324D",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  missionCardNew: { borderColor: c.amber, borderWidth: 1.5 },
  stripe: { width: 6 },
  missionBody: { flex: 1, padding: 14 },

  // Hàng trên: icon + số hiệu nhiệm vụ (trái) · số người gặp nạn (phải)
  disasterRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  disasterIcon: { fontSize: 26 },
  disasterName: { color: c.text, fontSize: 18, fontWeight: "800", flex: 1 },

  // Nền đỏ đặc, chữ trắng: đây là con số quy mô của việc, phải đọc được từ xa
  // trong lúc liếc qua danh sách chứ không phải đọc kỹ mới thấy.
  peopleBadge: {
    backgroundColor: c.red,
    flexShrink: 0,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  peopleBadgeText: { color: "#FFFFFF", fontSize: 12, fontWeight: "900" },
  stageRow: { marginTop: 12, gap: 2 },
  /** Mức nguy trên thẻ danh sách — cùng chữ, cùng màu với thẻ đầu màn chi tiết. */
  cardDanger: { fontSize: 12, fontWeight: "900", letterSpacing: 0.8, marginTop: 8 },
  cardPlace: { color: c.muted, fontSize: 13, fontWeight: "600", marginTop: 4 },
  stageText: { color: c.text, fontSize: 24, fontWeight: "900", lineHeight: 30 },
  stageDisaster: { color: c.muted, fontSize: 14, fontWeight: "600" },

  // Hàng dưới: thời gian (trái) · hành động (phải)
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: c.border,
  },
  metaTime: { color: c.text, fontSize: 14, fontWeight: "700" },
  metaHint: { color: c.amber, fontSize: 13, fontWeight: "700" },

  newBadge: { backgroundColor: c.amber, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  newBadgeText: { color: "#0f172a", fontSize: 10, fontWeight: "800" },
  /** Nhãn "vừa xem": xám nhạt, KHÔNG tranh chỗ với nhãn MỚI vốn màu nổi. */
  viewedBadge: {
    backgroundColor: c.surfaceAlt,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  viewedBadgeText: { color: c.muted, fontSize: 10, fontWeight: "900", letterSpacing: 0.5 },

  // ===== Thẻ thông báo thường (không gắn nhiệm vụ) =====
  infoCard: {
    flexDirection: "row",
    gap: 12,
    backgroundColor: c.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: c.border,
    padding: 14,
    marginBottom: 12,
    shadowColor: "#17324D",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 1,
  },
  infoCardNew: { borderColor: c.amber, borderWidth: 1.5 },
  infoIcon: { fontSize: 22 },
  infoTitle: { color: c.text, fontSize: 15, fontWeight: "700", flex: 1 },
  // Số hiệu nhiệm vụ trên thẻ thông báo: nhỏ và mờ hơn tiêu đề vì nó là nhãn
  // định danh, không phải nội dung — nhưng vẫn phải đọc được trước khi đọc tiêu đề.
  infoMissionNo: { color: c.muted, fontSize: 11, fontWeight: "800", marginBottom: 2 },
  infoBody: { color: c.muted, fontSize: 14, lineHeight: 20, marginTop: 4 },
  infoTime: { color: c.muted, fontSize: 12, marginTop: 8 },

  // States
  skeleton: {
    height: 120,
    backgroundColor: c.surface,
    borderRadius: 14,
    marginBottom: 12,
    opacity: 0.6,
  },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyTitle: { color: c.text, fontSize: 16, fontWeight: "700", marginBottom: 4 },
  emptyText: { color: c.muted, fontSize: 14, textAlign: "center" },
  linkText: { color: c.amber, fontSize: 14, fontWeight: "700", marginTop: 12 },

  // ===== Chi tiết nhiệm vụ =====
  backLink: { color: c.amber, fontSize: 14, fontWeight: "700" },
  detailScroll: { padding: 16, paddingBottom: 32 },

  // Hero: banner nguy hiểm + loại thiên tai + số người (thứ bậc rõ ràng)
  hero: {
    borderRadius: 16,
    borderWidth: 1.5,
    padding: 18,
    marginBottom: 16,
  },
  /** Việc phải làm theo vai — cùng câu chữ với `stageText` của thẻ danh sách. */
  heroStage: { color: c.text, fontSize: 20, fontWeight: "900", marginTop: 6 },
  heroDisaster: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 12 },
  heroIcon: { fontSize: 34 },
  heroDisasterName: { color: c.text, fontSize: 24, fontWeight: "800" },
  /**
   * Nhãn mức nguy đứng cạnh tên thiên tai.
   *
   * Viền chứ không nền đặc: thẻ đã có nền màu theo mức nguy rồi, thêm một mảng
   * đặc nữa là hai khối màu chồng lên nhau, mà nhãn này chỉ để ĐỌC ĐƯỢC mức nguy
   * bằng chữ chứ không phải để tranh chú ý với dòng việc phải làm.
   */
  heroDangerTag: {
    borderWidth: 1.5,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  heroDangerTagText: { fontSize: 11, fontWeight: "900", letterSpacing: 0.5 },
  heroLocation: { color: c.muted, fontSize: 14, marginTop: 6 },

  heroPeopleRow: { flexDirection: "row", alignItems: "flex-end", gap: 10, marginTop: 16 },
  heroPeopleNumber: { color: c.text, fontSize: 56, fontWeight: "900", lineHeight: 58 },
  heroPeopleUnit: { color: c.muted, fontSize: 16, fontWeight: "600", marginBottom: 10 },

  // Hàng thông tin phụ (thời gian nhận · thời lượng · đáp ứng)
  factRow: { flexDirection: "row", gap: 10, marginBottom: 18 },
  factBox: {
    flex: 1,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  factLabel: { color: c.muted, fontSize: 12, fontWeight: "600" },
  factValue: { color: c.text, fontSize: 16, fontWeight: "800", marginTop: 4 },

  sectionTitle: { color: c.text, fontSize: 15, fontWeight: "700", marginBottom: 8, marginTop: 4 },

  // ===== Vật tư (thẻ trực quan) =====
  suppliesHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
  },
  shortSummary: {
    backgroundColor: "rgba(239,68,68,0.16)",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 8,
  },
  shortSummaryText: { color: "#B42318", fontSize: 12, fontWeight: "800" },
  fullSummary: {
    backgroundColor: "rgba(34,197,94,0.16)",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 8,
  },
  fullSummaryText: { color: "#167A3D", fontSize: 12, fontWeight: "800" },

  supplyCard: {
    flexDirection: "row",
    gap: 12,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
    borderLeftWidth: 4,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  supplyIconBox: {
    width: 52,
    height: 52,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  supplyIcon: { fontSize: 28 },
  supplyMain: { flex: 1, justifyContent: "center" },
  supplyTopRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  supplyName: { color: c.text, fontSize: 15, fontWeight: "700", flex: 1 },
  supplyGroup: { color: c.muted, fontSize: 12, fontWeight: "600", marginTop: 2, marginBottom: 8 },

  /**
   * Nhãn đủ/thiếu là CHỮ, không phải khối màu.
   *
   * Trước đây nó là một viên nền đặc màu nằm cạnh tên vật tư. Trong một danh
   * sách chục dòng thì chục viên màu ấy tranh chú ý với chính con số bên dưới —
   * mà con số mới là thứ người đứng bốc hàng cần đọc. Màu chữ nói đủ điều cần
   * nói: xanh lá là đủ, đỏ là còn thiếu.
   */
  supplyStatusText: { fontSize: 12, fontWeight: "900" },

  supplyBarTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: c.surfaceAlt,
    overflow: "hidden",
  },
  supplyBarFill: { height: 8, borderRadius: 4 },

  supplyQtyRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
  },
  supplyQtyStrong: { color: c.text, fontSize: 18, fontWeight: "900" },
  supplyQtyMuted: { color: c.muted, fontSize: 13, fontWeight: "600" },
  supplyShort: { color: "#B42318", fontSize: 13, fontWeight: "800" },

  // Status badge
  statusBadge: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, alignItems: "center" },
  statusText: { fontSize: 13, fontWeight: "700" },

  // Action buttons
  actionRow: { flexDirection: "row", gap: 12, marginTop: 20 },
  btnAccept: {
    flex: 1,
    backgroundColor: c.green,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  btnReject: {
    flex: 1,
    backgroundColor: "transparent",
    borderWidth: 1.5,
    borderColor: c.red,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  btnAcceptText: { color: "#052e16", fontSize: 15, fontWeight: "800" },
  btnRejectText: { color: c.red, fontSize: 15, fontWeight: "800" },

  // Reason input block
  reasonBox: {
    marginTop: 20,
    backgroundColor: c.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: c.red,
    padding: 14,
  },
  reasonTitle: { color: c.text, fontSize: 15, fontWeight: "700", marginBottom: 10 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  reasonChip: {
    backgroundColor: c.surfaceAlt,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  reasonChipActive: { backgroundColor: c.amber },
  reasonChipText: { color: c.text, fontSize: 13, fontWeight: "600" },
  reasonChipTextActive: { color: "#0f172a", fontSize: 13, fontWeight: "700" },
  reasonInput: {
    backgroundColor: c.surfaceAlt,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 10,
    color: c.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    minHeight: 72,
    textAlignVertical: "top",
    marginBottom: 12,
  },
  actionButton: {
    backgroundColor: c.amber,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    alignItems: "center",
  },
  actionButtonText: { color: "#0f172a", fontSize: 13, fontWeight: "800" },

  // ===== Màn báo cáo tình huống (kho tại chỗ + lực lượng hiện trường) =====
  reportScroll: { padding: 16, paddingBottom: 32 },
  reportIntro: { color: c.muted, fontSize: 14, lineHeight: 20, marginBottom: 16 },
  // Ô mô tả tình huống — cao hơn reasonInput, để gõ dài.
  reportInput: {
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 12,
    color: c.text,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    minHeight: 140,
    textAlignVertical: "top",
    marginBottom: 12,
  },
  // Nút ghi âm (idle) — viền amber; khi đang ghi chuyển sang nền đỏ.
  micButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1.5,
    borderColor: c.amber,
    borderRadius: 10,
    paddingVertical: 12,
    marginBottom: 12,
  },
  micButtonRecording: { backgroundColor: c.red, borderColor: c.red },
  micButtonText: { color: c.amber, fontSize: 15, fontWeight: "700" },
  micButtonTextRecording: { color: c.text, fontSize: 15, fontWeight: "700" },
  micHint: { color: c.muted, fontSize: 12, marginBottom: 16, textAlign: "center" },
  /**
   * Nút ghi âm ĐÍNH KÈM: viền xanh, khác hẳn nút nhận dạng viền cam ngay trên.
   *
   * Hai nút micro nằm cạnh nhau mà cùng màu thì người dùng đọc thành hai cách
   * bấm cho cùng một việc, rồi bấm nhầm — mà bấm nhầm ở đây là báo cáo gửi đi
   * không có tiếng nói nào kèm theo.
   */
  attachButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1.5,
    borderColor: c.primary,
    borderRadius: 10,
    paddingVertical: 12,
    marginBottom: 8,
  },
  attachButtonText: { color: c.primary, fontSize: 15, fontWeight: "700" },
  attachedRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: c.green,
    backgroundColor: "rgba(34,197,94,0.12)",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 16,
  },
  attachedText: { color: c.text, fontSize: 13, fontWeight: "700" },
  attachedRemove: { color: c.red, fontSize: 13, fontWeight: "700" },
  voiceError: { color: c.red, fontSize: 13, marginBottom: 12, textAlign: "center" },
  // Xác nhận gửi thành công.
  successBox: {
    backgroundColor: "rgba(34,197,94,0.16)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: c.green,
    padding: 16,
    marginBottom: 16,
  },
  successTitle: { color: "#167A3D", fontSize: 16, fontWeight: "800", marginBottom: 4 },
  successText: { color: c.text, fontSize: 14, lineHeight: 20 },
  reportHistorySection: {
    marginTop: 24,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: c.border,
  },
  reportHistoryHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  reportHistoryTitle: { color: c.text, fontSize: 17, fontWeight: "800" },
  reportHistoryRefresh: { color: c.amber, fontSize: 13, fontWeight: "700" },
  reportHistoryCard: {
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  reportHistoryCardTitle: { color: c.text, fontSize: 14, fontWeight: "700", lineHeight: 20 },
  reportHistoryMeta: { color: c.muted, fontSize: 12, marginTop: 6 },
  reportHistoryStatus: { color: c.amber, fontSize: 12, fontWeight: "800", marginTop: 8 },
  reportHistoryEmpty: { color: c.muted, fontSize: 13, lineHeight: 19, textAlign: "center" },
  reportDetailPanel: {
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.amber,
    borderRadius: 12,
    padding: 16,
    marginBottom: 14,
  },
  reportDetailBack: { color: c.amber, fontSize: 13, fontWeight: "700", marginBottom: 12 },
  reportDetailTitle: { color: c.text, fontSize: 17, fontWeight: "800", marginBottom: 8 },
  reportDetailLabel: { color: c.muted, fontSize: 12, fontWeight: "700", marginTop: 12 },
  reportDetailValue: { color: c.text, fontSize: 14, lineHeight: 20, marginTop: 3 },
});

import { StyleSheet } from "react-native";

/** Tông màu khớp dashboard web (nền slate tối, accent amber). */
export const c = {
  bg: "#0f172a",
  surface: "#1e293b",
  surfaceAlt: "#334155",
  border: "#334155",
  text: "#f1f5f9",
  muted: "#94a3b8",
  amber: "#f59e0b",
  green: "#22c55e",
  red: "#ef4444",
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
  },
  title: { color: c.text, fontSize: 20, fontWeight: "700" },
  subtitle: { color: c.muted, fontSize: 13, marginTop: 2 },

  // Connection pill
  pill: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  pillText: { color: c.muted, fontSize: 12, fontWeight: "600" },

  // Login
  logo: { color: c.amber, fontSize: 28, fontWeight: "800", marginBottom: 4 },
  label: {
    color: c.muted,
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 6,
    alignSelf: "flex-start",
  },
  input: {
    width: "100%",
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 10,
    color: c.text,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    marginBottom: 16,
  },
  button: {
    width: "100%",
    backgroundColor: c.amber,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  buttonText: { color: "#0f172a", fontSize: 15, fontWeight: "700" },
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
  },
  missionCardNew: { borderColor: c.amber, borderWidth: 1.5 },
  stripe: { width: 6 },
  missionBody: { flex: 1, padding: 14 },

  // Hàng trên: icon + tên thiên tai (trái) · badge nguy hiểm (phải)
  disasterRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  disasterIcon: { fontSize: 26 },
  disasterName: { color: c.text, fontSize: 18, fontWeight: "800", flex: 1 },

  dangerBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  dangerBadgeText: { fontSize: 12, fontWeight: "900", letterSpacing: 0.5 },

  // Số người gặp nạn — con số lớn nhất trên card
  peopleRow: { flexDirection: "row", alignItems: "flex-end", gap: 8, marginTop: 12 },
  peopleNumber: { color: c.text, fontSize: 40, fontWeight: "900", lineHeight: 44 },
  peopleUnit: { color: c.muted, fontSize: 14, fontWeight: "600", marginBottom: 6 },

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
  },
  infoCardNew: { borderColor: c.amber, borderWidth: 1.5 },
  infoIcon: { fontSize: 22 },
  infoTitle: { color: c.text, fontSize: 15, fontWeight: "700", flex: 1 },
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
  heroTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  heroDanger: { fontSize: 15, fontWeight: "900", letterSpacing: 1 },
  heroDisaster: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 12 },
  heroIcon: { fontSize: 34 },
  heroDisasterName: { color: c.text, fontSize: 24, fontWeight: "800" },
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
  shortSummaryText: { color: "#f87171", fontSize: 12, fontWeight: "800" },
  fullSummary: {
    backgroundColor: "rgba(34,197,94,0.16)",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 8,
  },
  fullSummaryText: { color: "#4ade80", fontSize: 12, fontWeight: "800" },

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

  supplyStatusBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  supplyStatusText: { color: "#0f172a", fontSize: 11, fontWeight: "900" },

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
  supplyShort: { color: "#f87171", fontSize: 13, fontWeight: "800" },

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
    backgroundColor: c.bg,
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

  // ===== Màn báo cáo trưởng thôn (REPORTER) =====
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
  successTitle: { color: "#4ade80", fontSize: 16, fontWeight: "800", marginBottom: 4 },
  successText: { color: c.text, fontSize: 14, lineHeight: 20 },
});

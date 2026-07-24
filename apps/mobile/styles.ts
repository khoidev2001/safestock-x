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

  // Notification card
  card: {
    backgroundColor: c.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: c.border,
    padding: 14,
    marginBottom: 10,
  },
  cardNew: { borderColor: c.amber, borderWidth: 1.5 },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  cardTitle: { color: c.text, fontSize: 15, fontWeight: "700", flex: 1 },
  cardBody: { color: c.muted, fontSize: 14, lineHeight: 20 },
  cardTime: { color: c.muted, fontSize: 12, marginTop: 8 },
  chip: {
    backgroundColor: c.surfaceAlt,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    alignSelf: "flex-start",
  },
  chipText: { color: c.text, fontSize: 11, fontWeight: "700" },
  newBadge: { backgroundColor: c.amber, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  newBadgeText: { color: "#0f172a", fontSize: 10, fontWeight: "800" },

  // States
  skeleton: {
    height: 74,
    backgroundColor: c.surface,
    borderRadius: 12,
    marginBottom: 10,
    opacity: 0.6,
  },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyTitle: { color: c.text, fontSize: 16, fontWeight: "700", marginBottom: 4 },
  emptyText: { color: c.muted, fontSize: 14, textAlign: "center" },
  linkText: { color: c.amber, fontSize: 14, fontWeight: "700", marginTop: 12 },

  // Mission detail
  backLink: { color: c.amber, fontSize: 14, fontWeight: "700" },
  detailScroll: { padding: 16 },
  statLabel: { color: c.muted, fontSize: 12, fontWeight: "600" },
  statValue: { color: c.text, fontSize: 15, fontWeight: "700", marginTop: 2 },
  statRow: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 16 },
  statBox: {
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minWidth: 100,
    flexGrow: 1,
  },
  sectionTitle: { color: c.text, fontSize: 15, fontWeight: "700", marginBottom: 8, marginTop: 4 },
  reqRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 8,
  },
  reqName: { color: c.text, fontSize: 14, fontWeight: "600", flex: 1 },
  reqQty: { color: c.muted, fontSize: 13 },
  reqShortage: { color: c.red, fontSize: 13, fontWeight: "700" },

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
});

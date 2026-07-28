import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  approveStockReport,
  createMutationRequestId,
  fetchStockReport,
  fetchStockReports,
  fetchWarehouseBatches,
  rejectStockReport,
  submitStockReport,
  type AuthUser,
  type StockReport,
} from "./api";
import {
  buildMonthlyReportDraft,
  finalizeMonthlyReportDraft,
  type MonthlyReportDraftRow,
} from "./monthly-report-state";
import { c } from "./styles";

export function MonthlyReportScreen({
  token,
  user,
}: {
  token: string;
  user: AuthUser;
}) {
  const [reports, setReports] = useState<StockReport[]>([]);
  const [selected, setSelected] = useState<StockReport | null>(null);
  const [period, setPeriod] = useState(() => new Date().toISOString().slice(0, 7));
  const [rejectNote, setRejectNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<MonthlyReportDraftRow[]>([]);
  const [draftWarehouse, setDraftWarehouse] = useState<{ id: string; name: string } | null>(null);
  const isAdmin = user.role === "ADMIN";

  const load = useCallback(async () => {
    setError(null);
    try {
      setReports(await fetchStockReports(token));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Không tải được báo cáo.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const openReport = async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      setSelected(await fetchStockReport(token, id));
      setRejectNote("");
    } catch (openError) {
      setError(openError instanceof Error ? openError.message : "Không mở được báo cáo.");
    } finally {
      setBusy(false);
    }
  };

  const prepareCount = async () => {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) {
      setError("Kỳ báo cáo phải là tháng hợp lệ dạng YYYY-MM.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (!user.warehouseId) {
        throw new Error(
          "Tài khoản lập kiểm kê chưa được gán kho; liên hệ quản trị viên.",
        );
      }
      const warehouse = {
        id: user.warehouseId,
        name: user.warehouseName ?? "Kho phụ trách",
      };
      const batches = await fetchWarehouseBatches(token, warehouse.id);
      const rows = buildMonthlyReportDraft(batches);
      if (rows.length === 0) throw new Error("Kho chưa có dữ liệu để lập báo cáo.");
      setDraft(rows);
      setDraftWarehouse(warehouse);
    } catch (prepareError) {
      setError(
        prepareError instanceof Error
          ? prepareError.message
          : "Không lập được phiếu kiểm kê.",
      );
    } finally {
      setBusy(false);
    }
  };

  const confirmSubmit = () => {
    if (!draftWarehouse) return;
    let rows: ReturnType<typeof finalizeMonthlyReportDraft>;
    try {
      rows = finalizeMonthlyReportDraft(draft);
    } catch (validationError) {
      setError(validationError instanceof Error ? validationError.message : "Số đếm không hợp lệ.");
      return;
    }
    setBusy(true);
    setError(null);
    Alert.alert(
      "Xác nhận gửi báo cáo",
      `${draftWarehouse.name} · kỳ ${period}\n${rows.length} lô đã nhập số đếm thực tế.`,
      [
        { text: "Hủy", style: "cancel", onPress: () => setBusy(false) },
        {
          text: "Gửi",
          onPress: () => {
            void (async () => {
              try {
                await submitStockReport(token, {
                  warehouseId: draftWarehouse.id,
                  period,
                  rows,
                  requestId: createMutationRequestId("stock-report"),
                });
                setDraft([]);
                setDraftWarehouse(null);
                await load();
              } catch (submitError) {
                setError(
                  submitError instanceof Error ? submitError.message : "Không gửi được báo cáo.",
                );
              } finally {
                setBusy(false);
              }
            })();
          },
        },
      ],
      { cancelable: false },
    );
  };

  const processReport = async (kind: "APPROVE" | "REJECT") => {
    if (!selected) return;
    if (kind === "REJECT" && rejectNote.trim().length < 3) {
      setError("Nhập lý do từ chối ít nhất 3 ký tự.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (kind === "APPROVE") {
        await approveStockReport(token, selected.id);
      } else {
        await rejectStockReport(token, selected.id, rejectNote.trim());
      }
      setSelected(null);
      await load();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Không xử lý được báo cáo.");
    } finally {
      setBusy(false);
    }
  };

  if (selected) {
    return (
      <ScrollView
        style={screenStyles.screen}
        contentContainerStyle={screenStyles.content}
      >
        <Pressable onPress={() => setSelected(null)} disabled={busy}>
          <Text style={screenStyles.link}>‹ Danh sách báo cáo</Text>
        </Pressable>
        <Text style={screenStyles.title}>Kiểm tra số liệu</Text>
        <Text style={screenStyles.subtitle}>
          {selected.warehouse?.name ?? selected.warehouseId} · kỳ {selected.period}
        </Text>
        {(selected.rows ?? []).map((row, index) => (
          <View key={`${row.sku}-${index}`} style={screenStyles.rowCard}>
            <View style={screenStyles.rowHeader}>
              <View style={{ flex: 1 }}>
                <Text style={screenStyles.rowTitle}>{row.itemName}</Text>
                <Text style={screenStyles.muted}>{row.sku}</Text>
              </View>
              <Text style={screenStyles.quantity}>
                {row.quantity} {row.unit}
              </Text>
            </View>
            <Text style={screenStyles.muted}>
              Lô {row.batchCode ?? "cũ chưa định danh"} · kệ {row.shelfCode ?? "—"}
            </Text>
            <Text style={screenStyles.muted}>
              {row.condition || "Chưa ghi tình trạng"} · hạn {row.expiryDate || "—"}
            </Text>
            {row.note ? <Text style={screenStyles.note}>{row.note}</Text> : null}
          </View>
        ))}
        {isAdmin && selected.status === "PENDING" ? (
          <View style={screenStyles.actionBox}>
            <Text style={screenStyles.label}>Lý do nếu từ chối</Text>
            <TextInput
              multiline
              onChangeText={setRejectNote}
              placeholder="Nêu rõ SKU hoặc số liệu cần kiểm tra lại"
              placeholderTextColor={c.muted}
              style={screenStyles.input}
              value={rejectNote}
            />
            <View style={screenStyles.actionRow}>
              <ActionButton
                danger
                disabled={busy}
                label="Từ chối"
                onPress={() => void processReport("REJECT")}
              />
              <ActionButton
                disabled={busy}
                label={busy ? "Đang xử lý…" : "Duyệt & áp tồn"}
                onPress={() => void processReport("APPROVE")}
              />
            </View>
          </View>
        ) : selected.note ? (
          <Text style={screenStyles.note}>Ghi chú xử lý: {selected.note}</Text>
        ) : null}
        {error ? <Text style={screenStyles.error}>{error}</Text> : null}
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={screenStyles.screen}
      contentContainerStyle={screenStyles.content}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}
    >
      <Text style={screenStyles.title}>Báo cáo kiểm kê tháng</Text>
      <Text style={screenStyles.subtitle}>
        Nhập số đếm thực tế; xã xem chi tiết trước khi duyệt và áp vào tồn kho.
      </Text>

      {!isAdmin ? (
        <View style={screenStyles.submitCard}>
          <Text style={screenStyles.label}>Kỳ báo cáo (YYYY-MM)</Text>
          <TextInput
            autoCapitalize="none"
            onChangeText={setPeriod}
            placeholder="2026-07"
            placeholderTextColor={c.muted}
            style={screenStyles.input}
            value={period}
          />
          {draft.length === 0 ? (
            <ActionButton
              disabled={busy}
              label={busy ? "Đang lập phiếu…" : "Bắt đầu kiểm kê"}
              onPress={() => void prepareCount()}
            />
          ) : (
            <>
              <Text style={screenStyles.subtitle}>
                Nhập đủ số đếm thực tế. Tồn hệ thống chỉ dùng để đối chiếu.
              </Text>
              {draft.map((row, index) => (
                <View key={row.batchId} style={screenStyles.countRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={screenStyles.rowTitle}>{row.itemName}</Text>
                    <Text style={screenStyles.muted}>
                      {row.sku} · hệ thống {row.systemQuantity} {row.unit}
                    </Text>
                    <Text style={screenStyles.muted}>
                      Lô {row.batchCode} · kệ {row.shelfCode}
                    </Text>
                  </View>
                  <TextInput
                    keyboardType="number-pad"
                    onChangeText={(countedQuantity) =>
                      setDraft((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, countedQuantity } : item,
                        ),
                      )
                    }
                    placeholder="Số đếm"
                    placeholderTextColor={c.muted}
                    style={screenStyles.countInput}
                    value={row.countedQuantity}
                  />
                </View>
              ))}
              <View style={screenStyles.actionRow}>
                <ActionButton
                  danger
                  disabled={busy}
                  label="Hủy phiếu"
                  onPress={() => {
                    setDraft([]);
                    setDraftWarehouse(null);
                  }}
                />
                <ActionButton
                  disabled={busy}
                  label={busy ? "Đang gửi…" : "Kiểm tra & gửi"}
                  onPress={confirmSubmit}
                />
              </View>
            </>
          )}
        </View>
      ) : null}

      {error ? <Text style={screenStyles.error}>{error}</Text> : null}
      {!loading && reports.length === 0 ? (
        <Text style={screenStyles.empty}>Chưa có báo cáo tháng nào.</Text>
      ) : null}
      {reports.map((report) => (
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          key={report.id}
          onPress={() => void openReport(report.id)}
          style={screenStyles.reportCard}
        >
          <View style={{ flex: 1 }}>
            <Text style={screenStyles.rowTitle}>
              {report.warehouse?.name ?? report.warehouseId}
            </Text>
            <Text style={screenStyles.muted}>
              Kỳ {report.period} · {new Date(report.createdAt).toLocaleDateString("vi-VN")}
            </Text>
          </View>
          <Text style={statusStyle(report.status)}>{statusLabel(report.status)}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

function ActionButton({
  label,
  onPress,
  disabled,
  danger = false,
}: {
  label: string;
  onPress: () => void;
  disabled: boolean;
  danger?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[
        screenStyles.button,
        danger && screenStyles.dangerButton,
        disabled && { opacity: 0.5 },
      ]}
    >
      <Text style={[screenStyles.buttonText, danger && { color: c.text }]}>{label}</Text>
    </Pressable>
  );
}

function statusLabel(status: StockReport["status"]) {
  return status === "APPROVED"
    ? "Đã duyệt"
    : status === "REJECTED"
      ? "Từ chối"
      : "Chờ duyệt";
}

function statusStyle(status: StockReport["status"]) {
  return [
    screenStyles.status,
    {
      color:
        status === "APPROVED"
          ? c.green
          : status === "REJECTED"
            ? c.red
            : c.amber,
    },
  ];
}

const screenStyles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.bg },
  content: { padding: 16, paddingBottom: 32, gap: 12 },
  title: { color: c.text, fontSize: 22, fontWeight: "800" },
  subtitle: { color: c.muted, fontSize: 13, lineHeight: 19 },
  link: { color: c.amber, fontSize: 13, fontWeight: "700", marginBottom: 4 },
  submitCard: {
    backgroundColor: c.surface,
    borderColor: c.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    gap: 10,
  },
  reportCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: c.surface,
    borderColor: c.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
  },
  rowCard: {
    backgroundColor: c.surface,
    borderColor: c.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    gap: 5,
  },
  rowHeader: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  rowTitle: { color: c.text, fontSize: 14, fontWeight: "800" },
  quantity: { color: c.amber, fontSize: 15, fontWeight: "900" },
  muted: { color: c.muted, fontSize: 12 },
  note: { color: c.text, fontSize: 12, lineHeight: 18 },
  status: { fontSize: 12, fontWeight: "800" },
  label: { color: c.muted, fontSize: 12, fontWeight: "700" },
  input: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 9,
    color: c.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
    textAlignVertical: "top",
  },
  actionBox: {
    borderTopWidth: 1,
    borderTopColor: c.border,
    paddingTop: 14,
    gap: 10,
  },
  actionRow: { flexDirection: "row", gap: 10 },
  countRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  countInput: {
    width: 92,
    minHeight: 42,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 9,
    color: c.text,
    paddingHorizontal: 10,
    textAlign: "right",
  },
  button: {
    flex: 1,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9,
    backgroundColor: c.amber,
    paddingHorizontal: 12,
  },
  dangerButton: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: c.red,
  },
  buttonText: { color: c.bg, fontSize: 13, fontWeight: "800" },
  error: { color: c.red, fontSize: 13, lineHeight: 19 },
  empty: { color: c.muted, textAlign: "center", paddingVertical: 28 },
});

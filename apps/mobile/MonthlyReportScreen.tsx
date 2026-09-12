import { useCallback, useEffect, useState } from "react";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import {
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
  blockingMonthlyReport,
  buildMonthlyReportDraft,
  finalizeMonthlyReportDraft,
  isValidReportPeriod,
  type MonthlyReportDraftRow,
} from "./monthly-report-state";
import { c } from "./styles";

export function MonthlyReportScreen({ token, user }: { token: string; user: AuthUser }) {
  const [reports, setReports] = useState<StockReport[]>([]);
  const [selected, setSelected] = useState<StockReport | null>(null);
  const [period, setPeriod] = useState(() => new Date().toISOString().slice(0, 7));
  const [rejectNote, setRejectNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<MonthlyReportDraftRow[]>([]);
  const [draftWarehouse, setDraftWarehouse] = useState<{ id: string; name: string } | null>(null);
  /**
   * Đang chờ xác nhận gửi.
   *
   * Bước xác nhận nằm NGAY TRONG màn hình, không dùng hộp thoại của hệ điều hành.
   * Hộp thoại đó đã một lần làm treo đúng màn này: `Alert` của react-native-web là
   * hàm rỗng nên callback không bao giờ được gọi, nút kẹt ở "Đang gửi…" và không
   * một request nào được phát đi. Cùng một đoạn mã chạy trên ba nền (Expo Go, APK,
   * bản web) mà lại giao bước quan trọng nhất cho thứ hành xử khác nhau ở cả ba là
   * tự đặt bẫy. Hai nút vẽ bằng React thì nền nào cũng vẽ được như nhau.
   */
  const [pendingConfirm, setPendingConfirm] = useState(false);
  const isAdmin = user.role === "ADMIN";
  const periodValid = isValidReportPeriod(period);
  // Kỳ này đã có báo cáo đang chờ duyệt hoặc đã duyệt → máy chủ sẽ từ chối.
  const blocking = blockingMonthlyReport(reports, user.warehouseId ?? "", period.trim());
  const locked = Boolean(blocking);

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

  /**
   * Tự làm mới trạng thái báo cáo trong lúc màn hình đang mở.
   *
   * Việc duyệt xảy ra ở MÁY KHÁC — cán bộ xã bấm duyệt trên web, không có gì đi
   * qua điện thoại này để nó biết. Trước đây màn hình chỉ đọc dữ liệu đúng một
   * lần lúc mở, nên người giữ kho ngồi nhìn chữ "Chờ duyệt" trong khi báo cáo đã
   * được duyệt từ lâu; phải rời sang tab khác rồi quay lại (buộc dựng lại màn
   * hình) thì mới thấy. Với người dùng thì đó là "app hiện sai".
   *
   * Làm mới IM LẶNG: không đụng vào `loading`, `busy` hay `error`. Vòng quay này
   * chạy nền, nên nó không được phép làm nhấp nháy con quay hay xoá mất câu lỗi
   * người dùng đang đọc — và nhất là không được khoá nút giữa lúc đang bấm.
   *
   * Mười giây một lượt: trạng thái này đổi vài lần một tháng, hỏi dày hơn chỉ tốn
   * pin và sóng của một chiếc điện thoại đang ở vùng bão.
   */
  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const latest = await fetchStockReports(token);
        if (!cancelled) setReports(latest);
      } catch {
        // Mất sóng thì giữ nguyên số liệu đang hiện; lượt sau tự thử lại.
      }
    };
    const timer = setInterval(() => void refresh(), 10_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [token]);

  /**
   * Báo cáo đang mở cũng phải theo kịp.
   *
   * Danh sách làm mới rồi mà bản đang xem vẫn đứng yên thì người dùng đọc được
   * hai trạng thái khác nhau cho cùng một báo cáo, tuỳ họ đang nhìn màn hình nào.
   * Lấy trạng thái mới từ chính danh sách vừa tải, không gọi thêm một lượt mạng.
   */
  useEffect(() => {
    if (!selected) return;
    const latest = reports.find((report) => report.id === selected.id);
    if (latest && latest.status !== selected.status) {
      setSelected((current) => (current ? { ...current, status: latest.status } : current));
    }
  }, [reports, selected]);

  /**
   * Đổi tháng/năm là bắt đầu lại từ đầu.
   *
   * Phiếu đang mở là ảnh chụp tồn kho của KỲ CŨ: giữ nguyên số đếm rồi gửi sang
   * kỳ mới là nộp số của tháng trước dưới tên tháng này — sai lệch không ai nhìn
   * ra khi duyệt, vì mọi con số đều hợp lệ.
   */
  useEffect(() => {
    setDraft([]);
    setDraftWarehouse(null);
    setPendingConfirm(false);
    setError(null);
  }, [period]);

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
    if (!periodValid) {
      setError("Kỳ báo cáo phải là tháng hợp lệ dạng YYYY-MM.");
      return;
    }
    // Chặn ở đây nữa, không chỉ ở nút: danh sách báo cáo có thể vừa được tải lại
    // trong lúc người dùng đang đứng trên màn hình.
    if (blocking) {
      setError(`Kỳ ${period} đã có báo cáo ${statusLabel(blocking.status)}. Không gửi lại được.`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (!user.warehouseId) {
        throw new Error("Tài khoản lập kiểm kê chưa được gán kho; liên hệ quản trị viên.");
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
        prepareError instanceof Error ? prepareError.message : "Không lập được phiếu kiểm kê.",
      );
    } finally {
      setBusy(false);
    }
  };

  /** Bấm "Kiểm tra & gửi": soát số đếm rồi mở bước xác nhận ngay trong màn hình. */
  const reviewBeforeSubmit = () => {
    if (!draftWarehouse) return;
    try {
      finalizeMonthlyReportDraft(draft);
    } catch (validationError) {
      setError(validationError instanceof Error ? validationError.message : "Số đếm không hợp lệ.");
      setPendingConfirm(false);
      return;
    }
    setError(null);
    setPendingConfirm(true);
  };

  const submitCount = async () => {
    if (!draftWarehouse) return;
    let rows: ReturnType<typeof finalizeMonthlyReportDraft>;
    try {
      rows = finalizeMonthlyReportDraft(draft);
    } catch (validationError) {
      setError(validationError instanceof Error ? validationError.message : "Số đếm không hợp lệ.");
      setPendingConfirm(false);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await submitStockReport(token, {
        warehouseId: draftWarehouse.id,
        period,
        rows,
        requestId: createMutationRequestId("stock-report"),
      });
      setDraft([]);
      setDraftWarehouse(null);
      setPendingConfirm(false);
      await load();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Không gửi được báo cáo.");
    } finally {
      // Luôn tắt cờ bận, kể cả khi `load()` phía trên ném lỗi: nút kẹt ở "Đang
      // gửi…" là người dùng ngồi chờ một việc đã xong từ lâu.
      setBusy(false);
    }
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
      <ScrollView style={screenStyles.screen} contentContainerStyle={screenStyles.content}>
        {/* Mũi tên vẽ bằng bộ icon vector, không dùng ký tự "‹".
            "‹" là dấu ngoặc kép nhọn của tiếng Pháp, không phải mũi tên: cỡ của nó
            do phông chữ quyết định nên luôn nhỏ hơn chữ bên cạnh, và máy thiếu
            phông thì ra ô vuông rỗng. Icon vector thì đặt bao nhiêu ra bấy nhiêu. */}
        <Pressable
          onPress={() => setSelected(null)}
          disabled={busy}
          style={screenStyles.backRow}
        >
          <MaterialCommunityIcons name="chevron-left" size={13} color={c.amber} />
          <Text style={screenStyles.link}>Danh sách báo cáo</Text>
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
              placeholder="Nêu rõ mã vật tư hoặc số liệu cần kiểm tra lại"
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
          {/* Kỳ đã có báo cáo: nói NGAY tại đây, và khoá luôn nút mở phiếu.
              Trước đây màn hình vẫn mời người dùng bắt đầu, đếm hết vài chục lô,
              gõ từng con số, rồi mới nhận lỗi 409 từ máy chủ lúc bấm gửi. Cả buổi
              công việc đó không cứu được gì — và người dùng cũng không hiểu vì sao
              đến giờ mới bị chặn. */}
          {locked ? (
            <View style={screenStyles.lockedBox}>
              <Text style={screenStyles.lockedTitle}>
                Kỳ {period} đã có báo cáo · {statusLabel(blocking!.status)}
              </Text>
              <Text style={screenStyles.muted}>
                {blocking!.status === "APPROVED"
                  ? "Báo cáo đã được xã duyệt và áp vào tồn kho, không gửi lại được."
                  : "Báo cáo đang chờ xã duyệt. Chờ xã duyệt hoặc từ chối; bị từ chối thì mới gửi lại được."}
              </Text>
              <Text style={screenStyles.muted}>
                Đổi ô kỳ báo cáo phía trên sang tháng khác để lập phiếu mới.
              </Text>
            </View>
          ) : !periodValid ? (
            <Text style={screenStyles.muted}>Nhập kỳ dạng YYYY-MM, ví dụ 2026-09.</Text>
          ) : draft.length === 0 ? (
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
                    editable={!busy && !locked}
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
              {pendingConfirm ? (
                <View style={screenStyles.confirmBox}>
                  <Text style={screenStyles.lockedTitle}>Xác nhận gửi báo cáo</Text>
                  <Text style={screenStyles.muted}>
                    {draftWarehouse?.name} · kỳ {period}
                  </Text>
                  <Text style={screenStyles.muted}>
                    {draft.length} lô đã nhập số đếm thực tế. Gửi rồi thì phải chờ xã duyệt hoặc
                    từ chối mới sửa lại được.
                  </Text>
                  <View style={screenStyles.actionRow}>
                    <ActionButton
                      danger
                      disabled={busy}
                      label="Quay lại sửa"
                      onPress={() => setPendingConfirm(false)}
                    />
                    <ActionButton
                      disabled={busy}
                      label={busy ? "Đang gửi…" : "Gửi báo cáo"}
                      onPress={() => void submitCount()}
                    />
                  </View>
                </View>
              ) : (
                <View style={screenStyles.actionRow}>
                  <ActionButton
                    danger
                    disabled={busy}
                    label="Hủy phiếu"
                    onPress={() => {
                      setDraft([]);
                      setDraftWarehouse(null);
                      setPendingConfirm(false);
                    }}
                  />
                  <ActionButton
                    disabled={busy}
                    label="Kiểm tra & gửi"
                    onPress={reviewBeforeSubmit}
                  />
                </View>
              )}
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
  return status === "APPROVED" ? "Đã duyệt" : status === "REJECTED" ? "Từ chối" : "Chờ duyệt";
}

function statusStyle(status: StockReport["status"]) {
  return [
    screenStyles.status,
    {
      color: status === "APPROVED" ? c.green : status === "REJECTED" ? c.red : c.amber,
    },
  ];
}

const screenStyles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.bg },
  content: { padding: 16, paddingBottom: 32, gap: 12 },
  title: { color: c.text, fontSize: 22, fontWeight: "800" },
  subtitle: { color: c.muted, fontSize: 13, lineHeight: 19 },
  link: { color: c.amber, fontSize: 13, fontWeight: "700" },
  backRow: { flexDirection: "row", alignItems: "center", gap: 2, marginBottom: 4 },
  submitCard: {
    backgroundColor: c.surface,
    borderColor: c.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    gap: 10,
  },
  // Khối "kỳ này đã có báo cáo": viền hổ phách, cùng màu với trạng thái chờ duyệt
  // trong danh sách bên dưới để hai chỗ nói về một thứ trông như một thứ.
  lockedBox: {
    borderColor: c.amber,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    gap: 6,
  },
  confirmBox: {
    borderColor: c.border,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    gap: 8,
  },
  lockedTitle: {
    color: c.text,
    fontSize: 15,
    fontWeight: "700",
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

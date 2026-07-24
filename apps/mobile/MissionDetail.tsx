import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import {
  completeMission,
  confirmMission,
  fetchMission,
  rejectMission,
  type DeliveryOutcome,
  type MissionDetail,
} from "./api";
import { c, styles } from "./styles";

const INCIDENT_LABEL: Record<string, string> = {
  FLOOD: "Lũ lụt",
  STORM: "Bão",
  LANDSLIDE: "Sạt lở",
  FIRE: "Cháy",
  ISOLATION: "Cô lập",
  OTHER: "Khác",
};

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Nháp",
  PENDING_RESCUE: "Chờ cứu hộ xác nhận",
  RESCUE_CONFIRMED: "Đã xác nhận",
  PENDING_WAREHOUSE: "Chờ kho chuẩn bị",
  READY: "Kho đã sẵn sàng",
  COMPLETED: "Hoàn thành",
  REJECTED: "Đã từ chối",
  DEFERRED: "Tạm hoãn",
  CANCELLED: "Đã huỷ",
};

const REASON_SUGGESTIONS = ["Thiếu nhân lực", "Thiếu vật tư", "Xin trì hoãn", "Khác"];

/** Trạng thái đội đã nhận nhưng chưa xong → cho phép "báo không tiếp tục được". */
const AFTER_CONFIRM_STATES = ["RESCUE_CONFIRMED", "PENDING_WAREHOUSE"];

const OUTCOME_OPTIONS: { key: DeliveryOutcome; label: string }[] = [
  { key: "DELIVERED", label: "Đã giao đủ" },
  { key: "PARTIAL", label: "Giao một phần" },
  { key: "FAILED", label: "Không giao được" },
];

/** Màn chi tiết nhiệm vụ + hành động Chấp nhận / Từ chối (kèm lý do). */
export function MissionDetailScreen({
  token,
  missionId,
  onBack,
  onResolved,
}: {
  token: string;
  missionId: string;
  onBack: () => void;
  onResolved: () => void;
}) {
  const [mission, setMission] = useState<MissionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [selectedChip, setSelectedChip] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);
  const [outcome, setOutcome] = useState<DeliveryOutcome>("DELIVERED");
  const [deliveryNote, setDeliveryNote] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setMission(await fetchMission(token, missionId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lỗi tải dữ liệu");
    } finally {
      setLoading(false);
    }
  }, [token, missionId]);

  useEffect(() => {
    load();
  }, [load]);

  async function accept() {
    setBusy(true);
    setError(null);
    try {
      await confirmMission(token, missionId);
      onResolved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không chấp nhận được");
      setBusy(false);
    }
  }

  async function submitReject() {
    if (reason.trim().length < 3) {
      setError("Vui lòng nhập lý do từ chối");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await rejectMission(token, missionId, reason.trim());
      onResolved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không từ chối được");
      setBusy(false);
    }
  }

  async function submitComplete() {
    setBusy(true);
    setError(null);
    try {
      await completeMission(token, missionId, outcome, deliveryNote.trim() || undefined);
      onResolved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không xác nhận được kết quả giao");
      setBusy(false);
    }
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={onBack} accessibilityRole="button">
          <Text style={styles.backLink}>‹ Quay lại</Text>
        </Pressable>
        <Text style={styles.title}>Chi tiết nhiệm vụ</Text>
        <View style={{ width: 60 }} />
      </View>

      {loading ? (
        <View style={{ padding: 16 }}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={styles.skeleton} />
          ))}
        </View>
      ) : error && !mission ? (
        <View style={styles.center}>
          <Text style={styles.emptyIcon}>⚠️</Text>
          <Text style={styles.emptyTitle}>Không tải được</Text>
          <Text style={styles.emptyText}>{error}</Text>
          <Pressable onPress={load} accessibilityRole="button">
            <Text style={styles.linkText}>Thử lại</Text>
          </Pressable>
        </View>
      ) : mission ? (
        <ScrollView contentContainerStyle={styles.detailScroll}>
          <View style={styles.statRow}>
            <Stat
              label="Tình huống"
              value={INCIDENT_LABEL[mission.incidentType] ?? mission.incidentType}
            />
            <Stat label="Số người" value={String(mission.affectedPeople)} />
            <Stat label="Thời gian" value={`${mission.durationHours} giờ`} />
            <Stat label="Mức đáp ứng" value={`${mission.fulfillment}%`} />
          </View>

          <Text style={styles.sectionTitle}>Vật tư theo phương án</Text>
          {mission.requirements.length === 0 ? (
            <Text style={styles.emptyText}>Chưa có vật tư trong phương án.</Text>
          ) : (
            mission.requirements.map((r) => (
              <View key={r.id} style={styles.reqRow}>
                <Text style={styles.reqName}>{r.itemName}</Text>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={styles.reqQty}>
                    {r.allocated}/{r.required} {r.unit}
                  </Text>
                  {r.shortage > 0 ? (
                    <Text style={styles.reqShortage}>
                      Thiếu {r.shortage} {r.unit}
                    </Text>
                  ) : null}
                </View>
              </View>
            ))
          )}

          {error ? <Text style={[styles.errorText, { marginTop: 12 }]}>{error}</Text> : null}

          {rejecting ? (
            <View style={styles.reasonBox}>
              <Text style={styles.reasonTitle}>
                {mission.status === "PENDING_RESCUE"
                  ? "Lý do từ chối"
                  : "Lý do không tiếp tục được"}
              </Text>
              <View style={styles.chipRow}>
                {REASON_SUGGESTIONS.map((s) => {
                  const isOther = s === "Khác";
                  const active = selectedChip === s;
                  return (
                    <Pressable
                      key={s}
                      onPress={() => {
                        setSelectedChip(s);
                        // "Khác": xoá ô để nhập tự do; chip gợi ý: điền sẵn text.
                        setReason(isOther ? "" : s);
                      }}
                      style={[styles.reasonChip, active && styles.reasonChipActive]}
                      accessibilityRole="button"
                    >
                      <Text style={active ? styles.reasonChipTextActive : styles.reasonChipText}>
                        {s}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <TextInput
                style={styles.reasonInput}
                value={reason}
                onChangeText={(t) => {
                  setReason(t);
                  // Người dùng gõ tự do → coi như đang chọn "Khác".
                  if (t !== selectedChip) setSelectedChip("Khác");
                }}
                placeholder={
                  selectedChip === "Khác"
                    ? "Nhập lý do khác (vd: đường ngập sâu, cầu bị cuốn…)"
                    : "Mô tả chi tiết lý do (vd: cần thêm 5 người, thiếu áo phao…)"
                }
                placeholderTextColor={c.muted}
                multiline
                aria-label="Lý do không tiếp tục"
              />
              <View style={styles.actionRow}>
                <Pressable
                  style={[styles.btnReject, busy && { opacity: 0.6 }]}
                  onPress={() => setRejecting(false)}
                  disabled={busy}
                  accessibilityRole="button"
                >
                  <Text style={styles.btnRejectText}>Huỷ</Text>
                </Pressable>
                <Pressable
                  style={[styles.btnAccept, { backgroundColor: c.red }, busy && { opacity: 0.6 }]}
                  onPress={submitReject}
                  disabled={busy}
                  accessibilityRole="button"
                >
                  <Text style={[styles.btnAcceptText, { color: "#450a0a" }]}>
                    {busy ? "Đang gửi…" : "Xác nhận"}
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : completing ? (
            <View style={styles.reasonBox}>
              <Text style={styles.reasonTitle}>Kết quả giao tới hiện trường</Text>
              <View style={styles.chipRow}>
                {OUTCOME_OPTIONS.map((o) => {
                  const active = outcome === o.key;
                  return (
                    <Pressable
                      key={o.key}
                      onPress={() => setOutcome(o.key)}
                      style={[styles.reasonChip, active && styles.reasonChipActive]}
                      accessibilityRole="button"
                    >
                      <Text style={active ? styles.reasonChipTextActive : styles.reasonChipText}>
                        {o.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <TextInput
                style={styles.reasonInput}
                value={deliveryNote}
                onChangeText={setDeliveryNote}
                placeholder="Ghi chú (vd: thiếu 20 áo phao, giao tại điểm tập kết xã)"
                placeholderTextColor={c.muted}
                multiline
                aria-label="Ghi chú kết quả giao"
              />
              <View style={styles.actionRow}>
                <Pressable
                  style={[styles.btnReject, busy && { opacity: 0.6 }]}
                  onPress={() => setCompleting(false)}
                  disabled={busy}
                  accessibilityRole="button"
                >
                  <Text style={styles.btnRejectText}>Huỷ</Text>
                </Pressable>
                <Pressable
                  style={[styles.btnAccept, busy && { opacity: 0.6 }]}
                  onPress={submitComplete}
                  disabled={busy}
                  accessibilityRole="button"
                >
                  <Text style={styles.btnAcceptText}>
                    {busy ? "Đang gửi…" : "Xác nhận đã giao"}
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : mission.status === "PENDING_RESCUE" ? (
            <View style={styles.actionRow}>
              <Pressable
                style={[styles.btnAccept, busy && { opacity: 0.6 }]}
                onPress={accept}
                disabled={busy}
                accessibilityRole="button"
              >
                <Text style={styles.btnAcceptText}>{busy ? "Đang gửi…" : "Chấp nhận"}</Text>
              </Pressable>
              <Pressable
                style={[styles.btnReject, busy && { opacity: 0.6 }]}
                onPress={() => {
                  setError(null);
                  setRejecting(true);
                }}
                disabled={busy}
                accessibilityRole="button"
              >
                <Text style={styles.btnRejectText}>Từ chối</Text>
              </Pressable>
            </View>
          ) : AFTER_CONFIRM_STATES.includes(mission.status) ? (
            <View style={{ marginTop: 20 }}>
              <View style={[styles.statusBadge, { backgroundColor: c.surfaceAlt }]}>
                <Text style={[styles.statusText, { color: c.text }]}>
                  {STATUS_LABEL[mission.status] ?? mission.status}
                </Text>
              </View>
              <Pressable
                style={[styles.btnReject, { marginTop: 12 }, busy && { opacity: 0.6 }]}
                onPress={() => {
                  setError(null);
                  setReason("");
                  setSelectedChip(null);
                  setRejecting(true);
                }}
                disabled={busy}
                accessibilityRole="button"
              >
                <Text style={styles.btnRejectText}>Không tiếp tục được</Text>
              </Pressable>
            </View>
          ) : mission.status === "READY" ? (
            <View style={{ marginTop: 20 }}>
              <View style={[styles.statusBadge, { backgroundColor: c.surfaceAlt }]}>
                <Text style={[styles.statusText, { color: c.text }]}>
                  {STATUS_LABEL[mission.status] ?? mission.status}
                </Text>
              </View>
              <Pressable
                style={[styles.btnAccept, { marginTop: 12 }, busy && { opacity: 0.6 }]}
                onPress={() => {
                  setError(null);
                  setCompleting(true);
                }}
                disabled={busy}
                accessibilityRole="button"
              >
                <Text style={styles.btnAcceptText}>Xác nhận đã giao</Text>
              </Pressable>
            </View>
          ) : (
            <View style={{ marginTop: 20 }}>
              <View style={[styles.statusBadge, { backgroundColor: c.surfaceAlt }]}>
                <Text style={[styles.statusText, { color: c.text }]}>
                  {STATUS_LABEL[mission.status] ?? mission.status}
                </Text>
              </View>
              {mission.status === "REJECTED" && mission.rejectionReason ? (
                <Text style={[styles.emptyText, { marginTop: 10, textAlign: "left" }]}>
                  Lý do: {mission.rejectionReason}
                </Text>
              ) : null}
              {mission.status === "COMPLETED" && mission.deliveryNote ? (
                <Text style={[styles.emptyText, { marginTop: 10, textAlign: "left" }]}>
                  Ghi chú giao: {mission.deliveryNote}
                </Text>
              ) : null}
            </View>
          )}
        </ScrollView>
      ) : null}
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statBox}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

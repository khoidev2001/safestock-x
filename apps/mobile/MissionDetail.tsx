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
import { assessDanger, disasterOf, formatLongTime } from "./disaster";
import { supplyOf, supplyProgress } from "./supplies";
import { readOfflineCache, writeOfflineCache } from "./offline-cache";

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
  userId,
  missionId,
  onBack,
  onResolved,
}: {
  token: string;
  userId: string;
  missionId: string;
  onBack: () => void;
  onResolved: () => void;
}) {
  const [mission, setMission] = useState<MissionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cacheStoredAt, setCacheStoredAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [selectedChip, setSelectedChip] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);
  const [outcome, setOutcome] = useState<DeliveryOutcome>("DELIVERED");
  const [deliveryNote, setDeliveryNote] = useState("");

  const load = useCallback(async () => {
    setError(null);
    let hasCachedData = false;
    try {
      const cached = await readOfflineCache<MissionDetail>(
        userId,
        `mission.${missionId}`,
      );
      if (cached) {
        hasCachedData = true;
        setMission(cached.data);
        setCacheStoredAt(cached.storedAt);
        setLoading(false);
      } else {
        setLoading(true);
      }
    } catch {
      setLoading(true);
    }
    try {
      const latest = await fetchMission(token, missionId);
      setMission(latest);
      setCacheStoredAt(null);
      await writeOfflineCache(userId, `mission.${missionId}`, latest);
    } catch (e) {
      setError(
        hasCachedData
          ? "Đang xem bản lưu vì không kết nối được máy chủ LAN."
          : e instanceof Error
            ? e.message
            : "Lỗi tải dữ liệu",
      );
    } finally {
      setLoading(false);
    }
  }, [token, userId, missionId]);

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
          {cacheStoredAt ? (
            <View
              style={{
                borderWidth: 1,
                borderColor: c.amber,
                backgroundColor: "rgba(245,158,11,0.12)",
                borderRadius: 10,
                padding: 12,
                marginBottom: 12,
              }}
              accessibilityRole="alert"
            >
              <Text style={{ color: c.amber, fontSize: 12, fontWeight: "700" }}>
                Ngoại tuyến · chỉ đọc · bản lưu{" "}
                {new Date(cacheStoredAt).toLocaleString("vi-VN")}
              </Text>
            </View>
          ) : null}
          <MissionHero mission={mission} />

          <View style={styles.factRow}>
            <Fact label="Nhận lúc" value={mission.createdAt ? formatLongTime(mission.createdAt) : "—"} />
            <Fact label="Thời lượng" value={`${mission.durationHours} giờ`} />
            <Fact label="Đáp ứng" value={`${mission.fulfillment}%`} />
          </View>

          <SuppliesSection requirements={mission.requirements} />

          {error ? <Text style={[styles.errorText, { marginTop: 12 }]}>{error}</Text> : null}

          {cacheStoredAt ? null : rejecting ? (
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

/** Banner đầu màn: mức nguy hiểm + loại thiên tai + số người gặp nạn (thứ bậc rõ). */
function MissionHero({ mission }: { mission: MissionDetail }) {
  const disaster = disasterOf(mission.incidentType);
  const danger = assessDanger(mission.incidentType, mission.affectedPeople);
  return (
    <View style={[styles.hero, { backgroundColor: danger.bg, borderColor: danger.stripe }]}>
      <View style={styles.heroTopRow}>
        <Text style={[styles.heroDanger, { color: danger.color }]}>⚠ {danger.label}</Text>
      </View>

      <View style={styles.heroDisaster}>
        <Text style={styles.heroIcon}>{disaster.icon}</Text>
        <Text style={styles.heroDisasterName}>{disaster.label}</Text>
      </View>
      {mission.location ? <Text style={styles.heroLocation}>📍 {mission.location}</Text> : null}

      <View style={styles.heroPeopleRow}>
        <Text style={styles.heroPeopleNumber}>{mission.affectedPeople}</Text>
        <Text style={styles.heroPeopleUnit}>người gặp nạn</Text>
      </View>
    </View>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.factBox}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={styles.factValue}>{value}</Text>
    </View>
  );
}

/** Danh sách vật tư dạng thẻ trực quan + tóm tắt "đủ / thiếu" ở đầu mục. */
function SuppliesSection({ requirements }: { requirements: MissionDetail["requirements"] }) {
  if (requirements.length === 0) {
    return (
      <>
        <Text style={styles.sectionTitle}>Vật tư theo phương án</Text>
        <Text style={styles.emptyText}>Chưa có vật tư trong phương án.</Text>
      </>
    );
  }

  // Thiếu lên trước để đội cứu hộ thấy ngay cái cần chú ý.
  const sorted = [...requirements].sort((a, b) => b.shortage - a.shortage);
  const shortItems = requirements.filter((r) => r.shortage > 0).length;

  return (
    <>
      <View style={styles.suppliesHead}>
        <Text style={styles.sectionTitle}>Vật tư cần mang ({requirements.length})</Text>
        {shortItems > 0 ? (
          <View style={styles.shortSummary}>
            <Text style={styles.shortSummaryText}>⚠ Thiếu {shortItems} loại</Text>
          </View>
        ) : (
          <View style={styles.fullSummary}>
            <Text style={styles.fullSummaryText}>✓ Đủ vật tư</Text>
          </View>
        )}
      </View>
      {sorted.map((r) => (
        <SupplyCard key={r.id} req={r} />
      ))}
    </>
  );
}

/** Một dòng vật tư: icon lớn nhận diện · tên · số lượng cấp/cần · thanh đáp ứng. */
function SupplyCard({ req }: { req: MissionDetail["requirements"][number] }) {
  const meta = supplyOf(req.sku, req.itemName);
  const prog = supplyProgress(req.required, req.allocated);

  return (
    <View style={[styles.supplyCard, { borderLeftColor: prog.color }]}>
      <View style={[styles.supplyIconBox, { backgroundColor: meta.tint }]}>
        <Text style={styles.supplyIcon}>{meta.icon}</Text>
      </View>

      <View style={styles.supplyMain}>
        <View style={styles.supplyTopRow}>
          <Text style={styles.supplyName} numberOfLines={2}>
            {req.itemName}
          </Text>
          <View style={[styles.supplyStatusBadge, { backgroundColor: prog.color }]}>
            <Text style={styles.supplyStatusText}>{prog.label}</Text>
          </View>
        </View>

        <Text style={styles.supplyGroup}>{meta.group}</Text>

        <View style={styles.supplyBarTrack}>
          <View
            style={[
              styles.supplyBarFill,
              { width: `${Math.round(prog.ratio * 100)}%`, backgroundColor: prog.color },
            ]}
          />
        </View>

        <View style={styles.supplyQtyRow}>
          <Text style={styles.supplyQtyStrong}>
            {req.allocated}
            <Text style={styles.supplyQtyMuted}>
              /{req.required} {req.unit}
            </Text>
          </Text>
          {req.shortage > 0 ? (
            <Text style={styles.supplyShort}>
              Thiếu {req.shortage} {req.unit}
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}

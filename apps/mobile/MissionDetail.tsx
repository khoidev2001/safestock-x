import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import {
  acceptWarehouseMaterialRequest,
  fetchMission,
  fetchWarehouseMaterialRequests,
  prepareWarehouseMaterialRequest,
  reportWarehouseMaterialDiscrepancy,
  submitFieldUpdate,
  transcribe,
  type MissionDetail,
  type WarehouseMaterialRequest,
} from "./api";
import { c, styles } from "./styles";
import { assessDanger, disasterOf, formatLongTime } from "./disaster";
import { supplyOf, supplyProgress } from "./supplies";
import { readOfflineCache, writeOfflineCache } from "./offline-cache";
import { FIELD_FORCE_ROLE_LABEL } from "./role-labels";
import { isRecordingSupported, startRecording, type AudioRecording } from "./audio";

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Nháp",
  PENDING_RESCUE: `Chờ ${FIELD_FORCE_ROLE_LABEL} xác nhận`,
  RESCUE_CONFIRMED: "Đã xác nhận",
  PENDING_WAREHOUSE: "Chờ kho chuẩn bị",
  READY: "Kho đã sẵn sàng",
  COMPLETED: "Hoàn thành",
  REJECTED: "Đã từ chối",
  DEFERRED: "Tạm hoãn",
  CANCELLED: "Đã huỷ",
};

/** Màn chỉ đọc phương án, kèm Trợ lý hiện trường có xác nhận của người dùng. */
export function MissionDetailScreen({
  token,
  userId,
  role,
  missionId,
  onBack,
}: {
  token: string;
  userId: string;
  role: string;
  missionId: string;
  onBack: () => void;
}) {
  const [mission, setMission] = useState<MissionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cacheStoredAt, setCacheStoredAt] = useState<string | null>(null);
  const [fieldUpdateText, setFieldUpdateText] = useState("");
  const [fieldUpdateMode, setFieldUpdateMode] = useState<"TEXT" | "VOICE_TRANSCRIPT">("TEXT");
  const [fieldUpdateBusy, setFieldUpdateBusy] = useState(false);
  const [fieldVoiceBusy, setFieldVoiceBusy] = useState(false);
  const [fieldRecording, setFieldRecording] = useState(false);
  const [warehouseActionId, setWarehouseActionId] = useState<string | null>(null);
  const [warehouseNotes, setWarehouseNotes] = useState<Record<string, string>>({});
  const recordingRef = useRef<AudioRecording | null>(null);

  useEffect(
    () => () => {
      void recordingRef.current?.stop();
      recordingRef.current = null;
    },
    [],
  );

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
      if (role === "WAREHOUSE") {
        const ownRequests = await fetchWarehouseMaterialRequests(token);
        latest.warehouseRequests = ownRequests.filter(
          (request) => request.missionId === missionId,
        );
      }
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
  }, [token, userId, missionId, role]);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleFieldVoice() {
    setError(null);
    if (fieldRecording) {
      setFieldVoiceBusy(true);
      try {
        const audioBase64 = await recordingRef.current?.stop();
        recordingRef.current = null;
        setFieldRecording(false);
        if (!audioBase64) return;
        const result = await transcribe(token, audioBase64);
        if (result.text.trim()) {
          setFieldUpdateText(result.text.trim());
          setFieldUpdateMode("VOICE_TRANSCRIPT");
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Không nhận dạng được giọng nói");
      } finally {
        setFieldVoiceBusy(false);
      }
      return;
    }
    try {
      recordingRef.current = await startRecording();
      setFieldRecording(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không thể mở ghi âm");
    }
  }

  async function submitFieldObservation() {
    if (fieldUpdateText.trim().length === 0) {
      setError("Hãy nhập hoặc ghi âm nội dung trước khi xác nhận gửi.");
      return;
    }
    setFieldUpdateBusy(true);
    setError(null);
    try {
      await submitFieldUpdate(token, missionId, {
        requestId: fieldRequestId(),
        inputMode: fieldUpdateMode,
        confirmedText: fieldUpdateText.trim(),
        confirmedByUser: true,
        clientCapturedAt: new Date().toISOString(),
      });
      setFieldUpdateText("");
      setFieldUpdateMode("TEXT");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không gửi được cập nhật hiện trường");
    } finally {
      setFieldUpdateBusy(false);
    }
  }

  async function updateWarehouseRequest(
    kind: "accept" | "prepare" | "discrepancy",
    request: WarehouseMaterialRequest,
  ) {
    setWarehouseActionId(request.id);
    setError(null);
    try {
      const note = warehouseNotes[request.id]?.trim();
      if (kind === "discrepancy" && (!note || note.length < 3)) {
        throw new Error("Cần ghi rõ chênh lệch (ít nhất 3 ký tự).");
      }
      if (kind === "accept") {
        await acceptWarehouseMaterialRequest(token, request.id, note || undefined);
      } else if (kind === "prepare") {
        await prepareWarehouseMaterialRequest(token, request.id);
      } else {
        await reportWarehouseMaterialDiscrepancy(token, request.id, note as string);
      }
      setWarehouseNotes((current) => ({ ...current, [request.id]: "" }));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không cập nhật được yêu cầu vật tư");
    } finally {
      setWarehouseActionId(null);
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

          {role === "WAREHOUSE" && (mission.warehouseRequests?.length ?? 0) > 0 ? (
            <WarehouseMaterialRequestPanel
              requests={mission.warehouseRequests ?? []}
              notes={warehouseNotes}
              busyRequestId={warehouseActionId}
              onNoteChange={(requestId, note) =>
                setWarehouseNotes((current) => ({ ...current, [requestId]: note }))
              }
              onAction={(kind, request) => void updateWarehouseRequest(kind, request)}
              offline={Boolean(cacheStoredAt)}
            />
          ) : null}

          {role === "RESCUE" && !cacheStoredAt ? (
            <FieldUpdatePanel
              text={fieldUpdateText}
              onChange={(text) => {
                setFieldUpdateText(text);
                setFieldUpdateMode("TEXT");
              }}
              onVoice={() => void toggleFieldVoice()}
              onSubmit={() => void submitFieldObservation()}
              voiceAvailable={isRecordingSupported()}
              recording={fieldRecording}
              voiceBusy={fieldVoiceBusy}
              submitting={fieldUpdateBusy}
            />
          ) : null}

          {error ? <Text style={[styles.errorText, { marginTop: 12 }]}>{error}</Text> : null}

          <View style={{ marginTop: 20 }}>
            <View style={[styles.statusBadge, { backgroundColor: c.surfaceAlt }]}>
              <Text style={[styles.statusText, { color: c.text }]}>
                {STATUS_LABEL[mission.status] ?? mission.status}
              </Text>
            </View>
            <Text style={[styles.emptyText, { marginTop: 10, textAlign: "left" }]}>
              {mission.status === "READY"
                ? "Các kho đã chuẩn bị xong vật tư. Việc liên hệ và triển khai do con người quyết định ngoài thực tế."
                : "Bạn nhận thông tin phương án và tự đến các điểm lấy vật tư; ứng dụng không phân công cá nhân hoặc đội."}
            </Text>
            {mission.status === "COMPLETED" && mission.deliveryNote ? (
              <Text style={[styles.emptyText, { marginTop: 8, textAlign: "left" }]}>
                Ghi chú lịch sử: {mission.deliveryNote}
              </Text>
            ) : null}
          </View>
        </ScrollView>
      ) : null}
    </View>
  );
}

function WarehouseMaterialRequestPanel({
  requests,
  notes,
  busyRequestId,
  onNoteChange,
  onAction,
  offline,
}: {
  requests: WarehouseMaterialRequest[];
  notes: Record<string, string>;
  busyRequestId: string | null;
  onNoteChange: (requestId: string, note: string) => void;
  onAction: (
    kind: "accept" | "prepare" | "discrepancy",
    request: WarehouseMaterialRequest,
  ) => void;
  offline: boolean;
}) {
  const prepared = requests.filter((request) => request.status === "PREPARED").length;
  return (
    <View style={{ marginTop: 18 }}>
      <Text style={styles.sectionTitle}>
        Chuẩn bị theo vật tư ({prepared}/{requests.length})
      </Text>
      <Text style={[styles.emptyText, { textAlign: "left", marginBottom: 10 }]}>
        Tiếp nhận từng dòng, kiểm tra lô thực tế rồi mới xác nhận xuất. Mỗi dòng chỉ xuất một lần.
      </Text>
      {requests.map((request) => {
        const busy = busyRequestId === request.id;
        return (
          <View
            key={request.id}
            style={{
              backgroundColor: c.surface,
              borderWidth: 1,
              borderColor: request.status === "PREPARED" ? c.green : c.border,
              borderRadius: 12,
              padding: 14,
              marginBottom: 10,
            }}
          >
            <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: c.text, fontSize: 15, fontWeight: "800" }}>
                  {request.itemName}
                </Text>
                <Text style={{ color: c.muted, fontSize: 12, marginTop: 3 }}>
                  {request.sku}
                </Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={{ color: c.text, fontSize: 15, fontWeight: "800" }}>
                  {request.status === "PREPARED"
                    ? request.preparedQuantity
                    : request.requestedQuantity}{" "}
                  {request.unit}
                </Text>
                <Text style={{ color: request.status === "PREPARED" ? c.green : c.amber, fontSize: 11, fontWeight: "800", marginTop: 3 }}>
                  {warehouseRequestStatus(request.status)}
                </Text>
              </View>
            </View>

            {request.adminNote ? (
              <Text style={{ color: c.muted, fontSize: 12, lineHeight: 18, marginTop: 8 }}>
                Điều phối: {request.adminNote}
              </Text>
            ) : null}
            {request.warehouseNote ? (
              <Text style={{ color: c.amber, fontSize: 12, lineHeight: 18, marginTop: 8 }}>
                Đã báo: {request.warehouseNote}
              </Text>
            ) : null}

            {request.status !== "PREPARED" && !offline ? (
              <>
                <TextInput
                  value={notes[request.id] ?? ""}
                  onChangeText={(text) => onNoteChange(request.id, text)}
                  placeholder="Ghi chú tiếp nhận hoặc mô tả thiếu/sai"
                  placeholderTextColor={c.muted}
                  multiline
                  maxLength={1_000}
                  style={[styles.reasonInput, { marginTop: 10, marginBottom: 8 }]}
                  accessibilityLabel={`Ghi chú cho ${request.itemName}`}
                />
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  <Pressable
                    disabled={busy}
                    onPress={() =>
                      onAction(request.status === "PENDING" ? "accept" : "prepare", request)
                    }
                    accessibilityRole="button"
                    style={[
                      styles.actionButton,
                      { flexGrow: 1, opacity: busy ? 0.6 : 1 },
                    ]}
                  >
                    <Text style={styles.actionButtonText}>
                      {busy
                        ? "Đang xử lý…"
                        : request.status === "PENDING"
                          ? "Tiếp nhận"
                          : "Xác nhận xuất"}
                    </Text>
                  </Pressable>
                  <Pressable
                    disabled={busy}
                    onPress={() => onAction("discrepancy", request)}
                    accessibilityRole="button"
                    style={{
                      borderWidth: 1,
                      borderColor: c.amber,
                      borderRadius: 10,
                      paddingHorizontal: 12,
                      paddingVertical: 11,
                      opacity: busy ? 0.6 : 1,
                    }}
                  >
                    <Text style={{ color: c.amber, fontSize: 13, fontWeight: "800" }}>
                      Báo thiếu / sai
                    </Text>
                  </Pressable>
                </View>
              </>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

function warehouseRequestStatus(status: WarehouseMaterialRequest["status"]): string {
  if (status === "PENDING") return "CHỜ TIẾP NHẬN";
  if (status === "ACCEPTED") return "ĐÃ TIẾP NHẬN";
  return "ĐÃ XUẤT";
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

function FieldUpdatePanel({
  text,
  onChange,
  onVoice,
  onSubmit,
  voiceAvailable,
  recording,
  voiceBusy,
  submitting,
}: {
  text: string;
  onChange: (text: string) => void;
  onVoice: () => void;
  onSubmit: () => void;
  voiceAvailable: boolean;
  recording: boolean;
  voiceBusy: boolean;
  submitting: boolean;
}) {
  return (
    <View style={[styles.reasonBox, { marginTop: 16 }]}>
      <Text style={styles.reasonTitle}>Trợ lý hiện trường</Text>
      <Text style={[styles.emptyText, { textAlign: "left", marginBottom: 8 }]}>
        Gõ hoặc nói, xem lại nội dung rồi xác nhận gửi. Không gửi audio thô hoặc vị trí GPS.
      </Text>
      <TextInput
        style={styles.reasonInput}
        value={text}
        onChangeText={onChange}
        multiline
        placeholder="Ví dụ: đường vào thôn bị chắn, cần xác minh tuyến thay thế"
        placeholderTextColor={c.muted}
        accessibilityLabel="Nội dung cập nhật hiện trường"
      />
      <View style={styles.actionRow}>
        {voiceAvailable ? (
          <Pressable
            style={[styles.btnReject, (voiceBusy || submitting) && { opacity: 0.6 }]}
            onPress={onVoice}
            disabled={voiceBusy || submitting}
            accessibilityRole="button"
            accessibilityLabel={recording ? "Dừng ghi âm và chuyển thành chữ" : "Ghi âm cập nhật hiện trường"}
          >
            <Text style={styles.btnRejectText}>
              {voiceBusy ? "Đang nhận dạng…" : recording ? "Dừng ghi âm" : "Ghi âm"}
            </Text>
          </Pressable>
        ) : null}
        <Pressable
          style={[styles.btnAccept, (submitting || text.trim().length === 0) && { opacity: 0.6 }]}
          onPress={onSubmit}
          disabled={submitting || text.trim().length === 0}
          accessibilityRole="button"
          accessibilityLabel="Xác nhận gửi cập nhật hiện trường"
        >
          <Text style={styles.btnAcceptText}>{submitting ? "Đang gửi…" : "Xác nhận gửi"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function fieldRequestId() {
  return `field-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
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

  // Thiếu lên trước để Lực lượng hiện trường thấy ngay điều cần chú ý.
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

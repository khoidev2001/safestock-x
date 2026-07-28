import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { fetchMission, type MissionDetail } from "./api";
import { c, styles } from "./styles";
import { assessDanger, disasterOf, formatLongTime } from "./disaster";
import { supplyOf, supplyProgress } from "./supplies";

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

/** Màn chi tiết chỉ đọc: cứu hộ tự xem và tới các kho trong phương án. */
export function MissionDetailScreen({
  token,
  missionId,
  onBack,
}: {
  token: string;
  missionId: string;
  onBack: () => void;
  onResolved?: () => void;
}) {
  const [mission, setMission] = useState<MissionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
          <MissionHero mission={mission} />

          <Text style={styles.sectionTitle}>Điểm lấy vật tư</Text>
          <Text style={styles.emptyText}>
            Thôn báo cáo: {mission.warehouse?.name ?? "Chưa xác định"}
          </Text>
          {mission.warehouseRequests && mission.warehouseRequests.length > 0 ? (
            mission.warehouseRequests.map((request) => (
              <View key={request.id} style={styles.infoCard}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.infoTitle}>{request.warehouse.name}</Text>
                  <Text style={styles.infoBody}>
                    {request.itemName}: {request.requestedQuantity} {request.unit} ·{" "}
                    {request.status === "PREPARED"
                      ? "đã sẵn sàng"
                      : request.status === "ACCEPTED"
                        ? "đang chuẩn bị"
                        : "chờ kho tiếp nhận"}
                  </Text>
                </View>
              </View>
            ))
          ) : (
            <Text style={styles.emptyText}>Chưa có danh sách kho được duyệt.</Text>
          )}

          <View style={styles.factRow}>
            <Fact label="Nhận lúc" value={mission.createdAt ? formatLongTime(mission.createdAt) : "—"} />
            <Fact label="Thời lượng" value={`${mission.durationHours} giờ`} />
            <Fact label="Đáp ứng" value={`${mission.fulfillment}%`} />
          </View>

          <SuppliesSection requirements={mission.requirements} />

          {error ? <Text style={[styles.errorText, { marginTop: 12 }]}>{error}</Text> : null}

          <View style={{ marginTop: 20 }}>
              <View style={[styles.statusBadge, { backgroundColor: c.surfaceAlt }]}>
                <Text style={[styles.statusText, { color: c.text }]}>
                  {STATUS_LABEL[mission.status] ?? mission.status}
                </Text>
              </View>
              <Text style={[styles.emptyText, { marginTop: 10, textAlign: "left" }]}>
                Đội cứu hộ chỉ nhận thông tin và tự tới các kho trong phương án để lấy vật tư.
              </Text>
          </View>
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

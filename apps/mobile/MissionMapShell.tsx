import { useMemo, useState, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { buildMissionMapHtml, type MissionMapData } from "./mission-map-html";
import { c, styles } from "./styles";

/**
 * Phần vỏ của bản đồ nhiệm vụ (chỉ xem) — dùng chung cho điện thoại và Expo Web.
 *
 * Chỉ có MẶT BẢN ĐỒ khác nhau giữa hai nền (`react-native-webview` trên máy thật,
 * `<iframe>` trên trình duyệt), nên phần đó nhận vào qua `renderSurface`. Vỏ giữ
 * nguyên một bản để chữ nghĩa, chiều cao và nút phóng to giống hệt nhau ở hai nơi.
 *
 * Bản đồ MỞ SẴN, không giấu sau một nút bấm: người đi cứu hộ mở nhiệm vụ ra là để
 * biết chỗ nào, bắt bấm thêm một nút mới thấy thì thứ quan trọng nhất lại nằm sau
 * một thao tác thừa.
 */
export interface MissionMapSurfaceProps {
  html: string;
  /** Chuỗi JSON trang Leaflet gửi ra (`ready` / `error`). Vỏ tự parse. */
  onMessage: (raw: string) => void;
}

export function MissionMapShell({
  data,
  loading,
  renderSurface,
}: {
  data: MissionMapData;
  loading: boolean;
  renderSurface: (props: MissionMapSurfaceProps) => ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const [failed, setFailed] = useState(false);

  /**
   * HTML dựng lại khi dữ liệu đổi — và CHỈ khi đó.
   *
   * Mỗi lần chuỗi này đổi là khung bản đồ tải lại từ đầu: về tâm cũ, mất mức phóng
   * người dùng vừa chỉnh. Nên nút phóng to KHÔNG nằm trong danh sách phụ thuộc —
   * nó chỉ đổi chiều cao khung, bản đồ bên trong giữ nguyên.
   */
  const html = useMemo(() => buildMissionMapHtml(data), [data]);

  function handleMessage(raw: string) {
    try {
      const message = JSON.parse(raw) as { type?: string };
      if (message.type === "ready") setFailed(false);
      else if (message.type === "error") setFailed(true);
    } catch {
      // Thông điệp lạ từ trang: bỏ qua. Một chuỗi JSON hỏng không được phép làm
      // sập màn nhiệm vụ giữa lúc đang đi cứu hộ.
    }
  }

  const hasAnything = data.incident != null || data.warehouses.length > 0;

  return (
    <View style={{ marginTop: 18 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <Text style={[styles.sectionTitle, { marginBottom: 0, flexShrink: 1 }]}>
          Bản đồ điểm gặp nạn
        </Text>
        <View
          style={{
            borderRadius: 999,
            paddingHorizontal: 9,
            paddingVertical: 3,
            backgroundColor: c.surfaceAlt,
            borderWidth: 1,
            borderColor: c.border,
          }}
        >
          <Text style={{ color: c.muted, fontSize: 10, fontWeight: "800" }}>CHỈ XEM</Text>
        </View>
      </View>
      <Text style={[styles.emptyText, { textAlign: "left", marginTop: 4, marginBottom: 8 }]}>
        Kéo và phóng to để xem đường đi. Bản đồ này chỉ để xem — điểm gặp nạn do trưởng thôn ghim và
        cơ quan điều phối đã duyệt.
      </Text>

      {loading ? (
        <View style={[styles.skeleton, { height: 180 }]} />
      ) : !hasAnything ? (
        <View
          style={{
            borderWidth: 1,
            borderColor: c.border,
            borderRadius: 12,
            padding: 14,
            backgroundColor: c.surfaceAlt,
          }}
        >
          <Text style={{ color: c.muted, fontSize: 13, lineHeight: 19 }}>
            Phương án chưa có toạ độ điểm gặp nạn. Xem tên địa điểm ở đầu màn hình và hỏi lại cơ
            quan điều phối trước khi xuất phát.
          </Text>
        </View>
      ) : (
        <>
          <View
            style={{
              height: expanded ? 460 : 260,
              borderRadius: 12,
              overflow: "hidden",
              borderWidth: 1,
              borderColor: c.border,
              backgroundColor: "#e9edf2",
            }}
          >
            {renderSurface({ html, onMessage: handleMessage })}
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => setExpanded((value) => !value)}
            style={{
              marginTop: 8,
              borderWidth: 1,
              borderColor: c.border,
              borderRadius: 10,
              paddingVertical: 10,
              alignItems: "center",
              backgroundColor: c.surface,
            }}
          >
            <Text style={{ color: c.primary, fontSize: 13, fontWeight: "800" }}>
              {expanded ? "Thu gọn bản đồ" : "Phóng to bản đồ"}
            </Text>
          </Pressable>
        </>
      )}

      {failed ? (
        <Text style={{ color: c.muted, fontSize: 12, marginTop: 6 }}>
          Không tải được bản đồ (cần Internet). Danh sách kho, quãng đường và vật tư bên dưới vẫn
          đọc được.
        </Text>
      ) : null}
    </View>
  );
}

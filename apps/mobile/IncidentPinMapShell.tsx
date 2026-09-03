import { useMemo, useState, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { buildPinMapHtml, type PinnedPoint } from "./incident-pin-map-html";
import { c } from "./styles";

/**
 * Phần vỏ của bản đồ ghim: nút mở/đóng, toạ độ đang ghim, nút bỏ ghim, và xử lý
 * thông điệp từ trang Leaflet bên trong.
 *
 * Chỉ có MẶT BẢN ĐỒ là khác nhau giữa hai nền (`react-native-webview` trên điện
 * thoại, `<iframe>` trên Expo Web), nên phần đó nhận vào qua `renderSurface`. Vỏ
 * giữ nguyên một bản: nút, chữ, cách hiện toạ độ và luật "bấm dấu ghim là bỏ" phải
 * giống hệt nhau ở hai nơi, người dùng chuyển qua lại không phải học lại.
 */
export interface PinMapSurfaceProps {
  html: string;
  /** Chuỗi JSON trang Leaflet gửi ra. Vỏ tự parse; nền chỉ cần chuyển tiếp. */
  onMessage: (raw: string) => void;
}

export function IncidentPinMapShell({
  point,
  onChange,
  disabled = false,
  renderSurface,
}: {
  point: PinnedPoint | null;
  onChange: (point: PinnedPoint | null) => void;
  disabled?: boolean;
  renderSurface: (props: PinMapSurfaceProps) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);

  /**
   * HTML dựng MỘT LẦN cho mỗi lượt mở, cố tình không phụ thuộc `point`.
   *
   * Cho `point` vào đây thì mỗi lần ghim là `html` đổi → khung bản đồ tải lại →
   * nhảy về zoom ban đầu ngay khi vừa bấm. Điểm ban đầu chỉ cần lúc mở để dựng lại
   * dấu ghim cũ; từ đó trở đi bên trong trang tự quản.
   */
  const html = useMemo(() => buildPinMapHtml(point), [open]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleMessage(raw: string) {
    try {
      const data = JSON.parse(raw) as { type?: string; lat?: number; lng?: number };
      if (data.type === "pin" && data.lat != null && data.lng != null) {
        setFailed(false);
        onChange({ lat: data.lat, lng: data.lng });
      } else if (data.type === "clear") {
        onChange(null);
      } else if (data.type === "ready") {
        setFailed(false);
      } else if (data.type === "error") {
        setFailed(true);
      }
    } catch {
      // Thông điệp lạ từ trang: bỏ qua. Không được để một chuỗi JSON hỏng làm sập
      // màn báo cáo giữa lúc đang gấp.
    }
  }

  return (
    <View style={{ marginTop: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Pressable
          disabled={disabled}
          onPress={() => setOpen((v) => !v)}
          style={{
            flex: 1,
            borderWidth: 1,
            borderColor: c.border,
            borderRadius: 10,
            paddingVertical: 11,
            paddingHorizontal: 12,
            backgroundColor: c.surface,
            opacity: disabled ? 0.6 : 1,
          }}
        >
          <Text style={{ color: c.text, fontWeight: "700", fontSize: 14 }}>
            {open ? "Đóng bản đồ" : point ? "Sửa điểm đã ghim" : "Ghim vị trí trên bản đồ"}
          </Text>
          <Text style={{ color: c.muted, fontSize: 12, marginTop: 3 }}>
            {point
              ? `${point.lat.toFixed(6)}, ${point.lng.toFixed(6)}`
              : "Không bắt buộc — nhưng ghim thì cơ quan điều phối biết chính xác chỗ cần tới"}
          </Text>
        </Pressable>
        {point ? (
          <Pressable
            disabled={disabled}
            onPress={() => onChange(null)}
            style={{
              borderWidth: 1,
              borderColor: c.border,
              borderRadius: 10,
              paddingVertical: 11,
              paddingHorizontal: 12,
              backgroundColor: c.surface,
            }}
          >
            <Text style={{ color: c.red, fontWeight: "700", fontSize: 13 }}>Bỏ ghim</Text>
          </Pressable>
        ) : null}
      </View>

      {open ? (
        <View
          style={{
            height: 320,
            marginTop: 8,
            borderRadius: 10,
            overflow: "hidden",
            borderWidth: 1,
            borderColor: c.border,
            backgroundColor: "#e9edf2",
          }}
        >
          {renderSurface({ html, onMessage: handleMessage })}
        </View>
      ) : null}

      {failed ? (
        <Text style={{ color: c.muted, fontSize: 12, marginTop: 6 }}>
          Không tải được bản đồ (cần Internet). Vẫn gửi được báo cáo bằng lời kể.
        </Text>
      ) : null}
    </View>
  );
}

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
/**
 * Lệnh vỏ gửi XUỐNG trang Leaflet. `id` tăng dần mỗi lần phát để nền nhận ra
 * "lệnh mới" — hai lần bỏ ghim liên tiếp có cùng `name`, không có `id` thì
 * `useEffect` bên nền không chạy lại.
 *
 * Cố tình để tên lệnh dạng ngữ nghĩa chứ không phải đoạn JS: điện thoại chạy nó
 * bằng `injectJavaScript`, còn Expo Web bằng `postMessage`, hai cách hoàn toàn
 * khác nhau. Vỏ nói CẦN GÌ, mỗi nền tự lo cách nói xuống.
 */
export interface PinMapCommand {
  id: number;
  name: "clear";
}

export interface PinMapSurfaceProps {
  html: string;
  /** Chuỗi JSON trang Leaflet gửi ra. Vỏ tự parse; nền chỉ cần chuyển tiếp. */
  onMessage: (raw: string) => void;
  /** Lệnh mới nhất cần chuyển xuống trang, hoặc null khi chưa có lệnh nào. */
  command: PinMapCommand | null;
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
  const [command, setCommand] = useState<PinMapCommand | null>(null);

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

  /**
   * Bỏ ghim: vừa xoá toạ độ ở vỏ, vừa bảo trang Leaflet gỡ dấu ghim.
   *
   * Thiếu vế thứ hai thì bản đồ vẫn hiện chấm đỏ và dòng "Đã ghim 13.374172,
   * 109.103508 …" sau khi bấm — hai nửa cùng một màn hình nói hai điều trái ngược.
   */
  function clearPin() {
    onChange(null);
    setCommand((prev) => ({ id: (prev?.id ?? 0) + 1, name: "clear" }));
  }

  /**
   * Bản đồ ghim là bước dễ bị lướt qua nhất trong màn báo cáo: nó nằm giữa hai
   * việc bắt buộc (gõ/đọc mô tả và bấm gửi) nhưng bản thân lại không bắt buộc.
   * Nên khối này phải TỰ NÓI nó là gì — biểu tượng ghim, khối màu, và đổi hẳn
   * sang xanh lá khi đã ghim — thay vì trông như một dòng chữ xám nữa.
   */
  const pinned = point != null;
  const accent = pinned ? c.green : c.primary;
  const accentSoft = pinned ? "rgba(21,128,61,0.10)" : c.primarySoft;

  return (
    /* Cách nút "Gửi báo cáo" một khoảng rõ rệt: hai thứ này khác hẳn nhau về hệ
       quả (ghim thì sửa được, gửi thì không), không được dính sát nhau. */
    <View style={{ marginTop: 4, marginBottom: 24 }}>
      <Text style={{ color: c.text, fontSize: 14, fontWeight: "700", marginBottom: 8 }}>
        Ghim vị trí trên bản đồ
      </Text>

      <View style={{ flexDirection: "row", alignItems: "stretch", gap: 8 }}>
        <Pressable
          disabled={disabled}
          onPress={() => setOpen((v) => !v)}
          accessibilityRole="button"
          style={{
            flex: 1,
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            borderWidth: 1.5,
            borderColor: accent,
            borderRadius: 12,
            paddingVertical: 12,
            paddingHorizontal: 12,
            backgroundColor: accentSoft,
            opacity: disabled ? 0.6 : 1,
          }}
        >
          <View
            style={{
              width: 38,
              height: 38,
              borderRadius: 19,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: accent,
            }}
          >
            <Text style={{ fontSize: 19 }}>{pinned ? "✅" : "📍"}</Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ color: accent, fontWeight: "700", fontSize: 15 }}>
              {open ? "Đóng bản đồ" : pinned ? "Đã ghim — bấm để sửa" : "Bấm để ghim vị trí"}
            </Text>
            <Text style={{ color: pinned ? c.text : c.muted, fontSize: 12, marginTop: 3 }}>
              {point
                ? `${point.lat.toFixed(6)}, ${point.lng.toFixed(6)}`
                : "Không bắt buộc — nhưng ghim thì cơ quan điều phối biết chính xác chỗ cần tới"}
            </Text>
          </View>
        </Pressable>
        {point ? (
          <Pressable
            disabled={disabled}
            onPress={clearPin}
            accessibilityRole="button"
            accessibilityLabel="Bỏ điểm đã ghim"
            style={{
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1.5,
              borderColor: c.red,
              borderRadius: 12,
              paddingHorizontal: 14,
              backgroundColor: "rgba(220,38,38,0.08)",
              opacity: disabled ? 0.6 : 1,
            }}
          >
            <Text style={{ fontSize: 16 }}>🗑️</Text>
            <Text style={{ color: c.red, fontWeight: "700", fontSize: 11, marginTop: 2 }}>
              Bỏ ghim
            </Text>
          </Pressable>
        ) : null}
      </View>

      {open ? (
        <View
          style={{
            height: 320,
            marginTop: 8,
            borderRadius: 12,
            overflow: "hidden",
            borderWidth: 1.5,
            borderColor: accent,
            backgroundColor: "#e9edf2",
          }}
        >
          {renderSurface({ html, onMessage: handleMessage, command })}
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

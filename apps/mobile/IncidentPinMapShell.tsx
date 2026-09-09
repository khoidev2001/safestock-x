import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Modal, Pressable, Text, View } from "react-native";
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
  /**
   * MỞ SẴN mỗi lần vào màn báo cáo.
   *
   * Ghim vị trí là thứ quyết định cơ quan điều phối đi tới đâu, nhưng nó lại là
   * bước duy nhất không bắt buộc trong màn này — đóng sẵn thì nó chỉ còn là một
   * cái nút giữa hai việc bắt buộc, và người báo lướt qua. Mở sẵn thì bản đồ tự
   * mời ghim. Ai không cần vẫn đóng lại được, nhưng lần vào sau lại mở: đó là
   * lựa chọn cho MỘT lượt báo cáo, không phải một thiết lập cần nhớ.
   */
  const [open, setOpen] = useState(true);
  /** Bản đồ đang chiếm trọn màn hình — ghim chính xác trên khung to. */
  const [fullscreen, setFullscreen] = useState(false);
  const [failed, setFailed] = useState(false);
  const [command, setCommand] = useState<PinMapCommand | null>(null);

  /**
   * HTML dựng lại MỖI LẦN khung bản đồ được gắn mới, cố tình không phụ thuộc `point`.
   *
   * Cho `point` vào danh sách phụ thuộc thì mỗi lần ghim là `html` đổi → khung bản
   * đồ tải lại → nhảy về zoom ban đầu ngay khi vừa bấm. Điểm ban đầu chỉ cần lúc
   * dựng để vẽ lại dấu ghim cũ; từ đó trở đi bên trong trang tự quản.
   *
   * Vào/ra toàn màn hình cũng dựng khung mới (khung nằm ở hai chỗ khác nhau trong
   * cây), nên `fullscreen` phải nằm trong danh sách — thiếu nó thì bản đồ toàn màn
   * hình dựng lại bằng HTML cũ và mất dấu ghim vừa đặt.
   */
  const html = useMemo(() => buildPinMapHtml(point), [open, fullscreen]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Bỏ dấu ghim khỏi trang Leaflet mỗi khi toạ độ ở vỏ mất đi.
   *
   * Dấu ghim sống BÊN TRONG trang Leaflet, ngoài tầm với của React: xoá `point` ở
   * vỏ mà không nói xuống thì bản đồ vẫn hiện chấm đỏ và dòng "Đã ghim 13.374172,
   * …". Chỗ đau nhất là sau khi GỬI BÁO CÁO — màn báo cáo tự dọn `point` để người
   * ta khai vụ tiếp theo, nhưng bản đồ vẫn cắm cờ ở chỗ vừa gửi, nên người báo
   * tưởng vụ mới đã có sẵn toạ độ và không ghim lại.
   *
   * Đặt ở đây chứ không ở nút "Bỏ ghim": một hiệu ứng bám theo `point` bắt được
   * MỌI đường xoá — nút bỏ ghim, gửi xong, hay bất kỳ chỗ nào khác sau này — thay
   * vì phải nhớ gọi lệnh ở từng chỗ.
   */
  const hadPointRef = useRef(point != null);
  useEffect(() => {
    const had = hadPointRef.current;
    hadPointRef.current = point != null;
    if (!had || point != null) return;
    setCommand((prev) => ({ id: (prev?.id ?? 0) + 1, name: "clear" }));
  }, [point]);

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
   * Bỏ ghim: chỉ xoá toạ độ ở vỏ.
   *
   * Việc gỡ dấu ghim trên trang Leaflet do hiệu ứng bám `point` ở trên lo — nó
   * bắt mọi đường xoá chứ không riêng nút này.
   */
  function clearPin() {
    onChange(null);
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
              {open
                ? pinned
                  ? "Đã ghim — bấm để đóng bản đồ"
                  : "Đóng bản đồ"
                : pinned
                  ? "Đã ghim — bấm để sửa"
                  : "Bấm để ghim vị trí"}
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

      {/* Khung bản đồ chỉ được dựng ở ĐÚNG MỘT chỗ: hoặc trong dòng, hoặc trong
          khung toàn màn hình. Dựng cả hai là hai WebView cùng chạy một trang
          Leaflet, và cú bấm ghim ở khung này không đến được khung kia. */}
      {open && !fullscreen ? (
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
          {/* Nút phóng to nằm ĐÈ LÊN góc phải bản đồ, không phải một nút nữa
              trong hàng bên trên: hàng đó đã có hai nút và đây là thao tác VỀ
              bản đồ, đặt ngay trên nó thì không phải giải thích nó tác động lên
              cái gì. Góc trái trên đã có nút phóng to/thu nhỏ của Leaflet. */}
          <Pressable
            disabled={disabled}
            onPress={() => setFullscreen(true)}
            accessibilityRole="button"
            accessibilityLabel="Mở bản đồ toàn màn hình"
            style={{
              position: "absolute",
              top: 8,
              right: 8,
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: accent,
              paddingVertical: 7,
              paddingHorizontal: 10,
              backgroundColor: "rgba(255,255,255,0.94)",
              opacity: disabled ? 0.6 : 1,
            }}
          >
            <Text style={{ fontSize: 14 }}>⛶</Text>
            <Text style={{ color: accent, fontWeight: "700", fontSize: 12 }}>Toàn màn hình</Text>
          </Pressable>
        </View>
      ) : null}

      {/* Toàn màn hình: ghim một mái nhà giữa vùng ngập cần phóng tới mức mà khung
          cao 320px không cho. `onRequestClose` bắt nút Back của Android — thoát
          bằng cử chỉ quen thuộc thay vì phải tìm nút trên màn hình. */}
      <Modal
        visible={open && fullscreen}
        animationType="slide"
        onRequestClose={() => setFullscreen(false)}
        statusBarTranslucent={false}
      >
        <View style={{ flex: 1, backgroundColor: "#e9edf2" }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              paddingVertical: 12,
              paddingHorizontal: 14,
              backgroundColor: c.surface,
              borderBottomWidth: 1,
              borderBottomColor: accent,
            }}
          >
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ color: c.text, fontSize: 15, fontWeight: "700" }}>
                Ghim vị trí trên bản đồ
              </Text>
              {/* Toạ độ phải đọc được Ở ĐÂY luôn: khối tóm tắt bên ngoài đang bị
                  che kín, nên không có dòng này thì người ghim xong không có gì
                  xác nhận là hệ thống đã nhận đúng điểm. */}
              <Text style={{ color: pinned ? c.text : c.muted, fontSize: 12, marginTop: 2 }}>
                {point
                  ? `${point.lat.toFixed(6)}, ${point.lng.toFixed(6)} — kéo để dời, bấm dấu ghim để bỏ`
                  : "Bấm lên bản đồ để ghim chỗ đang xảy ra sự việc"}
              </Text>
            </View>
            <Pressable
              onPress={() => setFullscreen(false)}
              accessibilityRole="button"
              accessibilityLabel="Thu nhỏ bản đồ"
              style={{
                borderWidth: 1.5,
                borderColor: accent,
                borderRadius: 10,
                paddingVertical: 9,
                paddingHorizontal: 14,
                backgroundColor: accentSoft,
              }}
            >
              <Text style={{ color: accent, fontWeight: "700", fontSize: 13 }}>Xong</Text>
            </Pressable>
          </View>
          <View style={{ flex: 1 }}>
            {renderSurface({ html, onMessage: handleMessage, command })}
          </View>
        </View>
      </Modal>

      {failed ? (
        <Text style={{ color: c.muted, fontSize: 12, marginTop: 6 }}>
          Không tải được bản đồ (cần Internet). Vẫn gửi được báo cáo bằng lời kể.
        </Text>
      ) : null}
    </View>
  );
}

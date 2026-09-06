import { useEffect, useRef } from "react";
import { WebView } from "react-native-webview";
import { IncidentPinMapShell, type PinMapSurfaceProps } from "./IncidentPinMapShell";
import { type PinnedPoint } from "./incident-pin-map-html";

export { type PinnedPoint } from "./incident-pin-map-html";

/**
 * Bản đồ ghim điểm gặp nạn — bản ĐIỆN THOẠI (Android/iOS).
 *
 * Expo Web dùng `IncidentPinMap.web.tsx`; Metro tự chọn theo nền, không cần kiểm
 * `Platform.OS` ở đây. Nhờ vậy `react-native-webview` KHÔNG lọt vào bundle web —
 * gói đó trên react-native-web chỉ render một dòng chữ đỏ "does not support this
 * platform".
 *
 * Vì sao WebView chứ không `react-native-maps`: bản đồ này phải dùng ĐÚNG bộ tile
 * mà web đang dùng (Esri World Imagery + nhãn CARTO) để hai bên nhìn giống nhau
 * tuyệt đối — trưởng thôn ghim một mái nhà, admin mở web phải thấy cùng mái nhà đó.
 * `react-native-maps` kéo theo Google Maps SDK, cần API key riêng, và render nền
 * khác hẳn nên cùng một toạ độ lại ra hai bức ảnh khác nhau.
 */
export function IncidentPinMap({
  point,
  onChange,
  disabled = false,
}: {
  point: PinnedPoint | null;
  onChange: (point: PinnedPoint | null) => void;
  disabled?: boolean;
}) {
  return (
    <IncidentPinMapShell
      point={point}
      onChange={onChange}
      disabled={disabled}
      renderSurface={(props) => <WebViewSurface {...props} />}
    />
  );
}

function WebViewSurface({ html, onMessage, command }: PinMapSurfaceProps) {
  const webViewRef = useRef<WebView | null>(null);

  // Lệnh của vỏ chạy thẳng trong trang. `true;` ở cuối là bắt buộc trên iOS:
  // injectJavaScript cảnh báo nếu đoạn mã trả về giá trị không tuần tự hoá được.
  useEffect(() => {
    if (!command) return;
    webViewRef.current?.injectJavaScript(
      `window.__pinMapCommand && window.__pinMapCommand(${JSON.stringify(command.name)}); true;`,
    );
  }, [command]);

  return (
    <WebView
      ref={webViewRef}
      originWhitelist={["*"]}
      source={{ html }}
      // Bản đồ cần kéo/thả và pinch: để ScrollView của màn báo cáo giành cử chỉ
      // thì bấm ghim được nhưng không di chuyển được bản đồ.
      nestedScrollEnabled
      javaScriptEnabled
      domStorageEnabled
      setBuiltInZoomControls={false}
      onMessage={(event) => onMessage(event.nativeEvent.data)}
    />
  );
}

import { WebView } from "react-native-webview";
import { MissionMapShell } from "./MissionMapShell";
import { type MissionMapData } from "./mission-map-html";

export { type MissionMapData } from "./mission-map-html";

/**
 * Bản đồ nhiệm vụ (chỉ xem) — bản ĐIỆN THOẠI (Android/iOS).
 *
 * Expo Web dùng `MissionMap.web.tsx`; Metro tự chọn theo nền nên `react-native-webview`
 * KHÔNG lọt vào bundle web — gói đó trên react-native-web chỉ render một dòng chữ
 * đỏ "does not support this platform".
 *
 * Dùng WebView + Leaflet chứ không `react-native-maps` vì cùng lý do với bản đồ
 * ghim: phải là ĐÚNG bộ tile mà trưởng thôn và web điều phối đang nhìn, để ba bên
 * nói chuyện trên cùng một bức ảnh.
 */
export function MissionMap({ data, loading }: { data: MissionMapData; loading: boolean }) {
  return (
    <MissionMapShell
      data={data}
      loading={loading}
      renderSurface={({ html, onMessage }) => (
        <WebView
          originWhitelist={["*"]}
          source={{ html }}
          // Bản đồ cần kéo/thả và pinch: để ScrollView của màn nhiệm vụ giành hết
          // cử chỉ thì người dùng không di chuyển được bản đồ.
          nestedScrollEnabled
          javaScriptEnabled
          domStorageEnabled
          setBuiltInZoomControls={false}
          onMessage={(event) => onMessage(event.nativeEvent.data)}
        />
      )}
    />
  );
}

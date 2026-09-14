import { WebView } from "react-native-webview";
import { MissionMapShell } from "./MissionMapShell";
import { type MissionMapData } from "./mission-map-html";
import { offlineMapBaseUrl } from "./offline-map-tiles";

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
          // baseUrl trỏ vào thư mục của app: trang phải có gốc file:// thì mới đọc
          // được ô bản đồ đã lưu trên máy — gốc about:blank bị WebView chặn đọc file.
          source={{ html, baseUrl: offlineMapBaseUrl() ?? undefined }}
          allowFileAccess
          allowFileAccessFromFileURLs
          allowingReadAccessToURL={offlineMapBaseUrl() ?? undefined}
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

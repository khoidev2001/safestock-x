import { useEffect, useRef } from "react";
import { MissionMapShell, type MissionMapSurfaceProps } from "./MissionMapShell";
import { type MissionMapData } from "./mission-map-html";

export { type MissionMapData } from "./mission-map-html";

/**
 * Bản đồ nhiệm vụ (chỉ xem) — bản EXPO WEB.
 *
 * Metro chọn file `.web.tsx` này cho nền web và `MissionMap.tsx` cho điện thoại,
 * nên `react-native-webview` không lọt vào bundle web. `<iframe srcDoc>` nạp ĐÚNG
 * trang Leaflet mà điện thoại nạp, nên thử trên trình duyệt hay chạy trên máy thật
 * đều ra cùng một bản đồ — không phải dựng lại APK mới xem được kết quả.
 */
export function MissionMap({ data, loading }: { data: MissionMapData; loading: boolean }) {
  return (
    <MissionMapShell
      data={data}
      loading={loading}
      renderSurface={(props) => <IframeSurface {...props} />}
    />
  );
}

function IframeSurface({ html, onMessage }: MissionMapSurfaceProps) {
  const frameRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    function handle(event: MessageEvent) {
      // CHỈ nhận thông điệp từ đúng iframe này: trình duyệt cho bất kỳ frame nào
      // postMessage tới cửa sổ cha, không lọc thì một chuỗi từ nơi khác cũng thành
      // trạng thái của bản đồ này.
      if (!frameRef.current || event.source !== frameRef.current.contentWindow) return;
      if (typeof event.data !== "string") return;
      onMessage(event.data);
    }
    window.addEventListener("message", handle);
    return () => window.removeEventListener("message", handle);
  }, [onMessage]);

  return (
    <iframe
      ref={frameRef}
      srcDoc={html}
      title="Bản đồ điểm gặp nạn và tuyến lấy vật tư"
      style={{ width: "100%", height: "100%", border: "none" }}
    />
  );
}

import { useEffect, useRef } from "react";
import { IncidentPinMapShell, type PinMapSurfaceProps } from "./IncidentPinMapShell";
import { type PinnedPoint } from "./incident-pin-map-html";

export { type PinnedPoint } from "./incident-pin-map-html";

/**
 * Bản đồ ghim điểm gặp nạn — bản EXPO WEB.
 *
 * Metro chọn file `.web.tsx` này cho nền web và `IncidentPinMap.tsx` cho điện thoại,
 * nên `react-native-webview` không lọt vào bundle web. Bản trước chỉ hiện một dòng
 * ghi chú "tính năng này chỉ có trên APK" — đúng về kỹ thuật nhưng chặn mất đường
 * thử nhanh trên trình duyệt, mà dựng lại APK thì tốn hàng chục phút.
 *
 * `<iframe srcDoc>` nạp ĐÚNG trang Leaflet mà điện thoại nạp, nên ghim trên trình
 * duyệt hay trên máy thật đều ra cùng một toạ độ trên cùng một bức ảnh.
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
      renderSurface={(props) => <IframeSurface {...props} />}
    />
  );
}

function IframeSurface({ html, onMessage, command }: PinMapSurfaceProps) {
  const frameRef = useRef<HTMLIFrameElement | null>(null);

  // Chiều ngược lại của kênh trên: trang cha không với tay vào trong iframe được
  // nên gửi lệnh bằng postMessage; trang Leaflet có sẵn trình xử lý dịch lại thành
  // lời gọi `__pinMapCommand`.
  useEffect(() => {
    if (!command) return;
    frameRef.current?.contentWindow?.postMessage(JSON.stringify({ command: command.name }), "*");
  }, [command]);

  useEffect(() => {
    function handle(event: MessageEvent) {
      // CHỈ nhận thông điệp từ đúng iframe này. Trang có thể còn iframe khác, và
      // trình duyệt cho bất kỳ frame nào postMessage tới cửa sổ cha — không lọc thì
      // một chuỗi bất kỳ từ nơi khác cũng thành "toạ độ vừa ghim".
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
      title="Bản đồ ghim điểm gặp nạn"
      style={{ width: "100%", height: "100%", border: "none" }}
    />
  );
}

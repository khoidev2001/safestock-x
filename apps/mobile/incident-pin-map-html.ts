/**
 * Trang Leaflet dùng chung cho bản đồ ghim điểm gặp nạn.
 *
 * Một nguồn HTML duy nhất cho cả hai nền: điện thoại nạp nó vào `react-native-webview`,
 * Expo Web nạp vào `<iframe srcDoc>`. Tách ra đây vì nếu mỗi bên giữ một bản thì sớm
 * muộn cũng lệch — mà cả hai phải ghim ra ĐÚNG cùng một toạ độ trên đúng cùng một
 * bức ảnh vệ tinh, đó mới là điểm mấu chốt của tính năng này.
 *
 * Ảnh vệ tinh và Leaflet đều tải từ Internet: mất mạng thì trang tự báo và người
 * dùng vẫn gửi được báo cáo bằng lời kể.
 *
 * Zoom thật của ảnh vệ tinh ở Đồng Xuân dừng ở z18 (đo trực tiếp: từ z19 máy chủ
 * Esri trả ảnh xám in "Map data not yet available"). Vì bật `detectRetina` — máy
 * thật 300 dpi nên ô 256px bị kéo giãn gần gấp đôi, nhìn nhoè — Leaflet tự cộng 1
 * vào mức zoom của đường dẫn ô, nên `maxNativeZoom` đặt 17 để mức xin cao nhất
 * vẫn là z18. Quá đó thì phóng to ô z18: mờ dần nhưng là ảnh thật, thay vì dán
 * chữ "Map data not yet available" lên khắp bản đồ.
 */

export interface PinnedPoint {
  lat: number;
  lng: number;
}

const LEAFLET_CSS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
const LEAFLET_JS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";

/** Trung tâm mặc định: UBND xã Đồng Xuân, giống hằng DEFAULT_CENTER của web. */
const DEFAULT_CENTER = { lat: 13.3782428, lng: 109.104259 };

export function buildPinMapHtml(initial: PinnedPoint | null): string {
  const center = initial ?? DEFAULT_CENTER;
  const initialJson = JSON.stringify(initial);
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<link rel="stylesheet" href="${LEAFLET_CSS}" />
<style>
  html, body, #map { margin: 0; padding: 0; height: 100%; width: 100%; background: #e9edf2; }
  .hint {
    position: absolute; left: 8px; right: 8px; bottom: 8px; z-index: 500;
    background: rgba(255,255,255,0.94); border-radius: 8px; padding: 7px 10px;
    font: 600 12px/1.35 -apple-system, Roboto, sans-serif; color: #26303d; text-align: center;
  }
  .offline {
    position: absolute; inset: 0; z-index: 600; display: none;
    align-items: center; justify-content: center; padding: 18px; text-align: center;
    background: #e9edf2; font: 600 13px/1.5 -apple-system, Roboto, sans-serif; color: #4a5666;
  }
</style>
</head>
<body>
<div id="map"></div>
<div class="hint" id="hint">Bấm lên bản đồ để ghim chỗ đang xảy ra sự việc</div>
<div class="offline" id="offline">Không tải được bản đồ.<br />Kiểm tra mạng, hoặc cứ gửi báo cáo bằng lời kể — không bắt buộc phải ghim.</div>
<script>
  function send(payload) {
    var text = JSON.stringify(payload);
    // Điện thoại: cầu của react-native-webview. Web: postMessage lên trang cha.
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(text);
    } else if (window.parent && window.parent !== window) {
      window.parent.postMessage(text, '*');
    }
  }
  function boot() {
    if (!window.L) {
      document.getElementById('offline').style.display = 'flex';
      send({ type: 'error' });
      return;
    }
    var initial = ${initialJson};
    var map = L.map('map', { zoomControl: true, attributionControl: false })
      .setView([${center.lat}, ${center.lng}], initial ? 17 : 14);

    // detectRetina — vì sao cần trên điện thoại mà web không cần.
    //
    // Máy thật (SM-A066B) là 300 dpi, tức mỗi điểm ảnh CSS trải ra ~1,9 điểm ảnh
    // thật. Ô bản đồ 256px bị kéo giãn gần gấp đôi nên ảnh vệ tinh nhoè hẳn, trong
    // khi trên màn hình máy tính 1x thì nét. Bật cờ này thì Leaflet xin ô ở mức
    // zoom sâu hơn MỘT bậc rồi vẽ vào nửa khung — đúng bằng mật độ điểm ảnh thật.
    //
    // maxNativeZoom phải HẠ theo, 18 -> 17: detectRetina cộng 1 vào mức zoom
    // của đường dẫn ô, nên để nguyên 18 là nó đi xin z19. Mà z19 ở vùng này Esri
    // không có ảnh thật — nó trả HTTP 200 kèm ảnh xám in chữ "Map data not yet
    // available", và Leaflet dán thẳng chữ đó lên khắp bản đồ. Hạ xuống 17 thì
    // mức xin cao nhất vẫn là z18, đúng mức sâu nhất còn ảnh thật.
    L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      // maxZoom khai 20 chứ không phải 19: detectRetina tự TRỪ 1 vào maxZoom của
      // lớp (thấy tận mắt — để 19 thì từ mức 19 trở lên lớp vệ tinh ra ngoài phạm
      // vi và biến mất hẳn, chỉ còn nền trống với mấy chữ tên đường). Khai 20 để
      // sau khi bị trừ còn đúng 19, khớp lớp chữ.
      { maxZoom: 20, maxNativeZoom: 17, detectRetina: true }
    ).addTo(map);
    // Lớp chữ có sẵn bản @2x, nên chỉ cần chỗ giữ {r} — Leaflet tự thay thành
    // '@2x' trên màn mật độ cao. KHÔNG bật detectRetina ở đây: bật là vừa cộng
    // zoom vừa lấy @2x, thành lấy mẫu thừa gấp bốn.
    L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png',
      { maxZoom: 19, maxNativeZoom: 19 }
    ).addTo(map);

    // Dấu ghim 14px, không phải 22px.
    //
    // Bản đồ nhúng trong màn báo cáo chỉ cao chừng 200px trên điện thoại. Dấu 22px
    // cộng viền trắng 3px và quầng 2px là gần 32px — chiếm một mảng lớn giữa khung,
    // che mất chính mái nhà mà người ta đang nhắm để ghim. Đủ to để bấm trúng và
    // kéo được là được, không cần to hơn.
    var icon = L.divIcon({
      className: '',
      html: '<div style="width:14px;height:14px;border-radius:50%;background:#d64545;border:2px solid #fff;box-shadow:0 0 0 2px rgba(214,69,69,0.45)"></div>',
      iconSize: [14, 14],
      iconAnchor: [7, 7],
    });
    var marker = null;
    var ring = null;

    function place(latlng, notify) {
      var lat = Math.round(latlng.lat * 1e6) / 1e6;
      var lng = Math.round(latlng.lng * 1e6) / 1e6;
      if (!marker) {
        marker = L.marker([lat, lng], { icon: icon, draggable: true }).addTo(map);
        marker.on('dragend', function () { place(marker.getLatLng(), true); });
        // Bấm vào chính dấu ghim = bỏ ghim, giống hệt bản đồ trên web.
        marker.on('click', function () { clearPin(true); });
        ring = L.circle([lat, lng], {
          radius: 150, interactive: false, color: '#d64545', weight: 2,
          dashArray: '6 5', fillColor: '#d64545', fillOpacity: 0.12,
        }).addTo(map);
      } else {
        marker.setLatLng([lat, lng]);
        ring.setLatLng([lat, lng]);
      }
      document.getElementById('hint').textContent =
        'Đã ghim ' + lat.toFixed(6) + ', ' + lng.toFixed(6) + ' — kéo để dời, bấm vào dấu ghim để bỏ';
      if (notify) send({ type: 'pin', lat: lat, lng: lng });
    }

    /**
     * Xoá dấu ghim khỏi bản đồ. 'notify' = false khi lệnh ĐẾN TỪ vỏ bên ngoài
     * (nút "Bỏ ghim"): vỏ đã tự xoá toạ độ của nó rồi, gửi ngược lên chỉ tạo một
     * vòng lặp thừa.
     */
    function clearPin(notify) {
      if (marker) { map.removeLayer(marker); marker = null; }
      if (ring) { map.removeLayer(ring); ring = null; }
      document.getElementById('hint').textContent = 'Bấm lên bản đồ để ghim chỗ đang xảy ra sự việc';
      if (notify) send({ type: 'clear' });
    }

    /**
     * Kênh lệnh đi XUỐNG trang, ngược chiều với 'send'. Cần vì dấu ghim sống bên
     * trong Leaflet: vỏ bỏ toạ độ mà không nói xuống đây thì bản đồ vẫn hiện dấu
     * ghim cũ kèm dòng "Đã ghim …" — người báo tưởng vẫn còn ghim.
     *
     * Điện thoại gọi thẳng hàm này qua injectJavaScript; Expo Web không với tay
     * vào trong iframe được nên gửi bằng postMessage, và trình xử lý dưới đây dịch
     * lại thành cùng một lời gọi.
     */
    window.__pinMapCommand = function (name) {
      if (name === 'clear') clearPin(false);
    };
    window.addEventListener('message', function (event) {
      if (typeof event.data !== 'string') return;
      try {
        var msg = JSON.parse(event.data);
        if (msg && msg.command) window.__pinMapCommand(msg.command);
      } catch (err) {
        // Thông điệp lạ từ trang cha: bỏ qua.
      }
    });

    map.on('click', function (e) { place(e.latlng, true); });
    if (initial) place(L.latLng(initial.lat, initial.lng), false);
    send({ type: 'ready' });
  }

  var script = document.createElement('script');
  script.src = '${LEAFLET_JS}';
  script.onload = boot;
  script.onerror = function () {
    document.getElementById('offline').style.display = 'flex';
    send({ type: 'error' });
  };
  document.head.appendChild(script);
</script>
</body>
</html>`;
}

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
 * Esri trả ảnh xám in "Map data not yet available"). Đặt `maxNativeZoom: 18` để
 * Leaflet phóng to ô z18 — mờ dần nhưng vẫn là ảnh thật, thay vì dán chữ đó lên.
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

    L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { maxZoom: 19, maxNativeZoom: 18 }
    ).addTo(map);
    L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}.png',
      { maxZoom: 19, maxNativeZoom: 19 }
    ).addTo(map);

    var icon = L.divIcon({
      className: '',
      html: '<div style="width:22px;height:22px;border-radius:50%;background:#d64545;border:3px solid #fff;box-shadow:0 0 0 2px rgba(214,69,69,0.4)"></div>',
      iconSize: [22, 22],
      iconAnchor: [11, 11],
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
        marker.on('click', function () { clear(); });
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

    function clear() {
      if (marker) { map.removeLayer(marker); marker = null; }
      if (ring) { map.removeLayer(ring); ring = null; }
      document.getElementById('hint').textContent = 'Bấm lên bản đồ để ghim chỗ đang xảy ra sự việc';
      send({ type: 'clear' });
    }

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

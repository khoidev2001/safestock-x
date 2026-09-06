/**
 * Trang Leaflet CHỈ ĐỌC cho lực lượng hiện trường: điểm gặp nạn, các kho có hàng,
 * và tuyến đường từ từng kho tới điểm nạn.
 *
 * Khác hẳn `incident-pin-map-html.ts` ở một điểm cốt lõi: trang này KHÔNG có bất
 * kỳ đường nào để sửa dữ liệu — không bắt sự kiện bấm bản đồ, dấu ghim không kéo
 * được, không có nút bỏ ghim, và không gửi ra thông điệp `pin`/`clear` nào. Người
 * đi cứu hộ chỉ cần biết chỗ nào, đi đường nào; điểm nạn là do trưởng thôn ghim và
 * cơ quan điều phối duyệt, sửa được ở đây là sửa mất bằng chứng của người khác.
 *
 * Vẫn dùng ĐÚNG bộ tile của bản đồ ghim (Esri World Imagery + nhãn CARTO) để
 * trưởng thôn, điều phối viên trên web và người đi cứu hộ nhìn thấy cùng một bức
 * ảnh — cùng một mái nhà, cùng một khúc sông.
 *
 * Bản đồ tải từ Internet: mất mạng thì trang tự báo, phần danh sách kho và vật tư
 * bên dưới vẫn đọc được từ bản lưu.
 */

export interface MissionMapPoint {
  lat: number;
  lng: number;
}

export interface MissionMapWarehouse {
  id: string;
  name: string;
  kind: "CENTRAL" | "HAMLET" | null;
  lat: number;
  lng: number;
  distanceKm: number | null;
  etaMinutes: number | null;
  /** [kinh độ, vĩ độ] theo đúng thứ tự GeoJSON máy chủ trả về. */
  routeCoordinates: [number, number][] | null;
}

export interface MissionMapData {
  incident: MissionMapPoint | null;
  incidentLabel: string;
  warehouses: MissionMapWarehouse[];
}

const LEAFLET_CSS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
const LEAFLET_JS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";

/** Trung tâm mặc định: UBND xã Đồng Xuân, giống hằng DEFAULT_CENTER của web. */
const DEFAULT_CENTER = { lat: 13.3782428, lng: 109.104259 };

/**
 * Mốc nhìn 150 m quanh điểm nạn — giống hệt web.
 *
 * Không phải phạm vi ngập đã đo (hệ thống không có số đó), chỉ để mắt bắt được
 * chỗ xảy ra sự việc giữa một rừng nhà trên ảnh vệ tinh.
 */
const INCIDENT_ZONE_RADIUS_M = 150;

/**
 * Nhúng dữ liệu vào `<script>` mà không cho nó thoát ra ngoài.
 *
 * Tên kho lấy từ cơ sở dữ liệu; chỉ cần một chuỗi chứa `</script>` là phần còn lại
 * của trang thành văn bản thường và bản đồ trắng xoá. Chuyển `<`, `>`, `&` và hai
 * ký tự phân dòng mà JSON cho qua nhưng JavaScript thì không.
 */
function embedJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

export function buildMissionMapHtml(data: MissionMapData): string {
  const center = data.incident ?? data.warehouses[0] ?? DEFAULT_CENTER;
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<link rel="stylesheet" href="${LEAFLET_CSS}" />
<style>
  html, body, #map { margin: 0; padding: 0; height: 100%; width: 100%; background: #e9edf2; }
  .legend {
    position: absolute; left: 8px; bottom: 8px; z-index: 500;
    background: rgba(255,255,255,0.94); border-radius: 8px; padding: 7px 9px;
    font: 700 11px/1.5 -apple-system, Roboto, sans-serif; color: #26303d;
  }
  .legend .row { display: flex; align-items: center; gap: 6px; }
  .legend .swatch { width: 10px; height: 10px; border-radius: 50%; flex: none; }
  .legend .line { width: 14px; height: 3px; border-radius: 2px; flex: none; }
  .offline {
    position: absolute; inset: 0; z-index: 600; display: none;
    align-items: center; justify-content: center; padding: 18px; text-align: center;
    background: #e9edf2; font: 600 13px/1.5 -apple-system, Roboto, sans-serif; color: #4a5666;
  }
  .pin-label {
    background: rgba(16,42,67,0.86); color: #fff; border: none; box-shadow: none;
    border-radius: 6px; padding: 2px 6px; font: 700 10px/1.35 -apple-system, Roboto, sans-serif;
    white-space: nowrap;
  }
  .pin-label::before { display: none; }
</style>
</head>
<body>
<div id="map"></div>
<div class="legend">
  <div class="row"><span class="swatch" style="background:#d64545"></span><span>Điểm gặp nạn</span></div>
  <div class="row"><span class="swatch" style="background:#0B5FC6"></span><span>Kho trung tâm</span></div>
  <div class="row"><span class="swatch" style="background:#15803D"></span><span>Kho thôn</span></div>
  <div class="row"><span class="line" style="background:#EA7A12"></span><span>Tuyến kho → điểm nạn</span></div>
</div>
<div class="offline" id="offline">Không tải được bản đồ.<br />Kiểm tra mạng — danh sách kho và vật tư bên dưới vẫn đọc được.</div>
<script>
  var DATA = ${embedJson(data)};

  function send(payload) {
    var text = JSON.stringify(payload);
    // Điện thoại: cầu của react-native-webview. Web: postMessage lên trang cha.
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(text);
    } else if (window.parent && window.parent !== window) {
      window.parent.postMessage(text, '*');
    }
  }

  function esc(text) {
    return String(text == null ? '' : text)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /** Bỏ tiền tố "Kho thôn" cho nhãn gọn — trên bản đồ toàn kho thì chữ đó thừa. */
  function shortName(name) {
    return String(name || '').replace(/^Kho\\s+(thôn\\s+)?/i, '');
  }

  function travelText(w) {
    if (w.distanceKm == null || w.etaMinutes == null) return 'chưa tính được tuyến';
    return w.distanceKm.toFixed(1) + ' km · ~' + w.etaMinutes + ' phút';
  }

  function dotIcon(L, color, size) {
    return L.divIcon({
      className: '',
      html: '<div style="width:' + size + 'px;height:' + size + 'px;border-radius:50%;background:' +
        color + ';border:3px solid #fff;box-shadow:0 0 0 2px rgba(0,0,0,0.25)"></div>',
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
    });
  }

  function boot() {
    if (!window.L) {
      document.getElementById('offline').style.display = 'flex';
      send({ type: 'error' });
      return;
    }
    var map = L.map('map', {
      zoomControl: true,
      attributionControl: false,
      // CHỈ XEM: không gắn sự kiện click, và bấm đúp cũng chỉ phóng to như mọi
      // bản đồ khác — không có đường nào từ cử chỉ của người dùng tới dữ liệu.
    }).setView([${center.lat}, ${center.lng}], 15);

    L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { maxZoom: 19, maxNativeZoom: 18 }
    ).addTo(map);
    L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}.png',
      { maxZoom: 19, maxNativeZoom: 19 }
    ).addTo(map);

    var bounds = [];

    // Tuyến vẽ TRƯỚC các dấu ghim để đường không đè lên dấu ghim và nhãn tên.
    for (var i = 0; i < DATA.warehouses.length; i++) {
      var coords = DATA.warehouses[i].routeCoordinates;
      if (!coords || coords.length < 2) continue;
      var latlngs = coords.map(function (pair) { return [pair[1], pair[0]]; });
      // Viền trắng bên dưới: đường cam đơn độc trên ảnh vệ tinh (mái tôn, đường
      // đất) có chỗ gần như biến mất.
      L.polyline(latlngs, { color: '#FFFFFF', weight: 7, opacity: 0.85 }).addTo(map);
      L.polyline(latlngs, { color: '#EA7A12', weight: 4, opacity: 0.95 }).addTo(map);
      for (var j = 0; j < latlngs.length; j++) bounds.push(latlngs[j]);
    }

    for (var k = 0; k < DATA.warehouses.length; k++) {
      var w = DATA.warehouses[k];
      var color = w.kind === 'HAMLET' ? '#15803D' : '#0B5FC6';
      L.marker([w.lat, w.lng], { icon: dotIcon(L, color, 16), interactive: false })
        .addTo(map)
        .bindTooltip(
          '<b>' + esc(shortName(w.name)) + '</b><br />' + esc(travelText(w)),
          { permanent: true, direction: 'right', offset: [10, 0], className: 'pin-label' }
        );
      bounds.push([w.lat, w.lng]);
    }

    if (DATA.incident) {
      L.circle([DATA.incident.lat, DATA.incident.lng], {
        radius: ${INCIDENT_ZONE_RADIUS_M}, interactive: false, color: '#d64545', weight: 2,
        dashArray: '6 5', fillColor: '#d64545', fillOpacity: 0.12,
      }).addTo(map);
      L.marker([DATA.incident.lat, DATA.incident.lng], {
        icon: dotIcon(L, '#d64545', 22),
        // Không kéo được: đây là điểm trưởng thôn đã ghim và điều phối đã duyệt.
        draggable: false,
        interactive: false,
      })
        .addTo(map)
        .bindTooltip(esc(DATA.incidentLabel || 'Điểm gặp nạn'), {
          permanent: true, direction: 'top', offset: [0, -14], className: 'pin-label',
        });
      bounds.push([DATA.incident.lat, DATA.incident.lng]);
    }

    if (bounds.length > 1) {
      map.fitBounds(bounds, { padding: [42, 42], maxZoom: 17 });
    } else if (bounds.length === 1) {
      map.setView(bounds[0], 16);
    }

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

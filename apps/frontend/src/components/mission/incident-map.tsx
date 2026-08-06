"use client";

import L from "leaflet";
import { useEffect, useMemo, useRef } from "react";
import {
  Circle,
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents,
} from "react-leaflet";
import type { AdminWarehouse } from "@/lib/warehouse-api";
import type { DispatchRoute } from "@/lib/mission-api";
import type { LatLng } from "@/lib/geo";
import { CommuneBoundaries, useCommuneGeo } from "@/components/dashboard/commune-boundaries";
import {
  BLANK_TILE,
  CLUSTER_BOUNDS,
  CLUSTER_MIN_ZOOM,
  DEFAULT_CENTER,
  MAX_DETAIL_ZOOM,
  OFFLINE_MAX_NATIVE_ZOOM,
  OFFLINE_PACK_MIN_ZOOM,
  OFFLINE_TILE_ATTRIBUTION,
  OFFLINE_TILE_URL,
  PROVINCE_BOUNDS,
} from "@/components/dashboard/map-tiles";

function pinIcon(color: string, size = 30): L.DivIcon {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="${color}" stroke="white" stroke-width="1.5"><path d="M12 21s-7-6.5-7-11.5A7 7 0 0 1 19 9.5C19 14.5 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5" fill="white"/></svg>`;
  return L.divIcon({
    html: svg,
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
    popupAnchor: [0, -size],
  });
}

function fmtDistance(km: number): string {
  return `${km.toFixed(1)} km`;
}

/** Bỏ tiền tố "Kho thôn" cho nhãn gọn — trên bản đồ toàn kho thì chữ đó thừa. */
function shortWarehouseName(name: string): string {
  return name.replace(/^Kho\s+(thôn\s+)?/iu, "");
}

/**
 * Bán kính vòng khoanh quanh điểm nạn, tính bằng mét.
 *
 * Đây là MỐC NHÌN cố định, không phải phạm vi ảnh hưởng đã đo. Hệ thống không có
 * dữ liệu nào nói vùng ngập rộng bao nhiêu, nên vẽ một vòng co giãn theo số người
 * là bịa ra một con số trông như đã tính. Giữ cố định và ghi rõ ở chú giải thì
 * người xem hiểu đúng: nó chỉ giúp định vị chỗ xảy ra sự việc giữa các kho.
 */
const INCIDENT_ZONE_RADIUS_M = 150;

/**
 * Kho có nằm chồng lên dấu ghim điểm nạn không (trong khoảng ~40 m).
 *
 * Điểm ứng phó của thôn chính là kho thôn, nên khi sự việc xảy ra ngay trong thôn
 * thì hai toạ độ TRÙNG KHÍT. Dấu ghim điểm nạn to hơn và vẽ sau nên nuốt trọn dấu
 * ghim kho — nhìn vào tưởng hệ thống quên vẽ mất một kho. Ghi nhận trường hợp này
 * để đẩy nhãn tên sang trái, chừa chỗ cho dấu ghim đỏ.
 */
function overlapsIncident(point: LatLng, incident: LatLng | null): boolean {
  if (!incident) return false;
  return Math.abs(point.lat - incident.lat) < 0.0004 && Math.abs(point.lng - incident.lng) < 0.0004;
}

/** Một nhiệm vụ khác đang chạy, để đối chiếu trước khi lập vụ mới. */
export interface OngoingIncident {
  id: string;
  /** Tên chỗ xảy ra sự việc; trống thì dùng loại tình huống. */
  label: string;
  statusLabel: string;
  lat: number;
  lng: number;
  /**
   * Tuyến từ các kho tới điểm nạn của nhiệm vụ đó, dạng [kinh độ, vĩ độ].
   *
   * Chỉ một dấu ghim thì biết "có sự việc ở đó", còn thấy tuyến mới biết xã đang
   * huy động kho nào và đi đường nào — đó mới là thứ giúp nhận ra hai nhiệm vụ
   * sắp giẫm chân nhau.
   */
  routes: [number, number][][];
}

export interface IncidentMapProps {
  /** Kho có góp hàng cho phương án — kèm tuyến, quãng đường và danh sách vật tư. */
  warehouses: DispatchRoute[];
  /**
   * Toàn bộ kho trong xã, hiện ngay cả khi chưa lập phương án.
   *
   * Thiếu lớp này thì trước lúc bấm tính nhu cầu, bản đồ trống trơn — người dùng
   * không biết mình đang ghim gần kho nào, mà đó lại đúng là thứ cần thấy để chọn
   * điểm. Kho nào đã vào phương án thì nhường chỗ cho marker có tuyến ở trên.
   */
  baseWarehouses?: AdminWarehouse[];
  incidentPoint: LatLng | null;
  /**
   * Có thì bản đồ cho ghim điểm sự cố; không truyền thì chỉ xem.
   *
   * Bấm chỗ trống → đặt điểm. Bấm vào chính dấu ghim → gọi lại với null để bỏ.
   * Kéo dấu ghim → dời. Một bản đồ làm cả hai việc: trước khi lập phương án thì
   * chọn chỗ, sau khi lập thì xem tuyến.
   */
  onPickIncident?: (point: LatLng | null) => void;
  /**
   * Điểm nạn của các nhiệm vụ ĐÃ DUYỆT đang chạy.
   *
   * Không thấy chúng thì rất dễ lập thêm một nhiệm vụ cho đúng chỗ mà xã đã điều
   * phối rồi — hai phương án cùng rút một kho, cùng gọi một tuyến. Hiện lên bản
   * đồ là cách rẻ nhất để nhận ra trùng trước khi bấm tính nhu cầu.
   */
  ongoingIncidents?: OngoingIncident[];
  /** Bấm vào một điểm nạn đang chạy thì mở nhiệm vụ đó. */
  onOpenIncident?: (missionId: string) => void;
  /**
   * Giữ khung nhìn bám điểm nạn thay vì thu ra cho vừa hết các kho.
   *
   * Dùng ở khối khai tình huống: ở đó người dùng đang xem/chọn đúng một chỗ, thu
   * ra cả cụm kho làm mất chi tiết đường sá quanh chỗ đó. Bản đồ trong kế hoạch
   * hành động thì ngược lại — cần thấy trọn tuyến nên vẫn khớp theo các kho.
   */
  keepIncidentFocus?: boolean;
}

/**
 * Khung bản đồ theo các kho, KHÔNG theo điểm nạn.
 *
 * Điểm nạn cố tình không nằm trong khoá phụ thuộc: mỗi lần bấm chọn chỗ khác là
 * một lần đổi điểm, mà khung lại theo thì bản đồ giật về mức thu nhỏ ngay dưới
 * ngón tay người đang chọn — phóng to xem đường xong bấm một cái là mất hết.
 * Điểm nạn vẫn được tính vào khung ở lần khớp đầu (và mỗi khi danh sách kho đổi),
 * đủ để nó không nằm ngoài màn hình lúc mở lên.
 */
/** Mức phóng khi bám theo điểm nạn: đủ gần để đọc tên đường quanh chỗ xảy ra việc. */
const INCIDENT_FOCUS_ZOOM = 15;

function FitBounds({
  points,
  focusPoint,
  keepIncidentFocus = false,
}: {
  points: LatLng[];
  focusPoint: LatLng | null;
  keepIncidentFocus?: boolean;
}) {
  const map = useMap();
  const focusRef = useRef(focusPoint);
  focusRef.current = focusPoint;
  const key = points.map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join("|");
  useEffect(() => {
    const focus = focusRef.current;
    // Bám điểm nạn: lập xong phương án là danh sách kho nhảy vào, khung theo cả
    // cụm kho thì bản đồ thu ra tới mức chỗ xảy ra việc chỉ còn một chấm. Người
    // dùng đang nhìn đúng chỗ đó, không phải nhìn cả xã.
    if (keepIncidentFocus && focus) {
      map.setView([focus.lat, focus.lng], Math.max(map.getZoom(), INCIDENT_FOCUS_ZOOM));
      return;
    }
    const all = focus ? [...points, focus] : points;
    if (all.length === 0) return;
    if (all.length === 1) {
      map.setView([all[0].lat, all[0].lng], 14);
      return;
    }
    const bounds = L.latLngBounds(all.map((p) => [p.lat, p.lng]));
    map.fitBounds(bounds, { padding: [24, 24], maxZoom: 15 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, keepIncidentFocus]);
  return null;
}

export function IncidentMap({
  warehouses,
  baseWarehouses,
  incidentPoint,
  onPickIncident,
  ongoingIncidents,
  onOpenIncident,
  keepIncidentFocus = false,
}: IncidentMapProps) {
  const centralIcon = useMemo(() => pinIcon("var(--color-accent, #2f9e6e)"), []);
  const hamletIcon = useMemo(() => pinIcon("var(--text-muted, #8a8f98)", 26), []);
  const incidentIcon = useMemo(() => pinIcon("var(--color-critical, #d64545)", 34), []);
  const communeGeo = useCommuneGeo();
  // Cùng cỡ, cùng dáng với dấu ghim điểm nạn, chỉ khác màu: một chỗ có người mắc
  // kẹt thì vẫn là một chỗ có người mắc kẹt, dù xã đã điều phối hay chưa. Vẽ nó
  // nhỏ và mờ đi khiến nó trông như chú thích phụ, đúng cái bẫy đang muốn tránh —
  // người dùng lướt qua rồi lập thêm một nhiệm vụ trùng chỗ.
  const ongoingIcon = useMemo(() => pinIcon("var(--color-attention, #d98613)", 34), []);

  // Kho đã vào phương án vẽ bằng marker có tuyến; ở đây chỉ còn kho chưa tham gia.
  const otherWarehouses = useMemo(() => {
    const dispatched = new Set(warehouses.map((w) => w.id));
    return (baseWarehouses ?? []).filter(
      (w) => w.lat != null && w.lng != null && !dispatched.has(w.id),
    );
  }, [baseWarehouses, warehouses]);

  const boundsPoints = useMemo(() => {
    const pts: LatLng[] = warehouses.map((w) => ({ lat: w.lat, lng: w.lng }));
    for (const w of otherWarehouses) pts.push({ lat: w.lat as number, lng: w.lng as number });
    return pts;
  }, [warehouses, otherWarehouses]);

  const center = boundsPoints[0] ?? { lat: DEFAULT_CENTER[0], lng: DEFAULT_CENTER[1] };

  return (
    <div className="space-y-2">
      {/* Vuông: bản đồ nằm cạnh form theo cột dọc, khung vuông giữ cân với chiều
          cao form và không bóp méo khi cột hẹp lại. */}
      <div className="aspect-square w-full overflow-hidden rounded-md border">
        <MapContainer
          center={[center.lat, center.lng]}
          zoom={13}
          minZoom={OFFLINE_PACK_MIN_ZOOM}
          maxZoom={MAX_DETAIL_ZOOM}
          maxBounds={PROVINCE_BOUNDS}
          maxBoundsViscosity={1}
          scrollWheelZoom
          style={{ height: "100%", width: "100%" }}
        >
          <TileLayer
            url={OFFLINE_TILE_URL}
            attribution={OFFLINE_TILE_ATTRIBUTION}
            maxZoom={MAX_DETAIL_ZOOM}
            maxNativeZoom={OFFLINE_MAX_NATIVE_ZOOM}
            errorTileUrl={BLANK_TILE}
          />
          <BoundsForZoom />
          {/* Ranh giới xã: giống bản đồ kho, để biết điểm vừa ghim thuộc xã nào. */}
          {communeGeo ? <CommuneBoundaries geo={communeGeo} /> : null}
          <FitBounds
            points={boundsPoints}
            focusPoint={incidentPoint}
            keepIncidentFocus={keepIncidentFocus}
          />
          {onPickIncident ? <ClickToPin onPick={onPickIncident} /> : null}
          {/* Kho chưa tham gia phương án — vẫn phải thấy để biết ghim gần kho nào. */}
          {otherWarehouses.map((w) => (
            <Marker
              key={`base-${w.id}`}
              position={[w.lat as number, w.lng as number]}
              icon={w.kind === "CENTRAL" ? centralIcon : hamletIcon}
              opacity={0.75}
            >
              <Popup>
                <strong>{w.name}</strong>
                <br />
                {w.kind === "CENTRAL" ? "Kho tổng xã" : "Kho thôn"}
                <br />
                <span className="tabular">
                  {(w.lat as number).toFixed(5)}, {(w.lng as number).toFixed(5)}
                </span>
              </Popup>
              <WarehouseLabel
                name={w.name}
                kind={w.kind}
                point={{ lat: w.lat as number, lng: w.lng as number }}
                incidentPoint={incidentPoint}
              />
            </Marker>
          ))}
          {warehouses.map((w, index) =>
            w.routeStatus === "ROUTED" && w.routeGeometry ? (
              <Polyline
                key={`route-${w.id}`}
                positions={w.routeGeometry.coordinates.map(([lng, lat]) => [lat, lng])}
                pathOptions={{
                  color: ROUTE_COLORS[index % ROUTE_COLORS.length],
                  weight: 5,
                  opacity: 0.9,
                }}
              />
            ) : null,
          )}
          {warehouses.map((w) => (
            <Marker
              key={w.id}
              position={[w.lat, w.lng]}
              icon={w.kind === "CENTRAL" ? centralIcon : hamletIcon}
            >
              <Popup>
                <strong>{w.name}</strong>
                <br />
                {w.kind === "CENTRAL" ? "Kho tổng" : "Kho thôn"}
                {w.routeStatus === "ROUTED" && w.distanceKm != null ? (
                  <>
                    <br />
                    {fmtDistance(w.distanceKm)} · ~{w.etaMinutes} phút
                  </>
                ) : (
                  <>
                    <br />
                    Chưa tính được tuyến ({w.routeStatus})
                  </>
                )}
                {w.contributions.map((item) => (
                  <span key={item.sku} className="block">
                    {item.itemName}: {item.quantity} {item.unit}
                  </span>
                ))}
              </Popup>
              <WarehouseLabel
                name={w.name}
                kind={w.kind}
                point={{ lat: w.lat, lng: w.lng }}
                incidentPoint={incidentPoint}
              />
            </Marker>
          ))}
          {/* Tuyến của nhiệm vụ khác: XANH LÁ, nét đứt — khác hẳn tuyến xanh dương
              đặc của phương án đang xem, nên nhìn là biết đường nào thuộc vụ nào.
              Vẽ đầu tiên nên nằm dưới cùng, không che gì. */}
          {(ongoingIncidents ?? []).flatMap((item) =>
            item.routes.map((line, index) => (
              <Polyline
                key={`ongoing-route-${item.id}-${index}`}
                positions={line.map(([lng, lat]) => [lat, lng])}
                interactive={false}
                pathOptions={{
                  color: "var(--color-ready, #2f9e6e)",
                  weight: 3.5,
                  opacity: 0.85,
                  dashArray: "7 6",
                }}
              />
            )),
          )}
          {/* Nhiệm vụ khác đang chạy — vẽ trước để nằm dưới điểm đang chọn. */}
          {(ongoingIncidents ?? []).map((item) => (
            <Circle
              key={`ongoing-zone-${item.id}`}
              center={[item.lat, item.lng]}
              radius={INCIDENT_ZONE_RADIUS_M}
              interactive={false}
              pathOptions={{
                color: "var(--color-attention, #d98613)",
                weight: 2,
                opacity: 0.85,
                dashArray: "6 5",
                fillColor: "var(--color-attention, #d98613)",
                fillOpacity: 0.1,
              }}
            />
          ))}
          {(ongoingIncidents ?? []).map((item) => (
            <Marker
              key={`ongoing-${item.id}`}
              position={[item.lat, item.lng]}
              icon={ongoingIcon}
              eventHandlers={onOpenIncident ? { click: () => onOpenIncident(item.id) } : undefined}
            >
              <Tooltip
                permanent
                direction="top"
                offset={[0, -32]}
                className="wh-label wh-label-ongoing"
              >
                {item.label} · {item.statusLabel}
              </Tooltip>
              {onOpenIncident ? null : (
                <Popup>
                  <strong>{item.label}</strong>
                  <br />
                  {item.statusLabel}
                </Popup>
              )}
            </Marker>
          ))}
          {incidentPoint ? (
            /* interactive={false}: vòng khoanh là hình trang trí, không được nuốt
               cú bấm — nếu không thì bấm vào trong vòng để dời điểm nạn sẽ trượt. */
            <Circle
              center={[incidentPoint.lat, incidentPoint.lng]}
              radius={INCIDENT_ZONE_RADIUS_M}
              interactive={false}
              pathOptions={{
                color: "var(--color-critical, #d64545)",
                weight: 2,
                opacity: 0.9,
                dashArray: "6 5",
                fillColor: "var(--color-critical, #d64545)",
                fillOpacity: 0.12,
              }}
            />
          ) : null}
          {incidentPoint ? (
            <Marker
              position={[incidentPoint.lat, incidentPoint.lng]}
              icon={incidentIcon}
              // Điểm nạn luôn nằm trên cùng: kho có thể ghim trùng toạ độ với nó,
              // và trong hai thứ đó thì chỗ đang xảy ra sự việc mới là thứ không
              // được phép bị che.
              zIndexOffset={1000}
              draggable={Boolean(onPickIncident)}
              eventHandlers={
                onPickIncident
                  ? {
                      // Bấm vào chính dấu ghim = bỏ nó đi. Bấm chỗ trống = đặt điểm
                      // mới. Nhờ vậy đổi chỗ không cần nhớ nút nào, và bỏ hẳn được
                      // điểm đã ghim mà không phải kéo nó đi đâu cho khuất mắt.
                      click: () => onPickIncident(null),
                      dragend: (event) => {
                        const point = (event.target as L.Marker).getLatLng();
                        onPickIncident({ lat: point.lat, lng: point.lng });
                      },
                    }
                  : undefined
              }
            >
              {/* Chỉ mở popup khi xem: lúc đang ghim thì cú bấm dành cho việc xoá. */}
              {onPickIncident ? null : <Popup>Điểm nạn</Popup>}
            </Marker>
          ) : null}
        </MapContainer>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--text-muted)]">
        <LegendDot color="var(--color-critical, #d64545)" label="Điểm nạn" />
        {incidentPoint ? (
          <span className="flex items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full border border-dashed"
              style={{
                borderColor: "var(--color-critical, #d64545)",
                backgroundColor:
                  "color-mix(in srgb, var(--color-critical, #d64545) 12%, transparent)",
              }}
            />
            {/* Nói thẳng đây là mốc nhìn: vòng tròn trên bản đồ rất dễ bị đọc thành
                "phạm vi ảnh hưởng đã đo", mà hệ thống không hề có số liệu đó. */}
            Vùng quanh điểm nạn (mốc nhìn, bán kính {INCIDENT_ZONE_RADIUS_M} m)
          </span>
        ) : null}
        {ongoingIncidents && ongoingIncidents.length > 0 ? (
          <LegendDot
            color="var(--color-attention, #d98613)"
            label={`Nhiệm vụ đang điều phối (${ongoingIncidents.length}) — tuyến xanh lá`}
          />
        ) : null}
        <LegendDot color="var(--color-accent, #2f9e6e)" label="Kho tổng" />
        <LegendDot color="var(--text-muted, #8a8f98)" label="Kho thôn" />
        {incidentPoint ? (
          <span className="tabular">
            {incidentPoint.lat.toFixed(6)}, {incidentPoint.lng.toFixed(6)}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Nhãn tên kho hiện thường trực bên cạnh dấu ghim.
 *
 * Trước đây nhãn chỉ bật khi rê chuột, mà bản đồ này thường được xem để đối chiếu
 * với bảng "Điều phối kho" ngay bên trái — không ai rê từng dấu ghim để dò xem kho
 * nào là kho nào. Hiện thường trực thì nhìn phát là khớp được ngay, và kho bị dấu
 * ghim điểm nạn che mất vẫn còn tên để nhận ra.
 */
function WarehouseLabel({
  name,
  kind,
  point,
  incidentPoint,
}: {
  name: string;
  kind: string;
  point: LatLng;
  incidentPoint: LatLng | null;
}) {
  const hidden = overlapsIncident(point, incidentPoint);
  return (
    <Tooltip
      permanent
      direction={hidden ? "left" : "right"}
      offset={hidden ? [-12, -14] : [10, -14]}
      className={kind === "CENTRAL" ? "wh-label wh-label-central" : "wh-label"}
    >
      {shortWarehouseName(name)}
    </Tooltip>
  );
}

function ClickToPin({ onPick }: { onPick: (point: LatLng) => void }) {
  useMapEvents({
    click: (event) => onPick({ lat: event.latlng.lat, lng: event.latlng.lng }),
  });
  return null;
}

/** Khớp bản đồ quản trị: nhìn xa được cả tỉnh, nhìn gần bó vào vùng có ảnh chi tiết. */
function BoundsForZoom() {
  const map = useMap();
  useEffect(() => {
    const apply = () => {
      map.setMaxBounds(
        L.latLngBounds(map.getZoom() >= CLUSTER_MIN_ZOOM ? CLUSTER_BOUNDS : PROVINCE_BOUNDS),
      );
    };
    apply();
    map.on("zoomend", apply);
    return () => {
      map.off("zoomend", apply);
    };
  }, [map]);
  return null;
}

const ROUTE_COLORS = ["#2563eb", "#0284c7", "#4f46e5", "#0891b2", "#1d4ed8"];

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

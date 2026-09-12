"use client";

import L from "leaflet";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Circle,
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  Tooltip,
  ZoomControl,
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
  SATELLITE_LABELS_TILE_URL,
  SATELLITE_MAX_NATIVE_ZOOM,
  SATELLITE_TILE_ATTRIBUTION,
  SATELLITE_TILE_URL,
} from "@/components/dashboard/map-tiles";
import {
  MAP_IDLE_COLOR,
  MAP_SUPPLYING_COLOR,
  houseIcon,
  houseSvg,
  sosPinIcon,
  sosPinSvg,
  villaIcon,
  villaSvg,
} from "@/components/dashboard/map-house-icons";
import { ColorIcon } from "@/components/shared/color-icon";
import { formatCoordinate } from "@/lib/coordinate-input";
import { routeArrowSvg, routeArrows, type RoutePoint } from "@safestock/shared-types";

/**
 * Báo Leaflet đo lại khung mỗi khi vào/ra toàn màn hình.
 *
 * Leaflet đo kích thước container một lần lúc khởi tạo. Đổi khung bằng CSS mà
 * không gọi `invalidateSize` thì nó vẫn vẽ theo kích thước cũ: ô xám quanh bản
 * đồ, tâm lệch, và bấm vào một chỗ lại ghim ra chỗ khác. Đợi một nhịp cho trình
 * duyệt áp xong layout mới rồi mới đo.
 */
function ResizeOnToggle({ token }: { token: unknown }) {
  const map = useMap();
  useEffect(() => {
    const id = window.setTimeout(() => map.invalidateSize(), 60);
    return () => window.clearTimeout(id);
  }, [map, token]);
  return null;
}

/**
 * Đo lại mỗi khi CHÍNH khung bản đồ đổi kích thước, không đợi ai báo.
 *
 * `ResizeOnToggle` chỉ chạy khi có một thao tác đã biết trước (vào/ra toàn màn
 * hình). Nhưng khung bản đồ có thể được kéo cao bằng cột bên cạnh, mà cột đó dài
 * ngắn theo dữ liệu vừa tải về — không có cú bấm nào để bám vào. Không đo lại thì
 * Leaflet giữ nguyên số đo cũ: viền xám quanh mép và bấm một chỗ ghim ra chỗ khác.
 */
function ResizeOnContainerChange() {
  const map = useMap();
  useEffect(() => {
    const container = map.getContainer();
    // Lần đầu gọi ngay lúc gắn observer là số đo đang đúng — bỏ qua để khỏi tốn
    // một lượt vẽ lại thừa ngay sau khi bản đồ vừa khởi tạo.
    let first = true;
    const observer = new ResizeObserver(() => {
      if (first) {
        first = false;
        return;
      }
      map.invalidateSize();
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [map]);
  return null;
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
   * Giữ khung nhìn bám điểm nạn thay vì thu ra cho vừa hết các kho.
   *
   * Dùng ở khối khai tình huống: ở đó người dùng đang xem/chọn đúng một chỗ, thu
   * ra cả cụm kho làm mất chi tiết đường sá quanh chỗ đó. Bản đồ trong kế hoạch
   * hành động thì ngược lại — cần thấy trọn tuyến nên vẫn khớp theo các kho.
   */
  keepIncidentFocus?: boolean;
  /**
   * Đổi giá trị này là đưa khung nhìn về lại điểm đang bám (dùng cùng
   * `keepIncidentFocus`). Bản đồ kho dùng để mỗi lần bấm "Ghim toạ độ" là bay tới
   * chỗ vừa nhập, kể cả khi nhập lại đúng con số cũ.
   */
  focusKey?: string;
  /**
   * Tên gọi của dấu ghim đỏ, hiện ở popup và chú giải.
   *
   * Cùng một bản đồ phục vụ hai chỗ: bên điều phối dấu ghim là chỗ đang xảy ra
   * việc, bên bản đồ kho nó chỉ là toạ độ người dùng tra để nhìn cho rõ. Gọi tên
   * theo ngữ cảnh, chứ đừng bắt người xem bản đồ kho đọc "điểm gặp nạn" cho một
   * con số họ vừa tự gõ vào.
   */
  pointLabel?: string;
  /**
   * Lớp CSS của khung bản đồ khi KHÔNG toàn màn hình.
   *
   * Mặc định là khung vuông, hợp với chỗ đứng cạnh form khai tình huống. Trang bản
   * đồ kho không có form nào bên cạnh nên cho nó cao gần hết màn hình.
   */
  frameClassName?: string;
  /**
   * Lớp CSS của VỎ NGOÀI (khung bản đồ + chú giải bên dưới).
   *
   * Mặc định chỉ giãn dòng giữa hai phần. Chỗ nào cần bản đồ cao bằng đúng cột bên
   * cạnh thì truyền một flex-column có chiều cao đầy, rồi cho `frameClassName` ăn
   * hết phần còn lại — khung vuông mặc định không làm được việc đó vì chiều cao
   * của nó bị bề ngang quyết định.
   */
  className?: string;
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
  focusKey = "",
}: {
  points: LatLng[];
  focusPoint: LatLng | null;
  keepIncidentFocus?: boolean;
  /**
   * Đổi giá trị này là bắt khung nhìn nhảy về điểm đang bám.
   *
   * Bản đồ điều phối cố tình KHÔNG dùng: ở đó điểm đổi liên tục dưới ngón tay
   * người đang chọn. Bản đồ kho thì ngược lại — người dùng dán một toạ độ rồi
   * bấm tra, và cú bấm đó phải đưa được bản đồ tới chỗ vừa nhập.
   */
  focusKey?: string;
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
  }, [key, keepIncidentFocus, focusKey]);
  return null;
}

/** Cỡ chung của hai nút góc trên phải, để chúng luôn bằng nhau. */
const MAP_BUTTON_CLASS =
  "flex h-[30px] w-[34px] items-center justify-center rounded-md border bg-[var(--surface)] shadow-sm transition hover:bg-[var(--surface-2)] active:translate-y-px";

/** Khung mặc định: vuông, để cân với cột form khai tình huống bên cạnh. */
const DEFAULT_FRAME_CLASS =
  "relative isolate aspect-square w-full overflow-hidden rounded-md border";

export function IncidentMap({
  warehouses,
  baseWarehouses,
  incidentPoint,
  onPickIncident,
  keepIncidentFocus = false,
  focusKey = "",
  pointLabel = "Điểm gặp nạn",
  frameClassName = DEFAULT_FRAME_CLASS,
  className = "space-y-2",
}: IncidentMapProps) {
  // Hình nói LOẠI kho (nhà lớn = kho tổng, nhà thường = kho thôn), màu nói kho đó
  // có đang cấp hàng cho phương án này không. Hai chiều thông tin tách bạch nên
  // nhìn một dấu ghim là trả lời được cả hai câu hỏi mà không cần tra chú giải.
  const supplyCentralIcon = useMemo(() => villaIcon(MAP_SUPPLYING_COLOR, 34), []);
  const supplyHamletIcon = useMemo(() => houseIcon(MAP_SUPPLYING_COLOR, 28), []);
  // Kho chưa được huy động: xám. Trước đây kho tổng lúc nào cũng xanh, nên ngay
  // lúc chưa lập phương án nó đã trông như kho đã được chọn đi tiếp tế.
  const idleCentralIcon = useMemo(() => villaIcon(MAP_IDLE_COLOR, 34), []);
  const idleHamletIcon = useMemo(() => houseIcon(MAP_IDLE_COLOR, 26), []);
  // Điểm gặp nạn: ghim SOS — hình duy nhất trên bản đồ không phải ngôi nhà.
  const incidentIcon = useMemo(() => sosPinIcon(38), []);
  const communeGeo = useCommuneGeo();
  // Bản đồ trong cột form quá nhỏ để đọc đường sá quanh điểm nạn. Mở rộng ra hết
  // màn hình là cách xem cho rõ mà không phải rời trang và mất phần đang nhập dở.
  const [fullscreen, setFullscreen] = useState(false);
  /**
   * Nền đang dùng. Mặc định ẢNH VỆ TINH: ghim đúng một căn nhà hay một ngã ba là
   * việc chính của bản đồ này, mà nền vẽ offline chỉ tới zoom 15 và không có chữ
   * nên thưa quá, không đối chiếu được với lời kể.
   *
   * Đánh đổi phải biết: ảnh vệ tinh tải từ Internet. Mất mạng thì nền trắng và
   * người dùng bấm một nút để về gói offline — các dấu ghim, tuyến, ranh giới xã
   * đều vẽ bằng dữ liệu của chính hệ thống nên KHÔNG mất theo.
   */
  const [baseLayer, setBaseLayer] = useState<"offline" | "satellite">("satellite");
  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullscreen(false);
    };
    window.addEventListener("keydown", onKey);
    // Khoá cuộn nền: trang dài phía sau vẫn cuộn được thì lăn chuột trên bản đồ
    // vừa phóng to bản đồ vừa kéo trang, rất khó chịu.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [fullscreen]);

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
    <div className={className}>
      {/* Vuông: bản đồ nằm cạnh form theo cột dọc, khung vuông giữ cân với chiều
          cao form và không bóp méo khi cột hẹp lại. Ở chế độ toàn màn hình thì bỏ
          tỉ lệ vuông đi — lúc đó mục đích là nhìn được xa, không phải giữ cân. */}
      <div
        className={
          fullscreen
            ? "fixed inset-0 z-[1200] bg-[var(--surface)] p-3"
            : // `isolate` GIAM mọi thứ của bản đồ vào trong khung thẻ này.
              //
              // Leaflet đặt lớp control của nó ở z-index 1000, và nút "Toàn màn
              // hình" phải cao hơn thế mới không bị che. Nhưng `relative` không
              // tạo ngữ cảnh xếp lớp, nên hai con số đó leo thẳng ra tầng gốc của
              // trang và đè lên mọi thứ dựng bên ngoài — hộp thông báo của chuông
              // nằm trong header `sticky z-10`, tức cả cây con của nó chỉ được vẽ
              // ở tầng 10, nên chữ "Toàn màn hình" xuyên qua nằm giữa danh sách
              // thông báo. Nâng z-index của hộp thông báo lên không cứu được:
              // trần của nó là tầng 10 của header.
              //
              // `isolation: isolate` tạo ngữ cảnh xếp lớp ngay tại đây, nên 1000
              // của Leaflet chỉ còn nghĩa BÊN TRONG khung bản đồ. Sửa một chỗ,
              // hết cả nút toàn màn hình lẫn nút phóng to của Leaflet chọc ra.
              frameClassName
        }
      >
        <div className="absolute right-3 top-3 z-[1000] flex gap-2">
          {/* Chỉ icon, không chữ: hai nút cạnh nhau mà cả hai đều là chữ thì chiếm
            gần hết mép trên của bản đồ. `aria-label` và `title` vẫn nói đủ nghĩa —
            người dùng bàn phím và trình đọc màn hình không mất gì, và trỏ chuột vào
            là hiện đúng đánh đổi của chế độ sắp bật.

            Hai nút dùng CHUNG một lớp cỡ (MAP_BUTTON_CLASS): trước đây nút toàn màn
            hình là chữ nên nó cao thấp rộng hẹp theo độ dài chữ ("Toàn màn hình" rồi
            "Thu nhỏ"), tức là cứ bấm một cái là hàng nút đổi bề ngang và nút bên
            cạnh nhảy chỗ. */}
          <button
            type="button"
            onClick={() => setBaseLayer((v) => (v === "offline" ? "satellite" : "offline"))}
            aria-label={
              baseLayer === "offline" ? "Chuyển sang ảnh vệ tinh" : "Chuyển về bản đồ offline"
            }
            title={
              baseLayer === "offline"
                ? "Ảnh vệ tinh: thấy mái nhà, ngõ nhỏ, bờ ruộng — ghim chính xác hơn. Cần Internet."
                : "Bản đồ offline: chạy được khi mất mạng, nhưng chỉ tới zoom 15 và không có chữ."
            }
            className={MAP_BUTTON_CLASS}
          >
            <ColorIcon
              name={baseLayer === "offline" ? "satellite" : "mapFlat"}
              size={17}
              tone={baseLayer === "offline" ? "blue" : "green"}
            />
          </button>
          <button
            type="button"
            onClick={() => setFullscreen((v) => !v)}
            aria-label={fullscreen ? "Thu nhỏ bản đồ" : "Mở bản đồ toàn màn hình"}
            title={fullscreen ? "Thu nhỏ (Esc)" : "Mở toàn màn hình"}
            className={MAP_BUTTON_CLASS}
          >
            {/* Bốn mũi tên hướng ra = mở rộng, hướng vào = thu lại. Hình này ai cũng
              đọc được mà không cần chữ, nên nút giữ đúng một cỡ ở cả hai trạng thái. */}
            <ColorIcon name={fullscreen ? "shrink" : "expand"} size={17} tone="blue" />
          </button>
        </div>
        <div
          className={
            fullscreen ? "h-full w-full overflow-hidden rounded-md border" : "h-full w-full"
          }
        >
          <MapContainer
            center={[center.lat, center.lng]}
            zoom={13}
            minZoom={OFFLINE_PACK_MIN_ZOOM}
            maxZoom={MAX_DETAIL_ZOOM}
            maxBounds={PROVINCE_BOUNDS}
            maxBoundsViscosity={1}
            scrollWheelZoom
            // Nút +/- mặc định của Leaflet nằm góc trên TRÁI, nơi nhãn tên kho và
            // dấu ghim hay dồn về; tắt đi rồi dựng lại ở góc dưới phải để nó không
            // đè lên bản đồ mà vẫn nằm trong tầm ngón cái.
            zoomControl={false}
            style={{ height: "100%", width: "100%" }}
          >
            <ZoomControl position="bottomright" />
            {/* `key` khác nhau cho hai nền: không có nó, React-Leaflet chỉ đổi prop
              `url` trên cùng một lớp và Leaflet giữ nguyên `maxNativeZoom` cũ —
              bật vệ tinh xong phóng quá zoom 15 vẫn ra ảnh mờ của gói offline. */}
            {baseLayer === "satellite" ? (
              <>
                <TileLayer
                  key="satellite"
                  url={SATELLITE_TILE_URL}
                  attribution={SATELLITE_TILE_ATTRIBUTION}
                  maxZoom={MAX_DETAIL_ZOOM}
                  maxNativeZoom={SATELLITE_MAX_NATIVE_ZOOM}
                  errorTileUrl={BLANK_TILE}
                />
                {/* Chữ phủ lên ảnh: tên thôn, tên đường. Ảnh vệ tinh trần thấy được
                  mái nhà nhưng không biết đó là thôn nào — mà lời kể qua điện thoại
                  luôn nói bằng tên ("nhà văn hoá thôn Long Châu"). */}
                {/* Lớp chữ CÓ ảnh thật tới z19 (đã đo), sâu hơn ảnh vệ tinh ở vùng
                  này. Nên cho nó `maxNativeZoom` riêng: ảnh nền mờ dần khi phóng
                  quá z18 nhưng tên thôn, tên đường vẫn nét. */}
                <TileLayer
                  key="satellite-labels"
                  url={SATELLITE_LABELS_TILE_URL}
                  maxZoom={MAX_DETAIL_ZOOM}
                  maxNativeZoom={MAX_DETAIL_ZOOM}
                  errorTileUrl={BLANK_TILE}
                />
              </>
            ) : (
              <TileLayer
                key="offline"
                url={OFFLINE_TILE_URL}
                attribution={OFFLINE_TILE_ATTRIBUTION}
                maxZoom={MAX_DETAIL_ZOOM}
                maxNativeZoom={OFFLINE_MAX_NATIVE_ZOOM}
                errorTileUrl={BLANK_TILE}
              />
            )}
            <BoundsForZoom />
            <ResizeOnToggle token={fullscreen} />
            <ResizeOnContainerChange />
            {/* Ranh giới xã: giống bản đồ kho, để biết điểm vừa ghim thuộc xã nào. */}
            {communeGeo ? <CommuneBoundaries geo={communeGeo} /> : null}
            <FitBounds
              points={boundsPoints}
              focusPoint={incidentPoint}
              keepIncidentFocus={keepIncidentFocus}
              focusKey={focusKey}
            />
            {onPickIncident ? <ClickToPin onPick={onPickIncident} /> : null}
            {/* Kho chưa tham gia phương án — vẫn phải thấy để biết ghim gần kho nào. */}
            {otherWarehouses.map((w) => (
              <Marker
                key={`base-${w.id}`}
                position={[w.lat as number, w.lng as number]}
                icon={w.kind === "CENTRAL" ? idleCentralIcon : idleHamletIcon}
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
                <RouteLine
                  key={`route-${w.id}`}
                  color={ROUTE_COLORS[index % ROUTE_COLORS.length]}
                  points={w.routeGeometry.coordinates.map(([lng, lat]) => [lat, lng])}
                />
              ) : null,
            )}
            {warehouses.map((w) => (
              <Marker
                key={w.id}
                position={[w.lat, w.lng]}
                icon={w.kind === "CENTRAL" ? supplyCentralIcon : supplyHamletIcon}
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
                  supplying
                />
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
                {onPickIncident ? null : <Popup>{pointLabel}</Popup>}
              </Marker>
            ) : null}
          </MapContainer>
        </div>
      </div>

      {/* Hai hàng: hàng trên là các hình có trên bản đồ, hàng dưới là số đo của
          điểm đang ghim (bán kính vòng khoanh, rồi toạ độ). Mọi ô hình đều rộng
          đúng 20px — kể cả chấm tròn bé của vòng khoanh — nên chữ của hai hàng
          bắt đầu ở cùng một mép trái thay vì so le nhau. */}
      <div className="space-y-1.5 text-xs text-[var(--text-muted)]">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <LegendGlyph svg={sosPinSvg(20)} label={pointLabel} />
          <LegendGlyph svg={villaSvg(MAP_IDLE_COLOR, 20)} label="Kho tổng" />
          <LegendGlyph svg={houseSvg(MAP_IDLE_COLOR, 18)} label="Kho thôn" />
          {/* Chỉ nói tới màu xanh khi trên bản đồ THẬT SỰ có kho đang tiếp tế —
              chú giải cho một thứ không có mặt chỉ làm người đọc đi tìm. */}
          {warehouses.length > 0 ? (
            <LegendGlyph
              svg={houseSvg(MAP_SUPPLYING_COLOR, 18)}
              label={`Kho tiếp tế (${warehouses.length})`}
            />
          ) : null}
        </div>
        {incidentPoint ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span className="flex items-center gap-1.5">
              <span
                aria-hidden
                className="inline-flex h-5 w-5 shrink-0 items-center justify-center"
              >
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full border border-dashed"
                  style={{
                    borderColor: "var(--color-critical, #d64545)",
                    backgroundColor:
                      "color-mix(in srgb, var(--color-critical, #d64545) 12%, transparent)",
                  }}
                />
              </span>
              {/* Nói thẳng đây là mốc nhìn: vòng tròn trên bản đồ rất dễ bị đọc thành
                  "phạm vi ảnh hưởng đã đo", mà hệ thống không hề có số liệu đó. */}
              Bán kính {pointLabel.toLowerCase()} (mốc nhìn, {INCIDENT_ZONE_RADIUS_M}m)
            </span>
            <span className="flex items-center gap-1.5">
              {/* Vòng ngắm đỏ, đặt trong cùng ô 20px như mọi hình khác: không có nó
                  thì dòng toạ độ là dòng DUY NHẤT bắt đầu bằng chữ, nhìn như một câu
                  bị bỏ quên chứ không phải một mục của chú giải. Vòng ngắm chứ không
                  phải ghim — ghim đã là hình của điểm gặp nạn ở hàng trên, dùng lại
                  thì thành hai mục cùng hình. */}
              <span
                aria-hidden
                className="inline-flex h-5 w-5 shrink-0 items-center justify-center"
              >
                <ColorIcon name="target" size={16} tone="red" />
              </span>
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span>
                  Tọa độ {pointLabel.toLowerCase()}:{" "}
                  <span className="tabular font-semibold text-[var(--text)]">
                    {formatCoordinate(incidentPoint)}
                  </span>
                </span>
                <CopyCoordinateButton point={incidentPoint} />
              </span>
            </span>
          </div>
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
  supplying = false,
}: {
  name: string;
  kind: string;
  point: LatLng;
  incidentPoint: LatLng | null;
  /** Kho này có cấp hàng cho phương án đang xem không — quyết định nhãn có tô xanh. */
  supplying?: boolean;
}) {
  const hidden = overlapsIncident(point, incidentPoint);
  // Xanh đi theo VAI TRÒ trong phương án, giống hệt dấu ghim — nhãn xanh cho một
  // kho tổng chưa được huy động thì đọc ra là "kho này đang tiếp tế", sai hẳn.
  // Kho tổng chưa huy động vẫn được chữ to hơn một chút để nổi giữa cụm kho thôn.
  const tone = supplying ? " wh-label-supply" : kind === "CENTRAL" ? " wh-label-central" : "";
  return (
    <Tooltip
      permanent
      direction={hidden ? "left" : "right"}
      offset={hidden ? [-12, -14] : [10, -14]}
      className={`wh-label${tone}`}
    >
      {shortWarehouseName(name)}
    </Tooltip>
  );
}

/**
 * Chép cặp toạ độ ra clipboard.
 *
 * Đây là mắt nối giữa hai bản đồ: người trực đọc toạ độ ở nhiệm vụ rồi dán vào ô
 * tra cứu của bản đồ kho để xem cùng một chỗ. Chép tay 12 chữ số thì sai một số là
 * ghim lệch cả cây số mà nhìn vẫn thấy "hợp lý", nên nút này không phải tiện nghi.
 */
function CopyCoordinateButton({ point }: { point: LatLng }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(id);
  }, [copied]);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(formatCoordinate(point));
          setCopied(true);
        } catch {
          // Trình duyệt chặn clipboard (thường vì trang không chạy HTTPS). Không
          // báo lỗi ồn ào: toạ độ vẫn hiện ngay bên cạnh để bôi đen chép tay.
          setCopied(false);
        }
      }}
      title="Chép toạ độ để dán vào ô tra cứu của bản đồ kho"
      className="rounded-md border px-1.5 py-0.5 text-[11px] font-medium transition hover:bg-[var(--surface-2)] active:translate-y-px"
    >
      {copied ? "Đã chép" : "Chép"}
    </button>
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

/**
 * Một tuyến kho → điểm nạn: viền trắng, thân màu, và mũi tên chỉ chiều đi.
 *
 * Ba lớp chồng nhau, mỗi lớp một việc:
 *   - viền trắng dày hơn thân, để đường không tan vào ảnh vệ tinh (mái tôn sáng,
 *     mặt nước, đường bê tông đều gần trắng ở mức phóng thường dùng);
 *   - thân màu, dày 7px — bản trước để 5px và với bốn năm tuyến chồng nhau ở đoạn
 *     gần điểm nạn thì không tách được tuyến nào ra khỏi tuyến nào;
 *   - mũi tên rải theo quãng đường, nói chiều đi. Đường kẻ hai đầu như nhau không
 *     nói được đi về phía nào, mà đó lại là câu đầu tiên người đi lấy hàng hỏi.
 *
 * Mũi tên là `Marker` chứ không phải hoạ tiết của `Polyline`: Leaflet không có
 * hoạ tiết dọc đường, và bản vá phổ biến cho việc này là một plugin ngoài — thêm
 * một phụ thuộc chỉ để vẽ mấy hình tam giác thì không đáng.
 */
function RouteLine({ color, points }: { color: string; points: RoutePoint[] }) {
  const arrows = useMemo(() => routeArrows(points), [points]);
  return (
    <>
      <Polyline positions={points} pathOptions={{ color: "#ffffff", weight: 11, opacity: 0.75 }} />
      <Polyline positions={points} pathOptions={{ color, weight: 7, opacity: 0.95 }} />
      {arrows.map((arrow, index) => (
        <Marker
          key={`${arrow.lat}-${arrow.lng}-${index}`}
          position={[arrow.lat, arrow.lng]}
          // Hình trang trí: nuốt cú bấm thì bấm lên tuyến để ghim điểm nạn sẽ trượt.
          interactive={false}
          keyboard={false}
          icon={arrowIcon(arrow.bearing, color)}
        />
      ))}
    </>
  );
}

/**
 * Cỡ khung mũi tên, pixel.
 *
 * To hơn bản trước (17px) vì hình nay là một GẠCH có đầu nhọn chứ không còn là
 * tam giác trơn: phần thân chiếm gần hết chiều cao khung, nên ở 17px cái gạch chỉ
 * còn hơn chục pixel và lại đọc ra thành một vệt nhỏ như cũ.
 */
const ARROW_ICON_SIZE = 26;
function arrowIcon(bearing: number, color: string): L.DivIcon {
  return L.divIcon({
    html: routeArrowSvg(bearing, ARROW_ICON_SIZE, color),
    className: "",
    iconSize: [ARROW_ICON_SIZE, ARROW_ICON_SIZE],
    // Neo vào TÂM: mũi tên phải nằm đúng trên tim đường, không treo lủng lẳng bên
    // dưới như dấu ghim (dấu ghim neo ở chân vì nó "đứng" trên một chỗ).
    iconAnchor: [ARROW_ICON_SIZE / 2, ARROW_ICON_SIZE / 2],
  });
}

/**
 * Một dòng chú giải vẽ ĐÚNG hình đang có trên bản đồ.
 *
 * Chấm tròn màu thì rẻ, nhưng bắt người xem tự nối "chấm xanh" với "ngôi nhà lớn
 * màu xanh" ở giữa một tấm ảnh vệ tinh dày đặc — mà chú giải sinh ra chính là để
 * khỏi phải làm việc đó. Chuỗi SVG lấy từ cùng một hàm mà Leaflet dùng để vẽ
 * marker, nên chú giải không thể lệch với bản đồ.
 */
function LegendGlyph({ svg, label }: { svg: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        aria-hidden
        className="inline-flex h-5 w-5 shrink-0 items-center justify-center"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      {label}
    </span>
  );
}

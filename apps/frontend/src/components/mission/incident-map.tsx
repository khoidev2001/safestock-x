"use client";

import L from "leaflet";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
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

  /**
   * Toạ độ tuyến đã đảo sẵn về [vĩ độ, kinh độ], nhớ lại giữa các lượt vẽ.
   *
   * Một tuyến OSRM dài vài trăm điểm. Dựng lại mảng mỗi lần component vẽ lại —
   * bật toàn màn hình, đổi nền bản đồ — là ép luôn phần tính chỗ đặt mũi tên chạy
   * lại và thay toàn bộ marker mũi tên trong DOM, cho một dữ liệu không hề đổi.
   */
  const routeLines = useMemo(
    () =>
      warehouses.flatMap((warehouse, index) =>
        warehouse.routeStatus === "ROUTED" && warehouse.routeGeometry
          ? [
              {
                id: warehouse.id,
                color: ROUTE_COLORS[index % ROUTE_COLORS.length],
                positions: warehouse.routeGeometry.coordinates.map(([lng, lat]) => ({ lat, lng })),
              },
            ]
          : [],
      ),
    [warehouses],
  );

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
            {routeLines.map((route) => (
              // `Fragment` chứ không phải `<div>`: con của MapContainer phải là
              // lớp Leaflet, một thẻ DOM lạ sẽ bị thả thẳng vào khung bản đồ.
              <Fragment key={`route-${route.id}`}>
                {/* Viền trắng bên dưới: một nét xanh đơn độc trên ảnh vệ tinh lẫn
                    vào mái tôn và mặt đường bê tông, có khúc gần như biến mất. Lớp
                    này chỉ để tách đường ra khỏi nền, không mang tin. */}
                <Polyline
                  pathOptions={{
                    color: "#FFFFFF",
                    weight: ROUTE_CASING_WEIGHT,
                    opacity: 0.75,
                    interactive: false,
                  }}
                  positions={route.positions.map((point) => [point.lat, point.lng])}
                />
                <Polyline
                  pathOptions={{ color: route.color, weight: ROUTE_WEIGHT, opacity: 0.95 }}
                  positions={route.positions.map((point) => [point.lat, point.lng])}
                />
                {/* Mũi tên nằm TRONG lòng đường, chỉ từ kho về phía điểm gặp nạn —
                    tuyến máy chủ trả về luôn đi theo chiều đó. */}
                <RouteDirectionArrows color={route.color} positions={route.positions} />
              </Fragment>
            ))}
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
          {/* Nói rõ MŨI TÊN CHỈ CHIỀU NÀO. Đường kẻ có mũi tên vẫn có thể bị đọc
              ngược — "hàng chuyển về kho" — mà đọc ngược ở đây là cho xe đi sai
              hướng. Chỉ hiện khi trên bản đồ thật sự có tuyến vẽ được. */}
          {routeLines.length > 0 ? (
            <LegendGlyph label="Tuyến kho → điểm gặp nạn" svg={routeLegendSvg(20)} />
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
 * Bề dày tuyến đường.
 *
 * Nét mảnh biến mất trên ảnh vệ tinh: mái tôn, đường bê tông và bờ ruộng đều có
 * sắc gần với xanh dương ở độ phóng thấp, và người trực phải nheo mắt dò xem
 * đường chạy lối nào. Vẽ đường CHÍNH đủ dày để mũi tên chỉ hướng nằm lọt hẳn bên
 * trong nó, kèm một lớp viền trắng bên dưới để tách đường ra khỏi nền.
 */
const ROUTE_WEIGHT = 8;
const ROUTE_CASING_WEIGHT = ROUTE_WEIGHT + 5;

/** Khoảng cách trên MÀN HÌNH giữa hai mũi tên chỉ hướng, tính bằng pixel. */
const ARROW_SPACING_PX = 120;

/** Nhiều nhất ngần này mũi tên trên một tuyến — quá số này thì đường thành gạch nối. */
const MAX_ARROWS_PER_ROUTE = 8;

/**
 * Mũi tên chỉ hướng vẽ NẰM TRONG lòng đường, từ kho chạy về phía điểm gặp nạn.
 *
 * Một đường kẻ không có hướng chỉ nói "hai chỗ này nối với nhau". Trên bản đồ có
 * ba bốn kho cùng cấp hàng, các tuyến cắt nhau ở ngã ba và người đọc phải tự
 * đoán khúc nào chạy về đâu — đoán sai là cho xe đi ngược. Mũi tên trả lời sẵn
 * câu đó ngay trên hình.
 *
 * Góc quay tính trong hệ toạ độ MÀN HÌNH (`map.project`), không phải theo hiệu
 * số vĩ độ/kinh độ. Chiếu Mercator kéo giãn theo vĩ độ, nên góc tính từ lat/lng
 * trần sẽ lệch dần khỏi đường thật — mũi tên chỉ chệch ra ngoài lòng đường là
 * chi tiết đập vào mắt ngay.
 *
 * Vẽ lại sau mỗi lần phóng to thu nhỏ: khoảng cách giữa các mũi tên đo bằng
 * pixel, nên phóng to phải thêm mũi tên vào những khúc vừa giãn ra.
 */
function RouteDirectionArrows({ positions, color }: { positions: LatLng[]; color: string }) {
  const map = useMap();
  const [zoom, setZoom] = useState(() => map.getZoom());

  useEffect(() => {
    const sync = () => setZoom(map.getZoom());
    map.on("zoomend", sync);
    return () => {
      map.off("zoomend", sync);
    };
  }, [map]);

  const arrows = useMemo(() => {
    if (positions.length < 2) return [];

    // Đo tuyến trong hệ pixel của đúng mức phóng hiện tại: khoảng cách giữa hai
    // mũi tên là khoảng cách MẮT NHÌN THẤY, không phải quãng đường thật.
    const points = positions.map((position) => map.project([position.lat, position.lng], zoom));
    const lengths: number[] = [];
    let total = 0;
    for (let i = 1; i < points.length; i += 1) {
      const segment = points[i].distanceTo(points[i - 1]);
      lengths.push(segment);
      total += segment;
    }
    if (total <= 0) return [];

    // Ít nhất MỘT mũi tên trên mỗi tuyến, kể cả tuyến ngắn: tuyến ngắn nhất
    // thường là kho thôn ngay cạnh điểm nạn, mà đó lại là kho nên tới trước.
    const count = Math.max(1, Math.min(MAX_ARROWS_PER_ROUTE, Math.round(total / ARROW_SPACING_PX)));

    const placed: { key: string; lat: number; lng: number; angleDeg: number }[] = [];
    for (let index = 0; index < count; index += 1) {
      // Chia đều và lùi vào trong: đặt mũi tên ở mốc 0 hay mốc 1 là dán nó ngay
      // dưới dấu ghim kho hoặc dấu ghim điểm nạn, nơi nó bị che mất.
      const target = (total * (index + 0.5)) / count;
      let walked = 0;
      let segment = 0;
      while (segment < lengths.length - 1 && walked + lengths[segment] < target) {
        walked += lengths[segment];
        segment += 1;
      }
      const from = points[segment];
      const to = points[segment + 1];
      const ratio = lengths[segment] > 0 ? (target - walked) / lengths[segment] : 0;
      const at = L.point(from.x + (to.x - from.x) * ratio, from.y + (to.y - from.y) * ratio);
      const latlng = map.unproject(at, zoom);
      placed.push({
        key: `${index}`,
        lat: latlng.lat,
        lng: latlng.lng,
        // `atan2` trong hệ pixel: trục y hướng XUỐNG, nên góc này đã đúng chiều
        // quay của CSS `rotate` mà không phải đảo dấu.
        angleDeg: (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI,
      });
    }
    return placed;
  }, [map, positions, zoom]);

  return (
    <>
      {arrows.map((arrow) => (
        <Marker
          icon={arrowIcon(arrow.angleDeg, color)}
          // Trang trí thuần: nuốt cú bấm ở đây là chặn mất thao tác dời điểm nạn
          // của người đang lập phương án.
          interactive={false}
          key={`${arrow.key}-${arrow.lat}-${arrow.lng}`}
          position={[arrow.lat, arrow.lng]}
        />
      ))}
    </>
  );
}

/**
 * Hình tuyến đường cho chú giải: đúng bề dày, đúng màu, đúng mũi tên như trên bản đồ.
 *
 * Vẽ lại bằng cùng những con số mà tuyến thật dùng, để chú giải không thể lệch
 * với hình người ta đang nhìn.
 */
function routeLegendSvg(size: number): string {
  const middle = size / 2;
  return (
    `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true">` +
    `<line x1="1" y1="${middle}" x2="${size - 1}" y2="${middle}" stroke="#FFFFFF" ` +
    `stroke-width="${ROUTE_CASING_WEIGHT / 2}" stroke-linecap="round" />` +
    `<line x1="1" y1="${middle}" x2="${size - 1}" y2="${middle}" stroke="${ROUTE_COLORS[0]}" ` +
    `stroke-width="${ROUTE_WEIGHT / 2}" stroke-linecap="round" />` +
    `<path d="M${middle - 2} ${middle - 2.4} L${middle + 2} ${middle} L${middle - 2} ${middle + 2.4}" ` +
    `fill="none" stroke="#FFFFFF" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />` +
    `</svg>`
  );
}

/**
 * Một mũi tên trắng đủ nhỏ để nằm lọt trong lòng đường.
 *
 * Trắng chứ không phải màu đậm hơn của chính tuyến: nền là ảnh vệ tinh, và giữa
 * hai sắc xanh cạnh nhau thì mắt phải nhìn kỹ mới tách ra được hình mũi tên.
 */
function arrowIcon(angleDeg: number, color: string): L.DivIcon {
  const size = ROUTE_WEIGHT + 4;
  return L.divIcon({
    className: "",
    html:
      `<div style="width:${size}px;height:${size}px;display:flex;align-items:center;` +
      `justify-content:center;transform:rotate(${angleDeg.toFixed(1)}deg)">` +
      `<svg viewBox="0 0 12 12" width="${size}" height="${size}" aria-hidden="true">` +
      `<path d="M3.4 1.6 L8.4 6 L3.4 10.4" fill="none" stroke="#FFFFFF" stroke-width="2.6" ` +
      `stroke-linecap="round" stroke-linejoin="round" />` +
      `<path d="M3.4 1.6 L8.4 6 L3.4 10.4" fill="none" stroke="${color}" stroke-width="0.9" ` +
      `stroke-linecap="round" stroke-linejoin="round" />` +
      `</svg></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
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

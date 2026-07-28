import {
  BuildingFour,
  ChurchOne,
  Home,
  Hospital,
  School,
  Shop,
  Strongbox,
} from "@icon-park/react";
import { renderToStaticMarkup } from "react-dom/server";

export type MapMarkerKind =
  | "central-warehouse"
  | "hamlet-warehouse"
  | "place"
  | "health"
  | "school"
  | "civic"
  | "commerce"
  | "worship"
  | "poi";

const markerStyles: Record<
  MapMarkerKind,
  {
    color: string;
    background: string;
    icon: typeof Strongbox;
    label: string;
    size: number;
  }
> = {
  "central-warehouse": {
    color: "#166534",
    background: "#dcfce7",
    icon: Strongbox,
    label: "Kho tổng xã",
    size: 34,
  },
  "hamlet-warehouse": {
    color: "#475569",
    background: "#f1f5f9",
    icon: Strongbox,
    label: "Kho thôn",
    size: 30,
  },
  place: {
    color: "#7a2e12",
    background: "#ffedd5",
    icon: Home,
    label: "Thôn/xóm",
    size: 22,
  },
  health: {
    color: "#b91c1c",
    background: "#fee2e2",
    icon: Hospital,
    label: "Y tế",
    size: 22,
  },
  school: {
    color: "#1d4ed8",
    background: "#dbeafe",
    icon: School,
    label: "Trường học",
    size: 22,
  },
  civic: {
    color: "#6d28d9",
    background: "#ede9fe",
    icon: BuildingFour,
    label: "Hành chính",
    size: 22,
  },
  commerce: {
    color: "#047857",
    background: "#d1fae5",
    icon: Shop,
    label: "Chợ/cửa hàng",
    size: 22,
  },
  worship: {
    color: "#92400e",
    background: "#fef3c7",
    icon: ChurchOne,
    label: "Tôn giáo",
    size: 22,
  },
  poi: {
    color: "#4b5563",
    background: "#f3f4f6",
    icon: BuildingFour,
    label: "Địa điểm",
    size: 22,
  },
};

export function MapMarkerGlyph({
  kind,
  size,
}: {
  kind: MapMarkerKind;
  size?: number;
}) {
  const style = markerStyles[kind];
  const Icon = style.icon;
  const markerSize = size ?? style.size;
  return (
    <span
      aria-hidden="true"
      className="map-marker-glyph"
      style={{
        backgroundColor: style.background,
        color: style.color,
        height: markerSize,
        width: markerSize,
      }}
    >
      <Icon fill={style.color} size={Math.round(markerSize * 0.58)} strokeWidth={3} theme="filled" />
    </span>
  );
}

export function markerIconHtml(kind: MapMarkerKind, size?: number): string {
  return renderToStaticMarkup(<MapMarkerGlyph kind={kind} size={size} />);
}

export function mapMarkerLabel(kind: MapMarkerKind): string {
  return markerStyles[kind].label;
}

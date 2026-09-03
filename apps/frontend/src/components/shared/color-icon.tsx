import {
  Alarm,
  AddUser,
  ArrowRight,
  Attention,
  Audit,
  Box,
  BroadcastRadio,
  Caution,
  ChartStock,
  CheckOne,
  Clipboard,
  Close,
  CloseWifi,
  Dashboard,
  Delete,
  Down,
  Earth,
  Edit,
  Exchange,
  FileExcel,
  FileSearch,
  FileText,
  Fire,
  FullScreenOne,
  HeavyRain,
  Help,
  Inspection,
  Key,
  Left,
  Lifebuoy,
  LoadingFour,
  Logout,
  Magic,
  MapDraw,
  MapTwo,
  Message,
  Mountain,
  OffScreenOne,
  PeopleSafe,
  Peoples,
  PhoneCall,
  Pin,
  PreviewClose,
  PreviewOpen,
  Protection,
  Refresh,
  Remind,
  Robot,
  Right,
  Save,
  Send,
  Strongbox,
  Target,
  Thermometer,
  Thunderstorm,
  Time,
  Transfer,
  Trend,
  TrendingDown,
  TrendingUp,
  Upload,
  User,
  VoiceOne,
  WaterLevel,
  WaterNo,
} from "@icon-park/react";
import type { ComponentType } from "react";

const icons = {
  assistant: Robot,
  addUser: AddUser,
  arrowRight: ArrowRight,
  audit: Audit,
  blocked: Attention,
  close: Close,
  dashboard: Dashboard,
  delete: Delete,
  down: Down,
  document: FileText,
  edit: Edit,
  expand: FullScreenOne,
  help: Help,
  incident: Alarm,
  // Bốn loại thiên tai có hình riêng: thẻ thông báo phải nhận ra được là việc gì
  // trước khi người trực kịp đọc chữ.
  flood: WaterLevel,
  storm: Thunderstorm,
  landslide: Mountain,
  fire: Fire,
  isolation: WaterNo,
  insights: Trend,
  inventory: Box,
  key: Key,
  left: Left,
  loading: LoadingFour,
  logout: Logout,
  loan: Exchange,
  map: MapDraw,
  location: Pin,
  message: Message,
  mission: Lifebuoy,
  packageCheck: CheckOne,
  packageSearch: FileSearch,
  phone: PhoneCall,
  passwordHide: PreviewClose,
  passwordShow: PreviewOpen,
  peopleSafe: PeopleSafe,
  readiness: ChartStock,
  refresh: Refresh,
  report: FileExcel,
  right: Right,
  notification: Remind,
  shrink: OffScreenOne,
  save: Save,
  security: Protection,
  send: Send,
  simulator: BroadcastRadio,
  stocktake: Inspection,
  success: CheckOne,
  target: Target,
  temperature: Thermometer,
  time: Time,
  transfer: Transfer,
  trendDown: TrendingDown,
  trendUp: TrendingUp,
  upload: Upload,
  user: User,
  users: Peoples,
  warehouse: Strongbox,
  warning: Caution,
  weather: HeavyRain,
  wifiOff: CloseWifi,
  workflow: Clipboard,
  magic: Magic,
  // Đổi nền bản đồ: quả đất = ảnh vệ tinh, bản đồ = gói tile offline.
  satellite: Earth,
  mapFlat: MapTwo,
  microphone: VoiceOne,
} satisfies Record<string, IconParkComponent>;

const palettes = {
  blue: ["#123B8F", "#2F80ED", "#EFF6FF", "#60A5FA"],
  green: ["#166534", "#22C55E", "#F0FDF4", "#86EFAC"],
  amber: ["#92400E", "#F59E0B", "#FFFBEB", "#FCD34D"],
  orange: ["#9A3412", "#F97316", "#FFF7ED", "#FDBA74"],
  red: ["#991B1B", "#EF4444", "#FFF1F2", "#FDA4AF"],
} as const;

type IconParkComponent = ComponentType<{
  "aria-hidden"?: boolean;
  className?: string;
  fill?: string | string[];
  size?: number | string;
  strokeWidth?: number;
  theme?: "outline" | "filled" | "two-tone" | "multi-color";
}>;

export type ColorIconName = keyof typeof icons;
export type ColorIconTone = keyof typeof palettes;

export function ColorIcon({
  className,
  name,
  size = 20,
  tone = "blue",
}: {
  className?: string;
  name: ColorIconName;
  size?: number;
  tone?: ColorIconTone;
}) {
  const Icon = icons[name];

  return (
    <Icon
      aria-hidden="true"
      className={`shrink-0 ${className ?? ""}`}
      fill={[...palettes[tone]]}
      size={size}
      strokeWidth={3}
      theme="multi-color"
    />
  );
}

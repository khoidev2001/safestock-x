import {
  Alarm,
  AddUser,
  AllApplication,
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
  Delete,
  DocSuccess,
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
  HelmetOne,
  Home,
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
  PeoplesTwo,
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
  // Bốn ô vuông rời — hình quy ước của một trang tổng quan. `Dashboard` của thư
  // viện là mặt đồng hồ tốc độ: nó nói "đo lường", không nói "tất cả mọi thứ ở
  // đây". Khoá này CHỈ tab Tổng quan dùng nên đổi thẳng, không cần khoá mới.
  dashboard: AllApplication,
  delete: Delete,
  down: Down,
  document: FileText,
  edit: Edit,
  expand: FullScreenOne,
  help: Help,
  // Mũ bảo hộ (安全帽), không phải mũ thể thao — đây là đội đi hiện trường.
  helmet: HelmetOne,
  house: Home,
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
  // Ba người đứng cùng nhau: điều phối cứu hộ là điều NGƯỜI, không phải điều
  // vật tư. Khoá riêng chứ không đổi `mission`, vì phao cứu sinh còn dùng ở
  // dòng thời gian hiện trường, trợ lý và các bước của quy trình nhiệm vụ.
  rescueTeam: PeoplesTwo,
  packageCheck: CheckOne,
  // Tờ việc có dấu tích: một nhiệm vụ là danh sách việc phải làm xong, không
  // phải một kiện hàng đã kiểm. Khoá riêng vì `packageCheck` còn ở bảng vật tư.
  taskList: DocSuccess,
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
  mono = false,
  name,
  size = 20,
  tone = "blue",
}: {
  className?: string;
  /**
   * Vẽ một màu theo màu chữ của thẻ cha (`currentColor`), thay cho bảng bốn màu.
   *
   * Dùng khi hình nằm trên NỀN ĐẶC — nút màu nhấn, huy hiệu màu. Bảng bốn màu
   * được chọn để nổi trên nền trắng: nét đậm xanh navy, ruột xanh dương, nền
   * trong hình gần như trắng. Đặt nguyên bảng đó lên một nút xanh lá đặc thì cả
   * bốn màu đều xỉn lại thành một mảng chìm nghỉm — đúng thứ nhìn thấy ở nút gửi
   * và nút mở trợ lý.
   *
   * Một màu thì lấy đúng `--color-accent-fg` (gần như trắng) mà nút đã đặt sẵn,
   * nên hình luôn tương phản với nền, kể cả khi màu nhấn đổi sau này.
   */
  mono?: boolean;
  name: ColorIconName;
  size?: number;
  tone?: ColorIconTone;
}) {
  const Icon = icons[name];

  return (
    <Icon
      aria-hidden="true"
      className={`shrink-0 ${className ?? ""}`}
      fill={mono ? "currentColor" : [...palettes[tone]]}
      size={size}
      strokeWidth={3}
      theme={mono ? "outline" : "multi-color"}
    />
  );
}

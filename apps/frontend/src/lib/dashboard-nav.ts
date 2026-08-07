import type { ColorIconName, ColorIconTone } from "@/components/shared/color-icon";
import { FIELD_FORCE_ROLE_LABEL, Permission } from "@safestock/shared-types";

export type NavGroup = "Điều hành" | "Nghiệp vụ kho" | "Quản trị";

export interface NavItem {
  /** Đường dẫn thật của trang (dùng cho Link + so khớp active). */
  path: string;
  /** Nhãn ngắn trên thanh điều hướng. */
  label: string;
  icon: ColorIconName;
  tone: ColorIconTone;
  group: NavGroup;
  adminOnly?: boolean;
  requiredPermission: Permission;
  /** Tiêu đề + mô tả hiển thị ở đầu trang. */
  title: string;
  subtitle: string;
}

/**
 * Nguồn dữ liệu duy nhất cho điều hướng dashboard: mỗi mục là một route thật.
 * DashboardShell dựng menu từ đây; mỗi trang lấy title/subtitle theo path.
 */
export const navItems: NavItem[] = [
  {
    path: "/readiness",
    label: "Tổng quan",
    icon: "dashboard",
    tone: "green",
    group: "Điều hành",
    requiredPermission: Permission.READINESS_VIEW,
    title: "Tình trạng sẵn sàng",
    subtitle: "Theo dõi khả năng vận hành, các vướng mắc và việc cần xử lý.",
  },
  {
    path: "/mission",
    label: "Điều phối cứu hộ",
    icon: "mission",
    tone: "orange",
    group: "Điều hành",
    // MISSION_CREATE chứ không phải MISSION_VIEW.
    //
    // Trang này CHỈ có form khai tình huống, mà form đó chỉ hiện cho người lập
    // được phương án. Ai xem được nhưng không lập được thì bấm vào chỉ thấy một
    // trang trắng có mỗi cái tiêu đề — tệ hơn hẳn việc không có tab.
    //
    // Kho vẫn xem được nhiệm vụ của mình ở tab "Nhiệm vụ" ngay bên dưới, nên
    // giấu tab này không lấy đi thông tin nào của họ.
    requiredPermission: Permission.MISSION_CREATE,
    title: "Điều phối cứu hộ",
    subtitle: "Ghi nhận tình huống và chỉ chỗ xảy ra sự việc để hệ thống tính nhu cầu.",
  },
  {
    path: "/missions",
    label: "Nhiệm vụ",
    icon: "packageCheck",
    tone: "blue",
    group: "Điều hành",
    requiredPermission: Permission.MISSION_VIEW,
    title: "Nhiệm vụ",
    subtitle: "Theo dõi các nhiệm vụ đang chạy và mở trang chi tiết của từng nhiệm vụ.",
  },
  {
    path: "/insights",
    label: "Theo dõi, dự báo",
    icon: "insights",
    tone: "blue",
    group: "Điều hành",
    requiredPermission: Permission.READINESS_VIEW,
    title: "Theo dõi và dự báo",
    subtitle: "Nhận biết sớm nguy cơ thiếu hàng, hết hạn và nhu cầu điều chuyển giữa các kho.",
  },
  {
    path: "/inventory",
    label: "Vật tư",
    icon: "inventory",
    tone: "orange",
    group: "Nghiệp vụ kho",
    requiredPermission: Permission.INVENTORY_READ,
    title: "Kho vật tư",
    subtitle: "Tra cứu từng lô hàng, vị trí lưu trữ và số lượng hiện có.",
  },
  {
    path: "/stocktake",
    label: "Kiểm kê",
    icon: "stocktake",
    tone: "green",
    group: "Nghiệp vụ kho",
    requiredPermission: Permission.INVENTORY_RECONCILE,
    title: "Kiểm kê",
    subtitle: "Đối chiếu số đếm thực tế với số liệu đang được ghi nhận.",
  },
  {
    path: "/loan",
    label: "Mượn, trả",
    icon: "loan",
    tone: "amber",
    group: "Nghiệp vụ kho",
    requiredPermission: Permission.LOAN_MANAGE,
    title: "Mượn, trả vật tư",
    subtitle: "Theo dõi vật tư đã cho mượn và ghi nhận số lượng được hoàn trả.",
  },
  {
    path: "/incident",
    label: "Sự cố",
    icon: "incident",
    tone: "red",
    group: "Nghiệp vụ kho",
    requiredPermission: Permission.NOTIFICATION_VIEW,
    title: "Sự cố kho",
    subtitle: "Ghi nhận và xử lý các vấn đề ảnh hưởng đến vật tư hoặc hoạt động của kho.",
  },
  {
    path: "/report",
    label: "Báo cáo tháng",
    icon: "report",
    tone: "green",
    group: "Nghiệp vụ kho",
    requiredPermission: Permission.REPORT_VIEW,
    title: "Báo cáo kiểm kê tháng",
    subtitle: "Tiếp nhận báo cáo từ các thôn, kiểm tra và cập nhật số liệu tồn kho.",
  },
  {
    path: "/map",
    label: "Bản đồ kho",
    icon: "map",
    tone: "blue",
    group: "Nghiệp vụ kho",
    requiredPermission: Permission.WAREHOUSE_MANAGE,
    title: "Bản đồ kho trong xã",
    subtitle: "Theo dõi vị trí kho xã, kho thôn và cập nhật tọa độ khi cần.",
  },
  {
    path: "/simulator",
    label: "Cảm biến thử nghiệm",
    icon: "simulator",
    tone: "amber",
    group: "Quản trị",
    requiredPermission: Permission.SIMULATION_VIEW,
    title: "Cảm biến thử nghiệm",
    subtitle: "Theo dõi dữ liệu mô phỏng trước khi kết nối thiết bị thực tế.",
  },
  {
    path: "/users",
    label: "Tài khoản",
    icon: "users",
    tone: "blue",
    group: "Quản trị",
    requiredPermission: Permission.ADMIN_USERS,
    adminOnly: true,
    title: "Quản lý tài khoản",
    subtitle: `Cấp quyền sử dụng cho phụ trách kho, ${FIELD_FORCE_ROLE_LABEL} và quản trị xã.`,
  },
  {
    path: "/audit",
    label: "Nhật ký",
    icon: "audit",
    tone: "amber",
    group: "Quản trị",
    requiredPermission: Permission.AUDIT_VIEW,
    title: "Nhật ký hoạt động",
    subtitle: "Tra cứu những thay đổi quan trọng đã thực hiện trên hệ thống.",
  },
];

export const navGroups: NavGroup[] = ["Điều hành", "Nghiệp vụ kho", "Quản trị"];

/** Lấy metadata của trang theo path (dùng cho tiêu đề đầu trang). */
export function getNavItem(path: string): NavItem | undefined {
  const exact = navItems.find((item) => item.path === path);
  if (exact) return exact;
  // Trang con (vd /mission/<id>) mượn tiêu đề của mục cha, nếu không thì tiêu đề
  // trang trống trơn. Lấy tiền tố DÀI NHẤT để mục cha đúng nhất thắng.
  return navItems
    .filter((item) => path.startsWith(`${item.path}/`))
    .sort((a, b) => b.path.length - a.path.length)[0];
}

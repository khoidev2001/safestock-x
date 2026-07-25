import type { ColorIconName, ColorIconTone } from "@/components/shared/color-icon";

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
    title: "Tình trạng sẵn sàng",
    subtitle: "Theo dõi khả năng vận hành, các vướng mắc và việc cần xử lý.",
  },
  {
    path: "/mission",
    label: "Điều phối cứu hộ",
    icon: "mission",
    tone: "orange",
    group: "Điều hành",
    title: "Điều phối cứu hộ",
    subtitle: "Ghi nhận tình huống, xác định nhu cầu và phối hợp cấp phát vật tư.",
  },
  {
    path: "/insights",
    label: "Theo dõi, dự báo",
    icon: "insights",
    tone: "blue",
    group: "Điều hành",
    title: "Theo dõi và dự báo",
    subtitle: "Nhận biết sớm nguy cơ thiếu hàng, hết hạn và nhu cầu điều chuyển giữa các kho.",
  },
  {
    path: "/assistant",
    label: "Tra cứu kho",
    icon: "assistant",
    tone: "blue",
    group: "Điều hành",
    title: "Tra cứu kho",
    subtitle: "Hỏi nhanh về số lượng, hạn dùng, sự cố và khả năng đáp ứng hiện tại.",
  },
  {
    path: "/inventory",
    label: "Vật tư",
    icon: "inventory",
    tone: "orange",
    group: "Nghiệp vụ kho",
    title: "Kho vật tư",
    subtitle: "Tra cứu từng lô hàng, vị trí lưu trữ và số lượng hiện có.",
  },
  {
    path: "/stocktake",
    label: "Kiểm kê",
    icon: "stocktake",
    tone: "green",
    group: "Nghiệp vụ kho",
    title: "Kiểm kê",
    subtitle: "Đối chiếu số đếm thực tế với số liệu đang được ghi nhận.",
  },
  {
    path: "/loan",
    label: "Mượn, trả",
    icon: "loan",
    tone: "amber",
    group: "Nghiệp vụ kho",
    title: "Mượn, trả vật tư",
    subtitle: "Theo dõi vật tư đã cho mượn và ghi nhận số lượng được hoàn trả.",
  },
  {
    path: "/incident",
    label: "Sự cố",
    icon: "incident",
    tone: "red",
    group: "Nghiệp vụ kho",
    title: "Sự cố kho",
    subtitle: "Ghi nhận và xử lý các vấn đề ảnh hưởng đến vật tư hoặc hoạt động của kho.",
  },
  {
    path: "/report",
    label: "Báo cáo tháng",
    icon: "report",
    tone: "green",
    group: "Nghiệp vụ kho",
    title: "Báo cáo kiểm kê tháng",
    subtitle: "Tiếp nhận báo cáo từ các thôn, kiểm tra và cập nhật số liệu tồn kho.",
  },
  {
    path: "/map",
    label: "Bản đồ kho",
    icon: "map",
    tone: "blue",
    group: "Nghiệp vụ kho",
    title: "Bản đồ kho trong xã",
    subtitle: "Theo dõi vị trí kho xã, kho thôn và cập nhật tọa độ khi cần.",
  },
  {
    path: "/simulator",
    label: "Cảm biến thử nghiệm",
    icon: "simulator",
    tone: "amber",
    group: "Quản trị",
    title: "Cảm biến thử nghiệm",
    subtitle: "Theo dõi dữ liệu mô phỏng trước khi kết nối thiết bị thực tế.",
  },
  {
    path: "/users",
    label: "Tài khoản",
    icon: "users",
    tone: "blue",
    group: "Quản trị",
    adminOnly: true,
    title: "Quản lý tài khoản",
    subtitle: "Cấp quyền sử dụng cho phụ trách kho, đội cứu hộ và quản trị xã.",
  },
  {
    path: "/audit",
    label: "Nhật ký",
    icon: "audit",
    tone: "amber",
    group: "Quản trị",
    title: "Nhật ký hoạt động",
    subtitle: "Tra cứu những thay đổi quan trọng đã thực hiện trên hệ thống.",
  },
];

export const navGroups: NavGroup[] = ["Điều hành", "Nghiệp vụ kho", "Quản trị"];

/** Lấy metadata của trang theo path (dùng cho tiêu đề đầu trang). */
export function getNavItem(path: string): NavItem | undefined {
  return navItems.find((item) => item.path === path);
}

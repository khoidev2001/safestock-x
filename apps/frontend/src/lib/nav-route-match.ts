/**
 * Quy tắc: một đường dẫn thuộc về TAB NÀO.
 *
 * Tách khỏi `dashboard-nav` vì đây là phần dễ sai nhất và cũng là phần duy nhất
 * đáng viết kiểm thử: dữ liệu tab chỉ là một danh sách, còn luật so khớp thì có
 * bẫy thật (xem `subPaths`). Tệp này cố ý không nhập gì để chạy kiểm thử được
 * bằng `tsc` trần như các tệp cùng loại trong dự án.
 */
export interface NavRoute {
  path: string;
  /**
   * Đường dẫn con thuộc tab này nhưng KHÔNG nằm dưới `path` của nó.
   *
   * Sinh ra vì `/mission` và `/missions`: trang chi tiết một nhiệm vụ là
   * `/mission/<id>`, mà so khớp theo tiền tố thì nó rơi vào tab `/mission`
   * ("Điều phối cứu hộ") — trong khi việc đang làm rõ ràng thuộc tab
   * `/missions` ("Nhiệm vụ"). Không có khai báo tường minh này thì mở một nhiệm
   * vụ từ thông báo sẽ sáng nhầm tab, tiêu đề trang ghi nhầm việc, số trên tab
   * Nhiệm vụ không bao giờ mất, và tệ nhất: người phụ trách kho hay lực lượng
   * hiện trường bị đẩy văng khỏi trang vì tab kia đòi quyền lập phương án mà họ
   * không có.
   */
  subPaths?: string[];
}

/**
 * Tab sở hữu một đường dẫn, theo thứ tự ưu tiên:
 *
 * 1. Trùng khít — `/mission` là tab Điều phối, không phải cái gì khác.
 * 2. `subPaths` khai báo tường minh — thắng suy đoán, vì nó là do người viết chỉ định.
 * 3. Tiền tố dài nhất — trang con vô danh mượn tab cha gần nhất.
 */
export function matchNavRoute<T extends NavRoute>(routes: T[], path: string): T | undefined {
  const trungKhit = routes.find((route) => route.path === path);
  if (trungKhit) return trungKhit;

  const khaiBaoRo = routes.find((route) =>
    route.subPaths?.some((prefix) => path === prefix || path.startsWith(prefix)),
  );
  if (khaiBaoRo) return khaiBaoRo;

  return routes
    .filter((route) => path.startsWith(`${route.path}/`))
    .sort((a, b) => b.path.length - a.path.length)[0];
}

/**
 * Chuẩn hóa tên địa danh để so khớp exact, không fuzzy: Unicode NFD, bỏ dấu,
 * lower-case và gom mọi dấu phân cách thành một khoảng trắng.
 */
export function normalizeHamletName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLocaleLowerCase("vi")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

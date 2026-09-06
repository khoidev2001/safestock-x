/**
 * Tên xã, rút gọn khỏi tên đơn vị đầy đủ.
 *
 * Đơn vị lưu trong DB là "Hội Chữ thập đỏ xã Đồng Xuân", nhưng chỗ cần dùng lại
 * là tên xã trần: nhãn "Nhiệm vụ của xã Đồng Xuân" trên web, và tên xã mà xã bên
 * cạnh gõ vào khi gửi yêu cầu mượn.
 *
 * Không cắt được thì trả NGUYÊN tên thay vì đoán bừa — tên đầy đủ vẫn đọc được,
 * còn tên cắt sai thì không, và ở luồng mượn liên xã nó còn bị đem đi so khớp.
 */
export function communeNameFromUnitName(unitName: string | null | undefined): string | undefined {
  const trimmed = unitName?.trim();
  if (!trimmed) return undefined;
  const matched = /(?:^|\s)(?:xã|phường|thị trấn)\s+(.+)$/iu.exec(trimmed);
  return (matched?.[1] ?? trimmed).trim() || undefined;
}

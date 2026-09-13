export interface SuppressedIncident {
  kind: string;
  title: string;
  deviceCode: string;
  openIncidentId: string;
  openIncidentTitle: string;
}

/**
 * Nói rõ vì sao lượt gửi không sinh sự cố mới.
 *
 * Máy chủ không tạo sự cố trùng loại trên cùng thiết bị khi sự cố cũ còn mở.
 * Trước đây simulator im lặng ở chỗ này: người vận hành kéo khói lên 86, bấm gửi,
 * không thấy gì trên tab Sự cố và kết luận nhầm là đường qua domain đã hỏng. Câu
 * này chỉ thẳng sự cố nào đang chặn và phải làm gì để kích lại được.
 */
export function describeSuppressedIncidents(
  suppressed: SuppressedIncident[] | undefined,
): string | null {
  if (!suppressed?.length) return null;

  // Nhiều thiết bị có thể bị cùng một sự cố cũ chặn: gộp lại để mỗi sự cố chỉ nêu một lần.
  const devicesByOpenTitle = new Map<string, Set<string>>();
  for (const item of suppressed) {
    const devices = devicesByOpenTitle.get(item.openIncidentTitle) ?? new Set<string>();
    devices.add(item.deviceCode);
    devicesByOpenTitle.set(item.openIncidentTitle, devices);
  }
  const blocking = [...devicesByOpenTitle]
    .map(([title, devices]) => `"${title}" (${[...devices].join(", ")})`)
    .join("; ");

  return (
    `Không tạo sự cố mới vì còn sự cố cùng loại đang mở: ${blocking}. ` +
    "Đóng sự cố đó trên tab Sự cố rồi gửi lại."
  );
}

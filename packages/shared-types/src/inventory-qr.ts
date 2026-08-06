/**
 * Nội dung mã QR dán lên lô vật tư.
 *
 * Ba nơi phải hiểu giống hệt nhau: web tạo mã để in, backend tạo mã cho điện
 * thoại xem, và máy quét trong app đọc mã đó ra. Trước đây chuỗi này viết tay
 * ngay trong hộp thoại in của web — thêm một nơi tạo mã là thêm một cơ hội lệch
 * định dạng, mà lệch thì mã in ra vẫn đẹp và chỉ hỏng lúc đứng trong kho quét.
 *
 * Dạng URL chứ không phải JSON: máy quét chấp nhận cả hai, nhưng URL ngắn hơn
 * nên mã QR thưa ô hơn, dễ quét hơn khi nhãn in nhỏ hoặc bị nhàu.
 */
export function inventoryQrPayload(sku: string, batchCode?: string | null): string {
  const params = new URLSearchParams({ sku: sku.trim() });
  const batch = batchCode?.trim();
  if (batch) params.set("batch", batch);
  return `safestock://inventory?${params.toString()}`;
}

import { Injectable, NotFoundException } from "@nestjs/common";
import * as QRCode from "qrcode";
import { inventoryQrPayload } from "@safestock/shared-types";
import { PrismaService } from "../prisma/prisma.service";
import { assertWarehouseInScope } from "./warehouse-scope";

/**
 * Sinh ảnh mã QR cho một lô vật tư, trả về dạng data URI.
 *
 * Vì sao đặt ở máy chủ chứ không sinh ngay trên điện thoại: mọi thư viện vẽ QR
 * cho React Native đều cần `react-native-svg`, tức là một phụ thuộc NATIVE — thêm
 * vào là phải dựng lại APK và cài lại cho từng máy. Kho thôn dùng bản đã cài sẵn,
 * nên đổi ở máy chủ là cả mạng lưới có ngay, không ai phải cài gì.
 *
 * Web vẫn tự sinh phía trình duyệt vì nó cần in ra giấy; hai bên dùng chung hàm
 * dựng nội dung nên mã sinh ở đâu cũng quét ra cùng một kết quả.
 */
@Injectable()
export class BatchQrService {
  constructor(private prisma: PrismaService) {}

  async dataUrl(
    batchId: string,
    scopeWarehouseId?: string | null,
  ): Promise<{ dataUrl: string; payload: string; itemName: string; batchCode: string }> {
    // Lô không giữ warehouseId trực tiếp; kho nằm ở cuối chuỗi kệ → khu → kho.
    const batch = await this.prisma.itemBatch.findUnique({
      where: { id: batchId },
      select: {
        batchCode: true,
        item: { select: { sku: true, name: true } },
        shelf: { select: { zone: { select: { warehouseId: true } } } },
      },
    });
    if (!batch) throw new NotFoundException("Không tìm thấy lô vật tư");
    const warehouseId = batch.shelf?.zone.warehouseId ?? null;
    // Trưởng thôn chỉ in được nhãn của kho mình. Thiếu kiểm này thì biết một id
    // là in được nhãn của kho khác — nhãn đúng thật, nên dán nhầm cũng không ai
    // phát hiện cho tới lúc kiểm kê.
    if (warehouseId) assertWarehouseInScope(scopeWarehouseId, warehouseId);

    const payload = inventoryQrPayload(batch.item.sku, batch.batchCode);
    const dataUrl = await QRCode.toDataURL(payload, {
      width: 360,
      margin: 2,
      errorCorrectionLevel: "M",
      color: { dark: "#111827", light: "#ffffff" },
    });
    return { dataUrl, payload, itemName: batch.item.name, batchCode: batch.batchCode };
  }
}

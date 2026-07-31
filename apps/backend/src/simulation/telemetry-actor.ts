import { TelemetrySource } from "@prisma/client";

/**
 * Ai đã gửi lô số liệu này.
 *
 * Người vận hành xác nhận trên desktop và gateway phần cứng tự đẩy lên là HAI
 * DANH TÍNH khác nhau, nhưng đi CHUNG một đường xử lý. Sau điểm này, phần ghi
 * sự kiện, quét sự cố, tính điểm sẵn sàng và phát realtime không được phép rẽ
 * nhánh theo nguồn — chỉ hiển thị và truy vết mới dùng tới `source`.
 */
export interface OperatorTelemetryActor {
  source: typeof TelemetrySource.OPERATOR;
  userId: string;
  warehouseId: string;
}

export interface HardwareTelemetryActor {
  source: typeof TelemetrySource.HARDWARE;
  deviceCredentialId: string;
  deviceCode: string;
  warehouseId: string;
}

export type TelemetryActor = OperatorTelemetryActor | HardwareTelemetryActor;

/** Cột chủ thể tương ứng trên SensorSubmission; đúng một trong hai được đặt. */
export function submissionOwnerColumns(actor: TelemetryActor): {
  source: TelemetrySource;
  submittedByUserId: string | null;
  submittedByDeviceId: string | null;
} {
  return actor.source === TelemetrySource.OPERATOR
    ? {
        source: TelemetrySource.OPERATOR,
        submittedByUserId: actor.userId,
        submittedByDeviceId: null,
      }
    : {
        source: TelemetrySource.HARDWARE,
        submittedByUserId: null,
        submittedByDeviceId: actor.deviceCredentialId,
      };
}

/** Nhãn ngắn cho log và audit — không dùng để quyết định luồng xử lý. */
export function describeTelemetryActor(actor: TelemetryActor): string {
  return actor.source === TelemetrySource.OPERATOR
    ? `người vận hành ${actor.userId}`
    : `thiết bị ${actor.deviceCode}`;
}

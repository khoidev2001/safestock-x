import { ItemBatch } from "@prisma/client";
import { BatchReadinessInput } from "./readiness.types";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Giá trị môi trường hiện tại của 1 khu (từ DeviceState) + độ tươi cảm biến. */
export interface ZoneEnvironment {
  temperature: number | null;
  humidity: number | null;
  /** Cảm biến còn cập nhật trong ngưỡng (<30ph) không. */
  sensorFresh: boolean;
}

/** Dữ liệu 1 lô + phụ trợ để dựng BatchReadinessInput. */
export interface BatchWithContext {
  batch: ItemBatch;
  isBlocked: boolean;
  isLocked: boolean;
  /** Số kiểm kê gần nhất; null nếu chưa kiểm kê. */
  countedQty: number | null;
  /** Ngày kể từ lần kiểm kê gần nhất; null nếu chưa kiểm kê. */
  daysSinceLastCount: number | null;
  /** Tổng số đang mượn (LoanRecord ON_LOAN/PARTIALLY_RETURNED). */
  onLoanQty: number;
  env: ZoneEnvironment;
}

/**
 * Map dữ liệu entity → input tính điểm (hàm THUẦN, không DB).
 * Tách khỏi truy vấn để test được và giữ service gọn.
 *
 * @param now mốc thời gian server (#31) — truyền vào để deterministic.
 */
export function toBatchReadinessInput(
  ctx: BatchWithContext,
  now: Date,
): BatchReadinessInput {
  const { batch, env } = ctx;
  return {
    batchId: batch.id,
    quantity: batch.quantity,
    expiry: { expiryDate: batch.expiryDate, now },
    condition: { condition: batch.condition },
    accessibility: { isBlocked: ctx.isBlocked, isLocked: ctx.isLocked },
    quantityAvailability: {
      systemQty: batch.quantity,
      countedQty: ctx.countedQty,
      onLoanQty: ctx.onLoanQty,
    },
    environment: { temperature: env.temperature, humidity: env.humidity },
    dataReliability: {
      daysSinceLastCount: ctx.daysSinceLastCount,
      sensorFresh: env.sensorFresh,
    },
  };
}

/** Số ngày giữa 2 mốc (làm tròn xuống). */
export function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / MS_PER_DAY);
}

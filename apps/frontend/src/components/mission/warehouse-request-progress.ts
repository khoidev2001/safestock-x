/*
  Tiến độ theo kho và quy tắc "làm gộp" đều đã dời sang gói dùng chung, để điện
  thoại đọc chung một bản. Tái xuất ở đây cho mọi chỗ đang gọi — và bộ test cạnh
  file này — không phải đổi đường dẫn.
*/
export {
  warehouseProgress,
  planBulkAction,
  BULK_ACTION_LABEL,
  type RequestLike,
  type WarehouseProgress,
  type BulkActionKind,
  type BulkActionPlan,
  type BulkRequestLike,
} from "@safestock/shared-types";

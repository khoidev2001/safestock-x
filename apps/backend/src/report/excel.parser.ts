import { BadRequestException } from "@nestjs/common";
import ExcelJS from "exceljs";

/** 1 dòng báo cáo kiểm kê thôn (đã parse từ Excel). */
export interface ReportRow {
  sku: string;
  itemName: string;
  quantity: number;
  unit: string;
  expiryDate: string | null; // ISO "YYYY-MM-DD" hoặc null
  condition: string | null;
  note: string | null;
}

// Thứ tự 7 cột mẫu (hàng 1 = tiêu đề, dữ liệu từ hàng 2).
const HEADERS = ["SKU", "Tên vật tư", "Số lượng", "Đơn vị", "Hạn dùng", "Tình trạng", "Ghi chú"];

/**
 * Parse buffer .xlsx (form mẫu 7 cột) → danh sách ReportRow. THUẦN async, không DB.
 * Bỏ dòng trống (không SKU). Số lượng âm/không phải số → lỗi rõ ràng.
 */
export async function parseReportExcel(buffer: Buffer): Promise<ReportRow[]> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    throw new BadRequestException("File không phải Excel (.xlsx) hợp lệ");
  }
  const sheet = wb.worksheets[0];
  if (!sheet) throw new BadRequestException("File Excel không có sheet nào");

  const rows: ReportRow[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // bỏ hàng tiêu đề
    const sku = cellStr(row.getCell(1));
    if (!sku) return; // dòng trống

    const qty = Number(cellStr(row.getCell(3)));
    if (!Number.isFinite(qty) || qty < 0) {
      throw new BadRequestException(
        `Dòng ${rowNumber}: số lượng không hợp lệ (${cellStr(row.getCell(3))})`,
      );
    }

    rows.push({
      sku,
      itemName: cellStr(row.getCell(2)),
      quantity: Math.floor(qty),
      unit: cellStr(row.getCell(4)),
      expiryDate: parseDate(row.getCell(5)),
      condition: cellStr(row.getCell(6)) || null,
      note: cellStr(row.getCell(7)) || null,
    });
  });

  if (rows.length === 0) throw new BadRequestException("Không có dòng dữ liệu nào trong file");
  return rows;
}

/** Tiêu đề mẫu để FE/tài liệu biết đúng cột (và test đối chiếu). */
export const REPORT_HEADERS = HEADERS;

function cellStr(cell: ExcelJS.Cell): string {
  const v = cell.value;
  if (v == null) return "";
  if (typeof v === "object" && "text" in v) return String((v as { text: unknown }).text).trim();
  return String(v).trim();
}

function parseDate(cell: ExcelJS.Cell): string | null {
  const v = cell.value;
  if (v == null || v === "") return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

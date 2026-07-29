import { BadRequestException } from "@nestjs/common";
import { XMLParser } from "fast-xml-parser";
import { Open } from "unzipper";
import { posix as path } from "path";

/** 1 dòng báo cáo kiểm kê thôn (đã parse từ Excel). */
export interface ReportRow {
  batchId?: string | null;
  batchCode?: string | null;
  shelfCode?: string | null;
  sku: string;
  itemName: string;
  quantity: number;
  unit: string;
  expiryDate: string | null;
  condition: string | null;
  note: string | null;
}

type XmlRecord = Record<string, unknown>;

interface CellValue {
  text: string;
  isDate: boolean;
}

const HEADERS = [
  "SKU",
  "Tên vật tư",
  "Số lượng",
  "Đơn vị",
  "Hạn dùng",
  "Tình trạng",
  "Ghi chú",
  "Batch ID",
  "Mã lô",
  "Mã kệ",
];

const BUILTIN_DATE_FORMATS = new Set([
  14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 30, 36, 45, 46, 47, 50, 57,
]);

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseAttributeValue: false,
  parseTagValue: false,
  textNodeName: "#text",
  trimValues: false,
});

/**
 * Parse file .xlsx without loading ExcelJS's archive writer stack. The endpoint
 * only accepts report input, so this reader deliberately supports the subset of
 * SpreadsheetML used by the report template: shared/inline strings, numbers,
 * formulas with cached values and date-formatted serial values.
 */
export async function parseReportExcel(buffer: Buffer): Promise<ReportRow[]> {
  try {
    const archive = await Open.buffer(buffer);
    const workbook = parseXml(await readArchiveFile(archive.files, "xl/workbook.xml"));
    const relations = parseXml(await readArchiveFile(archive.files, "xl/_rels/workbook.xml.rels"));
    const sheetPath = resolveFirstSheetPath(workbook, relations);
    const [sheet, sharedStrings, dateStyles] = await Promise.all([
      readSheet(archive.files, sheetPath),
      readSharedStrings(archive.files),
      readDateStyles(archive.files),
    ]);
    return parseRows(sheet, sharedStrings, dateStyles);
  } catch (error) {
    if (error instanceof BadRequestException) throw error;
    throw new BadRequestException("File không phải Excel (.xlsx) hợp lệ");
  }
}

/** Tiêu đề mẫu để FE/tài liệu biết đúng cột. */
export const REPORT_HEADERS = HEADERS;

async function readSheet(files: { path: string; buffer: () => Promise<Buffer> }[], sheetPath: string) {
  return parseXml(await readArchiveFile(files, sheetPath));
}

async function readSharedStrings(
  files: { path: string; buffer: () => Promise<Buffer> }[],
): Promise<string[]> {
  const entry = files.find((file) => file.path === "xl/sharedStrings.xml");
  if (!entry) return [];

  const document = parseXml((await entry.buffer()).toString("utf8"));
  const sst = record(document.sst);
  return records(sst.si).map(extractText);
}

async function readDateStyles(
  files: { path: string; buffer: () => Promise<Buffer> }[],
): Promise<boolean[]> {
  const entry = files.find((file) => file.path === "xl/styles.xml");
  if (!entry) return [];

  const document = parseXml((await entry.buffer()).toString("utf8"));
  const styleSheet = record(document.styleSheet);
  const customFormats = new Map<number, string>();
  for (const format of records(record(styleSheet.numFmts).numFmt)) {
    const id = Number(stringValue(format["@_numFmtId"]));
    const code = stringValue(format["@_formatCode"]);
    if (Number.isInteger(id) && code) customFormats.set(id, code);
  }

  return records(record(styleSheet.cellXfs).xf).map((style) => {
    const formatId = Number(stringValue(style["@_numFmtId"]));
    return BUILTIN_DATE_FORMATS.has(formatId) || looksLikeDateFormat(customFormats.get(formatId));
  });
}

function resolveFirstSheetPath(workbookDocument: XmlRecord, relationsDocument: XmlRecord): string {
  const workbook = record(workbookDocument.workbook);
  const firstSheet = records(record(workbook.sheets).sheet)[0];
  const relationId = firstSheet ? stringValue(firstSheet["@_r:id"]) : "";
  if (!relationId) throw new BadRequestException("File Excel không có sheet nào");

  const relations = records(record(relationsDocument.Relationships).Relationship);
  const relation = relations.find((item) => stringValue(item["@_Id"]) === relationId);
  const target = relation ? stringValue(relation["@_Target"]) : "";
  if (!target) throw new BadRequestException("File Excel không có sheet nào");

  const resolved = path.normalize(path.join("xl", target));
  if (!resolved.startsWith("xl/") || resolved.includes("..")) {
    throw new BadRequestException("File Excel có đường dẫn sheet không hợp lệ");
  }
  return resolved;
}

function parseRows(
  sheetDocument: XmlRecord,
  sharedStrings: string[],
  dateStyles: boolean[],
): ReportRow[] {
  const worksheet = record(sheetDocument.worksheet);
  const rows = records(record(worksheet.sheetData).row);
  const result: ReportRow[] = [];

  for (const row of rows) {
    const rowNumber = Number(stringValue(row["@_r"]));
    if (rowNumber === 1) continue;
    const cells = new Map<number, CellValue>();
    for (const cell of records(row.c)) {
      const column = columnIndex(stringValue(cell["@_r"]));
      if (column === null) continue;
      cells.set(column, parseCell(cell, sharedStrings, dateStyles));
    }

    const sku = cell(cells, 1).text;
    if (!sku) continue;
    const quantityText = cell(cells, 3).text;
    const quantity = Number(quantityText);
    if (!Number.isFinite(quantity) || quantity < 0) {
      throw new BadRequestException(
        `Dòng ${rowNumber || result.length + 2}: số lượng không hợp lệ (${quantityText})`,
      );
    }

    result.push({
      batchId: cell(cells, 8).text || null,
      batchCode: cell(cells, 9).text || null,
      shelfCode: cell(cells, 10).text || null,
      sku,
      itemName: cell(cells, 2).text,
      quantity: Math.floor(quantity),
      unit: cell(cells, 4).text,
      expiryDate: parseDate(cell(cells, 5)),
      condition: cell(cells, 6).text || null,
      note: cell(cells, 7).text || null,
    });
  }

  if (!result.length) throw new BadRequestException("Không có dòng dữ liệu nào trong file");
  return result;
}

function parseCell(cellNode: XmlRecord, sharedStrings: string[], dateStyles: boolean[]): CellValue {
  const type = stringValue(cellNode["@_t"]);
  const styleIndex = Number(stringValue(cellNode["@_s"]));
  const value = stringValue(cellNode.v);

  if (type === "s") {
    const index = Number(value);
    return { text: Number.isInteger(index) ? sharedStrings[index] ?? "" : "", isDate: false };
  }
  if (type === "inlineStr") {
    return { text: extractText(record(cellNode.is)).trim(), isDate: false };
  }
  return { text: value.trim(), isDate: dateStyles[styleIndex] === true };
}

function parseDate(value: CellValue): string | null {
  if (!value.text) return null;
  if (value.isDate && Number.isFinite(Number(value.text))) {
    const excelEpoch = Date.UTC(1899, 11, 30);
    return new Date(excelEpoch + Number(value.text) * 86_400_000).toISOString().slice(0, 10);
  }
  const date = new Date(value.text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

async function readArchiveFile(
  files: { path: string; buffer: () => Promise<Buffer> }[],
  filePath: string,
): Promise<string> {
  const entry = files.find((file) => file.path === filePath);
  if (!entry) throw new BadRequestException("File Excel không hợp lệ");
  return (await entry.buffer()).toString("utf8");
}

function parseXml(xml: string): XmlRecord {
  return record(xmlParser.parse(xml));
}

function record(value: unknown): XmlRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as XmlRecord)
    : {};
}

function records(value: unknown): XmlRecord[] {
  if (Array.isArray(value)) return value.map(record);
  if (value && typeof value === "object") return [record(value)];
  return [];
}

function stringValue(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value).trim();
  }
  return extractText(record(value)).trim();
}

function extractText(value: XmlRecord): string {
  return Object.entries(value)
    .filter(([key]) => !key.startsWith("@_"))
    .map(([key, child]) => {
      if (key === "#text") return String(child ?? "");
      if (Array.isArray(child)) return child.map((item) => extractText(record(item))).join("");
      return child && typeof child === "object" ? extractText(record(child)) : String(child ?? "");
    })
    .join("");
}

function columnIndex(reference: string): number | null {
  const match = /^([A-Z]+)\d+$/i.exec(reference);
  if (!match) return null;
  return [...match[1].toUpperCase()].reduce((column, char) => column * 26 + char.charCodeAt(0) - 64, 0);
}

function cell(cells: Map<number, CellValue>, column: number): CellValue {
  return cells.get(column) ?? { text: "", isDate: false };
}

function looksLikeDateFormat(format: string | undefined): boolean {
  if (!format) return false;
  const normalized = format.replace(/"[^"]*"|\\.|\[[^\]]*]/g, "").toLowerCase();
  return /[dmyhs]/.test(normalized);
}

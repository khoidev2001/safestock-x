import { parseReportExcel } from "../excel.parser";

describe("SpreadsheetML report parser", () => {
  it("reads a representative .xlsx report without an archive writer dependency", async () => {
    const report = createXlsx({
      "xl/workbook.xml":
        '<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Kiem ke" sheetId="1" r:id="rId1"/></sheets></workbook>',
      "xl/_rels/workbook.xml.rels":
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
      "xl/worksheets/sheet1.xml":
        '<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>SKU</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>WATER-01</t></is></c><c r="B2" t="inlineStr"><is><t>Nước uống</t></is></c><c r="C2"><v>24</v></c><c r="D2" t="inlineStr"><is><t>thùng</t></is></c><c r="E2" t="inlineStr"><is><t>2026-12-31</t></is></c><c r="F2" t="inlineStr"><is><t>GOOD</t></is></c><c r="G2" t="inlineStr"><is><t>Kiểm tra tháng</t></is></c><c r="H2" t="inlineStr"><is><t>batch-1</t></is></c><c r="I2" t="inlineStr"><is><t>LOT-001</t></is></c><c r="J2" t="inlineStr"><is><t>A-01</t></is></c></row></sheetData></worksheet>',
    });

    await expect(parseReportExcel(report)).resolves.toEqual([
      {
        sku: "WATER-01",
        itemName: "Nước uống",
        quantity: 24,
        unit: "thùng",
        expiryDate: "2026-12-31",
        condition: "GOOD",
        note: "Kiểm tra tháng",
        batchId: "batch-1",
        batchCode: "LOT-001",
        shelfCode: "A-01",
      },
    ]);
  });

  it("resolves shared strings and date-formatted Excel serials", async () => {
    const report = createXlsx({
      "xl/workbook.xml":
        '<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Kiem ke" sheetId="1" r:id="rId1"/></sheets></workbook>',
      "xl/_rels/workbook.xml.rels":
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
      "xl/sharedStrings.xml":
        '<sst><si><t>WATER-02</t></si><si><t>Nước uống đóng chai</t></si><si><t>thùng</t></si><si><t>GOOD</t></si><si><t>batch-2</t></si></sst>',
      "xl/styles.xml":
        '<styleSheet><cellXfs><xf numFmtId="0"/><xf numFmtId="14"/></cellXfs></styleSheet>',
      "xl/worksheets/sheet1.xml":
        '<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>SKU</t></is></c></row><row r="2"><c r="A2" t="s"><v>0</v></c><c r="B2" t="s"><v>1</v></c><c r="C2"><v>10</v></c><c r="D2" t="s"><v>2</v></c><c r="E2" s="1"><v>46387</v></c><c r="F2" t="s"><v>3</v></c><c r="H2" t="s"><v>4</v></c></row></sheetData></worksheet>',
    });

    await expect(parseReportExcel(report)).resolves.toEqual([
      expect.objectContaining({
        sku: "WATER-02",
        itemName: "Nước uống đóng chai",
        quantity: 10,
        unit: "thùng",
        expiryDate: "2026-12-31",
        condition: "GOOD",
        batchId: "batch-2",
      }),
    ]);
  });
});

function createXlsx(entries: Record<string, string>): Buffer {
  const localFiles: Buffer[] = [];
  const centralDirectory: Buffer[] = [];
  let offset = 0;

  for (const [name, content] of Object.entries(entries)) {
    const nameBuffer = Buffer.from(name);
    const contentBuffer = Buffer.from(content);
    const crc = crc32(contentBuffer);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(contentBuffer.length, 18);
    local.writeUInt32LE(contentBuffer.length, 22);
    local.writeUInt16LE(nameBuffer.length, 26);
    localFiles.push(local, nameBuffer, contentBuffer);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(contentBuffer.length, 20);
    central.writeUInt32LE(contentBuffer.length, 24);
    central.writeUInt16LE(nameBuffer.length, 28);
    central.writeUInt32LE(offset, 42);
    centralDirectory.push(central, nameBuffer);
    offset += local.length + nameBuffer.length + contentBuffer.length;
  }

  const centralBuffer = Buffer.concat(centralDirectory);
  const footer = Buffer.alloc(22);
  footer.writeUInt32LE(0x06054b50, 0);
  footer.writeUInt16LE(Object.keys(entries).length, 8);
  footer.writeUInt16LE(Object.keys(entries).length, 10);
  footer.writeUInt32LE(centralBuffer.length, 12);
  footer.writeUInt32LE(offset, 16);
  return Buffer.concat([...localFiles, centralBuffer, footer]);
}

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

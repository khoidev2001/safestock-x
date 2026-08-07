/**
 * Markdown -> .docx (Office Open XML), không phụ thuộc Word hay thư viện ngoài.
 *
 * VÌ SAO KHÔNG DÙNG WORD: Word trên máy này ở trạng thái chưa kích hoạt nên chạy
 * chế độ hạn chế — mở xem được nhưng chặn lệnh lưu, và tự động hóa thì treo ở hộp
 * thoại kích hoạt không nhìn thấy. Sinh thẳng gói OOXML tránh hẳn chuyện đó, và
 * kết quả không đổi giữa các máy.
 *
 * Dùng: node md2docx.mjs <input.md> <output.docx> "<Tiêu đề bìa>" "<Phụ đề bìa>"
 */
import { readFileSync, writeFileSync } from "node:fs";
import { deflateRawSync } from "node:zlib";

// ─────────────────────────────── Đóng gói ZIP ───────────────────────────────

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0 ^ -1;
  for (let i = 0; i < buffer.length; i += 1) c = (c >>> 8) ^ CRC_TABLE[(c ^ buffer[i]) & 0xff];
  return (c ^ -1) >>> 0;
}

/**
 * Ghi gói ZIP tối thiểu nhưng đúng chuẩn: mỗi mục một local header, cuối gói là
 * central directory. Không dùng data descriptor để không phải cắm cờ bit 3.
 */
function makeZip(entries) {
  const chunks = [];
  const central = [];
  let offset = 0;

  for (const { name, data } of entries) {
    const raw = Buffer.from(data, "utf8");
    const compressed = deflateRawSync(raw, { level: 9 });
    const nameBuf = Buffer.from(name, "utf8");
    const crc = crc32(raw);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // phiên bản cần để giải nén
    local.writeUInt16LE(0x0800, 6); // cờ: tên tệp mã hoá UTF-8
    local.writeUInt16LE(8, 8); // phương pháp nén: deflate
    local.writeUInt16LE(0, 10); // giờ sửa đổi — để 0 cho kết quả tái lập được
    local.writeUInt16LE(0x0021, 12); // ngày sửa đổi: 1980-01-01
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    chunks.push(local, nameBuf, compressed);

    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0);
    dir.writeUInt16LE(20, 4);
    dir.writeUInt16LE(20, 6);
    dir.writeUInt16LE(0x0800, 8);
    dir.writeUInt16LE(8, 10);
    dir.writeUInt16LE(0, 12);
    dir.writeUInt16LE(0x0021, 14);
    dir.writeUInt32LE(crc, 16);
    dir.writeUInt32LE(compressed.length, 20);
    dir.writeUInt32LE(raw.length, 24);
    dir.writeUInt16LE(nameBuf.length, 28);
    // 30..41 (độ dài extra field, độ dài chú thích, số đĩa, thuộc tính) giữ 0 —
    // Buffer.alloc đã điền sẵn, không cần ghi lại.
    dir.writeUInt32LE(offset, 42); // vị trí local header trong gói
    central.push(Buffer.concat([dir, nameBuf]));

    offset += local.length + nameBuf.length + compressed.length;
  }

  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);

  return Buffer.concat([...chunks, centralBuf, end]);
}

// ─────────────────────────── Sinh mảnh WordprocessingML ───────────────────────

const xmlEscape = (text) =>
  String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** Một đoạn văn bản cùng kiểu chữ. */
function run(text, { bold, code, italic, color, size } = {}) {
  if (text === "") return "";
  const props = [];
  if (code) props.push('<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/>');
  if (bold) props.push("<w:b/>");
  if (italic) props.push("<w:i/>");
  if (color) props.push(`<w:color w:val="${color}"/>`);
  if (size) props.push(`<w:sz w:val="${size}"/><w:szCs w:val="${size}"/>`);
  if (code) props.push('<w:shd w:val="clear" w:fill="F0F2F4"/>');
  const rPr = props.length ? `<w:rPr>${props.join("")}</w:rPr>` : "";
  return `<w:r>${rPr}<w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r>`;
}

/**
 * Tách định dạng nội dòng thành các đoạn chữ.
 *
 * Xử lý mã nội dòng TRƯỚC: bên trong dấu ` có thể có dấu * hoặc _ mà không phải
 * là ký hiệu định dạng, ví dụ tên biến `ALERT_EMAIL_FROM`.
 */
function inlineRuns(text, base = {}) {
  const out = [];
  const pattern = /(`[^`]+`)|(\[[^\]]+\]\([^)]+\))|(\*\*[^*]+\*\*)/g;
  let last = 0;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) out.push(run(text.slice(last, match.index), base));
    const token = match[0];
    if (token.startsWith("`")) {
      out.push(run(token.slice(1, -1), { ...base, code: true, color: "8A2A2A", size: 19 }));
    } else if (token.startsWith("[")) {
      const label = /\[([^\]]+)\]\(([^)]+)\)/.exec(token);
      const href = label[2];
      // Liên kết tới mục trong tài liệu và tệp trong mã nguồn không bấm được từ
      // bản Word, nên giữ chữ và đánh dấu bằng màu thay vì tạo liên kết chết.
      const isWeb = /^https?:/i.test(href);
      const isAnchor = href.startsWith("#");
      out.push(
        run(label[1], {
          ...base,
          color: isAnchor ? undefined : isWeb ? "0F5C8C" : "17607F",
          code: !isWeb && !isAnchor,
          size: !isWeb && !isAnchor ? 19 : undefined,
        }),
      );
    } else {
      out.push(run(token.slice(2, -2), { ...base, bold: true }));
    }
    last = match.index + token.length;
  }
  if (last < text.length) out.push(run(text.slice(last), base));
  return out.join("");
}

function para(
  content,
  {
    style,
    align,
    indent,
    hanging,
    spaceBefore,
    spaceAfter,
    shade,
    pageBreak,
    keepNext,
    border,
  } = {},
) {
  const props = [];
  if (pageBreak) props.push("<w:pageBreakBefore/>");
  if (style) props.push(`<w:pStyle w:val="${style}"/>`);
  if (keepNext) props.push("<w:keepNext/>");
  if (shade) props.push(`<w:shd w:val="clear" w:fill="${shade}"/>`);
  if (border)
    props.push(`<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="C8C8C8"/></w:pBdr>`);
  if (indent !== undefined || hanging !== undefined) {
    props.push(`<w:ind w:left="${indent ?? 0}"${hanging ? ` w:hanging="${hanging}"` : ""}/>`);
  }
  if (spaceBefore !== undefined || spaceAfter !== undefined) {
    props.push(`<w:spacing w:before="${spaceBefore ?? 0}" w:after="${spaceAfter ?? 0}"/>`);
  }
  if (align) props.push(`<w:jc w:val="${align}"/>`);
  const pPr = props.length ? `<w:pPr>${props.join("")}</w:pPr>` : "";
  return `<w:p>${pPr}${content}</w:p>`;
}

// Bề rộng vùng in: A4 21cm trừ lề trái 2,5cm và lề phải 2cm = 16,5cm ≈ 9354 twip.
const CONTENT_WIDTH = 9354;

function table(rows, { widths, headerShade = "DFE7EC" }) {
  const grid = widths.map((w) => `<w:gridCol w:w="${w}"/>`).join("");
  const body = rows
    .map((row, rowIndex) => {
      const isHeader = rowIndex === 0;
      const cells = row.cells
        .map((cell, cellIndex) => {
          const shade = isHeader ? `<w:shd w:val="clear" w:fill="${headerShade}"/>` : "";
          const align = cell.align ? `<w:jc w:val="${cell.align}"/>` : "";
          const rPr = isHeader ? '<w:rPr><w:b/><w:color w:val="0F3D5C"/></w:rPr>' : "";
          const content = isHeader
            ? `<w:r>${rPr}<w:t xml:space="preserve">${xmlEscape(cell.text)}</w:t></w:r>`
            : inlineRuns(cell.text);
          return (
            `<w:tc><w:tcPr><w:tcW w:w="${widths[cellIndex] ?? 1000}" w:type="dxa"/>` +
            `${shade}<w:vAlign w:val="top"/></w:tcPr>` +
            `<w:p><w:pPr><w:spacing w:before="20" w:after="20"/>${align}` +
            `<w:rPr><w:sz w:val="20"/></w:rPr></w:pPr>` +
            `<w:r><w:rPr><w:sz w:val="20"/></w:rPr></w:r>${content}</w:p></w:tc>`
          );
        })
        .join("");
      const trPr = isHeader
        ? "<w:trPr><w:tblHeader/><w:cantSplit/></w:trPr>"
        : "<w:trPr><w:cantSplit/></w:trPr>";
      return `<w:tr>${trPr}${cells}</w:tr>`;
    })
    .join("");

  const borders =
    "<w:tblBorders>" +
    ["top", "left", "bottom", "right", "insideH", "insideV"]
      .map((side) => `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="9AA5AD"/>`)
      .join("") +
    "</w:tblBorders>";

  return (
    `<w:tbl><w:tblPr><w:tblW w:w="${CONTENT_WIDTH}" w:type="dxa"/>${borders}` +
    `<w:tblCellMar><w:top w:w="60" w:type="dxa"/><w:left w:w="90" w:type="dxa"/>` +
    `<w:bottom w:w="60" w:type="dxa"/><w:right w:w="90" w:type="dxa"/></w:tblCellMar>` +
    `<w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid>${grid}</w:tblGrid>${body}</w:tbl>`
  );
}

/** Khung một ô — dùng cho khối mã và khối lưu ý. */
function boxed(paragraphs, { fill, leftBar }) {
  const borders =
    "<w:tcBorders>" +
    `<w:left w:val="single" w:sz="${leftBar ? 18 : 4}" w:space="0" w:color="${leftBar ?? "C8CED4"}"/>` +
    ["top", "bottom", "right"]
      .map((side) => `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="D8DDE2"/>`)
      .join("") +
    "</w:tcBorders>";
  return (
    `<w:tbl><w:tblPr><w:tblW w:w="${CONTENT_WIDTH}" w:type="dxa"/><w:tblLayout w:type="fixed"/></w:tblPr>` +
    `<w:tblGrid><w:gridCol w:w="${CONTENT_WIDTH}"/></w:tblGrid>` +
    `<w:tr><w:trPr><w:cantSplit/></w:trPr><w:tc><w:tcPr><w:tcW w:w="${CONTENT_WIDTH}" w:type="dxa"/>` +
    `<w:shd w:val="clear" w:fill="${fill}"/>${borders}` +
    `<w:tcMar><w:top w:w="90" w:type="dxa"/><w:left w:w="140" w:type="dxa"/>` +
    `<w:bottom w:w="90" w:type="dxa"/><w:right w:w="140" w:type="dxa"/></w:tcMar>` +
    `</w:tcPr>${paragraphs}</w:tc></w:tr></w:tbl>`
  );
}

// ──────────────────────────── Đọc Markdown ────────────────────────────

const [, , inputPath, outputPath, coverTitle, coverSubtitle] = process.argv;
if (!inputPath || !outputPath) {
  console.error("Dùng: node md2docx.mjs <input.md> <output.docx> [tiêu đề] [phụ đề]");
  process.exit(1);
}

const lines = readFileSync(inputPath, "utf8").split(/\r?\n/);
const body = [];
let i = 0;
let sectionCount = 0;
const stats = { headings: 0, tables: 0, code: 0, notes: 0, paragraphs: 0 };

const splitRow = (line) =>
  line
    .replace(/^\s*\|/, "")
    .replace(/\|\s*$/, "")
    .split("|")
    .map((cell) => cell.trim());

const alignOf = (spec) => {
  const s = spec.trim();
  if (s.startsWith(":") && s.endsWith(":")) return "center";
  if (s.endsWith(":")) return "right";
  return undefined;
};

if (coverTitle) {
  body.push(
    para(run("", {}), { spaceBefore: 3600 }),
    para(run(coverTitle, { bold: true, size: 52, color: "0F3D5C" }), {
      align: "center",
      spaceAfter: 240,
    }),
  );
  if (coverSubtitle) {
    body.push(
      para(run(coverSubtitle, { size: 28, color: "3A4A55" }), {
        align: "center",
        spaceAfter: 1400,
      }),
    );
  }
  body.push(
    para(
      run("Hệ thống Ứng phó nhanh — quản lý kho và điều phối vật tư cứu hộ", {
        size: 23,
        color: "5A6B76",
      }),
      {
        align: "center",
        spaceAfter: 80,
      },
    ),
    para(run("Xã Đồng Xuân · Cập nhật 07/08/2026", { size: 23, color: "5A6B76" }), {
      align: "center",
    }),
    `<w:p><w:pPr><w:pageBreakBefore/></w:pPr></w:p>`,
  );
}

while (i < lines.length) {
  const line = lines[i];

  if (/^```/.test(line)) {
    const code = [];
    i += 1;
    while (i < lines.length && !/^```/.test(lines[i])) {
      code.push(lines[i]);
      i += 1;
    }
    i += 1;
    const paragraphs = code
      .map((text, index) =>
        para(run(text || " ", { code: true, size: 18, color: "23303A" }), {
          spaceBefore: index === 0 ? 40 : 0,
          spaceAfter: index === code.length - 1 ? 40 : 0,
        }),
      )
      .join("");
    body.push(boxed(paragraphs, { fill: "F4F5F7" }));
    stats.code += 1;
    continue;
  }

  if (/^\s*\|/.test(line) && i + 1 < lines.length && /^\s*\|[\s:|-]+\|?\s*$/.test(lines[i + 1])) {
    const header = splitRow(line);
    const aligns = splitRow(lines[i + 1]).map(alignOf);
    i += 2;
    const rows = [{ cells: header.map((text, n) => ({ text, align: aligns[n] })) }];
    while (i < lines.length && /^\s*\|/.test(lines[i])) {
      const cells = splitRow(lines[i]);
      rows.push({
        cells: header.map((_, n) => ({ text: cells[n] ?? "", align: aligns[n] })),
      });
      i += 1;
    }
    // Cột chia theo độ dài nội dung dài nhất, chặn hai đầu để không có cột quá hẹp
    // hoặc quá rộng — bảng phân quyền có cột ✅ rất ngắn cạnh cột mô tả rất dài.
    const weights = header.map((_, n) => {
      const longest = Math.max(...rows.map((r) => (r.cells[n]?.text ?? "").length));
      return Math.min(Math.max(longest, 6), 46);
    });
    const total = weights.reduce((a, b) => a + b, 0);
    const widths = weights.map((w) => Math.round((w / total) * CONTENT_WIDTH));
    widths[widths.length - 1] = CONTENT_WIDTH - widths.slice(0, -1).reduce((a, b) => a + b, 0);
    body.push(table(rows, { widths }));
    stats.tables += 1;
    continue;
  }

  if (/^>\s?/.test(line)) {
    const quote = [];
    while (i < lines.length && /^>\s?/.test(lines[i])) {
      quote.push(lines[i].replace(/^>\s?/, ""));
      i += 1;
    }
    const blocks = quote
      .join("\n")
      .split(/\n\s*\n/)
      .filter((block) => block.trim() !== "");
    const paragraphs = blocks
      .map((block, index) =>
        para(inlineRuns(block.replace(/\n/g, " ").trim(), { size: 22 }), {
          align: "both",
          spaceAfter: index === blocks.length - 1 ? 0 : 100,
        }),
      )
      .join("");
    body.push(boxed(paragraphs, { fill: "FBF7E8", leftBar: "C99A2E" }));
    stats.notes += 1;
    continue;
  }

  if (/^---+\s*$/.test(line)) {
    body.push(para("", { border: true, spaceBefore: 120, spaceAfter: 120 }));
    i += 1;
    continue;
  }

  const heading = /^(#{1,6})\s+(.*)$/.exec(line);
  if (heading) {
    const level = heading[1].length;
    const text = heading[2];
    stats.headings += 1;
    if (level === 1) {
      body.push(
        para(inlineRuns(text, { bold: true, size: 40, color: "0F3D5C" }), {
          style: "Heading1",
          align: "center",
          spaceAfter: 200,
        }),
      );
    } else if (level === 2) {
      sectionCount += 1;
      body.push(
        para(inlineRuns(text, { bold: true, size: 30, color: "0F3D5C" }), {
          style: "Heading2",
          pageBreak: sectionCount > 1,
          spaceBefore: sectionCount > 1 ? 0 : 240,
          spaceAfter: 140,
          keepNext: true,
        }),
      );
    } else {
      body.push(
        para(inlineRuns(text, { bold: true, size: level === 3 ? 26 : 24, color: "17607F" }), {
          style: `Heading${Math.min(level, 4)}`,
          spaceBefore: 220,
          spaceAfter: 100,
          keepNext: true,
        }),
      );
    }
    i += 1;
    continue;
  }

  const ordered = /^\d+\.\s+/.test(line);
  const bullet = /^[-*]\s+/.test(line);
  if (ordered || bullet) {
    const items = [];
    let counter = 0;
    while (i < lines.length) {
      const current = lines[i];
      if (ordered ? /^\d+\.\s+/.test(current) : /^[-*]\s+/.test(current)) {
        counter += 1;
        items.push({
          marker: ordered ? `${counter}.` : "•",
          text: current.replace(ordered ? /^\d+\.\s+/ : /^[-*]\s+/, ""),
        });
        i += 1;
      } else if (/^\s+\S/.test(current) && items.length > 0) {
        items[items.length - 1].text += ` ${current.trim()}`;
        i += 1;
      } else {
        break;
      }
    }
    for (const item of items) {
      body.push(
        para(run(`${item.marker}\t`, {}) + inlineRuns(item.text), {
          indent: 400,
          hanging: 280,
          align: "both",
          spaceAfter: 60,
        }),
      );
    }
    continue;
  }

  if (line.trim() === "") {
    i += 1;
    continue;
  }

  const paragraph = [];
  while (
    i < lines.length &&
    lines[i].trim() !== "" &&
    !/^```/.test(lines[i]) &&
    !/^\s*\|/.test(lines[i]) &&
    !/^>\s?/.test(lines[i]) &&
    !/^#{1,6}\s/.test(lines[i]) &&
    !/^---+\s*$/.test(lines[i]) &&
    !/^\d+\.\s+/.test(lines[i]) &&
    !/^[-*]\s+/.test(lines[i])
  ) {
    paragraph.push(lines[i].trim());
    i += 1;
  }
  body.push(para(inlineRuns(paragraph.join(" ")), { align: "both", spaceAfter: 120 }));
  stats.paragraphs += 1;
}

// ──────────────────────────── Đóng gói tài liệu ────────────────────────────

const sectPr =
  "<w:sectPr>" +
  '<w:footerReference w:type="default" r:id="rId2"/>' +
  '<w:pgSz w:w="11906" w:h="16838"/>' +
  '<w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1418" w:header="708" w:footer="567" w:gutter="0"/>' +
  "<w:titlePg/>" +
  "</w:sectPr>";

const documentXml =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
  `<w:body>${body.join("")}${sectPr}</w:body></w:document>`;

const headingStyle = (id, name, level, size, color) =>
  `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/>` +
  `<w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/>` +
  `<w:pPr><w:outlineLvl w:val="${level}"/><w:keepNext/></w:pPr>` +
  `<w:rPr><w:b/><w:color w:val="${color}"/><w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr></w:style>`;

const stylesXml =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
  "<w:docDefaults><w:rPrDefault><w:rPr>" +
  '<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:eastAsia="Times New Roman" w:cs="Times New Roman"/>' +
  '<w:sz w:val="24"/><w:szCs w:val="24"/><w:lang w:val="vi-VN"/>' +
  "</w:rPr></w:rPrDefault><w:pPrDefault><w:pPr>" +
  '<w:spacing w:after="120" w:line="276" w:lineRule="auto"/>' +
  "</w:pPr></w:pPrDefault></w:docDefaults>" +
  '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>' +
  headingStyle("Heading1", "heading 1", 0, 40, "0F3D5C") +
  headingStyle("Heading2", "heading 2", 1, 30, "0F3D5C") +
  headingStyle("Heading3", "heading 3", 2, 26, "17607F") +
  headingStyle("Heading4", "heading 4", 3, 24, "17607F") +
  "</w:styles>";

const footerXml =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
  '<w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:sz w:val="18"/><w:color w:val="6A7883"/></w:rPr></w:pPr>' +
  '<w:r><w:rPr><w:sz w:val="18"/><w:color w:val="6A7883"/></w:rPr><w:t xml:space="preserve">Trang </w:t></w:r>' +
  '<w:r><w:fldChar w:fldCharType="begin"/></w:r>' +
  '<w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r>' +
  '<w:r><w:fldChar w:fldCharType="separate"/></w:r>' +
  '<w:r><w:rPr><w:sz w:val="18"/><w:color w:val="6A7883"/></w:rPr><w:t>1</w:t></w:r>' +
  '<w:r><w:fldChar w:fldCharType="end"/></w:r>' +
  "</w:p></w:ftr>";

const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PKG = "http://schemas.openxmlformats.org/package/2006/relationships";

const zip = makeZip([
  {
    name: "[Content_Types].xml",
    data:
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
      '<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>' +
      '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
      "</Types>",
  },
  {
    name: "_rels/.rels",
    data:
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      `<Relationships xmlns="${PKG}">` +
      `<Relationship Id="rId1" Type="${REL}/officeDocument" Target="word/document.xml"/>` +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
      "</Relationships>",
  },
  {
    name: "word/_rels/document.xml.rels",
    data:
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      `<Relationships xmlns="${PKG}">` +
      `<Relationship Id="rId1" Type="${REL}/styles" Target="styles.xml"/>` +
      `<Relationship Id="rId2" Type="${REL}/footer" Target="footer1.xml"/>` +
      "</Relationships>",
  },
  { name: "word/document.xml", data: documentXml },
  { name: "word/styles.xml", data: stylesXml },
  { name: "word/footer1.xml", data: footerXml },
  {
    name: "docProps/core.xml",
    data:
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ' +
      'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" ' +
      'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
      `<dc:title>${xmlEscape(coverTitle ?? "Tài liệu")}</dc:title>` +
      "<dc:subject>Ứng phó nhanh — quản lý kho và điều phối vật tư cứu hộ</dc:subject>" +
      '<dcterms:created xsi:type="dcterms:W3CDTF">2026-08-07T00:00:00Z</dcterms:created>' +
      "</cp:coreProperties>",
  },
]);

writeFileSync(outputPath, zip);
console.log(
  `Đã sinh ${outputPath} — ${(zip.length / 1024).toFixed(0)} KB · ` +
    `${stats.headings} tiêu đề · ${stats.tables} bảng · ${stats.code} khối mã · ` +
    `${stats.notes} khối lưu ý · ${stats.paragraphs} đoạn`,
);

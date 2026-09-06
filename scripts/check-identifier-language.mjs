#!/usr/bin/env node
/**
 * Chặn định danh đặt tên bằng tiếng Việt trong mã nguồn.
 *
 * CODING-STANDARDS mục 2.1 bắt buộc tên biến/hàm/class/field viết bằng tiếng Anh,
 * nhưng một quy tắc chỉ nằm trong tài liệu thì không ai vi phạm cố ý — nó trôi vào
 * từng lượt sửa vội, và tới lúc phát hiện thì đã 60-70 cái tên rải khắp repo. Bài
 * này biến quy tắc đó thành một cổng chạy được: lệch là CI đỏ ngay ở PR gây ra nó.
 *
 * CHỈ SOI ĐỊNH DANH. Chuỗi, chú thích và dữ liệu tiếng Việt được giữ nguyên — nhãn
 * hiển thị, regex bắt lời kể của trưởng thôn, tên thôn trong seed đều PHẢI là tiếng
 * Việt, và một bộ lọc đụng vào chúng sẽ bị tắt trong tuần đầu.
 *
 * Chạy: node scripts/check-identifier-language.mjs [--json]
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

/** Âm tiết tiếng Việt viết không dấu, sinh từ (âm đầu × vần × âm cuối). */
const VIETNAMESE_SYLLABLES = (() => {
  const onsets = [
    "",
    "b",
    "c",
    "ch",
    "d",
    "dd",
    "g",
    "gh",
    "gi",
    "h",
    "k",
    "kh",
    "l",
    "m",
    "n",
    "ng",
    "ngh",
    "nh",
    "p",
    "ph",
    "q",
    "qu",
    "r",
    "s",
    "t",
    "th",
    "tr",
    "v",
    "x",
  ];
  const nuclei = [
    "a",
    "ai",
    "ao",
    "au",
    "ay",
    "e",
    "eo",
    "eu",
    "i",
    "ia",
    "ie",
    "ieu",
    "iu",
    "o",
    "oa",
    "oai",
    "oay",
    "oe",
    "oi",
    "oo",
    "ua",
    "uai",
    "uay",
    "ue",
    "ui",
    "uo",
    "uoi",
    "uou",
    "uu",
    "u",
    "y",
    "ye",
    "yeu",
    "uy",
    "uye",
  ];
  const codas = ["", "c", "ch", "m", "n", "ng", "nh", "p", "t", "i", "o", "u", "y"];
  const set = new Set();
  for (const onset of onsets)
    for (const nucleus of nuclei) for (const coda of codas) set.add(onset + nucleus + coda);
  return set;
})();

/**
 * Âm tiết vừa là tiếng Việt vừa là từ/viết tắt tiếng Anh dùng thật trong mã.
 *
 * Đây là phần quyết định bộ lọc sống hay chết. `map`, `key`, `set`, `lat`, `min`,
 * `run` đều lọt khuôn âm tiết tiếng Việt; đếm chúng là báo động giả hàng nghìn lượt
 * và cả đội sẽ tắt bộ lọc. Một tên chỉ bị bắt khi có ÍT NHẤT HAI âm tiết tiếng Việt
 * KHÔNG nằm trong danh sách này — `thieuMotPhan` bị bắt, `mapKey` thì không.
 */
const ENGLISH_LOOKALIKES = new Set(
  `
to set on at in by it be no up do so go re me the then than not can may key map get let try run
true false lat lng lon geo min max sum top end all one two per pre post sub add del put has is was
id sku url uri api ui ux db sql json html css img src ref idx val obj arr str num bool fn cb ctx
req res err name type kind mode item list data user role auth token time date size len count total
index main app src lib core base dist build test spec mock stub fake temp tmp util helper
row col tab bar box btn div span text link icon card view page form input label title body head
foot pin zoom tile layer point line area path route node edge dot chip gap trim
red blue green gray grey dark light color theme style class near far over under out off down left
right ok yes new old sec ms io net root doc ring non got hit len rain day chat loop pop cat na pat
bit due sim sin gain quit boat but ep en de va co ta la da ra tu an em nu si mu hu ge le li ki ti
xu bi gi ai vi io pi ha hi ho no na quot ay
loan main chain train plain drain brain coin join gap tip trip trim chai
`
    .trim()
    .split(/\s+/),
);

/**
 * Từ tiếng Việt một âm tiết vẫn phải chặn dù đứng một mình.
 *
 * Danh sách hẹp và chỉ gồm từ nghiệp vụ của dự án: `kho`, `thon`, `phieu` xuất hiện
 * như tên biến là gần như chắc chắn tiếng Việt, còn `sin`/`cat`/`pin` thì không.
 */
const VIETNAMESE_DOMAIN_WORDS = new Set(
  `
kho thon xa huyen tinh nguoi nhiem hua phieu vattu nguong khoa
khong nhung nhieu duoc trong ngoai truoc sau tren duoi
thieu thua tonkho xuat nhap muon tra huy sua ghi
nguoidung donvi sanpham soluong danhsach tongtien
`
    .trim()
    .split(/\s+/),
);

/** Tên riêng và mã ngôn ngữ được phép: địa danh thật, locale, tên model. */
const ALLOWED = new Set(["dongXuan", "DONG_XUAN", "dong_xuan", "tuyAn", "TUY_AN", "phoWhisper"]);

const SOURCE_FILE = /\.(ts|tsx|js|jsx|mjs|cjs|py)$/;
const SKIPPED_PATH =
  /(^|\/)(node_modules|dist|build|\.next|\.next-[^/]*|out|release|coverage|__pycache__|\.venv)\//;

/** Bỏ chú thích và thân chuỗi, giữ lại phần mã thật sự. */
function stripNonCode(source, isPython) {
  if (isPython) {
    return source
      .replace(/"""[\s\S]*?"""|'''[\s\S]*?'''/g, " ")
      .replace(/#[^\n]*/g, "")
      .replace(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/g, '""');
  }
  return (
    source
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/\/\/[^\n]*/g, "")
      // Template literal: giữ lại nội dung ${...} vì đó là mã, bỏ phần chữ bao quanh.
      .replace(/`(?:[^`\\]|\\.)*`/g, (literal) => (literal.match(/\$\{[^{}]*\}/g) ?? []).join(" "))
      .replace(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/g, '""')
  );
}

/**
 * CHỈ soi vị trí KHAI BÁO, không soi mọi từ trong tệp.
 *
 * Chữ tiếng Việt trong JSX (`<p>Kho thôn Long Châu</p>`) không nằm trong dấu nháy
 * nên bộ bỏ-chuỗi ở trên không chạm tới; quét mọi định danh sẽ báo hàng trăm lượt
 * vào đúng phần chữ mà dự án BẮT BUỘC viết tiếng Việt. Khai báo thì khác: một tên
 * khai bằng tiếng Anh kéo theo mọi chỗ dùng nó cũng tiếng Anh, nên soi ở đây là
 * đủ mà không đụng vào nội dung hiển thị.
 */
const DECLARATION_PATTERNS = {
  ts: [
    /\b(?:const|let|var|function|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/g,
    /^\s*(?:readonly\s+|private\s+|public\s+|protected\s+)*([A-Za-z_$][\w$]*)\s*[?!]?\s*:/gm,
    /(?:^|[(,]\s*)([A-Za-z_$][\w$]*)\s*(?:=>|\)\s*=>)/gm,
  ],
  py: [
    /^\s*(?:async\s+)?def\s+(\w+)/gm,
    /^\s*class\s+(\w+)/gm,
    /^\s*(\w+)\s*(?::[^=\n]+)?=(?!=)/gm,
    /\bfor\s+(\w+)\s+in\b/g,
    /\bas\s+(\w+)\s*[:,)\n]/g,
  ],
};

/** Danh sách tham số của hàm — `def tinh_tong(gio_bat_dau)` phải bị bắt cả tên tham số. */
const PARAMETER_LISTS = {
  ts: /\b(?:function\s+[A-Za-z_$][\w$]*|=>|\bfunction)\s*\(([^)]*)\)/g,
  py: /^\s*(?:async\s+)?def\s+\w+\s*\(([^)]*)\)/gm,
};

/** Tên được khai báo trong một tệp, kèm số dòng. */
function declaredIdentifiers(code, isPython) {
  const dialect = isPython ? "py" : "ts";
  const found = [];
  const lineOf = (offset) => code.slice(0, offset).split("\n").length;

  for (const pattern of DECLARATION_PATTERNS[dialect]) {
    for (const match of code.matchAll(pattern)) {
      found.push({ identifier: match[1], line: lineOf(match.index) });
    }
  }
  for (const match of code.matchAll(PARAMETER_LISTS[dialect])) {
    const line = lineOf(match.index);
    for (const parameter of match[1].split(",")) {
      // Bỏ kiểu, giá trị mặc định, `*args`/`**kwargs`, destructuring.
      const name = parameter
        .trim()
        .replace(/^[*\s]+/, "")
        .match(/^[A-Za-z_$][\w$]*/);
      if (name) found.push({ identifier: name[0], line });
    }
  }
  return found;
}

/** Tách `thieuMotPhan` / `THIEU_MOT_PHAN` / `thieu_mot_phan` thành các âm tiết. */
function splitIdentifier(identifier) {
  return identifier
    .replace(/^[_$]+|[_$]+$/g, "")
    .split(/[_$]+/)
    .flatMap((part) => part.match(/[A-Z]{2,}(?=[A-Z][a-z]|\d|\b)|[A-Z]?[a-z]+|[A-Z]+|\d+/g) ?? [])
    .map((token) => token.toLowerCase())
    .filter((token) => !/^\d+$/.test(token));
}

function isVietnameseIdentifier(identifier) {
  if (ALLOWED.has(identifier)) return false;
  const tokens = splitIdentifier(identifier);
  if (tokens.length === 0) return false;

  const vietnamese = tokens.filter((token) => VIETNAMESE_SYLLABLES.has(token) && token.length >= 2);
  const distinctive = vietnamese.filter((token) => !ENGLISH_LOOKALIKES.has(token));

  // Một âm tiết nghiệp vụ đứng một mình (`kho`, `phieu`) đã đủ để chặn.
  if (tokens.length === 1 && VIETNAMESE_DOMAIN_WORDS.has(tokens[0])) return true;

  // Cả tên phải toàn âm tiết tiếng Việt. `waterKho` lọt qua là chấp nhận được —
  // thà bỏ sót một tên lai còn hơn báo động giả vào `sumOnLoan` rồi bị tắt.
  if (!tokens.every((token) => VIETNAMESE_SYLLABLES.has(token))) return false;

  // Hai âm tiết đặc trưng là đủ chắc: `soLuongTon`, `thieuMotPhan`.
  if (distinctive.length >= 2) return true;

  // Một âm tiết đặc trưng vẫn chặn NẾU đó là từ nghiệp vụ: `so_nguoi`, `tenKho`.
  // Không có vế này thì `so`/`ten` (trùng từ tiếng Anh) kéo cả tên xuống dưới ngưỡng.
  return (
    distinctive.length === 1 && distinctive.some((token) => VIETNAMESE_DOMAIN_WORDS.has(token))
  );
}

function listSourceFiles() {
  return execFileSync("git", ["ls-files", "-z"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
    .split("\0")
    .filter((file) => file && SOURCE_FILE.test(file) && !SKIPPED_PATH.test(file));
}

function findViolations() {
  const violations = [];
  for (const file of listSourceFiles()) {
    let source;
    try {
      source = readFileSync(file, "utf8");
    } catch {
      continue; // Tệp vừa bị xoá giữa lúc quét — không phải lỗi đặt tên.
    }
    const isPython = file.endsWith(".py");
    const code = stripNonCode(source, isPython);
    const seen = new Set();
    for (const { identifier, line } of declaredIdentifiers(code, isPython)) {
      if (seen.has(identifier) || !isVietnameseIdentifier(identifier)) continue;
      seen.add(identifier);
      violations.push({ file, line, identifier });
    }
  }
  return violations;
}

const violations = findViolations();

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(violations, null, 2));
} else if (violations.length === 0) {
  console.log("Đặt tên: không có định danh tiếng Việt nào.");
} else {
  console.error(`Đặt tên: ${violations.length} định danh tiếng Việt (CODING-STANDARDS mục 2.1).\n`);
  for (const { file, line, identifier } of violations) {
    console.error(`  ${file}:${line}  ${identifier}`);
  }
  console.error("\nĐổi sang tiếng Anh. Chú thích và chuỗi hiển thị vẫn viết tiếng Việt như cũ.");
}

process.exitCode = violations.length === 0 ? 0 : 1;

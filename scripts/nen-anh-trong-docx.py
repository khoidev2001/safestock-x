# -*- coding: utf-8 -*-
"""Nén ảnh bên trong file .docx để hạ dung lượng, giữ nguyên bố cục và chữ.

Ảnh dán từ clipboard vào Word được lưu dạng PNG gần như không nén — một ảnh chụp
màn hình 2560x1305 chiếm ~9,6 MB. Script đổi chúng sang JPEG 4:4:4 (không lấy mẫu
con màu, nên chữ trên ảnh không bị nhoè viền) và thu nhỏ về đúng độ phân giải cần
cho khổ in A4.

Chạy:
    python scripts/nen-anh-trong-docx.py <file goc.docx> <file ra.docx> [MB toi da]

Không sửa file gốc.
"""
import io
import os
import re
import shutil
import sys
import zipfile

from PIL import Image

SRC = sys.argv[1]
OUT = sys.argv[2]
BUDGET_MB = float(sys.argv[3]) if len(sys.argv) > 3 else 9.2

# (bề ngang tối đa, chất lượng JPEG) — xếp từ đẹp nhất xuống, lấy mức đầu tiên vừa túi.
# Khổ chữ A4 lề Nghị định 30 rộng 16,5 cm; ảnh 1600 px tương đương ~246 DPI khi in.
PRESETS = [
    (2000, 92),
    (1800, 92),
    (1800, 88),
    (1600, 90),
    (1600, 88),
    (1600, 85),
    (1500, 85),
    (1400, 85),
    (1400, 82),
    (1280, 80),
    (1100, 78),
]


def encode(img: Image.Image, max_width: int, quality: int) -> bytes:
    if img.mode not in ("RGB", "L"):
        img = img.convert("RGB")
    if img.width > max_width:
        height = round(img.height * max_width / img.width)
        img = img.resize((max_width, height), Image.LANCZOS)
    buf = io.BytesIO()
    # subsampling=0 giữ nguyên độ phân giải màu → chữ trong ảnh chụp màn hình không bệt.
    img.save(buf, "JPEG", quality=quality, optimize=True, subsampling=0, progressive=True)
    return buf.getvalue()


src_zip = zipfile.ZipFile(SRC)
media = [n for n in src_zip.namelist() if n.startswith("word/media/")]
images = {}
skipped = []
for name in media:
    data = src_zip.read(name)
    try:
        images[name] = Image.open(io.BytesIO(data))
        images[name].load()
    except Exception:
        skipped.append(name)  # emf/wmf/svg… giữ nguyên

before = sum(src_zip.getinfo(n).file_size for n in media)
print(f"Anh trong file: {len(media)} ({before / 1048576:.1f} MB)")
if skipped:
    print(f"  giu nguyen {len(skipped)} tep khong phai anh bitmap")

chosen = None
encoded = {}
for max_width, quality in PRESETS:
    trial = {n: encode(im, max_width, quality) for n, im in images.items()}
    total = sum(len(b) for b in trial.values())
    print(f"  thu {max_width}px q{quality}: {total / 1048576:5.1f} MB", end="")
    if total <= BUDGET_MB * 1048576:
        chosen = (max_width, quality)
        encoded = trial
        print("  <- chon")
        break
    print()

if chosen is None:
    sys.exit(f"Khong dat duoi {BUDGET_MB} MB voi bo tham so hien co. Ha bot so anh hoac noi budget.")

# .png -> .jpeg: doi ten tep, va vá lai moi tham chieu trong cac tep .rels
rename = {n: re.sub(r"\.[^.]+$", ".jpeg", n) for n in encoded}


def patch_rels(xml: str) -> str:
    for old, new in rename.items():
        xml = xml.replace(old.replace("word/", ""), new.replace("word/", ""))
    return xml


def patch_content_types(xml: str) -> str:
    if 'Extension="jpeg"' not in xml:
        xml = xml.replace(
            "<Types ",
            "<Types ",
        ).replace(
            "</Types>",
            '<Default Extension="jpeg" ContentType="image/jpeg"/></Types>',
        )
    return xml


with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as out_zip:
    for info in src_zip.infolist():
        name = info.filename
        if name in encoded:
            out_zip.writestr(rename[name], encoded[name])
            continue
        data = src_zip.read(name)
        if name == "[Content_Types].xml":
            data = patch_content_types(data.decode("utf-8")).encode("utf-8")
        elif name.endswith(".rels"):
            data = patch_rels(data.decode("utf-8")).encode("utf-8")
        out_zip.writestr(info, data)

src_size = os.path.getsize(SRC)
out_size = os.path.getsize(OUT)
print(
    f"\nXong: {src_size / 1048576:.1f} MB -> {out_size / 1048576:.1f} MB "
    f"(bang {out_size / src_size * 100:.1f}%), anh o {chosen[0]}px chat luong {chosen[1]}"
)

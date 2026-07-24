"use client";

import { ColorIcon } from "@/components/shared/color-icon";

const MAX_AVATAR_DATA_URL_LENGTH = 80_000;

interface ProfileAvatarEditorProps {
  disabled?: boolean;
  fullName: string;
  onChange: (value: string | null) => void;
  onError: (message: string) => void;
  value: string | null;
}

export function ProfileAvatarEditor({
  disabled = false,
  fullName,
  onChange,
  onError,
  value,
}: ProfileAvatarEditorProps) {
  async function handleFile(file?: File) {
    if (!file) return;
    if (!file.type.match(/^image\/(png|jpeg|webp)$/)) {
      onError("Chỉ hỗ trợ ảnh PNG, JPEG hoặc WebP.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      onError("Ảnh đại diện phải nhỏ hơn 5 MB.");
      return;
    }

    try {
      onChange(await compressAvatar(file));
      onError("");
    } catch {
      onError("Không thể xử lý ảnh này. Vui lòng chọn ảnh khác.");
    }
  }

  return (
    <div className="flex items-center gap-4">
      <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[var(--surface-2)] ring-1 ring-[var(--border)]">
        {value ? (
          // value là data URL base64 vừa upload — next/image không hỗ trợ data URL động.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            alt={`Ảnh đại diện của ${fullName || "người dùng"}`}
            className="h-full w-full object-cover"
            src={value}
          />
        ) : (
          <ColorIcon name="user" size={42} tone="blue" />
        )}
      </div>
      <div className="min-w-0 space-y-2">
        <p className="text-sm font-semibold">Ảnh đại diện</p>
        <p className="text-xs text-[var(--text-muted)]">
          Ảnh vuông, tối đa 5 MB. Hệ thống tự thu nhỏ khi lưu.
        </p>
        <div className="flex flex-wrap gap-2">
          <label className="inline-flex min-h-10 items-center justify-center rounded-md border px-3 text-xs font-semibold transition hover:bg-[var(--surface-2)] active:translate-y-px">
            Chọn ảnh
            <input
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              disabled={disabled}
              onChange={(event) => void handleFile(event.target.files?.[0])}
              type="file"
            />
          </label>
          {value ? (
            <button
              className="min-h-10 rounded-md px-3 text-xs font-semibold text-[var(--color-critical)] transition hover:bg-red-50 active:translate-y-px"
              disabled={disabled}
              onClick={() => onChange(null)}
              type="button"
            >
              Xóa ảnh
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

async function compressAvatar(file: File): Promise<string> {
  const image = await loadImage(file);
  const size = Math.min(image.naturalWidth, image.naturalHeight);
  const sourceX = (image.naturalWidth - size) / 2;
  const sourceY = (image.naturalHeight - size) / 2;
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas unavailable");
  context.drawImage(image, sourceX, sourceY, size, size, 0, 0, 256, 256);

  for (const quality of [0.82, 0.72, 0.62, 0.52]) {
    const result = canvas.toDataURL("image/webp", quality);
    if (result.length <= MAX_AVATAR_DATA_URL_LENGTH) return result;
  }
  throw new Error("Avatar too large");
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Invalid image"));
    };
    image.src = url;
  });
}

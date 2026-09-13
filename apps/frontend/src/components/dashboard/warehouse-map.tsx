"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { CollapsiblePanel } from "@/components/shared/collapsible-panel";
import { ColorIcon } from "@/components/shared/color-icon";
import type { WarehouseTree, WarehouseZone } from "@/lib/dashboard-api";
import { getZoneGuide, type ZoneGuide } from "@/lib/warehouse-zone-guide";

interface WarehouseMapProps {
  tree: WarehouseTree | undefined;
  isLoading: boolean;
}

export function WarehouseMap({ tree, isLoading }: WarehouseMapProps) {
  /** Khu đang mở toàn màn hình; null là đang xem lưới bình thường. */
  const [zoomedZoneId, setZoomedZoneId] = useState<string | null>(null);

  if (isLoading) {
    return <div className="h-[310px] animate-pulse rounded-md border bg-[var(--surface)]" />;
  }

  if (!tree) {
    return (
      <CollapsiblePanel
        className="rounded-md border bg-[var(--surface)] p-5"
        icon={<ColorIcon name="map" size={20} tone="blue" />}
        title="Sơ đồ kho"
        subtitle="Vị trí các kệ được sắp theo từng khu"
      >
        <p className="text-sm text-[var(--text-muted)]">Chưa có cây kho để hiển thị.</p>
      </CollapsiblePanel>
    );
  }

  const zoomedZone = tree.zones.find((zone) => zone.id === zoomedZoneId);
  const zoomedGuide = zoomedZone ? getZoneGuide(zoomedZone.name) : undefined;

  return (
    <CollapsiblePanel
      className="rounded-md border bg-[var(--surface)] p-5"
      icon={<ColorIcon name="map" size={20} tone="blue" />}
      title="Sơ đồ kho"
      subtitle="Bấm vào mã kệ để xem vật tư trên kệ đó, bấm vào ảnh để phóng to"
      badge={
        <span className="rounded-md bg-[var(--surface-2)] px-2.5 py-1 text-xs font-medium text-[var(--text-muted)]">
          {tree.zones.length} khu
        </span>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {tree.zones.map((zone) => {
          const guide = getZoneGuide(zone.name);
          return (
            <div key={zone.id} className="rounded-md border bg-[var(--surface-2)] p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {guide ? (
                    <span
                      aria-hidden
                      className="flex h-7 w-7 items-center justify-center rounded-md text-sm font-bold text-white"
                      style={{ background: guide.accent }}
                    >
                      {zone.code}
                    </span>
                  ) : null}
                  <div>
                    <p className="text-sm font-semibold">{zone.name}</p>
                    <p className="text-xs text-[var(--text-muted)]">{zone.code}</p>
                  </div>
                </div>
                <span className="tabular text-xs text-[var(--text-muted)]">
                  {zone.shelves.length} kệ
                </span>
              </div>

              {guide ? (
                <div className="mt-3">
                  <ZonePlan guide={guide} onZoom={() => setZoomedZoneId(zone.id)} zone={zone} />
                </div>
              ) : (
                /* Kho thôn chỉ có một khu gộp, không có ảnh bố trí — giữ nguyên
                   danh sách kệ dạng ô như trước. */
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {zone.shelves.map((shelf) => (
                    <div
                      key={shelf.id}
                      className="min-h-20 rounded-md border bg-[var(--surface)] p-2"
                    >
                      <span className="text-xs font-semibold">{shelf.code}</span>
                      <p className="mt-2 line-clamp-2 text-xs text-[var(--text-muted)]">
                        {shelf.name}
                      </p>
                      <p className="tabular mt-2 text-xs font-medium">
                        {shelf._count?.batches ?? 0} lô
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {zoomedZone && zoomedGuide ? (
        <ZoneLightbox guide={zoomedGuide} onClose={() => setZoomedZoneId(null)} zone={zoomedZone} />
      ) : null}
    </CollapsiblePanel>
  );
}

/**
 * Ảnh bố trí một khu, có nhãn mã kệ ghim đúng chỗ kệ đứng.
 *
 * Nhãn là nút bấm được: bấm vào mở ngay bảng vật tư của kệ đó cạnh nhãn. Trước
 * đây phần mô tả nằm trong một khối gập chung dưới ảnh, người xem phải tự nối
 * "A1" trên ảnh với dòng "A1" trong danh sách — mở đúng chỗ mình vừa chỉ vào
 * thì không phải nối gì cả.
 */
function ZonePlan({
  zone,
  guide,
  onZoom,
}: {
  zone: WarehouseZone;
  guide: ZoneGuide;
  /** Bỏ trống khi đang hiển thị chính bản phóng to. */
  onZoom?: () => void;
}) {
  const [openShelfId, setOpenShelfId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!openShelfId) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpenShelfId(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      // Không nuốt phím khi khối phóng to cũng đang nghe Escape: đóng bảng vật
      // tư trước, bấm Escape lần nữa mới đóng ảnh.
      if (event.key === "Escape") {
        event.stopPropagation();
        setOpenShelfId(null);
      }
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape, true);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape, true);
    };
  }, [openShelfId]);

  return (
    /* Không cắt phần thừa: bảng vật tư mở ra cao hơn ảnh ở khổ nhỏ, cắt thì
       mất nửa dưới. Bo góc chuyển lên chính tấm ảnh. */
    <div className="relative rounded-md border bg-[var(--surface)]" ref={containerRef}>
      <Image
        alt={guide.alt}
        className="h-auto w-full rounded-md"
        height={941}
        sizes={onZoom ? "(min-width: 1280px) 30vw, (min-width: 640px) 45vw, 92vw" : "90vw"}
        src={guide.image}
        width={1672}
      />

      {/* Vùng bấm phóng to nằm DƯỚI các nhãn (z-0 so với z-10) nên bấm vào nhãn
          không mở ảnh, mà bấm chỗ nào khác trên ảnh thì mở. */}
      {onZoom ? (
        <button
          aria-label={`Xem ảnh khu ${zone.name} toàn màn hình`}
          className="absolute inset-0 z-0 cursor-zoom-in"
          onClick={onZoom}
          type="button"
        />
      ) : null}

      {zone.shelves.map((shelf) => {
        const shelfGuide = guide.shelves[shelf.code];
        if (!shelfGuide) return null;
        const isOpen = openShelfId === shelf.id;
        // Nhãn nằm nửa phải ảnh thì bảng đổ sang trái, nếu không nó tràn ra
        // ngoài khung và bị cắt mất nửa chữ.
        const alignRight = shelfGuide.hotspot.left > 55;
        return (
          <div
            className="absolute z-10 -translate-x-1/2 -translate-y-1/2"
            key={shelf.id}
            style={{
              left: `${shelfGuide.hotspot.left}%`,
              top: `${shelfGuide.hotspot.top}%`,
            }}
          >
            <button
              aria-expanded={isOpen}
              className={`flex items-center gap-1 whitespace-nowrap rounded-md bg-white/95 p-0.5 shadow-[var(--shadow)] ring-1 transition ${
                isOpen ? "ring-2 ring-[var(--text)]" : "ring-black/10 hover:ring-black/30"
              }`}
              onClick={() => setOpenShelfId(isOpen ? null : shelf.id)}
              type="button"
            >
              <span
                className="rounded px-1.5 py-0.5 text-[11px] font-bold text-white"
                style={{ background: guide.accent }}
              >
                {shelf.code}
              </span>
              <span className="tabular px-1 text-[11px] font-semibold text-[var(--text)]">
                {shelf._count?.batches ?? 0} lô
              </span>
            </button>

            {isOpen ? (
              <div
                className={`absolute top-full z-20 mt-1 w-[min(17rem,70vw)] rounded-md border bg-[var(--surface)] p-3 text-left shadow-[var(--shadow)] ${
                  alignRight ? "right-0" : "left-0"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold" style={{ color: guide.accent }}>
                    Kệ {shelf.code}
                  </span>
                  <span className="tabular text-xs font-medium">
                    {shelf._count?.batches ?? 0} lô
                  </span>
                </div>
                <p className="mt-1 text-xs text-[var(--text-muted)]">{shelfGuide.position}</p>
                <dl className="mt-2 grid gap-1.5">
                  {shelfGuide.contents.map((row) => (
                    <div key={row.level}>
                      <dt className="text-xs font-semibold">{row.level}</dt>
                      <dd className="text-xs text-[var(--text-muted)]">{row.items}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

/** Ảnh bố trí xem toàn màn hình — nhãn kệ vẫn bấm được như ở khối nhỏ. */
function ZoneLightbox({
  zone,
  guide,
  onClose,
}: {
  zone: WarehouseZone;
  guide: ZoneGuide;
  onClose: () => void;
}) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", closeOnEscape);
    // Nền trang không cuộn sau lưng ảnh đang mở.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  return (
    <div
      aria-label={`Sơ đồ khu ${zone.name}`}
      aria-modal
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      role="dialog"
    >
      {/* Bấm ra ngoài ảnh để đóng; để nút phủ nền thay vì onClick trên lớp phủ
          để bàn phím cũng đóng được. */}
      <button
        aria-label="Đóng ảnh"
        className="absolute inset-0 cursor-zoom-out"
        onClick={onClose}
        type="button"
      />
      <div className="relative z-10 w-full max-w-5xl">
        <div className="flex items-center justify-between gap-2 pb-2">
          <p className="text-sm font-semibold text-white">
            {zone.code} · {zone.name}
          </p>
          <button
            className="rounded-md bg-white/90 px-2.5 py-1 text-xs font-semibold text-[var(--text)] hover:bg-white"
            onClick={onClose}
            type="button"
          >
            Đóng
          </button>
        </div>
        <ZonePlan guide={guide} zone={zone} />
      </div>
    </div>
  );
}

"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { ColorIcon } from "@/components/shared/color-icon";
import { communeStockTotals } from "@/lib/commune-stock-totals";
import { getCommuneStock, type WarehouseStock, type WarehouseStockItem } from "@/lib/dashboard-api";
import { Pagination, usePagination } from "@/components/shared/pagination";
import { useBodyScrollLock } from "@/lib/use-body-scroll-lock";
import { stripDiacritics } from "@/lib/vi-text";

/**
 * Số ở dòng tóm tắt: viết liền, không phần lẻ.
 *
 * Kiểu Việt Nam chấm ngăn nghìn và phẩy ngăn thập phân cho ra "9.127,5 lít" —
 * ba con số đứng cạnh nhau, mỗi con số hai loại dấu, đọc lướt rất dễ hiểu sai độ
 * lớn. Dòng này chỉ để nắm quy mô nên viết thẳng "9127 lít".
 *
 * CẮT phần lẻ chứ không làm tròn: nửa lít lẻ sinh ra từ phép nhân chai × 1,5,
 * không ai đong được, và làm tròn lên là hứa nhiều nước hơn số thực có trong kho.
 */
const wholeNumber = (value: number) => String(Math.floor(value));

/** Chín kho mỗi trang: vừa đúng ba hàng của lưới ba cột, không để hàng cuối lẻ. */
const WAREHOUSES_PER_PAGE = 9;

type WarehouseSort = "desc" | "asc";

const WAREHOUSE_SORTS: { value: WarehouseSort; label: string }[] = [
  { value: "desc", label: "Nhiều món nhất trước" },
  { value: "asc", label: "Ít món nhất trước" },
];

/**
 * Tồn kho TOÀN XÃ, hiện ngay trong tab Vật tư của kho tổng.
 *
 * Bảng tồn bên dưới chỉ đếm hàng nằm trong chính kho tổng. Hàng đã đẩy xuống các
 * thôn thì biến mất khỏi màn hình, nên lúc cần điều phối người trực tưởng xã hết
 * hàng trong khi ba thôn vẫn còn — rồi đi xin chi viện một thứ mình đang có.
 *
 * XẾP THEO KHO, không phải theo vật tư. Người trực hỏi "thôn Long Châu đang có
 * gì" nhiều hơn hỏi "áo phao cả xã còn bao nhiêu" — vì câu hỏi thứ nhất dẫn tới
 * một hành động cụ thể (điều xe tới đâu), còn câu thứ hai chỉ là một con số.
 *
 * Mặc định BUNG SẴN. Lúc điều phối, câu hỏi "thôn nào còn hàng" đến trước câu
 * hỏi "kho tổng còn gì" — bắt người trực bấm thêm một nhát để thấy thứ họ vào
 * đây để xem là thừa. Ai không cần thì gấp lại được.
 *
 * Có ô tìm theo tên thôn vì xã có hàng chục kho: cuộn mắt qua từng thẻ để tìm
 * "Long Châu" chậm hơn gõ ba chữ.
 *
 * Kho thôn gọi vào đây sẽ bị máy chủ từ chối (403) — khối này lặng lẽ biến mất
 * thay vì hiện một câu lỗi mà trưởng thôn không làm gì được.
 */
export function CommuneStockPanel({ warehouseId }: { warehouseId: string }) {
  const [expanded, setExpanded] = useState(true);
  /** Từ khoá lọc theo tên kho/thôn; rỗng là hiện hết. */
  const [warehouseSearch, setWarehouseSearch] = useState("");
  /** Kho đang mở xem chi tiết; null là không mở gì. */
  const [openWarehouse, setOpenWarehouse] = useState<WarehouseStock | null>(null);
  const [sort, setSort] = useState<WarehouseSort>("desc");

  const query = useQuery({
    queryKey: ["commune-stock", warehouseId],
    queryFn: () => getCommuneStock(warehouseId),
    enabled: Boolean(warehouseId),
    // Không thử lại: 403 là câu trả lời dứt khoát cho kho thôn, thử lại chỉ tốn
    // lượt gọi và làm chậm màn hình.
    retry: false,
    staleTime: 60_000,
  });

  /*
    Bọc useMemo vì `?? []` đẻ ra một MẢNG MỚI mỗi lượt vẽ khi chưa có dữ liệu.
    Mảng mới là một phụ thuộc mới, nên khối lọc–xếp bên dưới chạy lại mỗi lượt
    vẽ dù không có gì đổi.
  */
  const warehouses = useMemo(() => query.data?.byWarehouse ?? [], [query.data]);

  /**
   * Lọc rồi xếp — cả hai chạy TRƯỚC lối thoát sớm bên dưới.
   *
   * `usePagination` là hook, mà hook thì không được đứng sau một câu `return`
   * có điều kiện. Vì vậy lối thoát khi máy chủ từ chối (403 với kho thôn) đã
   * dời xuống dưới toàn bộ phần tính toán này.
   *
   * Xếp theo TỔNG SỐ MÓN chứ không theo tên: câu hỏi lúc điều phối là "thôn nào
   * còn nhiều hàng nhất để rút bớt sang thôn đang thiếu", mà thứ tự chữ cái
   * không trả lời được câu nào. Kho trống tụt xuống cuối, đúng chỗ của nó.
   */
  const visibleWarehouses = useMemo(() => {
    const keyword = stripDiacritics(warehouseSearch);
    const matched = keyword
      ? warehouses.filter((k) => stripDiacritics(k.warehouseName).includes(keyword))
      : warehouses;
    return [...matched].sort(
      (a, b) =>
        (sort === "desc" ? b.totalUnits - a.totalUnits : a.totalUnits - b.totalUnits) ||
        // Hai kho cùng số món thì xếp theo tên: thiếu mốc phụ thì thứ tự giữa
        // chúng đổi mỗi lần vẽ lại, và cả lưới nhảy chỗ ngay dưới con trỏ.
        a.warehouseName.localeCompare(b.warehouseName, "vi"),
    );
  }, [warehouses, warehouseSearch, sort]);

  const pagination = usePagination(visibleWarehouses, WAREHOUSES_PER_PAGE);

  if (query.isError) return null;

  // Ba rổ rời nhau (đồ dùng / lương thực / nước) tính ở một chỗ dùng chung với
  // khối vật tư trên trang Tổng quan — xem `commune-stock-totals.ts`. Hai màn
  // hình tự phân loại lấy thì sớm muộn cũng nói hai con số cho cùng đống hàng.
  const { supplyUnits, foodKg, waterLiters } = communeStockTotals(warehouses);

  const summary = query.isLoading
    ? "đang tải…"
    : warehouses.length === 0
      ? "chưa có vật tư nào"
      : [
          `Tổng ${wholeNumber(supplyUnits)} vật tư`,
          `Lương thực ${wholeNumber(foodKg)} kg`,
          `Nước ${wholeNumber(waterLiters)} lít`,
        ].join(" · ");

  return (
    <section className="rounded-md border bg-[var(--surface)]">
      {/* Hẹp thì xếp dọc, rộng thì ô tìm nằm nép bên phải cùng hàng với tiêu đề —
          trên điện thoại mà ép chung một hàng thì tiêu đề bị bóp còn vài chữ. */}
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <button
          aria-expanded={expanded}
          className="flex min-w-0 flex-1 items-start gap-2 text-left"
          onClick={() => setExpanded((previous) => !previous)}
          type="button"
        >
          <ColorIcon name="warehouse" size={18} tone="blue" />
          <span aria-hidden="true" className="text-xs leading-6 text-[var(--text-muted)]">
            {expanded ? "▾" : "▸"}
          </span>
          {/* Số liệu xuống dòng riêng: nhét chung một hàng với tiêu đề thì bốn vế
              tràn ngang, còn màn hình hẹp thì cắt mất vế cuối. */}
          <span className="min-w-0">
            <span className="block">
              <span className="font-semibold">Tồn kho toàn xã</span>
              {/* Số kho ở lại cùng hàng với tiêu đề: nó nói khối này bao trùm
                  những đâu, còn dòng dưới mới là hàng hoá đang có. */}
              {warehouses.length > 0 ? (
                <span className="ml-2 text-sm text-[var(--text-muted)]">
                  {warehouses.length} kho
                </span>
              ) : null}
            </span>
            <span className="mt-0.5 block text-sm text-[var(--text-muted)]">{summary}</span>
          </span>
        </button>

        {expanded && warehouses.length > 0 ? (
          <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            <label className="sr-only" htmlFor="tim-kho-thon">
              Tìm thôn
            </label>
            <input
              id="tim-kho-thon"
              type="search"
              value={warehouseSearch}
              onChange={(event) => {
                setWarehouseSearch(event.target.value);
                // Về trang 1 khi đổi từ khoá: đang ở trang 3 mà lọc còn một
                // trang thì người dùng nhìn vào một lưới trống.
                pagination.setPage(1);
              }}
              placeholder="Tìm kho theo thôn"
              className="w-full rounded-md border bg-[var(--surface)] px-3 py-2 text-sm outline-none transition focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent)]/20 sm:w-52"
            />
            <label className="sr-only" htmlFor="sap-xep-kho">
              Sắp xếp kho
            </label>
            <select
              id="sap-xep-kho"
              value={sort}
              onChange={(event) => {
                setSort(event.target.value as WarehouseSort);
                pagination.setPage(1);
              }}
              className="select-field shrink-0 rounded-md border bg-[var(--surface)] py-2 pl-3 text-sm"
            >
              {WAREHOUSE_SORTS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>

      {expanded && warehouses.length > 0 ? (
        <>
          {visibleWarehouses.length === 0 ? (
            <p className="border-t p-4 text-sm text-[var(--text-muted)]">
              Không có kho nào khớp “{warehouseSearch}”.
            </p>
          ) : (
            <>
              <div className="grid gap-3 border-t p-4 sm:grid-cols-2 xl:grid-cols-3">
                {pagination.pageItems.map((warehouse) => (
                  <WarehouseCard
                    key={warehouse.warehouseId}
                    warehouse={warehouse}
                    onOpen={() => setOpenWarehouse(warehouse)}
                  />
                ))}
              </div>
              {/* Bỏ dòng "Hiển thị 1-9 trên 18 kho": số kho đã nằm ngay cạnh
                  tiêu đề khối, nhắc lại ở chân trang chỉ là một con số thứ hai
                  nói cùng một chuyện — mà lại đẩy dãy số trang dạt hẳn sang mép
                  phải. Tắt nó đi thì dãy số tự về giữa. */}
              <Pagination
                label="kho"
                onPageChange={pagination.setPage}
                padding="px-4 pb-4"
                page={pagination.page}
                pageSize={pagination.pageSize}
                showSummary={false}
                totalItems={visibleWarehouses.length}
                totalPages={pagination.totalPages}
              />
            </>
          )}
        </>
      ) : null}

      <WarehouseStockDialog warehouse={openWarehouse} onClose={() => setOpenWarehouse(null)} />
    </section>
  );
}

/**
 * Toàn bộ vật tư của MỘT kho, mở ra từ thẻ tóm tắt.
 *
 * Thẻ ngoài chỉ hiện năm mã nhiều nhất — đủ để so sánh giữa các thôn, nhưng
 * không trả lời được câu hỏi thật sự hay gặp: "thôn Long Châu còn bao nhiêu áo
 * phao". Trước đây muốn biết phải sang tab khác rồi đổi kho.
 *
 * Dữ liệu lấy thẳng từ thẻ đang mở, không gọi thêm lượt mạng nào: danh sách đầy
 * đủ vốn đã nằm sẵn trong `warehouse.items`, chỉ là bị cắt bớt lúc hiển thị.
 */
function WarehouseStockDialog({
  warehouse,
  onClose,
}: {
  warehouse: WarehouseStock | null;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  useBodyScrollLock(warehouse !== null);

  // Đổi kho thì xoá từ khoá cũ: giữ lại "áo phao" khi mở sang kho khác sẽ ra một
  // danh sách trống, trông như kho đó không có gì.
  useEffect(() => setSearch(""), [warehouse?.warehouseId]);

  useEffect(() => {
    if (!warehouse) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [warehouse, onClose]);

  const items = useMemo(() => {
    if (!warehouse) return [];
    const query = stripDiacritics(search);
    if (!query) return warehouse.items;
    // Tìm cả theo mã: người quen kho gõ "WATER-01" nhanh hơn gõ tên đầy đủ.
    return warehouse.items.filter(
      (item) => stripDiacritics(item.itemName).includes(query) || stripDiacritics(item.itemSku).includes(query),
    );
  }, [warehouse, search]);

  if (!warehouse) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Vật tư tại ${warehouse.warehouseName}`}
      className="fixed inset-0 z-[1300] flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[85dvh] w-full max-w-lg flex-col rounded-lg border bg-[var(--surface)] shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b p-5">
          <div className="min-w-0">
            <h3 className="truncate font-semibold">{warehouse.warehouseName}</h3>
            <p className="mt-0.5 text-sm text-[var(--text-muted)]">
              {warehouse.totalUnits.toLocaleString("vi")} món · {warehouse.itemCount} mã vật tư
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="shrink-0 rounded-md border px-3 py-1.5 text-sm font-medium transition hover:bg-[var(--surface-2)]"
          >
            Đóng
          </button>
        </div>

        <div className="border-b p-4">
          <label className="sr-only" htmlFor="tim-vat-tu">
            Tìm vật tư
          </label>
          <input
            id="tim-vat-tu"
            type="search"
            autoFocus
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Tìm tên vật tư hoặc mã (vd: áo phao, WATER-01)"
            className="w-full rounded-md border bg-[var(--surface)] px-3 py-2 text-sm outline-none transition focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent)]/20"
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {items.length === 0 ? (
            <p className="py-6 text-center text-sm text-[var(--text-muted)]">
              {search ? `Kho này không có vật tư nào khớp “${search}”.` : "Kho này đang trống."}
            </p>
          ) : (
            <ul className="divide-y text-sm">
              {items.map((item) => (
                <StockRow item={item} key={item.itemSku} />
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function StockRow({ item }: { item: WarehouseStockItem }) {
  return (
    <li className="py-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium">{item.itemName}</p>
          <p className="text-xs text-[var(--text-muted)]">{item.itemSku}</p>
        </div>
        <span className="tabular shrink-0 font-semibold">
          {item.quantity.toLocaleString("vi")} {item.unit}
        </span>
      </div>
      {item.conversion ? (
        <p className="mt-0.5 text-xs text-[var(--text-muted)]">{item.conversion}</p>
      ) : null}
    </li>
  );
}

/**
 * Một kho, kèm những gì nó đang giữ.
 *
 * Chỉ hiện năm mặt hàng nhiều nhất rồi gộp phần còn lại thành một dòng. Kho tổng
 * có tới mười bảy mã vật tư; liệt kê hết thì mỗi thẻ dài bằng cả màn hình và
 * người đọc mất luôn khả năng so sánh giữa các thôn — vốn là lý do khối này tồn
 * tại.
 */
function WarehouseCard({ warehouse, onOpen }: { warehouse: WarehouseStock; onOpen: () => void }) {
  const MAX_VISIBLE_ITEMS = 5;
  const visible = warehouse.items.slice(0, MAX_VISIBLE_ITEMS);
  const hiddenCount = warehouse.items.length - visible.length;
  const isCentral = warehouse.kind === "CENTRAL";
  const isEmpty = warehouse.totalUnits === 0;

  return (
    // Cả thẻ là một nút: vùng bấm càng lớn càng dễ trúng, nhất là trên máy tính
    // bảng ngoài hiện trường. Kho trống vẫn bấm được — mở ra để thấy rõ "không
    // còn gì" là một câu trả lời, khác hẳn với một thẻ chết không phản hồi.
    <button
      type="button"
      onClick={onOpen}
      title={`Xem toàn bộ vật tư tại ${warehouse.warehouseName}`}
      // `flex flex-col` chứ không để mặc định: nội dung trong <button> bị căn
      // giữa theo chiều dọc, nên thẻ nào ít mã hàng hơn hàng xóm là cả khối chữ
      // trôi xuống giữa ô — nhìn qua tưởng lỗi hiển thị. Xếp từ trên xuống thì
      // mọi thẻ bắt đầu cùng một vạch.
      className="flex flex-col items-stretch rounded-md border p-3 text-left transition hover:border-[var(--text-muted)]/60 hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
      style={
        isCentral
          ? { borderColor: "var(--color-accent)", background: "var(--surface-2)" }
          : undefined
      }
    >
      <div className="flex items-baseline justify-between gap-2">
        <h4 className="truncate text-sm font-semibold" title={warehouse.warehouseName}>
          {warehouse.warehouseName}
        </h4>
        {isCentral ? (
          <span className="shrink-0 text-[10px] font-semibold uppercase text-[var(--color-accent)]">
            kho tổng
          </span>
        ) : null}
      </div>

      <p className="mt-0.5 text-xs text-[var(--text-muted)]">
        {isEmpty
          ? "đang trống"
          : `${warehouse.totalUnits.toLocaleString("vi")} món · ${warehouse.itemCount} mã`}
      </p>

      {isEmpty ? (
        /* Kho trống vẫn phải hiện. Bỏ nó đi thì người đọc tưởng thôn đó không
           tồn tại, trong khi "thôn này hết hàng" mới là thông tin cần biết. */
        <p className="mt-2 text-xs italic text-[var(--text-muted)]">Không còn vật tư nào</p>
      ) : (
        <ul className="mt-2 space-y-1 text-xs">
          {visible.map((mon) => (
            <li key={mon.itemSku}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate" title={mon.itemName}>
                  {mon.itemName}
                </span>
                <span className="shrink-0 font-mono font-semibold">
                  {mon.quantity.toLocaleString("vi")} {mon.unit}
                </span>
              </div>
              {/* Quy đổi ra lốc và lít cho hàng đếm theo chai — ba cách đếm cho
                  cùng một đống hàng, ai cũng đọc được ngay phần mình cần. */}
              {mon.conversion ? (
                <div className="text-[10px] text-[var(--text-muted)]">{mon.conversion}</div>
              ) : null}
            </li>
          ))}
          {hiddenCount > 0 ? (
            <li className="pt-0.5 text-[var(--text-muted)]">và {hiddenCount} mã khác</li>
          ) : null}
        </ul>
      )}

      {/* `mt-auto` ghim dòng này xuống đáy thẻ. Các thẻ trong lưới cao bằng nhau
          nhưng số mã hàng khác nhau, nên nếu để nó chạy ngay sau danh sách thì
          mỗi thẻ một độ cao — mắt đọc hàng ngang bị gãy. */}
      <span className="mt-auto block pt-2 text-xs font-medium text-[var(--color-accent)]">
        Xem tất cả vật tư →
      </span>
    </button>
  );
}

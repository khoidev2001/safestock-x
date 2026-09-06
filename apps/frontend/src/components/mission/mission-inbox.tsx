"use client";

import { useEffect, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  listMissionInbox,
  type MissionInboxFilter,
  type MissionInboxSort,
  type MissionSearchField,
} from "@/lib/mission-api";
import { formatDayMonthYear, formatHourMinute } from "@/lib/date-format";
import {
  missionIsPublished,
  missionLocationLabel,
  missionNeedsAction,
  missionStageLabel,
  type MissionInboxItem,
} from "@/lib/mission-inbox-state";
import { Pagination } from "@/components/shared/pagination";
import { useAuth } from "@/lib/auth-store";

/**
 * 15 thẻ mỗi trang khi không ai nói khác: đủ kín một màn hình rộng ở tab Nhiệm
 * vụ, nơi hộp nhiệm vụ là thứ DUY NHẤT trên trang nên cuộn dài không đè lên gì.
 *
 * Trang Tổng quan xin số nhỏ hơn vì ở đó hộp nhiệm vụ chỉ là một khối trong
 * chồng khối; 15 thẻ đẩy tồn kho, sự cố và mượn — trả xuống dưới tầm nhìn.
 */
const DEFAULT_MISSIONS_PER_PAGE = 15;

const SORT_OPTIONS: { value: MissionInboxSort; label: string }[] = [
  { value: "newest", label: "Mới nhất trước" },
  { value: "oldest", label: "Cũ nhất trước" },
  { value: "most-people", label: "Nhiều người gặp nạn nhất" },
  { value: "fewest-people", label: "Ít người gặp nạn nhất" },
];

const SEARCH_FIELDS: {
  value: MissionSearchField;
  label: string;
  placeholder: string;
  numeric: boolean;
}[] = [
  {
    value: "text",
    label: "Địa điểm",
    placeholder: "Tìm kiếm",
    numeric: false,
  },
  {
    value: "mission-no",
    label: "Số thứ tự",
    placeholder: "Ví dụ: 98",
    numeric: true,
  },
  {
    value: "affected-people",
    label: "Số người gặp nạn",
    placeholder: "Ví dụ: 300",
    numeric: true,
  },
];

const FILTER_OPTIONS: { value: MissionInboxFilter; label: string }[] = [
  { value: "all", label: "Tất cả" },
  { value: "needs-action", label: "Cần xử lý" },
  { value: "published", label: "Đã duyệt" },
];

const INCIDENT_LABELS: Record<string, string> = {
  FLOOD: "Lũ lụt",
  STORM: "Bão",
  LANDSLIDE: "Sạt lở",
  FIRE: "Cháy",
  ISOLATION: "Cô lập",
  OTHER: "Khác",
};

interface MissionInboxProps {
  selectedMissionId: string | null;
  role?: string;
  warehouseId?: string | null;
  /** Mở nhiệm vụ theo SỐ HIỆU — đó là thứ nằm trên đường dẫn. */
  onSelect: (missionNo: number) => void;
  /** Số thẻ mỗi trang. Trang nào có khối khác bên dưới thì nên xin ít hơn. */
  pageSize?: number;
}

export function MissionInbox({
  selectedMissionId,
  role,
  warehouseId,
  onSelect,
  pageSize = DEFAULT_MISSIONS_PER_PAGE,
}: MissionInboxProps) {
  const communeName = useAuth((state) => state.user?.communeName);
  const [search, setSearch] = useState("");
  const [searchField, setSearchField] = useState<MissionSearchField>("text");
  const [sort, setSort] = useState<MissionInboxSort>("newest");
  const [filter, setFilter] = useState<MissionInboxFilter>("all");
  const [page, setPage] = useState(1);

  /**
   * Hoãn ô tìm nửa giây trước khi gọi API.
   *
   * Tìm kiếm giờ chạy ở máy chủ, nên mỗi ký tự gõ ra là một lượt truy vấn cơ sở
   * dữ liệu. Gõ "Long Châu" là chín lượt, mà tám lượt đầu không ai kịp đọc.
   */
  const [searchQuery, setSearchQuery] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setSearchQuery(search), 500);
    return () => clearTimeout(timer);
  }, [search]);

  /**
   * Đổi bộ lọc, cách xếp hay ô tìm thì về trang 1.
   *
   * Không về thì người đang ở trang 6 lọc lại còn 2 trang sẽ xin một trang không
   * tồn tại. Backend có kéo về trang cuối, nhưng người dùng vẫn nhảy tới một chỗ
   * họ không chọn — về đầu là thứ họ mong đợi sau khi đổi điều kiện.
   */
  useEffect(() => {
    setPage(1);
  }, [searchQuery, searchField, sort, filter]);

  const inboxQuery = useQuery({
    // Giữ tiền tố ["missions","inbox"] vì các mutation khắp app vô hiệu hoá theo
    // đúng tiền tố đó sau khi đổi nhiệm vụ.
    queryKey: [
      "missions",
      "inbox",
      role,
      warehouseId,
      page,
      // Kích thước trang nằm TRONG khoá: thiếu nó thì hai màn hình dùng chung
      // một ô nhớ đệm, và trang xin 9 thẻ sẽ vẽ lại đúng 15 thẻ mà màn hình kia
      // vừa tải về.
      pageSize,
      sort,
      filter,
      searchQuery,
      searchField,
    ],
    queryFn: () =>
      listMissionInbox({
        page,
        pageSize,
        sort,
        filter,
        search: searchQuery,
        searchField,
      }),
    enabled: Boolean(role),
    refetchInterval: 5000,
    // Giữ trang cũ trên màn hình trong lúc tải trang mới: không giữ thì mỗi lượt
    // hỏi định kỳ 5 giây lại chớp qua khung xương, và danh sách nhấp nháy liên tục.
    placeholderData: keepPreviousData,
  });

  const activeSearchField =
    SEARCH_FIELDS.find((item) => item.value === searchField) ?? SEARCH_FIELDS[0];
  const data = inboxQuery.data;
  const missions = data?.items ?? [];
  const isLoading = inboxQuery.isPending;
  const error = inboxQuery.error;

  return (
    <section className="app-panel p-4 md:p-5" aria-labelledby="mission-inbox-title">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            {/* Tên xã nằm ngay trên tiêu đề: một xã có nhiều quản trị viên cùng
                duyệt, và tài khoản nào cũng chỉ thấy nhiệm vụ của xã mình — nói
                rõ ra thì không ai phải đoán danh sách này gồm phạm vi nào. */}
            <h2 id="mission-inbox-title" className="text-base font-semibold">
              {communeName
                ? `Danh sách nhiệm vụ cứu hộ của xã ${communeName}`
                : "Danh sách nhiệm vụ cứu hộ"}
            </h2>
            {/* Tổng THẬT do backend đếm trên cả bảng, không phải số dòng đang
                nằm trên trang này. Trước đây nó là độ dài mảng đã tải, mà mảng
                đó bị chặn ở 100 — hộp có 104 nhiệm vụ vẫn cứ hiện 100. */}
            {data && (
              <span className="rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-xs font-semibold text-[var(--text-muted)]">
                {data.totalAll.toLocaleString("vi-VN")}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Có thể tìm kiếm, lọc và sắp xếp nhiệm vụ.
          </p>
        </div>

        {/* Chọn trường trước, gõ sau — nằm cạnh nhau vì đọc thành một câu: "tìm
            theo SỐ THỨ TỰ: 98". Tách ra hai chỗ thì người dùng gõ xong mới phát
            hiện mình đang tìm nhầm trường. */}
        <div className="flex w-full gap-2 lg:max-w-sm">
          <label htmlFor="mission-search-field" className="sr-only">
            Tìm theo trường nào
          </label>
          <select
            id="mission-search-field"
            value={searchField}
            onChange={(event) => {
              setSearchField(event.target.value as MissionSearchField);
              // Xoá luôn từ khoá cũ: "Long Châu" giữ lại khi vừa chuyển sang tìm
              // theo số thì không bao giờ khớp, và danh sách trống trơn trông
              // như hỏng chứ không như "chưa nhập gì".
              setSearch("");
            }}
            className="select-field shrink-0 rounded-md border bg-[var(--surface)] py-2 pl-3 text-sm"
          >
            {SEARCH_FIELDS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <label htmlFor="mission-search" className="sr-only">
            Từ khoá tìm nhiệm vụ
          </label>
          <input
            id="mission-search"
            type={activeSearchField.numeric ? "number" : "search"}
            min={activeSearchField.numeric ? 0 : undefined}
            inputMode={activeSearchField.numeric ? "numeric" : undefined}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={activeSearchField.placeholder}
            className="w-full min-w-0 rounded-md border bg-[var(--surface)] px-3 py-2 text-sm outline-none transition focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent)]/20"
          />
        </div>
      </div>

      {/* Lọc là các nút bấm thấy ngay, còn sắp xếp là ô chọn: lọc được dùng liên
          tục trong một ca trực nên phải bấm một nhát, còn sắp xếp thì đổi vài lần
          một buổi — cho nó bốn nút nữa thì thanh này dài mà chẳng ai bấm. */}
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Lọc nhiệm vụ">
          {FILTER_OPTIONS.map((option) => {
            const active = filter === option.value;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={active}
                onClick={() => setFilter(option.value)}
                className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${
                  active
                    ? "border-[var(--color-accent)] bg-[var(--color-accent)] text-[var(--color-accent-fg)]"
                    : "hover:bg-[var(--surface-2)]"
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <label className="shrink-0 text-sm text-[var(--text-muted)]" htmlFor="mission-sort">
            Sắp xếp
          </label>
          <select
            id="mission-sort"
            value={sort}
            onChange={(event) => setSort(event.target.value as MissionInboxSort)}
            className="select-field rounded-md border bg-[var(--surface)] py-2 pl-3 text-sm"
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-4">
        {isLoading ? (
          <div
            className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
            aria-label="Đang tải nhiệm vụ"
            aria-busy="true"
          >
            {[0, 1, 2].map((item) => (
              <div
                key={item}
                className="h-32 animate-pulse rounded-lg border bg-[var(--surface-2)]"
              />
            ))}
          </div>
        ) : error ? (
          <div
            role="alert"
            className="flex flex-col items-start gap-3 rounded-lg border border-[var(--color-critical)]/30 bg-[var(--color-critical)]/5 p-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <p className="text-sm">
              Chưa tải được danh sách nhiệm vụ. Kết nối có thể đang gián đoạn.
            </p>
            <button
              type="button"
              onClick={() => void inboxQuery.refetch()}
              className="rounded-md border px-3 py-2 text-sm font-semibold transition hover:bg-[var(--surface-2)] active:translate-y-px"
            >
              Thử lại
            </button>
          </div>
        ) : missions.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-center">
            {/* Lọc ra không có gì KHÁC với hộp vốn trống: câu "nhiệm vụ mới sẽ
                xuất hiện tại đây" nói sai hẳn khi người dùng vừa tự tay lọc, và
                họ đi tìm lỗi ở chỗ không có lỗi. */}
            <p className="text-sm font-medium">
              {searchQuery || filter !== "all"
                ? "Không tìm thấy nhiệm vụ phù hợp"
                : "Chưa có nhiệm vụ nào"}
            </p>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              {searchQuery
                ? "Thử tên địa điểm hoặc loại tình huống khác."
                : filter !== "all"
                  ? "Bỏ bộ lọc để xem toàn bộ nhiệm vụ."
                  : "Nhiệm vụ mới sẽ xuất hiện tại đây."}
            </p>
          </div>
        ) : (
          /* Danh sách chảy theo cả trang, không còn khung cuộn riêng.

             Khung cuộn cũ là cách xoay xở khi cả trăm nhiệm vụ đổ vào một chỗ:
             nó nhốt danh sách vào một ô cao 62vh, tức người dùng cuộn trong một
             ô nhỏ nằm giữa trang đang cuộn — hai thanh cuộn lồng nhau, và phần
             lớn màn hình bỏ trống. Phân trang giải quyết đúng gốc vấn đề đó, nên
             khung cuộn không còn lý do tồn tại.

             Trang này chỉ có mỗi hộp nhiệm vụ nên không còn khối nào bên dưới bị
             danh sách dài đẩy khỏi màn hình. */
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {missions.map((mission) => {
              const selected = mission.id === selectedMissionId;
              const needsAction = missionNeedsAction(mission, role, warehouseId);
              const incidentLabel = INCIDENT_LABELS[mission.incidentType] ?? mission.incidentType;
              const locationLabel = missionLocationLabel(mission);
              return (
                <button
                  key={mission.id}
                  type="button"
                  onClick={() => onSelect(mission.missionNo)}
                  aria-current={selected ? "true" : undefined}
                  className={`min-h-32 rounded-lg border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 ${
                    selected
                      ? "border-[var(--color-accent)] bg-[var(--color-accent)]/5"
                      : "bg-[var(--surface)] hover:border-[var(--text-muted)]/60 hover:bg-[var(--surface-2)]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      {/* Số hiệu là thứ người trực đọc cho nhau qua bộ đàm, nên nó
                          đứng đầu thẻ. Thiếu số (dữ liệu cũ chưa kịp đánh) thì bỏ
                          hẳn dòng, đừng in "Nhiệm vụ số undefined". */}
                      {mission.missionNo != null && (
                        <p className="font-semibold">Nhiệm vụ số {mission.missionNo}</p>
                      )}
                      {/* Loại tình huống gộp vào cuối dòng địa điểm: hai dòng riêng
                          làm thẻ cao thêm mà phần trên chỉ mang đúng một từ.

                          Không có dòng địa điểm thì bỏ luôn cặp ngoặc — ghép máy
                          móc sẽ ra " (Lũ lụt)" thừa một dấu cách đầu dòng. */}
                      <p className="mt-0.5 line-clamp-1 text-sm text-[var(--text-muted)]">
                        {locationLabel ? `${locationLabel} (${incidentLabel})` : incidentLabel}
                      </p>
                    </div>
                    <MissionCardBadge mission={mission} needsAction={needsAction} />
                  </div>
                  <div className="mt-4 text-xs">
                    <p className="font-medium">{missionStageLabel(mission)}</p>
                    {/* Số người và thời gian đứng CÙNG một hàng, không phải một cột
                        chữ bên trái với cái đồng hồ dính đáy bên phải. Trước đây
                        dòng trạng thái dài ngắn khác nhau giữa các thẻ nên hai con
                        số đó nằm lệch nhau mỗi thẻ một kiểu, đọc lướt cả lưới thẻ
                        thì không dóng hàng vào đâu được. */}
                    <div className="mt-1 flex items-baseline justify-between gap-3 text-[var(--text-muted)]">
                      <span className="truncate">
                        {mission.affectedPeople.toLocaleString("vi-VN")} người
                      </span>
                      {/* `whitespace-nowrap`: giờ kèm ngày đầy đủ là chuỗi dài, thẻ
                          hẹp lại là nó tự ngắt thành hai dòng và cắt đôi ngày tháng. */}
                      <time
                        dateTime={mission.createdAt}
                        className="tabular shrink-0 whitespace-nowrap text-right"
                      >
                        {formatMissionTime(mission.createdAt)}
                      </time>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Phân trang nằm ngoài vùng tabpanel có điều kiện: để bên trong thì mỗi
          nhánh (đang tải / lỗi / rỗng) phải tự nhớ dựng nó, và nhánh quên là chỗ
          người dùng kẹt lại ở trang cuối không có đường ra. */}
      {data && !error && (
        <Pagination
          page={data.page}
          pageSize={data.pageSize}
          totalItems={data.total}
          totalPages={data.totalPages}
          onPageChange={setPage}
          showJump
          showSummary={false}
          padding="mt-5 py-4"
        />
      )}
    </section>
  );
}

/**
 * Huy hiệu góc phải của thẻ nhiệm vụ.
 *
 * Ba trạng thái, ba màu, không chồng nhau:
 * - CAM "Cần xử lý": việc đang chờ chính người đang đăng nhập. Trước đây dùng
 *   xanh lá — cùng màu với nút xác nhận khắp app, nên nó đọc như "đã xong" chứ
 *   không phải "hãy làm đi".
 * - XANH LÁ "Đã duyệt": đã phát hành, việc đã chuyển sang kho hoặc hiện trường.
 * - XANH LÁ "Đã hoàn thành": hiện trường đã giao và báo kết quả, nhiệm vụ đóng.
 *   Vẫn cùng sắc xanh với "Đã duyệt" vì cả hai đều là diễn biến tốt; chữ mới là
 *   thứ phân biệt "đang chạy" với "xong rồi".
 * - Không huy hiệu: còn nháp mà chưa tới lượt mình, hoặc đã huỷ.
 *
 * "Cần xử lý" thắng khi cả hai cùng đúng (nhiệm vụ bị hiện trường từ chối vừa là
 * đã phát hành, vừa là việc ADMIN phải xử lý ngay): người dùng cần biết phải LÀM
 * gì trước khi cần biết nó đã đi tới đâu.
 */
function MissionCardBadge({
  mission,
  needsAction,
}: {
  mission: MissionInboxItem;
  needsAction: boolean;
}) {
  const chip =
    "shrink-0 rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-white";

  if (needsAction) {
    return (
      // Cam của token --color-degraded quá sáng để chữ trắng đọc rõ ở cỡ 10px in
      // đậm, nên tối đi hẳn hai nhịp — vẫn đúng sắc cam của hệ màu, nhưng đủ tương
      // phản để đọc lướt qua cả lưới thẻ mà vẫn nhận ra ngay.
      <span
        className={chip}
        style={{ background: "color-mix(in oklch, var(--color-degraded) 80%, black)" }}
      >
        Cần xử lý
      </span>
    );
  }

  // Đứng TRƯỚC nhánh "Đã duyệt": nhiệm vụ đã đóng vẫn thoả `missionIsPublished`,
  // nên xếp sau thì huy hiệu mãi mãi dừng ở "Đã duyệt" dù hiện trường đã báo xong.
  if (mission.status === "COMPLETED") {
    return (
      <span className={chip} style={{ background: "var(--color-accent)" }}>
        Đã hoàn thành
      </span>
    );
  }

  if (missionIsPublished(mission)) {
    return (
      <span className={chip} style={{ background: "var(--color-accent)" }}>
        Đã duyệt
      </span>
    );
  }

  return null;
}

/**
 * Giờ rồi tới ngày đủ năm: "14:35 - 05/09/2026".
 *
 * Phần ghép chữ số nằm ở `lib/date-format` và dùng chung với nhật ký hậu kiểm; lý
 * do không dùng `Intl` ghi ở đó. Riêng thẻ nhiệm vụ giữ dấu gạch giữa hai vế: thẻ
 * hẹp, hai cụm số dính nhau bằng một dấu cách thì đọc lướt dễ dính thành một chuỗi.
 */
function formatMissionTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Không rõ thời gian";
  }
  return `${formatHourMinute(date)} - ${formatDayMonthYear(date)}`;
}

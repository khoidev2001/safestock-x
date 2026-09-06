"use client";

import { use } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ColorIcon } from "@/components/shared/color-icon";
import { DashboardPage } from "@/components/dashboard/dashboard-page";
import { MissionView } from "@/components/mission/mission-view";
import { getMission, getMissionByNo } from "@/lib/mission-api";
import { missionNoFromSlug, missionStageLabel } from "@/lib/mission-inbox-state";

/**
 * Trang riêng của một nhiệm vụ, địa chỉ theo SỐ HIỆU: /missions/nhiem-vu-103.
 *
 * Đường dẫn cũ dùng cuid nên nhìn thanh địa chỉ không biết đang mở nhiệm vụ nào —
 * mở vài tab là lẫn hết. Số hiệu vốn là thứ người trực gọi cho nhau, nên nó mới
 * đáng nằm trên URL.
 *
 * Phải tra một lượt để đổi số hiệu thành id vì mọi khối bên trong `MissionView`
 * đều gọi API theo id. Đổi hết chúng sang số hiệu là sửa hàng chục điểm gọi để
 * tiết kiệm đúng một lượt mạng lúc mở trang.
 */
export default function MissionByNumberPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const missionNo = missionNoFromSlug(decodeURIComponent(slug));

  const missionQuery = useQuery({
    queryKey: ["mission-by-no", missionNo],
    queryFn: () => getMissionByNo(missionNo as number),
    enabled: missionNo !== null,
  });
  const missionId = missionQuery.data?.id;

  /**
   * Bản đang sống của nhiệm vụ, dùng CHUNG khoá cache với `MissionView`.
   *
   * Lượt tra theo số hiệu ở trên chỉ chạy MỘT lần lúc mở trang: nó tồn tại để đổi
   * số hiệu thành id. Mọi thao tác bên trong — lập bản tham mưu, lập kế hoạch cứu
   * hộ, duyệt và phát hành — đều làm mới khoá `["mission", id]` chứ không đụng tới
   * `["mission-by-no", ...]`. Đọc phụ đề từ lượt tra kia thì nó đứng yên ở trạng
   * thái lúc mở trang: người trực lập xong kế hoạch, nhìn lên vẫn thấy "Bản nháp",
   * trong khi thẻ ngoài danh sách đã ghi đúng.
   *
   * Đọc thẳng khoá của `MissionView` thì phụ đề và nội dung luôn kể cùng một câu
   * chuyện, và không tốn thêm lượt mạng nào: hai bên chung một bản dữ liệu.
   */
  const liveMissionQuery = useQuery({
    queryKey: ["mission", missionId],
    queryFn: () => getMission(missionId as string),
    enabled: Boolean(missionId),
  });

  const mission = liveMissionQuery.data ?? missionQuery.data;

  return (
    <DashboardPage
      // Số hiệu lấy thẳng từ đường dẫn nên tiêu đề hiện ngay, không đợi lượt tra.
      // Trạng thái thì phải chờ dữ liệu — để trống còn hơn nhấp nháy một câu sai.
      title={missionNo === null ? "Không tìm thấy nhiệm vụ" : `Nhiệm vụ số ${missionNo}`}
      subtitle={mission ? missionStageLabel(mission) : ""}
      topSlot={
        <Link
          href="/missions"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--text-muted)] transition hover:text-[var(--text)]"
        >
          <ColorIcon name="left" size={16} tone="blue" />
          Trở lại
        </Link>
      }
    >
      {(warehouseId) => {
        if (missionNo === null || missionQuery.isError) {
          return <NotFound slug={slug} />;
        }
        if (!mission) {
          return (
            <div
              className="app-panel h-40 animate-pulse bg-[var(--surface-2)]"
              aria-label="Đang mở nhiệm vụ"
              aria-busy
            />
          );
        }
        return <MissionView warehouseId={warehouseId} missionId={mission.id} />;
      }}
    </DashboardPage>
  );
}

function NotFound({ slug }: { slug: string }) {
  return (
    <section className="app-panel p-6 text-center" role="alert">
      <p className="font-semibold">Không tìm thấy nhiệm vụ</p>
      <p className="mt-1 text-sm text-[var(--text-muted)]">
        Đường dẫn <span className="tabular">{slug}</span> không ứng với nhiệm vụ nào. Nhiệm vụ có
        thể đã bị xoá, hoặc thuộc xã khác.
      </p>
      <Link
        href="/missions"
        className="mt-4 inline-block rounded-md border px-4 py-2 text-sm font-semibold transition hover:bg-[var(--surface-2)]"
      >
        Về hộp nhiệm vụ
      </Link>
    </section>
  );
}

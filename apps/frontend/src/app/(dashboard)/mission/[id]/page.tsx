"use client";

import { use } from "react";
import { DashboardPage } from "@/components/dashboard/dashboard-page";
import { MissionView } from "@/components/mission/mission-view";

/**
 * Trang riêng của một nhiệm vụ.
 *
 * Tab điều phối (/mission) giữ lại đúng hai việc: khai tình huống mới và xem hộp
 * nhiệm vụ. Mọi khối thuộc về một nhiệm vụ cụ thể — sẵn sàng, yêu cầu vật tư theo
 * SKU, bản tham mưu, cập nhật hiện trường, tiến trình và kế hoạch — nằm ở đây.
 */
export default function MissionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <DashboardPage>
      {(warehouseId) => (
        <MissionView warehouseId={warehouseId} missionId={decodeURIComponent(id)} />
      )}
    </DashboardPage>
  );
}

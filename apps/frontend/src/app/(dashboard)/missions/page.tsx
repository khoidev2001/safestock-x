"use client";

import { Suspense } from "react";
import { DashboardPage } from "@/components/dashboard/dashboard-page";
import { MissionView } from "@/components/mission/mission-view";

/**
 * Tab Nhiệm vụ: hộp nhiệm vụ và lối vào trang chi tiết.
 *
 * Tách khỏi tab Điều phối cứu hộ vì hai đầu việc khác nhau: khai một tình huống
 * mới là việc của lúc vừa nhận tin, còn theo dõi các nhiệm vụ đang chạy là việc
 * làm suốt buổi — thường của người khác, vào lúc khác. Gộp chung thì trang dài
 * lê thê và ai vào cũng phải cuộn qua phần không thuộc việc của mình.
 */
export default function MissionsPage() {
  return (
    <DashboardPage>
      {(warehouseId) => (
        <Suspense
          fallback={
            <div
              className="app-panel h-40 animate-pulse bg-[var(--surface-2)]"
              aria-label="Đang mở hộp nhiệm vụ"
              aria-busy
            />
          }
        >
          <MissionView warehouseId={warehouseId} variant="danh-sach" />
        </Suspense>
      )}
    </DashboardPage>
  );
}

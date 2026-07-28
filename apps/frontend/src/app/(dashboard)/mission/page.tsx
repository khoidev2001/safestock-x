"use client";

import { Suspense } from "react";
import { DashboardPage } from "@/components/dashboard/dashboard-page";
import { MissionView } from "@/components/mission/mission-view";

export default function MissionPage() {
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
          <MissionView warehouseId={warehouseId} />
        </Suspense>
      )}
    </DashboardPage>
  );
}

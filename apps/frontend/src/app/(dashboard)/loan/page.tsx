"use client";

import { DashboardPage } from "@/components/dashboard/dashboard-page";
import { InterCommuneLoanPanel } from "@/components/dashboard/inter-commune-loan-panel";
import { LoanView } from "@/components/dashboard/loan-view";

export default function LoanPage() {
  return (
    <DashboardPage>
      {(warehouseId) => (
        <div className="space-y-5">
          {/* Mượn liên xã lên TRƯỚC: đây là khoản nợ với đơn vị khác, có hạn và
              có người bên ngoài đang chờ. Mượn trong xã là việc nội bộ, sai sót
              còn sửa được ngay tại chỗ. */}
          <InterCommuneLoanPanel warehouseId={warehouseId} />
          <LoanView warehouseId={warehouseId} />
        </div>
      )}
    </DashboardPage>
  );
}

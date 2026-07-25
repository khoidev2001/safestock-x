"use client";

import { DashboardPage } from "@/components/dashboard/dashboard-page";
import { AuditView } from "@/components/dashboard/audit-view";

export default function AuditPage() {
  return <DashboardPage standalone>{() => <AuditView />}</DashboardPage>;
}

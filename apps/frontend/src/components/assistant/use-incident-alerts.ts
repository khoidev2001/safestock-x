"use client";

import { useEffect } from "react";
import type { IncidentSummary } from "@/lib/dashboard-api";
import { useIncidentAlerts } from "@/lib/incident-alert-store";

const CRITICAL_SEVERITIES = new Set(["HIGH", "CRITICAL"]);

/**
 * Cầu nối: theo dõi danh sách sự cố (query open-incidents). Khi 1 sự cố có `explanation`
 * (AI enrich xong) và CHƯA từng đẩy → thêm bong bóng cảnh báo vào trợ lý chat; nếu mức
 * HIGH/CRITICAL → yêu cầu tự mở trợ lý. Dedupe theo id trong store (chống lặp khi refetch).
 */
export function useIncidentAlertsBridge(incidents: IncidentSummary[] | undefined): void {
  const pushAlert = useIncidentAlerts((s) => s.pushAlert);
  const requestAutoOpen = useIncidentAlerts((s) => s.requestAutoOpen);
  const seenExplainedIds = useIncidentAlerts((s) => s.seenExplainedIds);

  useEffect(() => {
    if (!incidents) return;
    for (const inc of incidents) {
      if (!inc.explanation) continue; // chưa có giải thích AI → chờ enrich
      if (seenExplainedIds.has(inc.id)) continue; // đã đẩy rồi
      pushAlert({ id: inc.id, title: inc.title, severity: inc.severity, explanation: inc.explanation });
      if (CRITICAL_SEVERITIES.has(inc.severity)) requestAutoOpen();
    }
  }, [incidents, pushAlert, requestAutoOpen, seenExplainedIds]);
}

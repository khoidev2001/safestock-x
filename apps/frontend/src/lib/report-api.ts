import { apiFetch, BASE } from "./api";
import { useAuth } from "./auth-store";

export type ReportStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface StockReport {
  id: string;
  warehouseId: string;
  period: string;
  status: ReportStatus;
  createdAt: string;
  warehouse?: { name: string };
  submittedBy?: { fullName: string };
  rows?: ReportRow[];
  note?: string | null;
}

export interface ReportRow {
  sku: string;
  itemName: string;
  quantity: number;
  unit: string;
  expiryDate: string | null;
  condition: string | null;
  note: string | null;
}

/** Upload Excel kiểm kê (multipart) — không dùng apiFetch vì cần FormData, tự gắn token. */
export async function uploadReport(
  warehouseId: string,
  period: string,
  file: File,
): Promise<StockReport> {
  const form = new FormData();
  form.append("file", file);
  form.append("warehouseId", warehouseId);
  form.append("period", period);
  const token = useAuth.getState().token;
  const res = await fetch(`${BASE}/api/reports/upload`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(data?.message ?? `Lỗi ${res.status}`);
  return data;
}

export function listReports(status?: ReportStatus): Promise<StockReport[]> {
  return apiFetch<StockReport[]>(`/api/reports${status ? `?status=${status}` : ""}`);
}

export function getReport(id: string): Promise<StockReport> {
  return apiFetch<StockReport>(`/api/reports/${id}`);
}

export function approveReport(id: string): Promise<unknown> {
  return apiFetch(`/api/reports/${id}/approve`, { method: "POST" });
}

export function rejectReport(id: string, note?: string): Promise<unknown> {
  return apiFetch(`/api/reports/${id}/reject`, { method: "POST", body: JSON.stringify({ note }) });
}

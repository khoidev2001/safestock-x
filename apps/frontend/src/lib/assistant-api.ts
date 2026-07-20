import { apiFetch } from "./api";

export function askAssistant(warehouseId: string, question: string): Promise<{ answer: string }> {
  return apiFetch<{ answer: string }>(`/api/assistant/warehouses/${warehouseId}/ask`, {
    method: "POST",
    body: JSON.stringify({ question }),
  });
}

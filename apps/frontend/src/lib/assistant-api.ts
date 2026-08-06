import { apiFetch } from "./api";

/** Tín hiệu sự việc cần điều phối, do backend nhận diện bằng luật cố định. */
export interface EmergencySignal {
  location: string | null;
  affectedPeople: number | null;
}

export interface AssistantAnswer {
  answer: string;
  emergency?: EmergencySignal;
}

export function askAssistant(warehouseId: string, question: string): Promise<AssistantAnswer> {
  return apiFetch<AssistantAnswer>(`/api/assistant/warehouses/${warehouseId}/ask`, {
    method: "POST",
    body: JSON.stringify({ question }),
  });
}

import { apiFetch, apiStream } from "./api";

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

/** Một mẩu tin trên đường trả lời đang chảy. */
export interface AssistantChunk {
  /** Chữ nối thêm vào cuối câu đang hiện. */
  delta?: string;
  /** Thay TRỌN câu đang hiện — lớp chống bịa số ở ai-service dùng đường này. */
  replace?: string;
  emergency?: EmergencySignal;
  error?: string;
}

/**
 * Hỏi trợ lý và nhận chữ chảy dần.
 *
 * Mỗi mẩu tin trả về nguyên dạng cho bên gọi tự ghép, vì `replace` phải xoá sạch
 * phần đã hiện chứ không nối thêm — gộp sẵn ở đây thì bên gọi mất khả năng phân
 * biệt hai việc đó.
 *
 * `signal` để người dùng bỏ ngang hoặc rời màn hình thì ngắt luôn, không để mô
 * hình chạy tiếp cho hư không.
 */
export async function* streamAssistant(
  warehouseId: string,
  question: string,
  signal?: AbortSignal,
): AsyncGenerator<AssistantChunk> {
  const response = await apiStream(`/api/assistant/warehouses/${warehouseId}/ask/stream`, {
    method: "POST",
    body: JSON.stringify({ question }),
    signal,
  });

  const doc = response.body!.getReader();
  const boGiaiMa = new TextDecoder();
  let conLai = "";

  try {
    for (;;) {
      const { done, value } = await doc.read();
      if (done) break;
      conLai += boGiaiMa.decode(value, { stream: true });

      // Mẩu cuối chưa chắc trọn một sự kiện — giữ lại chờ khối sau.
      const cacPhan = conLai.split("\n\n");
      conLai = cacPhan.pop() ?? "";
      for (const phan of cacPhan) {
        const dong = phan.trim();
        if (!dong.startsWith("data:")) continue;
        const than = dong.slice(5).trim();
        if (than === "[DONE]") return;
        try {
          yield JSON.parse(than) as AssistantChunk;
        } catch {
          // Một mẩu hỏng thì bỏ qua, đừng làm đứt cả câu trả lời đang chạy dở.
        }
      }
    }
  } finally {
    await doc.cancel().catch(() => undefined);
  }
}

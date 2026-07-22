/**
 * Build context (prompt) cho LLM giải thích 1 sự cố — hàm THUẦN (không DB, test được).
 *
 * Dùng chung cho:
 *  - IncidentController POST /:id/explain (giải thích thủ công qua API).
 *  - IncidentService.enrichNewIncident (AI tự giải thích khi sự cố mới bật).
 *
 * Nguyên tắc: context CHỈ chứa số đã tính (tiêu đề + mức độ + độ tin cậy + bằng chứng
 * theo thời gian). LLM diễn giải, KHÔNG bịa thêm số — prompt _EXPLAIN_SYSTEM ràng buộc.
 */

export interface IncidentContextInput {
  title: string;
  severity: string;
  confidence: number;
  evidence: { note: string | null; occurredAt: Date }[];
}

export function buildIncidentContext(incident: IncidentContextInput): string {
  const timeline = incident.evidence
    .map((e) => `${new Date(e.occurredAt).toLocaleTimeString("vi")} — ${e.note ?? ""}`)
    .join("\n");
  return [
    `Sự cố: ${incident.title} (mức ${incident.severity}, độ tin cậy ${Math.round(incident.confidence * 100)}%).`,
    `Các bằng chứng theo thời gian:`,
    timeline,
  ].join("\n");
}

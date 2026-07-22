import { create } from "zustand";

/** 1 bong bóng cảnh báo AI (sự cố mới đã được backend giải thích). */
export interface IncidentAlert {
  id: string; // = incident id (dedupe)
  title: string;
  severity: string;
  explanation: string;
}

interface IncidentAlertState {
  alerts: IncidentAlert[]; // hàng đợi hiển thị trong trợ lý chat
  seenExplainedIds: Set<string>; // đã đẩy bong bóng cho incident nào (chống lặp khi refetch/reconnect)
  autoOpenReq: number; // tăng khi cần tự mở trợ lý (sự cố nghiêm trọng)
  pushAlert: (alert: IncidentAlert) => void;
  requestAutoOpen: () => void;
  clearAutoOpen: () => void;
  reset: () => void;
}

/**
 * Cầu nối cảnh báo AI → trợ lý chat + tự mở. Không persist (session-only): tin cảnh báo
 * là realtime, không cần giữ qua reload. Nguồn sự thật là query open-incidents (có
 * severity + explanation); store chỉ giữ hàng đợi hiển thị + cờ tự mở.
 */
export const useIncidentAlerts = create<IncidentAlertState>((set, get) => ({
  alerts: [],
  seenExplainedIds: new Set(),
  autoOpenReq: 0,
  pushAlert: (alert) => {
    if (get().seenExplainedIds.has(alert.id)) return; // đã đẩy → bỏ qua
    set((state) => {
      const seen = new Set(state.seenExplainedIds);
      seen.add(alert.id);
      // Giữ tối đa 20 bong bóng gần nhất để không phình vô hạn.
      const alerts = [...state.alerts, alert].slice(-20);
      return { alerts, seenExplainedIds: seen };
    });
  },
  requestAutoOpen: () => set((state) => ({ autoOpenReq: state.autoOpenReq + 1 })),
  clearAutoOpen: () => set({ autoOpenReq: 0 }),
  reset: () => set({ alerts: [], seenExplainedIds: new Set(), autoOpenReq: 0 }),
}));

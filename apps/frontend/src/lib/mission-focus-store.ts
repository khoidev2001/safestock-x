import { create } from "zustand";

/**
 * Store chia sẻ để mở đúng 1 nhiệm vụ từ thông báo (chuông) → tab Nhiệm vụ.
 * Bell set focusMissionId + đổi tab; MissionView đọc rồi tự clear để lần sau
 * bấm cùng mission vẫn kích hoạt lại (set lại id khác reference).
 */
export type MissionFocusKind = "mission" | "operator-report" | "warehouse-request";

interface MissionFocusState {
  focusMissionId: string | null;
  focusKind: MissionFocusKind;
  focusMission: (id: string, kind?: MissionFocusKind) => void;
  clearFocus: () => void;
}

export const useMissionFocus = create<MissionFocusState>((set) => ({
  focusMissionId: null,
  focusKind: "mission",
  focusMission: (id, kind = "mission") => set({ focusMissionId: id, focusKind: kind }),
  clearFocus: () => set({ focusMissionId: null, focusKind: "mission" }),
}));

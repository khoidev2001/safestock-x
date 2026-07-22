import { create } from "zustand";

/**
 * Store chia sẻ để mở đúng 1 nhiệm vụ từ thông báo (chuông) → tab Nhiệm vụ.
 * Bell set focusMissionId + đổi tab; MissionView đọc rồi tự clear để lần sau
 * bấm cùng mission vẫn kích hoạt lại (set lại id khác reference).
 */
interface MissionFocusState {
  focusMissionId: string | null;
  focusMission: (id: string) => void;
  clearFocus: () => void;
}

export const useMissionFocus = create<MissionFocusState>((set) => ({
  focusMissionId: null,
  focusMission: (id) => set({ focusMissionId: id }),
  clearFocus: () => set({ focusMissionId: null }),
}));

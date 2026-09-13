import type { SupplyGroup } from "@safestock/shared-types";
import { ColorIcon, type ColorIconName } from "@/components/shared/color-icon";

/**
 * Màu và hình riêng của từng nhóm vật tư.
 *
 * Chỉ một dòng tiêu đề xám thì mắt vẫn phải đọc chữ mới biết mình đang ở nhóm nào,
 * nhất là khi cuộn giữa chừng. Mỗi nhóm một màu, lặp lại thành vạch dọc ở mép trái
 * từng dòng, nên liếc là thấy ranh giới nhóm.
 *
 * Cố ý TRÁNH đỏ và xanh lá: trong cùng bảng, đỏ đang nói "thiếu hàng" và xanh lá
 * nói "đủ". Nhóm y tế tô đỏ thì dòng bộ sơ cứu đủ hàng trông như đang báo thiếu.
 */
export const SUPPLY_GROUP_STYLES: Readonly<
  Record<SupplyGroup, { icon: ColorIconName; text: string; tint: string; stripe: string }>
> = {
  FOOD: {
    icon: "supplyFood",
    text: "oklch(0.5 0.11 75)",
    tint: "oklch(0.97 0.035 90)",
    stripe: "oklch(0.8 0.15 85)",
  },
  WATER_HYGIENE: {
    icon: "supplyWater",
    text: "oklch(0.48 0.13 250)",
    tint: "oklch(0.96 0.025 245)",
    stripe: "oklch(0.65 0.15 250)",
  },
  LIFESAVING: {
    icon: "mission",
    text: "oklch(0.52 0.15 45)",
    tint: "oklch(0.96 0.03 55)",
    stripe: "oklch(0.7 0.17 50)",
  },
  SHELTER: {
    icon: "supplyShelter",
    text: "oklch(0.48 0.09 190)",
    tint: "oklch(0.96 0.025 190)",
    stripe: "oklch(0.68 0.11 190)",
  },
  MEDICAL: {
    icon: "supplyMedical",
    text: "oklch(0.48 0.16 330)",
    tint: "oklch(0.96 0.03 330)",
    stripe: "oklch(0.65 0.2 330)",
  },
  POWER_COMMS: {
    icon: "supplyPower",
    text: "oklch(0.45 0.13 285)",
    tint: "oklch(0.96 0.025 285)",
    stripe: "oklch(0.62 0.15 285)",
  },
  OTHER: {
    icon: "inventory",
    text: "oklch(0.45 0.02 245)",
    tint: "oklch(0.96 0.008 245)",
    stripe: "oklch(0.72 0.02 245)",
  },
};

/** Nội dung tiêu đề nhóm: hình + tên, căn giữa. Khung (hàng bảng hay khối) do chỗ gọi lo. */
export function SupplyGroupHeading({ group, label }: { group: SupplyGroup; label: string }) {
  const style = SUPPLY_GROUP_STYLES[group];
  return (
    <span
      className="flex items-center justify-center gap-1.5 text-sm font-semibold"
      style={{ color: style.text }}
    >
      <ColorIcon mono name={style.icon} size={16} />
      {label}
    </span>
  );
}

/** Vạch màu ở mép trái của một dòng vật tư — vẽ bằng bóng trong để không xô lệch cột. */
export function supplyGroupStripe(group: SupplyGroup) {
  return { boxShadow: `inset 4px 0 0 ${SUPPLY_GROUP_STYLES[group].stripe}` };
}

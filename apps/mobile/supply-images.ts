/**
 * TỆP SINH TỰ ĐỘNG — đừng sửa tay.
 *
 * Sinh lại sau khi thêm/bớt ảnh trong `assets/supplies/`:
 *   pnpm --filter @safestock/mobile supply-images
 *
 * Ảnh thật của từng món vật tư, tra theo mã vật tư. Món nào chưa có ảnh thì
 * không có trong bảng này, và ô nhận diện quay về icon emoji của nhóm.
 */
import type { ImageSourcePropType } from "react-native";

const SUPPLY_IMAGES: Record<string, ImageSourcePropType> = {
  "AQUATAB-01": require("./assets/supplies/aquatab-01.jpg"),
  "BATT-01": require("./assets/supplies/batt-01.jpg"),
  "BLANKET-01": require("./assets/supplies/blanket-01.jpg"),
  "BOAT-01": require("./assets/supplies/boat-01.jpg"),
  "BOOT-01": require("./assets/supplies/boot-01.jpg"),
  "CANVAS-01": require("./assets/supplies/canvas-01.jpg"),
  "FIRSTAID-01": require("./assets/supplies/firstaid-01.jpg"),
  "FOOD-RATION-01": require("./assets/supplies/food-ration-01.jpg"),
  "GENERATOR-01": require("./assets/supplies/generator-01.jpg"),
  "HYGIENE-KIT-01": require("./assets/supplies/hygiene-kit-01.jpg"),
  "LIFE-ADULT": require("./assets/supplies/life-adult.jpg"),
  "LIFE-CHILD": require("./assets/supplies/life-child.jpg"),
  "MEGAPHONE-01": require("./assets/supplies/megaphone-01.jpg"),
  "MILK-01": require("./assets/supplies/milk-01.jpg"),
  "MOSQUITO-NET-01": require("./assets/supplies/mosquito-net-01.jpg"),
  "NOODLE-01": require("./assets/supplies/noodle-01.jpg"),
  "POWERBANK-01": require("./assets/supplies/powerbank-01.jpg"),
  "RADIO-01": require("./assets/supplies/radio-01.jpg"),
  "RAINCOAT-01": require("./assets/supplies/raincoat-01.jpg"),
  "RICE-01": require("./assets/supplies/rice-01.jpg"),
  "RING-01": require("./assets/supplies/ring-01.jpg"),
  "ROPE-01": require("./assets/supplies/rope-01.jpg"),
  "SHOVEL-01": require("./assets/supplies/shovel-01.jpg"),
  "STRETCHER-01": require("./assets/supplies/stretcher-01.jpg"),
  "TORCH-01": require("./assets/supplies/torch-01.jpg"),
  "WATER-01": require("./assets/supplies/water-01.jpg"),
  "WATER-CAN-20L": require("./assets/supplies/water-can-20l.jpg"),
};

/** Ảnh thật của một mã vật tư, hoặc `undefined` nếu chưa có ảnh. */
export function supplyImageOf(sku: string): ImageSourcePropType | undefined {
  return SUPPLY_IMAGES[sku?.toUpperCase?.() ?? ""];
}

/** Số món đã có ảnh — dùng trong test và kiểm tra nhanh. */
export const SUPPLY_IMAGE_COUNT = 27;

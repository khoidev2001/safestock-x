/**
 * Ô nhận diện một món vật tư.
 *
 * Ưu tiên ảnh thật của món hàng — ngoài hiện trường, nhìn đúng cái thùng mì hay
 * đúng cái áo phao thì nhanh hơn đọc tên. Món nào chưa có ảnh thì quay về icon
 * emoji trên nền màu nhóm như trước, không để ô trống.
 */
import { Image, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { supplyImageOf } from "./supply-images";
import type { SupplyMeta } from "./supplies";

interface SupplyThumbProps {
  /** Mã vật tư — khoá tra ảnh. */
  sku: string;
  /** Icon + màu nhóm, dùng khi chưa có ảnh. */
  meta: SupplyMeta;
  /** Tên món, đọc cho trình đọc màn hình. */
  itemName?: string;
  /** Cạnh của ô vuông. */
  size: number;
  /** Cỡ icon emoji khi chưa có ảnh. */
  iconSize: number;
  borderRadius: number;
  style?: StyleProp<ViewStyle>;
}

export function SupplyThumb({
  sku,
  meta,
  itemName,
  size,
  iconSize,
  borderRadius,
  style,
}: SupplyThumbProps) {
  const image = supplyImageOf(sku);
  const box: ViewStyle = {
    width: size,
    height: size,
    borderRadius,
    alignItems: "center",
    justifyContent: "center",
  };

  if (!image) {
    return (
      <View style={[box, { backgroundColor: meta.tint }, style]}>
        <Text style={{ fontSize: iconSize }}>{meta.icon}</Text>
      </View>
    );
  }

  /* Ảnh sản phẩm gần như luôn nền trắng, nên nền ô cũng để trắng cho liền mạch;
     màu nhóm chuyển ra viền để mắt vẫn gom nhóm được như khi còn dùng icon. */
  return (
    <View
      style={[
        box,
        {
          backgroundColor: "#ffffff",
          borderWidth: 1,
          borderColor: meta.tint,
          overflow: "hidden",
          /* Đệm mỏng thôi: ảnh sản phẩm vốn đã có sẵn lề trắng quanh món hàng,
             cộng thêm đệm dày nữa thì món hàng co lại giữa một ô gần như trống. */
          padding: Math.max(2, Math.round(size * 0.04)),
        },
        style,
      ]}
    >
      <Image
        source={image}
        resizeMode="contain"
        style={{ width: "100%", height: "100%" }}
        accessible
        accessibilityLabel={itemName ?? meta.group}
      />
    </View>
  );
}

// Alert của react-native-web là hàm rỗng: không hiện hộp thoại và không bao giờ
// gọi onPress. Màn hình nào đặt cờ "đang gửi" rồi chờ callback của Alert sẽ treo
// vĩnh viễn trên web mà không phát một request nào — đúng triệu chứng đã gặp ở
// phiếu kiểm kê tháng. Bọc lại để mỗi nền tảng dùng hộp thoại thật của nó.
import { Alert, Platform } from "react-native";

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
}

/** Hỏi xác nhận hai lựa chọn. Trả về true khi người dùng đồng ý. */
export function confirmAction({
  title,
  message,
  confirmLabel = "Đồng ý",
  cancelLabel = "Hủy",
}: ConfirmOptions): Promise<boolean> {
  if (Platform.OS === "web") {
    // globalThis.confirm vắng mặt khi render phía máy chủ hoặc trong test.
    const ask = typeof globalThis.confirm === "function" ? globalThis.confirm : null;
    return Promise.resolve(ask ? ask(`${title}\n\n${message}`) : false);
  }
  return new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: cancelLabel, style: "cancel", onPress: () => resolve(false) },
        { text: confirmLabel, onPress: () => resolve(true) },
      ],
      { cancelable: false },
    );
  });
}

/** Báo kết quả một chiều, không cần trả lời. */
export function notify(title: string, message: string): void {
  if (Platform.OS === "web") {
    if (typeof globalThis.alert === "function") globalThis.alert(`${title}\n\n${message}`);
    return;
  }
  Alert.alert(title, message);
}

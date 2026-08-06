export interface CommunePeer {
  /** Tên xã, đúng như ghi trong danh mục xã lân cận. */
  communeName: string;
  /** Địa chỉ máy chủ của xã đó, đã bỏ dấu gạch chéo cuối. */
  baseUrl: string;
  /** Khoá chia sẻ giữa hai xã, dùng cho header xác thực máy-với-máy. */
  sharedKey: string;
}

/**
 * Danh bạ máy chủ của các xã lân cận, đọc từ biến môi trường.
 *
 * Khai theo mẫu, mỗi xã một dòng:
 *
 *     COMMUNE_PEER_XUAN_THO=Xuân Thọ|https://xuantho.example|khoa-chia-se
 *
 * Đọc từ môi trường chứ không lưu trong cơ sở dữ liệu vì đây là **bí mật**: khoá
 * chia sẻ nằm trong bảng thì nó đi theo mọi bản sao lưu và mọi lần xuất dữ liệu.
 *
 * Xã nào không khai thì đơn giản là không gửi được tin sang — người dùng vẫn ghi
 * tay được khoản mượn đã thoả thuận qua điện thoại. Đó là đường lùi có chủ đích,
 * không phải lỗi: lúc thiên tai thì mất mạng là chuyện thường, và hai xã vẫn gọi
 * điện cho nhau như từ trước tới nay.
 */
export function parseCommunePeers(env: Record<string, string | undefined>): CommunePeer[] {
  const peers: CommunePeer[] = [];
  for (const [key, raw] of Object.entries(env)) {
    if (!key.startsWith("COMMUNE_PEER_") || !raw) continue;
    const [communeName, baseUrl, sharedKey] = raw.split("|").map((part) => part.trim());
    // Thiếu mảnh nào cũng bỏ qua CẢ DÒNG. Nhận một nửa cấu hình rồi gửi tin tới
    // địa chỉ rỗng, hoặc gửi mà không kèm khoá, còn tệ hơn là không gửi.
    if (!communeName || !baseUrl || !sharedKey) continue;
    peers.push({
      communeName,
      baseUrl: baseUrl.replace(/\/+$/, ""),
      sharedKey,
    });
  }
  return peers;
}

/**
 * Tìm xã lân cận theo tên, bỏ qua hoa thường và dấu tiếng Việt.
 *
 * Tên xã trong danh mục và tên khai trong biến môi trường do hai người khác nhau
 * gõ vào ở hai thời điểm khác nhau; đòi khớp từng ký tự là chắc chắn có lúc lệch
 * một dấu rồi cả đường truyền im lặng không hoạt động.
 */
export function findPeer(peers: CommunePeer[], communeName: string): CommunePeer | null {
  const target = foldCommuneName(communeName);
  if (!target) return null;
  return peers.find((peer) => foldCommuneName(peer.communeName) === target) ?? null;
}

function foldCommuneName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Tìm xã lân cận theo KHOÁ chia sẻ, không theo tên.
 *
 * Ban đầu tôi gửi kèm tên xã trong một header HTTP — và cách đó hỏng với MỌI xã
 * thật: header chỉ mang được latin-1, trong khi "Xuân Thọ", "Đồng Xuân", "Tuy An
 * Bắc" đều có dấu. Lỗi này không lộ ra khi thử bằng tên không dấu.
 *
 * Tra theo khoá vừa bỏ được cái header đó, vừa hợp lý hơn: khoá vốn đã là thứ
 * định danh xã gửi, còn tên xã chỉ là nhãn cho người đọc.
 *
 * So từng khoá bằng thời gian hằng định và KHÔNG dừng sớm khi đã khớp: dừng sớm
 * thì thời gian trả lời tiết lộ vị trí của xã trong danh bạ.
 */
export function findPeerByKey(
  peers: CommunePeer[],
  presentedKey: string,
  compare: (a: string, b: string) => boolean,
): CommunePeer | null {
  let found: CommunePeer | null = null;
  for (const peer of peers) {
    if (compare(presentedKey, peer.sharedKey)) found = peer;
  }
  return found;
}

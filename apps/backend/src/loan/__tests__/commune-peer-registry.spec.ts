import { findPeer, findPeerByKey, parseCommunePeers } from "../commune-peer-registry";

describe("danh bạ máy chủ xã lân cận", () => {
  it("đọc được nhiều xã, bỏ dấu gạch chéo cuối địa chỉ", () => {
    const peers = parseCommunePeers({
      COMMUNE_PEER_XUAN_THO: "Xuân Thọ|https://xuantho.example/|khoa-1",
      COMMUNE_PEER_TUY_AN: "Tuy An Bắc|https://tuyan.example|khoa-2",
      DATABASE_URL: "postgres://khong-lien-quan",
    });

    expect(peers).toEqual([
      { communeName: "Xuân Thọ", baseUrl: "https://xuantho.example", sharedKey: "khoa-1" },
      { communeName: "Tuy An Bắc", baseUrl: "https://tuyan.example", sharedKey: "khoa-2" },
    ]);
  });

  it("thiếu mảnh nào thì bỏ qua CẢ DÒNG", () => {
    // Nhận một nửa cấu hình rồi gửi tin tới địa chỉ rỗng, hoặc gửi mà không kèm
    // khoá, còn tệ hơn là không gửi.
    const peers = parseCommunePeers({
      COMMUNE_PEER_THIEU_KHOA: "Xuân Thọ|https://xuantho.example",
      COMMUNE_PEER_THIEU_URL: "Xuân Thọ||khoa",
      COMMUNE_PEER_THIEU_TEN: "|https://x.example|khoa",
      COMMUNE_PEER_RONG: "",
    });

    expect(peers).toEqual([]);
  });

  it("không khai xã nào thì trả danh sách rỗng, không ném", () => {
    expect(parseCommunePeers({})).toEqual([]);
  });

  it("tìm xã bỏ qua hoa thường và dấu tiếng Việt", () => {
    // Tên trong danh mục và tên khai trong biến môi trường do hai người khác nhau
    // gõ vào; đòi khớp từng ký tự là chắc chắn có lúc lệch một dấu rồi cả đường
    // truyền im lặng không hoạt động.
    const peers = parseCommunePeers({
      COMMUNE_PEER_A: "Xuân Thọ|https://x.example|k",
    });

    expect(findPeer(peers, "xuan tho")?.baseUrl).toBe("https://x.example");
    expect(findPeer(peers, "XUÂN THỌ")?.baseUrl).toBe("https://x.example");
    expect(findPeer(peers, "  Xuân   Thọ  ")?.baseUrl).toBe("https://x.example");
  });

  it("xã lạ trả null chứ không đoán bừa xã gần giống", () => {
    // Gửi yêu cầu mượn sang nhầm xã là chuyện không sửa được bằng một lời xin lỗi.
    const peers = parseCommunePeers({ COMMUNE_PEER_A: "Xuân Thọ|https://x.example|k" });

    expect(findPeer(peers, "Xuân Lộc")).toBeNull();
    expect(findPeer(peers, "")).toBeNull();
  });
});

describe("tra xã theo khoá chia sẻ", () => {
  const peers = parseCommunePeers({
    COMMUNE_PEER_A: "Xuân Thọ|https://a.example|khoa-a",
    COMMUNE_PEER_B: "Tuy An Bắc|https://b.example|khoa-b",
  });
  const soSanh = (a: string, b: string) => a === b;

  it("khoá đúng thì ra đúng xã", () => {
    expect(findPeerByKey(peers, "khoa-b", soSanh)?.communeName).toBe("Tuy An Bắc");
  });

  it("khoá sai trả null", () => {
    expect(findPeerByKey(peers, "khoa-lung-tung", soSanh)).toBeNull();
    expect(findPeerByKey([], "khoa-a", soSanh)).toBeNull();
  });

  it("KHÔNG dừng sớm khi đã khớp", () => {
    // Dừng sớm thì thời gian trả lời tiết lộ vị trí của xã trong danh bạ: khoá
    // của xã đầu danh sách trả lời nhanh hơn hẳn khoá của xã cuối.
    let soLanSo = 0;
    findPeerByKey(peers, "khoa-a", (a, b) => {
      soLanSo += 1;
      return a === b;
    });

    expect(soLanSo).toBe(peers.length);
  });
});

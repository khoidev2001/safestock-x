import { EPISODE_GAP_DAYS, groupIntoEpisodes, isEpisodeOngoing } from "../disaster-episodes";

/**
 * Khoá luật chia đợt của báo cáo sau thiên tai.
 *
 * Một đợt là một cơn bão, một trận lũ — không phải một nhiệm vụ. Trước đây báo
 * cáo kê mỗi nhiệm vụ thành một "đợt", nên câu hỏi "bão số 5 xã tiêu hết bao
 * nhiêu" không có chỗ nào trả lời được.
 */

const day = (value: string) => new Date(`2026-09-${value}T08:00:00.000Z`);

function mission(id: string, startedAt: Date) {
  return { id, startedAt };
}

describe("chia nhiệm vụ thành đợt thiên tai", () => {
  it("nhiệm vụ nối tiếp nhau trong bảy ngày là CÙNG một đợt", () => {
    // Một cơn bão đi qua xã: thôn này báo ngập hôm nay, thôn kia mất nước ba
    // ngày sau, đội quay lại tiếp tế lần hai vào cuối tuần. Ba việc, một cơn bão.
    const episodes = groupIntoEpisodes([
      mission("a", day("01")),
      mission("b", day("04")),
      mission("c", day("09")),
    ]);

    expect(episodes).toHaveLength(1);
    expect(episodes[0].map((item) => item.id)).toEqual(["a", "b", "c"]);
  });

  it("đo khoảng cách với nhiệm vụ LIỀN TRƯỚC, nên một đợt dài vẫn là một đợt", () => {
    /*
      Bão hoàn lưu kéo dài: việc nối nhau suốt ba tuần, không lúc nào im quá bảy
      ngày. Nếu đo từ nhiệm vụ ĐẦU đợt thì đúng ngày thứ tám cơn bão bị xé làm
      đôi, dù thực tế nó chưa hề dừng.
    */
    const episodes = groupIntoEpisodes([
      mission("a", day("01")),
      mission("b", day("06")),
      mission("c", day("11")),
      mission("d", day("16")),
      mission("e", day("21")),
    ]);

    expect(episodes).toHaveLength(1);
    expect(episodes[0]).toHaveLength(5);
  });

  it("im lặng quá bảy ngày thì mở đợt mới", () => {
    // Bão số 5 xong, mười ngày sau bão số 6 vào. Hai cơn bão, hai đợt.
    const episodes = groupIntoEpisodes([
      mission("bao-5-a", day("01")),
      mission("bao-5-b", day("03")),
      mission("bao-6-a", day("14")),
    ]);

    expect(episodes).toHaveLength(2);
    // Đợt mới nhất đứng đầu: người mở báo cáo gần như luôn hỏi về đợt vừa rồi.
    expect(episodes[0].map((item) => item.id)).toEqual(["bao-6-a"]);
    expect(episodes[1].map((item) => item.id)).toEqual(["bao-5-a", "bao-5-b"]);
  });

  it("đúng bảy ngày vẫn là cùng đợt; quá bảy ngày mới tách", () => {
    // Ranh giới phải rõ ràng: "khoảng 7 ngày không có nhiệm vụ mới" nghĩa là
    // ngày thứ bảy vẫn còn nối, sang ngày thứ tám mới đứt.
    const exactly = groupIntoEpisodes([mission("a", day("01")), mission("b", day("08"))]);
    expect(exactly).toHaveLength(1);

    const oneMore = groupIntoEpisodes([mission("a", day("01")), mission("b", day("09"))]);
    expect(oneMore).toHaveLength(2);
  });

  it("dữ liệu vào lộn xộn thứ tự vẫn cho cùng một cách chia", () => {
    // Bên gọi lấy dữ liệu mới-nhất-trước; luật chia đợt chỉ đúng khi đi theo dòng
    // thời gian, nên hàm phải tự sắp lại thay vì tin vào thứ tự nhận được.
    const ascending = groupIntoEpisodes([
      mission("a", day("01")),
      mission("b", day("03")),
      mission("c", day("20")),
    ]);
    const descending = groupIntoEpisodes([
      mission("c", day("20")),
      mission("b", day("03")),
      mission("a", day("01")),
    ]);

    expect(descending.map((group) => group.map((item) => item.id))).toEqual(
      ascending.map((group) => group.map((item) => item.id)),
    );
  });

  it("không có nhiệm vụ nào thì không có đợt nào", () => {
    expect(groupIntoEpisodes([])).toEqual([]);
  });

  it("đợt còn nhận thêm nhiệm vụ thì được đánh dấu đang diễn ra", () => {
    // Số liệu của đợt đang diễn ra CÒN ĐỔI; người đọc phải biết trước khi mang nó
    // đi quyết toán hay đi xin cấp bù.
    const now = day("10");
    expect(isEpisodeOngoing(day("08"), now)).toBe(true);
    expect(isEpisodeOngoing(day("01"), now)).toBe(false);
    // Mặc định của hàm phải khớp với hằng số công bố ra ngoài.
    expect(EPISODE_GAP_DAYS).toBe(7);
  });
});

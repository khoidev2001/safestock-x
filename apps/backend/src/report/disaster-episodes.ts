/**
 * Gộp nhiệm vụ thành ĐỢT THIÊN TAI.
 *
 * Một đợt là một cơn bão, một trận lũ — "bão số 5", "bão số 6" — chứ không phải
 * một nhiệm vụ. Một cơn bão đi qua xã sinh ra hàng chục nhiệm vụ trong nhiều
 * ngày: thôn này báo ngập sáng thứ hai, thôn kia mất nước chiều thứ tư, đội cứu
 * hộ quay lại tiếp tế lần hai vào cuối tuần. Kê mỗi nhiệm vụ thành một "đợt" thì
 * báo cáo sau thiên tai trả lời sai chính câu hỏi nó sinh ra để trả lời: "cơn
 * bão vừa rồi xã tiêu hết bao nhiêu hàng".
 *
 * Hệ thống không có chỗ nào ghi tên cơn bão, và cũng không nên bắt người trực
 * gõ tay vào — giữa bão thì không ai ngồi phân loại hồ sơ. Nên đợt được suy ra
 * từ NHỊP xuất hiện của nhiệm vụ: nhiệm vụ mới còn nối tiếp nhau thì thiên tai
 * còn đang diễn ra; im lặng đủ lâu nghĩa là đợt đó đã qua.
 *
 * Hàm thuần, không đụng cơ sở dữ liệu: luật chia đợt là thứ quyết định mọi con
 * số trong báo cáo, nên nó phải khoá được bằng test mà không cần dựng database.
 */

/**
 * Im lặng bao nhiêu ngày thì coi như đợt đã khép lại.
 *
 * Bảy ngày là khoảng người vận hành đã nêu, và nó khớp với cách một đợt thiên
 * tai thật diễn ra: mưa hoàn lưu sau bão còn kéo dài vài ngày, nước rút chậm ở
 * vùng trũng nên yêu cầu tiếp tế lẻ tẻ vẫn về sau đó cả tuần. Cắt ngắn hơn thì
 * một cơn bão bị xé thành hai ba "đợt"; dài hơn thì hai cơn bão liền nhau trong
 * mùa mưa bị dính làm một.
 */
export const EPISODE_GAP_DAYS = 7;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Thứ tối thiểu để xếp được vào đợt: mỗi nhiệm vụ có mốc bắt đầu và một id. */
export interface EpisodeMember {
  id: string;
  /** Mốc ghi nhận tình huống — "lúc bắt đầu thực hiện nhiệm vụ". */
  startedAt: Date;
}

/**
 * Chia danh sách nhiệm vụ thành các đợt, đợt MỚI NHẤT đứng đầu.
 *
 * Luật: đi từ nhiệm vụ cũ nhất tới mới nhất; nhiệm vụ nào bắt đầu trong vòng
 * `gapDays` ngày kể từ nhiệm vụ LIỀN TRƯỚC thì vẫn thuộc cùng đợt, quá thì mở
 * đợt mới. Nhờ đo theo nhiệm vụ liền trước chứ không theo nhiệm vụ đầu đợt, một
 * cơn bão kéo dài ba tuần vẫn là MỘT đợt: chừng nào việc còn nối tiếp nhau thì
 * thiên tai còn đang diễn ra.
 *
 * Mốc đo là lúc nhiệm vụ ĐƯỢC LẬP, không phải lúc nó xong. Một nhiệm vụ có thể
 * nằm chờ kho cả tuần rồi mới khép; lấy mốc kết thúc thì một việc bị bỏ quên sẽ
 * kéo dài đợt ra vô hạn dù không có tình huống mới nào phát sinh.
 */
export function groupIntoEpisodes<T extends EpisodeMember>(
  missions: T[],
  gapDays: number = EPISODE_GAP_DAYS,
): T[][] {
  if (missions.length === 0) return [];
  const gapMs = gapDays * MS_PER_DAY;
  // Sắp lại từ cũ tới mới trước khi chia: bên gọi lấy dữ liệu theo thứ tự nào là
  // chuyện của bên gọi, còn luật chia đợt chỉ đúng khi đi theo dòng thời gian.
  // `id` phân giải trường hợp hai nhiệm vụ trùng mốc, để cùng một dữ liệu luôn
  // cho ra cùng một cách chia.
  const ordered = [...missions].sort(
    (left, right) =>
      left.startedAt.getTime() - right.startedAt.getTime() || left.id.localeCompare(right.id),
  );

  const episodes: T[][] = [];
  let current: T[] = [ordered[0]];
  for (let index = 1; index < ordered.length; index += 1) {
    const mission = ordered[index];
    const previous = ordered[index - 1];
    const silenceMs = mission.startedAt.getTime() - previous.startedAt.getTime();
    if (silenceMs > gapMs) {
      episodes.push(current);
      current = [mission];
    } else {
      current.push(mission);
    }
  }
  episodes.push(current);

  // Mới nhất lên đầu: người mở báo cáo gần như luôn hỏi về đợt vừa rồi.
  return episodes.reverse();
}

/**
 * Đợt còn đang diễn ra hay đã khép lại.
 *
 * "Đang diễn ra" nghĩa là chưa đủ `gapDays` ngày im lặng kể từ nhiệm vụ gần nhất,
 * nên một tình huống mới phát sinh hôm nay vẫn sẽ được tính vào chính đợt này.
 * Con số của đợt đang diễn ra còn đổi — người đọc cần biết để không mang nó đi
 * quyết toán.
 */
export function isEpisodeOngoing(
  lastMissionStartedAt: Date,
  now: Date,
  gapDays: number = EPISODE_GAP_DAYS,
): boolean {
  return now.getTime() - lastMissionStartedAt.getTime() <= gapDays * MS_PER_DAY;
}

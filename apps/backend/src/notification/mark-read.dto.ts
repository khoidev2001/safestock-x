import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsString, MaxLength } from "class-validator";

/**
 * Danh sách thông báo cần đánh dấu đã đọc trong MỘT lượt gọi.
 *
 * Bấm vào một tab có số việc chưa xem phải xoá hết số đó. Làm bằng
 * `POST /:id/read` cho từng cái thì một tab đang có 40 việc sẽ bắn 40 lượt gọi
 * cùng lúc — mạng ở xã lúc có bão vốn đã chật, và chỉ cần vài lượt hỏng là con
 * số trên tab đứng lại ở một giá trị lẻ mà người dùng không hiểu vì sao.
 *
 * Trần 200 khớp với chỗ nhiều nhất mà `list()` trả về (50) cộng dư địa, đủ để
 * không bao giờ chạm tới trong sử dụng thật nhưng vẫn chặn được thân yêu cầu
 * phình vô hạn.
 */
export class MarkNotificationsReadDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  ids!: string[];
}

# Kịch bản trình diễn — Ứng phó nhanh

Tài liệu duy nhất cho việc trình diễn: **vừa đọc vừa bấm**, dùng được cả khi quay video lẫn khi demo trực tiếp.

**Quay MỘT LƯỢT liền mạch, 25 phút.** Bảy phần, đi theo đúng thứ tự một ngày làm việc ở kho xã — sáng mở máy xem tình hình, có tin báo từ thôn, lập phương án, kho xuất hàng, đội đi lấy, thiếu thì mượn xã bên, cuối kỳ đối chiếu. Đi theo **luồng công việc** chứ không theo danh sách menu, để người xem hiểu *vì sao* có chức năng đó chứ không chỉ thấy nó tồn tại.

Mỗi thao tác có ba cột:

| Cột            | Nghĩa                                                                                 |
| --------------- | -------------------------------------------------------------------------------------- |
| **BẤM**  | thao tác, ghi đúng tên nút trên màn hình                                       |
| **ĐỌC** | lời thuyết minh — đọc thẳng thành tiếng, hoặc dùng làm phụ đề            |
| —              | phần in nghiêng dưới bảng là câu nói dài hơn, dùng để lấp lúc chờ máy |

> Chữ trong cột **ĐỌC** đã viết sẵn thành câu nói được. Cứ đọc y nguyên là xong, không phải tự dựng lời giữa lúc đang bấm.

Ba mức thời lượng:

| Có bao nhiêu phút | Chạy phần                          |
| -------------------- | ------------------------------------ |
| **25 phút**   | Toàn bộ, phần 1 → 7              |
| **15 phút**   | Phần 2 → 3 → 5 → 6 (bỏ 1, 4, 7) |
| **8 phút**    | Mục 2.1 → 3.2 → 5.2 → 6.1 → 6.8 |

---

# NĂM MÀN HÌNH

|               | Màn hình            | Tài khoản                        | Mật khẩu        | Vai                         |
| ------------- | --------------------- | ---------------------------------- | ----------------- | --------------------------- |
| **M1**  | Chrome thường       | `admin`                          | `admin123@`     | Quản trị xã Đồng Xuân |
| **M2**  | Chrome ẩn danh       | `staff`         | `staff123`      | Phụ trách kho trung tâm  |
| **M3**  | BrowserOS             | `admin.xuantho` | `admin123@`     | Quản trị xã Xuân Thọ   |
| **Đ1** | Điện thoại ảo S23 | `rescue`        | `rescue123`     | Đội hiện trường        |
| **Đ2** | Điện thoại thật   | `longchau`      | `truongthon123` | Trưởng thôn Long Châu   |

Tài khoản quản trị là **`admin`** trần, không phải email.

---

# CHUẨN BỊ TRƯỚC KHI BẤM MÁY

## 1. Khởi động

Bấm **CHUAN BI DEMO.bat**, đợi báo xong.

## 2. Dọn card — làm được tới đâu hay tới đó

Máy ảo Android sẽ ăn VRAM, và đó là đánh đổi đã chấp nhận để có đủ năm màn hình. Nhưng vẫn nên đóng những thứ **không dùng tới trong lúc quay**:

**VS Code · Vysor · Microsoft Store · ShareX · thẻ Chrome thừa**

Ba cái giữa tự chạy nền, không ai chủ động mở mà vẫn giữ card.

> **Trợ lý sẽ chậm hơn — chuyện bình thường, đã tính trước.** Chữ đầu có thể ra sau 20–40 giây thay vì 7 giây. Xem mục *Khi trợ lý chậm* ở cuối tài liệu để biết nói gì trong lúc chờ.

## 3. Năm màn hình

Đăng nhập sẵn theo bảng trên.

## 4. Ghi số ra giấy

Mở tab **Vật tư** trên M1, ghi lại tồn của **Áo phao người lớn** và **Nước uống đóng chai**. Cuối video sẽ đối chiếu — đó là bằng chứng mạnh nhất rằng hệ thống cộng trừ đúng.

## 5. Dọn sổ

```
pnpm --filter @safestock/backend exec ts-node prisma/reset-demo-data.ts
```

Sau lệnh này: 0 nhiệm vụ, 0 sự cố, 0 thông báo, tồn kho về đúng số gốc. Giữ nguyên kho, tài khoản, toạ độ thôn.

## 6. Đặt máy quay

Điện thoại thật: **chiếu màn hình lên máy tính** rồi thu bằng OBS. Cầm tay quay thì chữ nhoè và rung, không đọc được số.

---

# PHẦN 1 — Mở máy, nhìn toàn cảnh · 4 phút

## 1.1 Đăng nhập và phân quyền — M1

| BẤM                                          | ĐỌC                                                                                                                                               |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mở`localhost:3200`, đăng nhập `admin` | *"Hệ thống có ba vai: quản trị xã, phụ trách kho, lực lượng hiện trường."*                                                          |
| Chỉ thanh bên trái                         | *"Mỗi vai thấy một bộ tab khác nhau. Trưởng thôn không xem được tồn kho thôn khác — đó là chủ ý, không phải thiếu sót."* |

## 1.2 Tab **Tổng quan**

| BẤM                          | ĐỌC                                                                                                                                                        |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Đứng ở**Tổng quan** | *"Trang này xếp theo mức khẩn, không theo ý thích."*                                                                                                |
| Chỉ từ trên xuống         | *"Việc đang chặn điều phối lên đầu. Rồi nhiệm vụ đang chờ mình. Rồi tồn kho, kiểm kê. Cuối cùng mới tới bản đồ và thiết bị."* |
| Chỉ khối mức sẵn sàng    | *"Điểm sẵn sàng tính từ tồn kho, hạn dùng và tình trạng thiết bị — không phải người tự chấm."*                                        |
| Bấm**tính lại**      | *"Tính lại được bất cứ lúc nào."*                                                                                                                 |

## 1.3 Tab **Theo dõi, dự báo**

| BẤM                              | ĐỌC                                                                              |
| --------------------------------- | ---------------------------------------------------------------------------------- |
| Vào**Theo dõi, dự báo** | *"Dự báo mưa lấy từ dịch vụ khí tượng, theo đúng toạ độ kho."*    |
| Chỉ biểu đồ xu hướng        | *"Kèm xu hướng tiêu thụ vật tư — để biết thứ gì đang cạn nhanh."* |

## 1.4 Tab **Bản đồ kho**

| BẤM                        | ĐỌC                                                             |
| --------------------------- | ----------------------------------------------------------------- |
| Vào**Bản đồ kho** | *"Mười tám kho trên bản đồ thật, toạ độ thật."*     |
| Phóng to một kho thôn    | *"Bản đồ chạy offline — tải sẵn, không cần internet."* |

## 1.5 Tab **Cảm biến thử nghiệm**

| BẤM                                  | ĐỌC                                                                                    |
| ------------------------------------- | ---------------------------------------------------------------------------------------- |
| Vào**Cảm biến thử nghiệm** | *"Kho trung tâm có cảm biến nhiệt độ, độ ẩm, cửa mở."*                     |
| Chỉnh một giá trị vượt ngưỡng | *"Vượt ngưỡng là hệ thống tự tạo sự cố, không đợi người phát hiện."* |
| Chờ thông báo góc phải dưới    | *"Thông báo hiện ngay, giống Zalo."*                                               |

---

# PHẦN 2 — Nhận tin từ hiện trường · 4 phút

> **Mở đầu bằng điện thoại, không phải máy tính.** Người xem phải thấy hệ thống bắt đầu từ nơi sự việc xảy ra, không phải từ một bảng điều khiển.

## 2.1 Báo bằng giọng nói — Đ2 (điện thoại thật)

| BẤM                                                                                                                                      | ĐỌC                                                                                                                                      |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Mở app, tab**Báo cáo**                                                                                                           | *"Đây là điện thoại của trưởng thôn Long Châu. Nước bắt đầu lên."*                                                      |
| Bấm**ghi âm**                                                                                                                     | *"Anh ấy không gõ. Trời mưa, tay ướt, và gõ thì chậm."*                                                                       |
| Nói rõ:**"Thôn Long Châu ngập nặng, khoảng một trăm năm mươi người mắc kẹt, cần nước uống và áo phao gấp."** | *"Chỉ cần nói."*                                                                                                                      |
| Chờ chữ hiện ra                                                                                                                        | *"Nhận dạng tiếng Việt chạy ngay trên máy chủ của xã. Giọng nói không gửi đi đâu cả — mất mạng vẫn nghe được."* |
| Đọc lại, sửa nếu sai, bấm**gửi**                                                                                             | *"Máy nghe xong, người đọc lại rồi mới gửi. Máy không tự quyết thay người."*                                              |

## 2.2 Các tab khác trên điện thoại — Đ2

| BẤM                     | ĐỌC                                                                                                          |
| ------------------------ | -------------------------------------------------------------------------------------------------------------- |
| Tab**Tổng quan**  | *"Trưởng thôn xem được tình hình kho mình."*                                                        |
| Tab**Sẵn sàng**  | *"Mức sẵn sàng của riêng thôn."*                                                                       |
| Tab**Kho**         | *"Tồn kho thôn mình — và chỉ thôn mình."*                                                            |
| Tab**Kiểm kê**   | *"Kiểm kê ngay trên điện thoại, không phải về xã."*                                                |
| Tab**Thông báo** | *"Thông báo từ xã gửi xuống."*                                                                         |
| Chỉ thanh tab dưới    | *"Mỗi tab một màu theo nghĩa: việc phải làm màu xanh, nguy hiểm màu đỏ, chờ xử lý màu cam."* |

## 2.3 Xã nhận được báo cáo — M1

| BẤM                               | ĐỌC                                                                    |
| ---------------------------------- | ------------------------------------------------------------------------ |
| Chỉ thông báo góc phải dưới | *"Xã nhận được ngay."*                                            |
| Vào tab**Sự cố**          | *"Báo cáo vào danh sách sự cố, có mức độ và trạng thái."* |

---

# PHẦN 3 — Trợ lý và điều phối · 5 phút

## 3.1 Trợ lý trả lời tức thì — M1

| BẤM                                                | ĐỌC                                                                           |
| --------------------------------------------------- | ------------------------------------------------------------------------------- |
| Mở trợ lý (nút nổi góc phải dưới)          | *"Người trực ở xã mở trợ lý."*                                        |
| Gõ**Còn bao nhiêu áo phao người lớn?** | *"Câu tra dữ liệu trả lời trong hai giây, không cần hỏi mô hình."* |
| Gõ**Vật tư nào sắp hết hạn?**          | *"Kèm hạn dùng, hạn gần lên trước."*                                  |
| Gõ**Kho đang có sự cố gì không?**      | —                                                                              |

## 3.2 Trợ lý đọc tình huống thật

| BẤM                                                                    | ĐỌC                                                                                                                                    |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Gõ**Thôn Long Châu có 150 người mắc kẹt, đang mưa to.** | *"Còn đây là tình huống thật."*                                                                                                 |
| **Chờ chữ chạy ra**                                            | *"Chữ chạy dần chứ không đứng im. Trước đây màn hình đứng tám giây, người trực tưởng máy treo rồi bấm lại."* |
| Chỉ lời mời sang điều phối                                        | *"Nó nhận ra đây là việc cần điều xe, và mời sang luồng điều phối — kèm sẵn địa điểm và số người."*          |

*Nói khi chữ đang chạy:* **"Mọi con số trong câu trả lời đều phải có trong dữ liệu kho. Chữ chạy xong, hệ thống đối chiếu lại từng số; số nào không có thật thì thay cả câu bằng câu an toàn. Máy được nói nhanh, nhưng không được bịa."**

## 3.3 Thử lớp chống bịa số

| BẤM                                                | ĐỌC                                                                        |
| --------------------------------------------------- | ---------------------------------------------------------------------------- |
| Gõ**Hôm nay đội nào thắng bóng đá?** | *"Hỏi một câu ngoài phạm vi."*                                        |
| Chờ trả lời                                      | *"Nó từ chối, và không kéo theo số liệu kho vào câu trả lời."* |

## 3.4 Tab **Điều phối cứu hộ** — lập phương án

| BẤM                                               | ĐỌC                                                                                                                                                                                          |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bấm**mở luồng điều phối** từ trợ lý | *"Lời kể mang thẳng sang, không phải gõ lại."*                                                                                                                                        |
| Kiểm địa điểm, số người đã điền sẵn   | *"Bóc ra từ chính câu vừa kể."*                                                                                                                                                        |
| Điền thêm trẻ em, người già, ca y tế       | *"Càng rõ thì định mức càng sát."*                                                                                                                                                   |
| Bấm**tạo phương án**                    | —                                                                                                                                                                                             |
| Chờ bảng vật tư                                | *"Hệ thống đối chiếu định mức cứu trợ quốc tế với tồn kho thật, rồi chia việc cho từng kho."*                                                                              |
| Chỉ dòng**Nước uống**                   | *"Nước tính theo chai năm lít. Mười lăm lít một người một ngày, một trăm năm mươi người, hai ngày — hệ thống ra số chai, không bắt người xuất kho tự chia."* |
| Chỉ phần phân bổ theo kho                      | *"Ưu tiên kho thôn gần điểm ngập nhất, thiếu mới lấy từ kho tổng — để xe chạy quãng ngắn nhất."*                                                                         |
| Chỉ tuyến và thời gian tới                    | *"Kèm quãng đường và thời gian dự kiến, tính từ toạ độ thật."*                                                                                                                |

*Nói khi chỉ vào bảng:* **"Đây không phải máy đoán. Định mức là chuẩn Sphere, tồn kho là số thật trong sổ, khoảng cách là toạ độ thật của từng kho. Máy chỉ làm phép tính mà người trực đang phải làm bằng tay giữa lúc bão."**

## 3.5 Tab **Nhiệm vụ**

| BẤM                                                   | ĐỌC                                                      |
| ------------------------------------------------------ | ---------------------------------------------------------- |
| Vào**Nhiệm vụ**                               | *"Nhiệm vụ vừa tạo nằm ở đây."*                  |
| Chỉ bộ lọc**Đang xử lý / Đã kết thúc** | *"Việc cần mình xử lý được đưa lên trước."* |
| Mở nhiệm vụ                                         | —                                                         |

---

# PHẦN 4 — Kho vận hành · 5 phút

## 4.1 Tab **Vật tư** — thao tác hằng ngày — M2

| BẤM                                            | ĐỌC                                                                              |
| ----------------------------------------------- | ---------------------------------------------------------------------------------- |
| Đăng nhập M2 bằng`staff@`                 | *"Đây là màn hình người phụ trách kho."*                                |
| Vào tab**Vật tư**                      | —                                                                                 |
| Bấm**Tiếp nhận lô mới**              | *"Nhập hàng: chọn vật tư, mã lô, số lượng, hạn dùng, vị trí kệ."* |
| Điền và xác nhận                           | —                                                                                 |
| Chọn một lô →**Nhập thêm vào lô** | *"Bổ sung vào lô sẵn có."*                                                  |
| Chọn một lô →**Chuyển vị trí**     | *"Chuyển sang kệ khác trong kho."*                                            |
| Chọn một lô →**Xuất khỏi kho**      | *"Xuất lẻ."*                                                                   |
| Bấm**Xuất nhiều lô**                  | *"Hoặc xuất hàng loạt theo phương án."*                                   |

## 4.2 Mã QR

| BẤM                                | ĐỌC                                                                           |
| ----------------------------------- | ------------------------------------------------------------------------------- |
| Chọn một lô, bấm**in QR** | *"Mỗi lô có mã QR."*                                                      |
| Chỉ mã                            | *"Quét ra ngay lô đó, vị trí kệ, hạn dùng — không phải tra sổ."* |

## 4.3 Tab **Kiểm kê**

| BẤM                                       | ĐỌC                                                                                                                   |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| Vào**Kiểm kê**                    | *"Kiểm kê định kỳ: đếm thực tế rồi đối chiếu với sổ."*                                                 |
| Nhập số đếm lệch với sổ, xác nhận | *"Lệch bao nhiêu ghi lại bấy nhiêu, kèm người đếm và thời điểm. Không sửa thẳng con số trong sổ."* |

## 4.4 Chuẩn bị hàng cho nhiệm vụ

| BẤM                                                     | ĐỌC                                                                            |
| -------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Tab**Nhiệm vụ**, mở nhiệm vụ vừa tạo        | *"Yêu cầu vật tư từ điều phối gửi xuống."*                           |
| Bấm**Tiếp nhận yêu cầu**                      | *"Kho xác nhận đã đọc."*                                                 |
| Ở dòng khác, bấm**Báo thiếu / sai**          | *"Nếu kho không đủ thì báo ngược lên, điều phối duyệt lại số."* |
| Về dòng đầu, bấm**Xác nhận xuất vật tư** | *"Xuất hàng — tồn kho trừ thật ngay lúc này."*                         |

## 4.5 Kho nào xong, kho nào chưa — M1

| BẤM                   | ĐỌC                                                                                                                                                          |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Về M1, mở nhiệm vụ | —                                                                                                                                                             |
| Chỉ các thẻ màu    | *"Xanh là kho đã xong, cam là còn nợ. Trước đây chỉ có một con số gộp kiểu 'một trên năm' — nó không nói được phải gọi cho ai."* |

---

# PHẦN 5 — Đội hiện trường lấy hàng · 3 phút

> **Cảnh quan trọng nhất cả buổi.** Cố ý làm sai trước để người xem thấy hệ thống chặn. Xem hệ thống *từ chối* thuyết phục hơn xem nó chạy trơn — ai cũng biết chạy trơn là đã chuẩn bị sẵn.
>
> Cảnh này **không gọi AI** nên máy ảo chậm cũng không ảnh hưởng.

## 5.1 Nhận nhiệm vụ — Đ1 (điện thoại ảo)

| BẤM                                  | ĐỌC                                                                               |
| ------------------------------------- | ----------------------------------------------------------------------------------- |
| Mở app, đã đăng nhập`rescue@` | *"Đội hiện trường làm việc trên điện thoại, không ngồi máy tính."* |
| Tab**Lệnh**, mở nhiệm vụ    | *"Kèm địa điểm, số người, danh sách vật tư, và lấy ở kho nào."*    |

## 5.2 Ký nhận — làm sai trước

| BẤM                                                                          | ĐỌC                                                             |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Cuộn tới khối**Ký nhận đã lấy hàng**                           | *"Kho đã soạn xong. Giờ người đi lấy phải ký nhận."* |
| **Nhập số ít hơn số đã soạn, để trống ô lý do**            | *"Nhưng hôm nay xe nhỏ, không chở hết."*                  |
| Bấm**Ký nhận đã lấy hàng**                                       | —                                                                |
| **Chờ báo lỗi hiện ra**                                             | *"Hệ thống chặn lại."*                                      |
| Đọc to câu báo                                                            | *"Thiếu bao nhiêu thì phải nói rõ vì sao."*              |
| Điền lý do:**Xe chỉ chở được từng ấy, chuyến sau lấy nốt** | —                                                                |
| Bấm ký nhận lần nữa                                                      | *"Giờ mới cho qua."*                                          |

*Nói khi hệ thống chặn:* **"Con số thiếu một mình không dùng được. Người điều phối cần biết thiếu vì kho hết hàng — thì phải đi xin xã khác — hay vì xe không chở hết — thì chuyến sau lấy nốt. Hai việc khác hẳn nhau, và đúng lúc đó chỉ người đứng ở kho mới biết."**

## 5.3 Điều phối nhận báo thiếu — M1

| BẤM                                  | ĐỌC                                                               |
| ------------------------------------- | ------------------------------------------------------------------- |
| Chỉ thông báo góc phải dưới    | *"Điều phối nhận ngay: lấy thiếu bao nhiêu, và vì sao."* |
| Mở nhiệm vụ, chỉ dòng nền vàng | *"Ghi lại trong sổ nhiệm vụ, không mất đi."*               |

## 5.4 Hoàn tất giao hàng — Đ1

| BẤM                                                     | ĐỌC                                                  |
| -------------------------------------------------------- | ------------------------------------------------------ |
| Bấm**xác nhận đã giao**                       | *"Đội giao xong thì báo về."*                   |
| Chọn kết quả: đủ / một phần / không giao được | *"Ghi rõ kết quả, kèm lý do nếu không đủ."* |

---

# PHẦN 6 — Thiếu hàng thì mượn xã bên · 5 phút

## 6.1 Nhìn toàn xã trước khi đi xin — M1

> Mục có số liệu gây bất ngờ nhất. Đừng bỏ.

| BẤM                                         | ĐỌC                                                                                                                                                                                   |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tab**Vật tư**, chỉ bảng tồn       | *"Bảng này chỉ đếm hàng nằm trong chính kho tổng."*                                                                                                                          |
| Bấm mở**Tồn kho toàn xã**         | *"Nhưng xã còn mười bảy kho thôn nữa."*                                                                                                                                       |
| **Dừng ở thẻ Kho thôn Long Châu** | *"Long Châu giữ gần hai nghìn đơn vị — nhưng chỉ bốn mặt hàng, riêng bộ sơ cứu đã một nghìn sáu."*                                                              |
| Chỉ thẻ kho tổng                          | *"Còn kho tổng mười bảy mặt hàng nhưng mỗi thứ ít."*                                                                                                                       |
| Chỉ dòng quy đổi dưới tên nước      | *"Nước hiện cả ba cách đếm: bao nhiêu chai, bao nhiêu lốc, bao nhiêu lít. Người bốc hàng cần chai, người xếp xe cần lốc, người tính định mức cần lít."* |

*Nói khi mở khối:* **"Không có khối này, người trực nhìn con số ở kho tổng rồi kết luận xã hết hàng, đi xin chi viện — trong khi thứ mình cần đang nằm ở thôn bên cạnh."**

## 6.2 Nhãn hàng đang mắc nợ

| BẤM                                                    | ĐỌC                                                                                                                             |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Chỉ khối**Hàng đang mắc nợ với xã khác** | *"Tồn kho là một con số duy nhất — nó không nói được bao nhiêu trong đó là hàng đi mượn, phải trả lại."* |

## 6.3 Gửi yêu cầu mượn — tab **Mượn, trả**

| BẤM                                                                                      | ĐỌC                                                                                               |
| ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Bấm**Gửi yêu cầu mượn xã khác**                                             | *"Cả xã vẫn thiếu. Phải hỏi xã bên cạnh."*                                               |
| Chọn xã**Xuân Thọ**, vật tư **Áo phao người lớn**, số **50** | *"Chọn từ danh sách chứ không gõ tay — tên phải khớp thì bên kia mới nhận đúng."* |
| Ghi chú, bấm**Gửi yêu cầu**                                                    | *"Kho mình chưa đổi gì. Chưa ai đồng ý thì chưa có hàng nào rời chỗ."*            |

## 6.4 Xã bên kia quyết ngay trên thông báo — M3

| BẤM                                                   | ĐỌC                                                    |
| ------------------------------------------------------ | -------------------------------------------------------- |
| **Chờ thông báo góc phải dưới**           | *"Xã Xuân Thọ nhận được ngay."*                 |
| Chỉ**hai nút trên thông báo**               | *"Và quyết luôn tại chỗ, không phải đi tìm."* |
| Bấm**Đồng ý**, chọn lô, xác nhận         | *"Kho Xuân Thọ trừ đúng số đó."*               |
| Chỉ tồn kho đã giảm và nhãn*đang cho mượn* | —                                                       |

*Nói ở mục này:* **"Hai xã là hai hệ thống hoàn toàn tách rời. Cơ sở dữ liệu riêng, kho riêng. Đồng Xuân không nhìn thấy tồn kho Xuân Thọ, và không bao giờ nhìn thấy được. Sợi dây duy nhất nối hai bên là thông báo — mỗi bên tự cộng trừ kho của mình."**

## 6.5 Nhận hàng về — M1

| BẤM                                                 | ĐỌC                                                                   |
| ---------------------------------------------------- | ----------------------------------------------------------------------- |
| Bấm**Xác nhận đã nhận hàng**, chọn lô | *"Đồng Xuân nhận hàng vào kho."*                                |
| Tab**Vật tư**, chỉ nhãn vàng              | *"Và hệ thống ghi rõ: số này có trong kho nhưng phải trả."* |

## 6.6 Trả hàng

| BẤM                                                                           | ĐỌC                                                      |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| Tab**Mượn, trả** → **Ghi nhận đã trả**, nhập **20** | *"Trả từng phần cũng được."*                      |
| Chỉ trạng thái**Đã trả một phần**                                | —                                                         |
| Bấm lại, trả nốt**30**                                               | *"Trả hết thì nhãn biến mất ở cả hai bên."*     |
| Sang M3, bấm**Ghi nhận nhận lại**                                    | *"Xuân Thọ nhận lại, kho về đúng số ban đầu."* |

## 6.7 Thử nhánh từ chối

| BẤM                                      | ĐỌC                                               |
| ----------------------------------------- | --------------------------------------------------- |
| Gửi một yêu cầu mới từ M1           | —                                                  |
| Ở M3 bấm**Từ chối**, ghi lý do | *"Từ chối thì kho hai bên không đổi gì."* |

## 6.8 Khi mất mạng — ghi tay

> **Cảnh đóng.** Đây là thứ phân biệt một phần mềm chạy đẹp trong phòng với một phần mềm dùng được ngoài bão.

| BẤM                                                                | ĐỌC                                                                                                                    |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| M1 →**Ghi tay khoản đã thoả thuận qua điện thoại**   | *"Lúc bão, đường truyền là thứ đứt đầu tiên."*                                                            |
| Đọc to dòng mô tả trong form                                   | *"Hai xã gọi điện thoả thuận xong, mỗi bên tự ghi vào sổ của mình."*                                      |
| Chọn chiều, xã, vật tư, số lượng                            | *"Chọn tên vật tư, không phải mã lô — người trực đang gọi điện nói 'nước uống', không nói mã."* |
| Ghi chú**ai gọi, lúc mấy giờ** → **Ghi vào sổ** | —                                                                                                                       |
| Chỉ nhãn**· ghi tay**                                      | *"Có dấu riêng để sau này đối chiếu còn phân biệt được."*                                               |
| Chỉ tồn kho đã đổi                                            | *"Kho vẫn cộng trừ thật."*                                                                                         |

*Câu chốt cả buổi:* **"Hệ thống không giả vờ rằng mạng luôn có, điện luôn có, và mọi thứ luôn suôn sẻ. Mất mạng thì nó lùi về đúng cách hai xã vẫn làm với nhau từ trước khi có phần mềm — gọi điện, rồi mỗi bên ghi sổ. Khác là sổ giờ cộng trừ kho thật, và có dấu vết để đối chiếu."**

---

# PHẦN 7 — Đối chiếu và quản trị · 3 phút

## 7.1 Tab **Báo cáo tháng**

| BẤM                           | ĐỌC                                                     |
| ------------------------------ | --------------------------------------------------------- |
| Vào**Báo cáo tháng** | *"Báo cáo tổng hợp: nhập, xuất, tồn, hao hụt."* |
| Bấm xuất báo cáo           | *"Xuất ra để gửi lên huyện."*                     |

## 7.2 Tab **Nhật ký**

| BẤM                              | ĐỌC                                                                                         |
| --------------------------------- | --------------------------------------------------------------------------------------------- |
| Vào**Nhật ký**           | *"Mọi thao tác đều có dấu vết: ai làm, lúc nào, đổi gì từ đâu sang đâu."* |
| Lọc theo loại**Vật tư** | *"Lọc được theo loại và theo người."*                                               |
| Chỉ dòng vừa tạo              | *"Đây là thao tác vừa nãy."*                                                          |

## 7.3 Tab **Tài khoản**

| BẤM                                       | ĐỌC                                                                                                                 |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| Vào**Tài khoản**                  | *"Hai mươi tài khoản: một quản trị, một hiện trường, mười tám phụ trách kho."*                      |
| Chỉ cột vai và kho phụ trách          | *"Mỗi trưởng thôn gắn đúng một kho. Tên đăng nhập là tên thôn — nhìn là biết ai giữ kho nào."* |
| Bấm**đổi email nhận cảnh báo** | *"Đổi được email nhận cảnh báo cho từng người."*                                                         |

## 7.4 Đối chiếu số — đóng buổi

| BẤM                                                            | ĐỌC                                                                                           |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Về tab**Vật tư**, so với số ghi ra giấy đầu buổi | *"Đầu buổi tôi đã ghi lại tồn kho."*                                                  |
| Chỉ từng con số                                              | *"Xuất bao nhiêu, mượn bao nhiêu, trả bao nhiêu — cộng trừ khớp từng đơn vị."* |

---

# Câu hỏi hay gặp — có sẵn câu trả lời

**"Chạy trên máy nào? Có cần internet không?"**

> *"Toàn bộ chạy trên một máy tính đặt tại xã. Mô hình trả lời bằng chữ và mô hình nhận dạng giọng nói đều chạy trên card đồ hoạ của chính máy đó. Không gọi dịch vụ ngoài, không gửi dữ liệu đi đâu. Mất internet vẫn dùng được đủ."*

**"AI có tự bịa số không?"**

> *"Không đưa được. Máy chủ chụp trạng thái kho rồi gửi cho mô hình; mô hình chỉ được dùng số có trong ảnh chụp đó. Trả lời xong, hệ thống đối chiếu từng con số — số nào không nằm trong dữ liệu thì thay cả câu."*

**"Hai người cùng bấm một lúc thì sao?"**

> *"Một người thành công, người kia nhận báo 'vừa được cập nhật ở nơi khác'. Đây là lỗi đã từng xảy ra thật trong lúc phát triển: cả hai cùng thành công, kho trừ hai lần mà sổ chỉ ghi một lần. Đã chặn và có bài kiểm riêng."*

**"Máy chủ sập giữa lúc đang chuyển hàng?"**

> *"Sổ và kho là hai bước ghi khác nhau nên có một khe hẹp giữa chúng. Hệ thống ghi lại lời hứa chuyển kho cùng lúc chốt sổ; sập giữa chừng thì lần khởi động sau tự làm nốt, và không chuyển hai lần."*

**"Nhân rộng ra nhiều xã thế nào?"**

> *"Mỗi xã một hệ thống độc lập, không phụ thuộc máy chủ trung tâm. Thêm một xã là dựng thêm một bản, khai tên nhau vào sổ đăng ký là mượn trả được. Không có điểm chết chung."*

---

# Phòng hờ khi có sự cố

| Hiện tượng                                              | Xử lý — và câu nói biến nó thành điểm mạnh                                                                                                                                     |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Trợ lý chờ lâu mới ra chữ                            | *"Máy này đang chạy đồng thời mô hình chữ và mô hình giọng nói trên một card sáu gi-ga."* Đóng bớt trình duyệt rồi hỏi lại.                                    |
| Trợ lý trả*"Chưa thể tạo câu trả lời an toàn"* | **Đây là lớp bảo vệ đang chạy đúng.** Nói thẳng: *"Mô hình vừa đưa ra một con số không có trong dữ liệu kho, hệ thống chặn lại."* Rồi hỏi câu khác. |
| Nhận dạng giọng nói ra sai chữ                        | Sửa tay rồi gửi:*"Máy nghe xong, người đọc lại rồi mới gửi — máy không tự quyết thay người."*                                                                         |
| Xã bên kia không nhận được thông báo              | Chuyển thẳng sang**6.8**: *"Đúng tình huống này chúng tôi đã lường trước."*                                                                                         |
| Khối**Tồn kho toàn xã** trống                   | Đang đăng nhập tài khoản kho thôn. Chỉ kho tổng xem được — đó là chủ ý.                                                                                                  |
| Khối**Hàng đang mắc nợ** không hiện           | Không có khoản mượn nào đang mở. Chạy 6.3 → 6.5 trước.                                                                                                                         |
| App điện thoại báo lỗi mạng                          | Kiểm điện thoại cùng WiFi với máy tính. Vẫn lỗi thì dùng trình duyệt trên điện thoại thay app.                                                                           |

---

# Bảng kiểm — đã đi hết chưa

Đánh dấu khi chạy thử, để không sót lúc quay thật.

**Web — 13 tab**

- [ ] Tổng quan · [ ] Điều phối cứu hộ · [ ] Nhiệm vụ · [ ] Theo dõi, dự báo
- [ ] Vật tư · [ ] Kiểm kê · [ ] Mượn, trả · [ ] Sự cố
- [ ] Báo cáo tháng · [ ] Bản đồ kho · [ ] Cảm biến thử nghiệm · [ ] Tài khoản · [ ] Nhật ký

**Thao tác kho — 7**

- [ ] Tiếp nhận lô mới · [ ] Nhập thêm vào lô · [ ] Chuyển vị trí
- [ ] Xuất khỏi kho · [ ] Xuất nhiều lô · [ ] In QR · [ ] Kiểm kê lệch

**Luồng nhiệm vụ — 9**

- [ ] Báo cáo hiện trường · [ ] Trợ lý đọc tình huống · [ ] Tạo phương án
- [ ] Kho tiếp nhận · [ ] Kho báo thiếu · [ ] Kho xuất
- [ ] Đội ký nhận thiếu (bị chặn) · [ ] Đội ký nhận có lý do · [ ] Xác nhận đã giao

**Mượn trả liên xã — 8**

- [ ] Gửi yêu cầu · [ ] Quyết trên thông báo · [ ] Nhận hàng
- [ ] Trả một phần · [ ] Trả hết · [ ] Nhận lại · [ ] Từ chối · [ ] Ghi tay

**Điện thoại — 7 tab**

- [ ] Tổng quan · [ ] Sẵn sàng · [ ] Kho · [ ] Kiểm kê
- [ ] Lệnh · [ ] Thông báo · [ ] Báo cáo (ghi âm)

**AI — 5**

- [ ] Nhận dạng giọng nói · [ ] Trợ lý trả nhanh · [ ] Trợ lý chạy chữ
- [ ] Bóc tách địa điểm và số người · [ ] Từ chối câu ngoài phạm vi

---

# Ghi chú kỹ thuật khi quay

**Card đồ hoạ — trợ lý sẽ chậm, đã tính trước.** Máy ảo Android chiếm khoảng 300 MB VRAM, nên chữ đầu của trợ lý có thể ra sau 20–40 giây thay vì 7 giây. Đây là đánh đổi có chủ ý để có đủ năm màn hình thật.

### Khi trợ lý chậm — nói gì trong lúc chờ

Đừng ngồi im. Có ba câu lấp được cả phút, và cả ba đều là nội dung thật chứ không phải câu độn:

> *"Trong lúc mô hình đang chạy, có một điểm em muốn nói: nó chạy ngay trên máy tính này, không gọi dịch vụ ngoài. Chậm hơn dịch vụ đám mây, nhưng đổi lại là mất internet vẫn dùng được — mà lúc bão thì internet là thứ đứt đầu tiên."*

> *"Máy đang chạy đồng thời mô hình trả lời bằng chữ và mô hình nhận dạng giọng nói trên một card sáu gi-ga, cộng thêm một máy ảo Android. Ở máy chủ thật đặt tại xã thì chỉ có mô hình, nên nhanh hơn nhiều."*

> *"Chữ chạy dần thế này là có chủ ý. Trước đây màn hình đứng im cho tới khi có câu trả lời đầy đủ, và người trực tưởng máy treo nên bấm lại — mỗi lần bấm lại là mô hình chạy thêm một lượt."*

**Nếu quá 60 giây mà chưa ra chữ:** dừng, đóng bớt cửa sổ, hỏi lại câu đó. Đừng cố chờ tiếp — trên video một phút im lặng dài hơn anh tưởng rất nhiều.

**Điện thoại.** Chiếu màn hình lên máy tính rồi thu bằng OBS. Cầm tay quay thì chữ nhoè và rung, không đọc được số.

**Thông báo.** Hiện ở **góc phải dưới**, tự tắt sau 6 giây. Cảnh nào cần quay thông báo thì phải chuyển màn hình trong vòng 6 giây, hoặc để chuột lên thẻ cho nó dừng đếm.

**Ba màn hình web.** Đặt cạnh nhau trên cùng màn hình nếu đủ chỗ, hoặc dùng ba cửa sổ và chuyển bằng Alt+Tab. Đừng thu nhỏ cửa sổ quá — chữ trên video phải đọc được.

**Chuột.** Di chậm. Người xem cần thấy anh bấm vào đâu, mà chuột nhảy nhanh thì họ mất dấu.

---

# Dọn dẹp sau khi chạy

1. Xoá các dòng mượn thử ở **cả hai xã**.
2. Đối chiếu tồn kho với số ghi đầu buổi; lệch thì sửa bằng kiểm kê.
3. Xoá nhiệm vụ thử nếu không muốn nó xuất hiện lần sau.

---

# Tài liệu liên quan

- [Lời dẫn quay video](LOI-DAN-QUAY-VIDEO.md) — giới thiệu bản thân, nhóm, sơ lược ứng dụng và phần kết; đọc trước khi vào Phần 2
- [Hướng dẫn thử luồng mượn — trả liên xã](HUONG-DAN-TEST-MUON-TRA-LIEN-XA.md) — chi tiết từng nhánh rẽ và cách gỡ khi hỏng
- [Tài khoản demo](TAI-KHOAN-DEMO.md) — toàn bộ 20 tài khoản
- [Bàn giao vận hành](BAN-GIAO-VAN-HANH.md) — cách các dịch vụ chạy nền trên máy demo

# Kịch bản trình diễn — các tính năng mới

Năm tính năng, **khoảng 9 phút**. Mỗi màn viết theo ba dòng: **bấm gì**, **nói gì**, **nhìn vào đâu**.

Thứ tự đã xếp có chủ đích: mở bằng thứ gây ấn tượng thị giác ngay (chữ chạy), giữa là hai thứ có số liệu thật đắt giá nhất, đóng bằng thứ chứng minh hệ thống hiểu hoàn cảnh thật (mất mạng).

---

## Chuẩn bị trước khi bắt đầu

1. Bấm **CHUAN BI DEMO.bat** trên Desktop, đợi báo xong.
2. **Đóng bớt Chrome, VS Code, Docker Desktop.** Card đồ hoạ 6 GB dùng chung cho mô hình chữ và nhận dạng giọng nói; còn dưới 1 GB trống là mọi thứ chậm đi thấy rõ.
3. Đăng nhập tài khoản quản trị, để sẵn ở tab **Tổng quan**.
4. Mở sẵn một nhiệm vụ có yêu cầu vật tư đang ở trạng thái **Đã soạn — chờ người lấy** (xem màn 4).

> **Nếu chỉ có 5 phút:** chạy màn 1, 2 và 5. Ba màn đó đủ kể trọn câu chuyện.

---

## Màn 1 — Trợ lý trả lời chạy chữ (90 giây)

**Bấm:** mở trợ lý (nút nổi góc phải), gõ *"Kho đang có sự cố gì không?"* → Enter.

**Nói:** "Câu này hệ thống trả lời tức thì, không cần gọi mô hình — vì dữ liệu sự cố đã nằm trong kho."

**Nhìn:** trả lời hiện gần như ngay, khoảng 2 giây.

Rồi gõ tiếp: *"Thôn Tân Bình có 150 người mắc kẹt, đang mưa to."*

**Nói:** "Còn câu này là tình huống thật, phải để mô hình đọc trên nền tồn kho thật. Trước đây màn hình đứng im tám giây — người trực tưởng máy treo, bấm lại lần nữa. Giờ chữ chạy ra dần."

**Nhìn:**
- Chữ đầu tiên ra sau khoảng **7 giây**, rồi chạy dần từng mẩu.
- Bên dưới câu trả lời có lời mời sang luồng điều phối, kèm đúng địa điểm và số người vừa kể.

**Câu chốt:** "Lớp chống bịa số không bị bỏ — nó chuyển về cuối dòng. Chữ chảy xong, hệ thống đối chiếu mọi con số với ảnh chụp kho; không khớp thì thay cả câu bằng câu an toàn. Người dùng thấy máy đang làm việc, mà số vẫn không bịa được."

---

## Màn 2 — Kho tổng nhìn thấy hàng của cả xã (90 giây)

Đây là màn có **số liệu thật gây bất ngờ nhất**. Đừng bỏ.

**Bấm:** vào tab **Vật tư** → bấm dòng **"Tồn kho toàn xã"** ở đầu trang để mở bảng.

**Nói trước khi mở:** "Bảng tồn bên dưới chỉ đếm hàng nằm trong chính kho tổng. Hàng đã đẩy xuống các thôn thì biến mất khỏi màn hình."

**Nhìn — chỉ tay vào hai dòng này:**

| Vật tư | Kho tổng | Toàn xã | Nằm ở thôn |
|---|---|---|---|
| Áo phao người lớn | 60 | **492** | 432 |
| Bộ sơ cứu | 34 | **1 796** | 1 762 |

**Câu chốt:** "Người trực nhìn con số 60 rồi kết luận xã hết áo phao, đi xin chi viện — trong khi 432 chiếc đang nằm ở 17 thôn của chính mình. Bảng này trả lại cái nhìn toàn xã, và nói rõ gọi thôn nào."

**Nói thêm nếu ban giám khảo hỏi sâu:** "Số này suy từ sổ lô hàng chứ không nuôi thêm một cột song song — nuôi cột song song là nuôi thêm một chỗ để lệch. Và nó trừ phần đang cho xã khác mượn, vì hàng đã rời kho thì đếm vào là đếm một thứ mình không điều được."

---

## Màn 3 — Tồn kho hiện rõ hàng đi mượn (45 giây)

Màn ngắn, đi liền sau màn 2 vì cùng một tab.

**Bấm:** cuộn lên đầu tab **Vật tư**, chỉ vào khối **"Hàng đang mắc nợ với xã khác"**.

**Nói:** "Tồn kho là một con số duy nhất. Nó không nói được bao nhiêu trong đó là hàng mình đi mượn, phải trả lại."

**Nhìn:** dòng ghi rõ *"đang mượn … (có trong kho nhưng phải trả)"* và *"đang cho mượn …"*, kèm tên xã.

**Câu chốt:** "Không có dòng này thì người điều phối đếm cả hàng đi mượn vào năng lực của mình."

> Khối này **tự ẩn** khi không có khoản mượn nào đang mở. Muốn chắc có nó lúc trình diễn thì chạy trước một vòng mượn ở màn 5.

---

## Màn 4 — Chữ ký của người đi lấy hàng (2 phút)

**Chuẩn bị:** cần một nhiệm vụ có yêu cầu vật tư đã qua bước kho xuất. Nếu chưa có: vào tab **Nhiệm vụ**, chọn một nhiệm vụ, bấm **Tiếp nhận yêu cầu** rồi **Xác nhận xuất vật tư**.

**Bấm:** ở dòng vật tư đó, giờ trạng thái là **"Đã soạn — chờ người lấy"**, hiện ra khối **"Người đi lấy ký nhận"**.

**Nói:** "Kho bấm xong 'đã chuẩn bị' là sổ ghi đủ số đã yêu cầu, và từ đó mọi màn hình đều tin hàng đã đi đủ. Nhưng chuyện hay xảy ra nhất ở kho lúc mưa bão là soạn được tám trên mười."

### Thử nhánh sai trước — đây mới là chỗ đáng xem

**Bấm:** nhập **Số thực lấy** ít hơn số đã soạn, **để trống ô lý do**, bấm **Ký nhận đã lấy hàng**.

**Nhìn:** hệ thống chặn, báo *"Thiếu N so với số đã soạn — phải ghi rõ lý do."*

**Nói:** "Con số thiếu một mình không dùng được. Người điều phối cần biết thiếu vì kho hết hàng — phải xin xã khác — hay vì xe không chở hết — chuyến sau lấy nốt. Hai việc khác hẳn nhau. Bắt buộc ở đây không phải làm khó người dùng, mà vì đúng lúc đó họ là người duy nhất biết lý do."

### Rồi ghi lý do và ký

**Bấm:** điền lý do *"Xe chỉ chở được 80, chuyến sau lấy nốt"*, bấm ký nhận.

**Nhìn:**
- Dòng đổi sang **"Đã ký nhận"**, hiện *"Đã ký nhận 80/100 — thiếu 20. Lý do: …"* trên nền vàng.
- Bên điều phối nhận **thông báo "Lấy hàng THIẾU so với số đã soạn"**.

**Câu chốt:** "Chỉ báo khi thiếu. Lấy đủ là chuyện bình thường — báo cả những lần bình thường thì người điều phối quen tay bỏ qua, rồi bỏ qua luôn lần thiếu thật."

**Nếu bị hỏi:** "Ký nhận là chữ ký, không sửa lại được. Bấm lần hai hệ thống từ chối."

---

## Màn 5 — Mượn liên xã, và khi mất mạng (3 phút)

Màn đóng. Cần **hai trình duyệt** đăng nhập hai xã khác nhau.

### Phần A — vòng thuận (2 phút)

**Bấm ở xã A:** tab **Mượn, trả** → khối "Mượn của xã khác" → điền vật tư và số lượng → gửi.

**Nói:** "Hai xã là hai hệ thống hoàn toàn tách rời. Cơ sở dữ liệu riêng, kho riêng. Xã A không nhìn thấy tồn kho xã B, và không bao giờ nhìn thấy được."

**Nhìn ở xã B:** thông báo hiện góc phải trong vài giây.

**Bấm ở xã B:** **Đồng ý cho mượn**, chọn lô → **tồn kho B giảm ngay**.

**Bấm ở xã A:** **Xác nhận đã nhận hàng**, chọn lô → **tồn kho A tăng**.

**Câu chốt:** "Sợi dây duy nhất nối hai bên là thông báo. Mỗi bên tự cộng trừ kho của mình. Không có kho chung, không có giao dịch hai pha — vì hai xã không thể phụ thuộc vào một máy chủ chung khi đường truyền là thứ đứt đầu tiên lúc bão."

### Phần B — mất mạng (1 phút, đây là điểm nhấn)

**Nói:** "Giờ mới đến phần thật. Lúc bão, đường truyền là thứ đứt đầu tiên."

**Bấm:** tab **Mượn, trả** → nút **"Ghi tay khoản đã thoả thuận qua điện thoại"**.

**Nhìn và đọc to phần mô tả:** *"Dùng khi mất mạng: hai xã gọi điện thoả thuận xong, mỗi bên tự ghi vào sổ của mình."*

**Bấm:** chọn chiều **"Mình cho xã khác mượn (kho mình GIẢM)"**, điền tên xã, mã lô, số lượng, ghi chú *"Anh Tuấn xã Xuân Thọ gọi lúc 14h, mất mạng"* → **Ghi vào sổ**.

**Nhìn:**
- Khoản mới hiện trên danh sách với nhãn **`· ghi tay`**.
- **Tồn kho giảm thật** đúng số đó.

**Câu chốt để kết cả buổi:** "Hệ thống không giả vờ rằng mạng luôn có. Mất mạng thì nó lùi về đúng cách hai xã vẫn làm với nhau từ trước khi có phần mềm — gọi điện, rồi mỗi bên ghi sổ. Khác là sổ giờ cộng trừ kho thật, và có nhãn để sau này đối chiếu còn phân biệt được khoản nào ghi tay."

---

## Nếu ban giám khảo hỏi sâu

**"Máy chủ sập giữa lúc chuyển kho thì sao?"**

"Sổ và kho nằm ở hai bước ghi khác nhau, nên có một khe hẹp giữa chúng. Chúng tôi ghi lại lời hứa chuyển kho vào cùng lượt chốt sổ; sập giữa chừng thì lời hứa nằm lại, và lần khởi động sau hệ thống tự làm nốt. An toàn nhờ khoá chống trùng vốn đã có — hàng đã đi thật thì lượt chạy lại không chuyển thêm lần nữa."

**"Hai người cùng bấm trả hàng một lúc?"**

"Một người thành công, người kia nhận câu 'Khoản mượn vừa được cập nhật ở nơi khác'. Đây là lỗi đã từng xảy ra thật trong lúc phát triển: cả hai cùng thành công, kho trừ hai lần mà sổ chỉ ghi một lần."

**"AI có tự bịa số không?"**

"Không đưa được. Backend chụp trạng thái kho rồi gửi cho mô hình; mô hình chỉ được dùng số có trong ảnh chụp đó. Trả lời xong, hệ thống đối chiếu từng con số — có số nào không nằm trong ảnh chụp thì thay cả câu."

**"Chạy trên máy nào?"**

"Toàn bộ chạy trên máy tại chỗ, không gọi dịch vụ ngoài. Mô hình chữ và mô hình nhận dạng giọng nói đều chạy trên card đồ hoạ của chính máy này. Mất internet vẫn dùng được đủ."

---

## Phòng hờ khi có sự cố

| Hiện tượng | Xử lý tại chỗ |
|---|---|
| Trợ lý chờ quá lâu mới ra chữ | Card đang bị tranh chấp. Đóng bớt trình duyệt rồi hỏi lại. Nói với ban giám khảo: "Máy này đang chạy đồng thời mô hình chữ và mô hình giọng nói trên một card 6 GB." |
| Trợ lý trả *"Chưa thể tạo câu trả lời an toàn"* | **Đây là lớp bảo vệ đang chạy đúng, không phải lỗi.** Nói thẳng: "Mô hình vừa đưa ra một con số không có trong dữ liệu kho, hệ thống chặn lại." Rồi hỏi câu khác. |
| Xã B không nhận được thông báo | Chuyển sang phần B (ghi tay) luôn, và biến sự cố thành điểm mạnh: "Đúng tình huống này chúng tôi đã lường trước." |
| Bảng "Tồn kho toàn xã" trống | Đang đăng nhập bằng tài khoản kho thôn. Chỉ kho tổng xem được — đó là chủ ý, trưởng thôn không được xem tồn của thôn khác. |
| Khối "Hàng đang mắc nợ" không hiện | Không có khoản mượn nào đang mở. Chạy màn 5 phần A trước. |

---

## Tài liệu liên quan

- [Hướng dẫn thử luồng mượn — trả liên xã](HUONG-DAN-TEST-MUON-TRA-LIEN-XA.md) — chi tiết từng bước và các nhánh rẽ
- [Kịch bản demo điều phối](KICH-BAN-DEMO-DIEU-PHOI.md) — luồng điều phối cứu hộ
- [Tài khoản demo](TAI-KHOAN-DEMO.md) — tài khoản đăng nhập hai xã

# Kịch bản demo đầy đủ — đi hết mọi chức năng

**Tổng: 25–30 phút.** Bảy phần, mỗi phần một nhóm chức năng, đi theo đúng thứ tự một ngày làm việc ở kho xã: *sáng mở máy xem tình hình → có tin báo → lập phương án → kho xuất hàng → đội lấy hàng → thiếu thì mượn xã bên → cuối kỳ đối chiếu.*

Khác bản ngắn ([KICH-BAN-QUAY-VIDEO-DEMO.md](KICH-BAN-QUAY-VIDEO-DEMO.md)) ở chỗ: bản đó chọn 9 cảnh đắt nhất để kể chuyện, bản này **đi hết 13 tab và cả 3 ứng dụng**, không bỏ chức năng nào.

Ký hiệu màn hình:

| | Màn hình | Tài khoản | Mật khẩu |
|---|---|---|---|
| **M1** | Chrome thường | `admin` | `admin123@` |
| **M2** | Chrome ẩn danh | `staff@ungphonhanh.life` | `staff123` |
| **M3** | BrowserOS | `admin.xuantho@ungphonhanh.life` | `admin123@` |
| **Đ1** | Điện thoại ảo | `rescue@ungphonhanh.life` | `rescue123` |
| **Đ2** | Điện thoại thật | `longchau@ungphonhanh.life` | `truongthon123` |

---

# PHẦN 1 — Mở máy, nhìn toàn cảnh (4 phút)

## 1.1 · Đăng nhập và phân quyền — M1

| Bấm | Đọc |
|---|---|
| Mở `localhost:3200`, đăng nhập `admin` | *"Hệ thống có ba vai: quản trị xã, phụ trách kho, lực lượng hiện trường."* |
| Chỉ thanh bên trái | *"Mỗi vai thấy một bộ tab khác nhau. Trưởng thôn không thấy được tồn kho thôn khác — đó là chủ ý, không phải thiếu sót."* |

## 1.2 · Tab **Tổng quan** — thứ tự theo mức khẩn

| Bấm | Đọc |
|---|---|
| Ở tab **Tổng quan** | *"Trang này xếp theo mức khẩn, không phải theo ý thích."* |
| Chỉ từ trên xuống | *"Việc đang chặn điều phối lên đầu. Rồi nhiệm vụ đang chờ mình. Rồi tồn kho và kiểm kê. Cuối cùng mới tới bản đồ và thiết bị."* |
| Chỉ khối **mức sẵn sàng** | *"Điểm sẵn sàng tính từ tồn kho, hạn dùng, và tình trạng thiết bị — không phải người tự chấm."* |
| Bấm **tính lại** | *"Tính lại được bất cứ lúc nào."* |

## 1.3 · Tab **Theo dõi, dự báo**

| Bấm | Đọc |
|---|---|
| Vào **Theo dõi, dự báo** | *"Dự báo mưa lấy từ dịch vụ khí tượng, theo đúng toạ độ kho."* |
| Chỉ biểu đồ xu hướng | *"Kèm xu hướng tiêu thụ vật tư — để biết thứ gì đang cạn nhanh."* |

## 1.4 · Tab **Bản đồ kho**

| Bấm | Đọc |
|---|---|
| Vào **Bản đồ kho** | *"Mười tám kho trên bản đồ thật, có toạ độ thật."* |
| Phóng to một kho thôn | *"Bản đồ chạy offline — tải sẵn, không cần internet."* |

## 1.5 · Tab **Cảm biến thử nghiệm**

| Bấm | Đọc |
|---|---|
| Vào **Cảm biến thử nghiệm** | *"Kho trung tâm có cảm biến nhiệt độ, độ ẩm, cửa mở."* |
| Chỉnh một giá trị vượt ngưỡng | *"Vượt ngưỡng là hệ thống tự tạo sự cố, không đợi người phát hiện."* |
| Chờ thông báo góc phải dưới | *"Thông báo hiện ngay — giống Zalo."* |

---

# PHẦN 2 — Nhận tin từ hiện trường (4 phút)

## 2.1 · Báo bằng giọng nói — Đ2 (điện thoại thật)

| Bấm | Đọc |
|---|---|
| Mở app, tab **Báo cáo** | *"Trưởng thôn Long Châu. Nước đang lên."* |
| Bấm **ghi âm**, nói: **"Thôn Long Châu ngập nặng, khoảng một trăm năm mươi người mắc kẹt, cần nước uống và áo phao gấp."** | *"Trời mưa, tay ướt. Anh ấy chỉ cần nói."* |
| Chờ chữ hiện | *"Nhận dạng tiếng Việt chạy trên máy chủ của xã. Giọng nói không gửi đi đâu."* |
| Đọc lại, sửa nếu sai, bấm **gửi** | *"Máy nghe xong, người đọc lại rồi mới gửi."* |

## 2.2 · Các tab khác trên điện thoại — Đ2

| Bấm | Đọc |
|---|---|
| Tab **Tổng quan** | *"Trưởng thôn xem được tình hình kho mình."* |
| Tab **Sẵn sàng** | *"Mức sẵn sàng của riêng thôn."* |
| Tab **Kho** | *"Tồn kho thôn mình — và chỉ thôn mình."* |
| Tab **Kiểm kê** | *"Kiểm kê ngay trên điện thoại, không cần về xã."* |
| Tab **Thông báo** | *"Thông báo từ xã gửi xuống."* |
| Chỉ thanh tab dưới | *"Mỗi tab một màu theo nghĩa: việc phải làm màu xanh, nguy hiểm màu đỏ, chờ xử lý màu cam."* |

## 2.3 · Xã nhận được báo cáo — M1

| Bấm | Đọc |
|---|---|
| Chỉ thông báo góc phải dưới | *"Xã nhận được ngay."* |
| Vào tab **Sự cố** | *"Báo cáo vào danh sách sự cố, có mức độ và trạng thái."* |

---

# PHẦN 3 — Trợ lý và điều phối (5 phút)

## 3.1 · Trợ lý trả lời tức thì

| Bấm | Đọc |
|---|---|
| Mở trợ lý (nút nổi góc phải dưới) | — |
| Gõ **Còn bao nhiêu áo phao người lớn?** | *"Câu tra dữ liệu trả lời trong hai giây, không cần hỏi mô hình."* |
| Gõ **Vật tư nào sắp hết hạn?** | *"Kèm hạn dùng, xếp hạn gần lên trước."* |
| Gõ **Kho đang có sự cố gì không?** | — |

## 3.2 · Trợ lý đọc tình huống thật

| Bấm | Đọc |
|---|---|
| Gõ **Thôn Long Châu có 150 người mắc kẹt, đang mưa to.** | *"Còn đây là tình huống thật."* |
| **Chờ chữ chạy** | *"Chữ chạy dần chứ không đứng im. Trước đây màn hình đứng tám giây, người trực tưởng máy treo."* |
| Chỉ lời mời sang điều phối | *"Nó nhận ra đây là việc cần điều xe, và mời sang luồng điều phối kèm sẵn địa điểm, số người."* |

**Nói khi chờ:** *"Mọi con số trong câu trả lời phải có trong dữ liệu kho. Chữ chạy xong, hệ thống đối chiếu từng số; số nào không có thật thì thay cả câu."*

## 3.3 · Thử lớp chống bịa số

| Bấm | Đọc |
|---|---|
| Gõ **Hôm nay đội nào thắng bóng đá?** | *"Hỏi ngoài phạm vi."* |
| Chờ trả lời | *"Nó từ chối, và không kéo theo số liệu kho vào câu trả lời."* |

## 3.4 · Tab **Điều phối cứu hộ** — lập phương án

| Bấm | Đọc |
|---|---|
| Bấm **mở luồng điều phối** từ trợ lý | *"Lời kể mang thẳng sang, không gõ lại."* |
| Kiểm địa điểm, số người đã điền sẵn | *"Bóc ra từ chính câu vừa kể."* |
| Điền thêm: trẻ em, người già, ca y tế | *"Càng rõ thì định mức càng sát."* |
| Bấm **tạo phương án** | — |
| Chờ bảng vật tư | *"Đối chiếu định mức cứu trợ quốc tế với tồn kho thật, rồi chia việc cho từng kho."* |
| Chỉ dòng **Nước uống** | *"Nước tính theo chai năm lít. Mười lăm lít một người một ngày — hệ thống ra số chai, không bắt người xuất kho tự chia."* |
| Chỉ phần phân bổ theo kho | *"Ưu tiên kho thôn gần điểm ngập nhất, thiếu mới lấy từ kho tổng."* |
| Chỉ phần **tuyến và thời gian tới** | *"Kèm quãng đường và thời gian dự kiến, tính từ toạ độ thật."* |

## 3.5 · Tab **Nhiệm vụ**

| Bấm | Đọc |
|---|---|
| Vào **Nhiệm vụ** | *"Nhiệm vụ vừa tạo nằm ở đây."* |
| Chỉ bộ lọc **Đang xử lý / Đã kết thúc** | *"Việc cần mình xử lý được đưa lên trước."* |
| Bấm vào nhiệm vụ để mở chi tiết | — |

---

# PHẦN 4 — Kho vận hành (5 phút)

## 4.1 · Tab **Vật tư** — các thao tác kho — M2

| Bấm | Đọc |
|---|---|
| Đăng nhập M2 bằng `staff@` | *"Đây là màn hình người phụ trách kho."* |
| Vào tab **Vật tư** | — |
| Bấm **Tiếp nhận lô mới** | *"Nhập hàng vào kho: chọn vật tư, mã lô, số lượng, hạn dùng, vị trí kệ."* |
| Điền và xác nhận | — |
| Chọn một lô, bấm **Nhập thêm vào lô** | *"Bổ sung vào lô sẵn có."* |
| Chọn một lô, bấm **Chuyển vị trí** | *"Chuyển sang kệ khác trong kho."* |
| Chọn một lô, bấm **Xuất khỏi kho** | *"Xuất lẻ."* |
| Bấm **Xuất nhiều lô** | *"Hoặc xuất hàng loạt theo phương án."* |

## 4.2 · Mã QR

| Bấm | Đọc |
|---|---|
| Chọn một lô, bấm **in QR** | *"Mỗi lô có mã QR."* |
| Chỉ mã | *"Quét mã ra ngay lô đó, vị trí kệ, hạn dùng — không phải tra sổ."* |

## 4.3 · Tab **Kiểm kê**

| Bấm | Đọc |
|---|---|
| Vào **Kiểm kê** | *"Kiểm kê định kỳ: đếm thực tế rồi đối chiếu với sổ."* |
| Nhập số đếm được lệch với sổ | — |
| Xác nhận | *"Lệch bao nhiêu ghi lại bấy nhiêu, kèm người đếm và thời điểm. Không sửa thẳng con số trong sổ."* |

## 4.4 · Chuẩn bị hàng cho nhiệm vụ

| Bấm | Đọc |
|---|---|
| Vào tab **Nhiệm vụ**, mở nhiệm vụ vừa tạo | *"Yêu cầu vật tư từ điều phối gửi xuống."* |
| Bấm **Tiếp nhận yêu cầu** | *"Kho xác nhận đã đọc."* |
| Bấm **Báo thiếu / sai** trên một dòng khác | *"Nếu kho không đủ thì báo ngược lên, điều phối duyệt lại số."* |
| Quay lại dòng đầu, bấm **Xác nhận xuất vật tư** | *"Xuất hàng — tồn kho trừ thật ngay lúc này."* |

## 4.5 · Kho nào xong, kho nào chưa — M1

| Bấm | Đọc |
|---|---|
| Về M1, mở nhiệm vụ | — |
| Chỉ các thẻ màu | *"Xanh là kho đã xong, cam là còn nợ. Trước đây chỉ có một con số gộp — nó không nói được phải gọi cho ai."* |

---

# PHẦN 5 — Đội hiện trường lấy hàng (3 phút)

## 5.1 · Nhận nhiệm vụ — Đ1 (điện thoại ảo)

| Bấm | Đọc |
|---|---|
| Mở app, đăng nhập `rescue@` | *"Đội hiện trường làm việc trên điện thoại."* |
| Tab **Lệnh** | *"Nhiệm vụ hiện ở đây."* |
| Mở nhiệm vụ | *"Kèm địa điểm, số người, danh sách vật tư, và lấy ở kho nào."* |

## 5.2 · Ký nhận — thử nhánh sai trước

| Bấm | Đọc |
|---|---|
| Cuộn tới khối **Ký nhận đã lấy hàng** | *"Kho đã soạn xong. Người đi lấy phải ký."* |
| **Nhập số ít hơn, để trống ô lý do** | *"Hôm nay xe nhỏ, không chở hết."* |
| Bấm **Ký nhận đã lấy hàng** | — |
| **Chờ báo lỗi** | *"Hệ thống chặn."* |
| Đọc to câu báo | *"Thiếu bao nhiêu thì phải nói rõ vì sao."* |
| Điền lý do, bấm lại | *"Giờ mới cho qua."* |

**Nói:** *"Con số thiếu một mình không dùng được. Điều phối cần biết thiếu vì kho hết hàng — phải xin xã khác — hay vì xe không chở hết — chuyến sau lấy nốt. Hai việc khác hẳn nhau."*

## 5.3 · Điều phối nhận báo thiếu — M1

| Bấm | Đọc |
|---|---|
| Chỉ thông báo góc phải dưới | *"Điều phối nhận ngay: lấy thiếu bao nhiêu và vì sao."* |
| Mở nhiệm vụ, chỉ dòng nền vàng | *"Ghi lại trong sổ nhiệm vụ, không mất đi."* |

## 5.4 · Hoàn tất giao hàng — Đ1

| Bấm | Đọc |
|---|---|
| Bấm **xác nhận đã giao** | *"Đội giao xong thì báo về."* |
| Chọn kết quả: giao đủ / giao một phần / không giao được | *"Ghi rõ kết quả, kèm lý do nếu không đủ."* |

---

# PHẦN 6 — Thiếu hàng thì mượn xã bên (5 phút)

## 6.1 · Nhìn toàn xã trước khi đi xin — M1

| Bấm | Đọc |
|---|---|
| Vào tab **Vật tư** | *"Trước khi xin xã khác, phải xem trong xã còn gì đã."* |
| Bấm mở **Tồn kho toàn xã** | — |
| Dừng ở thẻ **Kho thôn Long Châu** | *"Long Châu giữ gần hai nghìn đơn vị — nhưng chỉ bốn mặt hàng."* |
| Chỉ thẻ kho tổng | *"Kho tổng mười bảy mặt hàng nhưng mỗi thứ ít."* |
| Chỉ dòng quy đổi dưới tên nước | *"Nước hiện cả ba cách đếm: chai, lốc, lít."* |

**Nói:** *"Không có khối này, người trực nhìn con số ở kho tổng rồi kết luận xã hết hàng — trong khi thứ cần đang nằm ở thôn bên cạnh."*

## 6.2 · Nhãn hàng đang mắc nợ

| Bấm | Đọc |
|---|---|
| Chỉ khối **Hàng đang mắc nợ với xã khác** (nếu có) | *"Tồn kho là một con số duy nhất — nó không nói được bao nhiêu trong đó là hàng đi mượn, phải trả lại."* |

## 6.3 · Gửi yêu cầu mượn — tab **Mượn, trả**

| Bấm | Đọc |
|---|---|
| Bấm **Gửi yêu cầu mượn xã khác** | *"Cả xã vẫn thiếu. Phải hỏi xã bên cạnh."* |
| Chọn xã **Xuân Thọ**, vật tư **Áo phao người lớn**, số **50** | *"Chọn từ danh sách, không gõ tay — tên phải khớp thì bên kia mới nhận đúng."* |
| Ghi chú, bấm **Gửi yêu cầu** | *"Kho mình chưa đổi gì. Chưa ai đồng ý thì chưa có hàng nào rời chỗ."* |

## 6.4 · Xã bên kia quyết ngay trên thông báo — M3

| Bấm | Đọc |
|---|---|
| **Chờ thông báo góc phải dưới** | *"Xã Xuân Thọ nhận ngay."* |
| Chỉ **hai nút trên thông báo** | *"Và quyết luôn tại chỗ, không phải đi tìm."* |
| Bấm **Đồng ý** | — |
| Chọn lô, xác nhận | *"Kho Xuân Thọ trừ đúng số đó."* |
| Chỉ tồn kho đã giảm, và nhãn *đang cho mượn* | — |

## 6.5 · Nhận hàng về — M1

| Bấm | Đọc |
|---|---|
| Bấm **Xác nhận đã nhận hàng**, chọn lô | *"Đồng Xuân nhận vào kho."* |
| Tab **Vật tư**, chỉ nhãn vàng | *"Ghi rõ: có trong kho nhưng phải trả."* |

## 6.6 · Trả hàng

| Bấm | Đọc |
|---|---|
| Tab **Mượn, trả**, bấm **Ghi nhận đã trả**, nhập **20** | *"Trả từng phần cũng được."* |
| Chỉ trạng thái **Đã trả một phần** | — |
| Bấm lại, trả nốt **30** | *"Trả hết thì nhãn biến mất ở cả hai bên."* |
| Sang M3, bấm **Ghi nhận nhận lại** | *"Xuân Thọ nhận lại, kho về đúng số ban đầu."* |

## 6.7 · Thử nhánh từ chối

| Bấm | Đọc |
|---|---|
| Gửi một yêu cầu mới từ M1 | — |
| Ở M3 bấm **Từ chối**, ghi lý do | *"Từ chối thì kho hai bên không đổi gì."* |

## 6.8 · Khi mất mạng — ghi tay

| Bấm | Đọc |
|---|---|
| M1, bấm **Ghi tay khoản đã thoả thuận qua điện thoại** | *"Lúc bão, đường truyền là thứ đứt đầu tiên."* |
| Đọc to dòng mô tả trong form | *"Hai xã gọi điện thoả thuận xong, mỗi bên tự ghi vào sổ mình."* |
| Chọn chiều, xã, vật tư, số lượng | *"Chọn tên vật tư, không phải mã lô — người đang gọi điện nói 'nước uống', không nói mã."* |
| Ghi chú **ai gọi, lúc mấy giờ**, bấm **Ghi vào sổ** | — |
| Chỉ nhãn **· ghi tay** | *"Có dấu riêng để sau này đối chiếu còn phân biệt được."* |
| Chỉ tồn kho đã đổi | *"Kho vẫn cộng trừ thật."* |

**Câu chốt:** *"Hệ thống không giả vờ rằng mạng luôn có. Mất mạng thì nó lùi về đúng cách hai xã vẫn làm với nhau từ trước khi có phần mềm."*

---

# PHẦN 7 — Đối chiếu và quản trị (3 phút)

## 7.1 · Tab **Báo cáo tháng**

| Bấm | Đọc |
|---|---|
| Vào **Báo cáo tháng** | *"Báo cáo tổng hợp theo tháng: nhập, xuất, tồn, hao hụt."* |
| Bấm xuất báo cáo | *"Xuất ra để gửi lên huyện."* |

## 7.2 · Tab **Nhật ký**

| Bấm | Đọc |
|---|---|
| Vào **Nhật ký** | *"Mọi thao tác đều có dấu vết: ai làm, lúc nào, đổi gì từ đâu sang đâu."* |
| Lọc theo loại **Vật tư** | *"Lọc được theo loại và theo người."* |
| Chỉ một dòng vừa tạo | *"Đây là thao tác vừa nãy."* |

## 7.3 · Tab **Tài khoản**

| Bấm | Đọc |
|---|---|
| Vào **Tài khoản** | *"Hai mươi tài khoản: một quản trị, một hiện trường, mười tám phụ trách kho."* |
| Chỉ cột vai và kho phụ trách | *"Mỗi trưởng thôn gắn đúng một kho. Tên đăng nhập là tên thôn — nhìn là biết ai giữ kho nào."* |
| Bấm **đổi email nhận cảnh báo** | *"Đổi được email nhận cảnh báo cho từng người."* |

## 7.4 · Đối chiếu số — đóng buổi demo

| Bấm | Đọc |
|---|---|
| Về tab **Vật tư**, so với số ghi ra giấy đầu buổi | *"Đầu buổi tôi đã ghi lại tồn kho."* |
| Chỉ từng con số | *"Xuất bao nhiêu, mượn bao nhiêu, trả bao nhiêu — cộng trừ khớp từng đơn vị."* |

---

## Bảng kiểm — đã đi hết chưa

Đánh dấu khi chạy thử để không sót:

**Web (13 tab)**
- [ ] Tổng quan · [ ] Điều phối cứu hộ · [ ] Nhiệm vụ · [ ] Theo dõi, dự báo
- [ ] Vật tư · [ ] Kiểm kê · [ ] Mượn, trả · [ ] Sự cố
- [ ] Báo cáo tháng · [ ] Bản đồ kho · [ ] Cảm biến thử nghiệm · [ ] Tài khoản · [ ] Nhật ký

**Thao tác kho**
- [ ] Tiếp nhận lô mới · [ ] Nhập thêm vào lô · [ ] Chuyển vị trí
- [ ] Xuất khỏi kho · [ ] Xuất nhiều lô · [ ] In QR · [ ] Kiểm kê lệch

**Luồng nhiệm vụ**
- [ ] Báo cáo từ hiện trường · [ ] Trợ lý đọc tình huống · [ ] Tạo phương án
- [ ] Kho tiếp nhận · [ ] Kho báo thiếu · [ ] Kho xuất
- [ ] Đội ký nhận thiếu (bị chặn) · [ ] Đội ký nhận có lý do · [ ] Xác nhận đã giao

**Mượn trả liên xã**
- [ ] Gửi yêu cầu · [ ] Quyết trên thông báo · [ ] Nhận hàng
- [ ] Trả một phần · [ ] Trả hết · [ ] Nhận lại · [ ] Từ chối · [ ] Ghi tay

**Điện thoại (7 tab × 2 máy)**
- [ ] Tổng quan · [ ] Sẵn sàng · [ ] Kho · [ ] Kiểm kê
- [ ] Lệnh · [ ] Thông báo · [ ] Báo cáo (ghi âm)

**AI**
- [ ] Nhận dạng giọng nói · [ ] Trợ lý trả nhanh · [ ] Trợ lý chạy chữ
- [ ] Bóc tách địa điểm, số người · [ ] Từ chối câu ngoài phạm vi

---

## Nếu chỉ có ít thời gian

| Thời lượng | Chạy phần |
|---|---|
| 30 phút | Toàn bộ |
| 15 phút | Phần 2 → 3 → 5 → 6 (bỏ 1, 4, 7) |
| 8 phút | 2.1 → 3.2 → 5.2 → 6.1 → 6.8 |

---

## Phòng hờ khi có sự cố

| Hiện tượng | Xử lý — và câu nói biến nó thành điểm mạnh |
|---|---|
| Trợ lý chờ lâu | *"Máy này chạy đồng thời mô hình chữ và mô hình giọng nói trên một card sáu gi-ga."* Đóng bớt trình duyệt. |
| Trợ lý trả *"Chưa thể tạo câu trả lời an toàn"* | **Lớp bảo vệ đang chạy đúng.** *"Mô hình vừa đưa ra một con số không có trong dữ liệu kho, hệ thống chặn lại."* |
| Nhận dạng ra sai chữ | Sửa tay rồi gửi: *"Máy nghe xong, người đọc lại rồi mới gửi."* |
| Xã bên kia không nhận được | Chuyển thẳng sang **6.8**: *"Đúng tình huống này chúng tôi đã lường trước."* |
| Khối tồn kho toàn xã trống | Đang dùng tài khoản kho thôn. Chỉ kho tổng xem được — đó là chủ ý. |
| App báo lỗi mạng | Kiểm điện thoại cùng WiFi với máy tính. Vẫn lỗi thì dùng trình duyệt trên điện thoại. |

---

## Chuẩn bị trước khi bắt đầu

1. Bấm **CHUAN BI DEMO.bat**, đợi báo xong.
2. **Đóng Chrome thừa, VS Code, Docker Desktop** — card đồ hoạ 6 GB dùng chung cho hai mô hình.
3. Đăng nhập sẵn 5 màn hình theo bảng đầu tài liệu.
4. **Ghi tồn kho Áo phao người lớn và Nước uống ra giấy** — cuối buổi đối chiếu.
5. Tab **Mượn, trả** ở M1 và M3 nên trống. Còn dòng cũ thì xoá.

## Dọn dẹp sau khi chạy

1. Xoá dòng mượn thử ở **cả hai xã**.
2. Đối chiếu tồn kho với số đã ghi, lệch thì sửa bằng kiểm kê.
3. Xoá nhiệm vụ thử nếu không muốn nó xuất hiện lần sau.

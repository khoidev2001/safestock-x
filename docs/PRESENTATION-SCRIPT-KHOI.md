# Kịch bản thuyết trình — phần của Khôi

> Vị trí trong bài: sau phần của Trình (luồng điều phối cứu hộ), trước khi Trình quay
> lại dẫn vào demo. Thời lượng mục tiêu: **3 phút – 4 phút**.
> Chủ đề: quản lý kho thông minh · IoT cảnh báo · trợ lý AI · thư quan tâm của
> Hội Chữ thập đỏ xã Đồng Xuân.

---

## 0. Chuyển tiếp (10 giây)

> Cảm ơn Trình.
>
> Vừa rồi là câu chuyện của những ngày có thiên tai. Nhưng một hệ thống cứu hộ chỉ
> mạnh được vào ngày bão, nếu nó đã được chăm sóc tử tế trong **suốt ba trăm ngày
> không có bão**. Phần của em nói về những ngày như vậy.

**Ghi chú sân khấu:** đứng yên, chưa chuyển slide. Câu "ba trăm ngày không có bão"
đọc chậm lại một nhịp.

---

## 1. Kho tập trung — và câu hỏi đúng cần hỏi (45 giây)

> Toàn bộ số lượng vật tư, lịch sử nhập – xuất và thông tin của từng kho đều được
> quản lý tập trung trên hệ thống. Một xã của chúng em có **một kho tổng và mười bảy
> kho thôn**. Khi cần kiểm tra một loại vật tư, người quản lý chỉ cần tìm trên hệ
> thống, thay vì gọi điện hỏi từng thôn — mỗi cuộc gọi vài phút, giữa lúc nước đang lên.
>
> Nhưng chúng em nhận ra một điều: biết **"còn bao nhiêu"** là chưa đủ.
>
> Câu hỏi thật sự trong cứu hộ là: **"bao nhiêu trong số đó dùng được ngay bây giờ?"**
>
> Vì vậy mỗi lô hàng trong hệ thống mang **hai chiều trạng thái tách rời nhau**:
> tình trạng vật lý — mới, đã dùng, cần kiểm tra, hỏng; và trạng thái lưu hành —
> đang trong kho, đang cho mượn, đã xuất.
>
> Ba mươi chiếc áo phao còn tốt nhưng đang cho đội xung kích mượn đi diễn tập thì
> **không được tính là khả dụng**. Đây chính là chỗ phần mềm kho thông thường hay
> đếm nhầm — và một con số tồn kho đẹp có thể che giấu một kho không xuất được hàng.

**Ghi chú:** chiếu slide bảng vật tư theo lô. Nhấn mạnh cụm **"dùng được ngay bây giờ"**.

---

## 2. Chỉ số sẵn sàng của kho (35 giây)

> Từ dữ liệu đó, hệ thống tính ra **chỉ số sẵn sàng** cho từng kho: chấm theo sáu
> chiều, tính ở bốn cấp — từng lô, từng kệ, từng khu, tới toàn kho.
>
> Điểm quan trọng là hệ thống **không trả về một con số đơn độc**. Nó trả về một kết
> luận vận hành, kèm lý do và việc phải làm.
>
> Ví dụ: kho trung tâm đang chín mươi lăm trên một trăm điểm — rất đẹp. Cảm biến khói
> báo vượt ngưỡng, nhiệt độ tăng vọt, hệ thống mở sự cố nguy cơ cháy. Chỉ số lập tức
> chuyển sang trạng thái **"không điều phối được"**.
>
> Người điều phối biết ngay là **không được lên phương án lấy hàng từ kho này** —
> thay vì nhìn con số chín mươi lăm rồi yên tâm.

**Ghi chú:** slide chỉ số sẵn sàng. Đọc chậm cụm "không điều phối được".

---

## 3. Không tìm ở kho tổng, tìm ở cả xã (20 giây)

> Hệ thống cũng ngăn một sai lầm mà chúng em đã thấy ngoài đời: người trực nhìn con số
> ở kho tổng, kết luận cả xã hết hàng, rồi đi xin chi viện — trong khi thứ mình cần
> đang nằm ở thôn bên cạnh.
>
> Màn hình tồn kho toàn xã cho thấy kho tổng chỉ còn ít bộ sơ cứu, nhưng kho thôn
> Long Châu đang giữ **hơn một nghìn sáu trăm bộ**. Xe chạy bốn ki-lô-mét, thay vì
> gọi điện xin xã bên.

---

## 4. IoT — cảnh báo trước khi mất hàng (50 giây)

> Bên cạnh đó, tại mỗi kho có thể triển khai các thiết bị IoT để theo dõi điều kiện
> môi trường và phát hiện sự cố: cân kệ, nhiệt độ, độ ẩm, khói, cảm biến cửa, cổng
> RFID, camera, nguồn điện — **chín loại thiết bị**.
>
> Hệ thống quét theo **chín loại sự cố**. Chúng em xin nói kỹ hai quy tắc, vì đó là
> chỗ thể hiện rõ nhất cách nhóm em suy nghĩ:
>
> **Thứ nhất — nguy cơ cháy đòi hai dấu hiệu cùng lúc**: khói vượt ba mươi ppm
> **và** nhiệt độ tăng từ mười lăm độ trở lên trong cùng một cửa sổ quét. Chỉ có khói
> thì không kích hoạt. Vì một hệ thống báo động giả vài lần sẽ bị người ta tắt đi —
> và lần thứ năm cháy thật thì không còn ai nghe nữa.
>
> **Thứ hai — sự im lặng cũng là một sự cố.** Thiết bị bỏ lỡ ba chu kỳ báo thì hệ
> thống cảnh báo; bỏ lỡ mười chu kỳ thì coi như thiết bị đã chết. Nếu chỉ phản ứng
> với số liệu nhận được, thì im lặng sẽ bị hiểu nhầm là "mọi thứ bình thường" — đúng
> lúc kho đang không hề được giám sát.
>
> Khi phát hiện bất thường, hệ thống mở hồ sơ sự cố kèm bằng chứng, báo thời gian
> thực và gửi thư cảnh báo cho người phụ trách. Thư đi qua một **hàng chờ bền vững**:
> mất Internet thì thư nằm chờ và gửi lại sau, nhưng vẫn ghi đủ **ba mốc thời gian** —
> lúc phát hiện, lúc hệ thống nhận, lúc gửi đi — để không ai nhầm một cảnh báo cũ
> là cảnh báo mới.
>
> Hai giờ sáng, độ ẩm kho tăng lên tám mươi tám phần trăm vì mái tôn dột. Hệ thống mở
> sự cố bảo quản xấu và gửi thư cho người phụ trách. Sáng ra, số thuốc và lương khô
> ở khu đó vẫn còn dùng được.

**Ghi chú:** slide danh sách sự cố + thư cảnh báo ba mốc thời gian.

---

## 5. Nói thẳng về phần cứng (20 giây) — **đừng bỏ đoạn này**

> Và chúng em xin nói thẳng một điều: hiện tại lớp cảm biến trong hệ thống là một
> **bản sao số của kho** — một ứng dụng máy tính mô phỏng đủ chín loại thiết bị, để
> chúng em kiểm thử trọn chuỗi *tín hiệu → sự cố → cảnh báo → chỉ số sẵn sàng*
> **trước khi bỏ tiền mua thiết bị**.
>
> Nhưng đường ống dữ liệu được thiết kế để **cảm biến thật và thiết bị mô phỏng đi
> chung một lối vào**, mỗi cổng thu phát có khóa riêng và chỉ gửi được cho đúng kho.
> Nghĩa là khi gắn thiết bị thật, phần nghiệp vụ phía sau **không phải sửa**.
>
> Nhóm em sẽ không tuyên bố tương thích phần cứng trước khi nghiệm thu thiết bị thật.

**Ghi chú:** đoạn này là điểm cộng về sự trung thực. Nói bình thản, không xin lỗi,
không hạ giọng. Đây là *lựa chọn kỹ thuật*, không phải *thiếu sót*.

---

## 6. Trợ lý AI — hỏi bằng tiếng Việt, nhưng không được bịa số (40 giây)

> Tiếp đến, hệ thống được tích hợp **trợ lý AI**, cho phép người dùng truy vấn nhanh
> thông tin về kho, vật tư hoặc dữ liệu cứu hộ bằng ngôn ngữ tự nhiên.
>
> Thay vì mở từng báo cáo và kiểm tra từng kho, người quản lý hỏi thẳng:
> *"Kho nào hiện còn nhiều áo phao nhất?"* — khoảng **hai giây** là có số, kèm phân bổ
> theo từng kho. Hoặc: *"Trong đợt thiên tai gần nhất, chúng ta đã dùng bao nhiêu
> thùng nước?"*
>
> Nhưng điều chúng em quan tâm nhất ở đây không phải là trợ lý trả lời nhanh, mà là
> **trợ lý không được phép đưa ra một con số không có trong dữ liệu**.
>
> Sau khi mô hình viết xong câu trả lời, hệ thống **đối chiếu từng con số** trong đó
> với ảnh chụp dữ liệu kho tại thời điểm hỏi. Không khớp thì câu trả lời bị chặn lại,
> và màn hình hiện: *"Chưa thể tạo câu trả lời an toàn từ dữ liệu hiện có."*
>
> Bởi vì trong cứu hộ, **một câu trả lời sai nghe rất thuyết phục còn nguy hiểm hơn
> là không có câu trả lời nào.**
>
> Còn khi người dùng hỏi về định mức hay quy trình sơ cứu, trợ lý trả lời dựa trên
> kho tri thức biên tập từ **Sphere Standards, IFRC, WHO và cơ quan phòng chống thiên
> tai Việt Nam** — và **bắt buộc trích nguồn**. Chủ đề ngoài phạm vi tài liệu thì trả
> lời "chưa có trong tài liệu tham khảo", chứ không lấy trí nhớ của mô hình ra bù vào.
>
> Toàn bộ mô hình AI **chạy tại chỗ**, trên máy đặt tại xã — không gửi dữ liệu ra
> ngoài, và **không tính tiền theo lượt gọi**.

**Ghi chú:** slide trợ lý trả lời + slide trợ lý bị chặn số sai. Câu "sai nghe rất
thuyết phục" là câu chốt — ngừng một nhịp sau đó.

---

## 7. Biết trước thay vì biết sau (20 giây)

> Và vì mọi giao dịch đều được ghi lại, hệ thống dự báo được thứ gì sắp cạn, thứ gì
> sắp hết hạn, rồi ghép thêm **lượng mưa dự báo bảy mươi hai giờ theo đúng tọa độ kho**.
>
> Sáng ngày mười hai tháng Chín, bản tin đầu ngày báo: mưa một trăm tám mươi mi-li-mét
> trong ba ngày tới; với mức mưa đó nhu cầu nước uống dự kiến **gấp đôi**, kho sẽ thiếu
> khoảng bốn trăm chai, và lượng nước hiện có chỉ còn đủ khoảng chín ngày.
>
> Xã nhập hàng **trước khi mưa tới** — chứ không phải sau khi đã thiếu.

---

## 8. Thư quan tâm của Hội Chữ thập đỏ xã Đồng Xuân (35 giây)

**Ghi chú sân khấu:** chuyển slide sang ảnh chụp lá thư. Đây là đoạn cần nói chậm
nhất trong cả phần. Nhìn thẳng xuống ban giám khảo, không nhìn slide.

> Thưa quý ban giám khảo, có một điều chúng em muốn nói rõ.
>
> Dự án này không bắt đầu từ một bài toán trên giấy. Nó bắt đầu từ **quê nhà của
> chúng em — xã Đồng Xuân**, nơi trong gia đình thành viên nhóm có người đang trực
> tiếp tham gia công tác **Hội Chữ thập đỏ xã**. Nghĩa là những gì chúng em vừa trình
> bày — sổ giấy, bảng Excel, tin nhắn Zalo, những thùng vật tư hết hạn mà không ai
> kịp biết — không phải là giả định. Đó là những gì chúng em nhìn thấy tận nơi.
>
> Và để dự án này không dừng lại ở một sản phẩm dự thi, nhóm em đã làm việc với
> **Hội Chữ thập đỏ xã Đồng Xuân** và nhận được **thư quan tâm** của Hội — như quý
> ban giám khảo đang thấy trên màn hình.
>
> Trong thư, Hội xác nhận ba điều:
>
> **Một** — xác nhận đúng thực trạng: công tác quản lý kho vật tư cứu trợ tại xã hiện
> vẫn làm thủ công bằng sổ sách và bảng tính; trong đợt bão lũ năm 2025 đã phát sinh
> tình trạng vật tư hết hạn, hư hỏng và số liệu không khớp giữa các thôn.
>
> **Hai** — xác nhận nhu cầu thật đối với một hệ thống quản lý kho và điều phối vật tư
> như Ứng phó nhanh.
>
> **Ba** — và đây là điều chúng em trân trọng nhất: Hội **đồng ý tạo điều kiện cho
> nhóm khảo sát quy trình thật và triển khai thử nghiệm tại xã sau cuộc thi**.
>
> Với chúng em, lá thư này có ý nghĩa hơn một trang giấy xác nhận. Nó nghĩa là sản phẩm
> này **có một nơi để về**.

---

## 9. Chốt phần và chuyển sang demo (20 giây)

> Ngoài những chức năng vừa trình bày, Ứng phó nhanh còn nhiều tính năng được thiết kế
> riêng cho quy trình điều phối cứu hộ, và chúng em xin phép trình bày cụ thể hơn
> trong phần demo ngay sau đây.
>
> Với Ứng phó nhanh, điều chúng em muốn xây dựng không chỉ là một phần mềm quản lý kho,
> cũng không chỉ là một công cụ AI. Chúng em muốn xây dựng một hệ thống có thể
> **kết nối thông tin – hỗ trợ ra quyết định – điều phối nguồn lực**, để công nghệ
> chia sẻ một phần áp lực với những con người đang trực tiếp đứng ở tuyến đầu.
>
> Bởi vì chúng ta có thể không kiểm soát được **khi nào** thiên tai xảy ra — nhưng
> chúng ta hoàn toàn có thể chuẩn bị tốt hơn, phối hợp nhanh hơn và ứng phó hiệu quả
> hơn khi nó thực sự ập đến.
>
> Sau đây, xin mời bạn Trình trở lại với phần demo một quy trình cứu hộ thực tế.

**Ghi chú:** câu cuối ngừng hai giây trước khi bàn giao. Đừng vội bước lùi.

---

# PHỤ LỤC A — Nếu thư quan tâm chưa kịp có trong tay

Thay **ba đoạn cuối của mục 8** (từ "Và để dự án này không dừng lại…") bằng:

> Và để dự án này không dừng lại ở một sản phẩm dự thi, nhóm em đang làm việc với
> **Hội Chữ thập đỏ xã Đồng Xuân** để nhận **thư quan tâm** làm đầu mối khảo sát —
> xác nhận thực trạng quản lý kho thủ công tại xã, xác nhận nhu cầu, và tạo điều kiện
> cho nhóm triển khai thử nghiệm tại địa phương ngay sau cuộc thi.
>
> Chúng em không muốn chỉ nói rằng sản phẩm này *có thể* dùng được ở xã. Chúng em muốn
> mang nó về đúng nơi nó sinh ra, và để chính những người làm công tác cứu trợ ở đó
> nói cho chúng em biết chỗ nào còn chưa đúng.

---

# PHỤ LỤC B — Bốn câu ban giám khảo hay hỏi ở phần này

**"Nếu mất điện, mất mạng thì sao?"**
> Mô hình AI và nhận dạng giọng nói chạy ngay trên máy tại xã. Bản đồ và dữ liệu đường
> đi tải sẵn trong máy. Ứng dụng IoT giữ hàng chờ bền vững, chuông tại kho vẫn kêu khi
> mất kết nối máy chủ và gửi lại không trùng khi có mạng. Điện thoại cho xem dữ liệu đã
> lưu kèm dấu thời gian nhưng **từ chối ghi mới** — vì một con số ghi vào lúc không
> đồng bộ được còn nguy hiểm hơn là không ghi.

**"Chi phí triển khai cho một xã là bao nhiêu?"**
> Phần mềm nền tảng và mô hình AI: **không đồng** — toàn bộ mã nguồn mở, chạy tại chỗ,
> không tính tiền theo lượt gọi. Máy chủ ứng dụng dùng máy văn phòng sẵn có ở UBND xã.
> Phát sinh thật sự là **một thân máy tính phổ thông** để chạy riêng cơ sở dữ liệu, đặt
> trong mạng nội bộ và không mở ra Internet. Thiết bị người dùng là điện thoại Android
> cán bộ đang dùng. Cảm biến **không bắt buộc ở giai đoạn đầu**.

**"AI ở đây thật sự làm gì, hay chỉ là gắn nhãn?"**
> Nhóm em phân định rõ. AI **không** tham gia cộng trừ kho, **không** tự duyệt phương án,
> **không** sinh tọa độ, **không** tự sửa danh mục vật tư. Phần dự báo cạn kho là thống kê
> tất định — nhóm em gọi đúng tên nó là dự báo thống kê, không phóng đại thành học sâu.
> AI làm bốn việc: hiểu tiếng Việt tự nhiên, nhận dạng giọng nói tại chỗ, truy hồi tài
> liệu theo ngữ nghĩa, và diễn đạt những dữ kiện mà máy chủ đã kiểm chứng. Mọi con số
> đều bị đối chiếu lại với cơ sở dữ liệu trước khi hiện lên màn hình.

**"Kho thôn không có cảm biến thì chỉ số sẵn sàng có bị thấp oan không?"**
> Không. Kho thôn **không bị trừ điểm vì lý do không có thiết bị** — đó là chủ trương
> thiết kế, không phải lỗ hổng. Chỉ số của kho thôn chấm trên hạn dùng, tình trạng vật
> lý, trạng thái lưu hành và độ tươi của dữ liệu kiểm kê.

---

# PHỤ LỤC C — Bảng thời lượng

| Mục | Nội dung | Thời lượng |
|---|---|---|
| 0 | Chuyển tiếp | 0:10 |
| 1 | Kho tập trung, "dùng được bao nhiêu" | 0:45 |
| 2 | Chỉ số sẵn sàng | 0:35 |
| 3 | Tồn kho toàn xã | 0:20 |
| 4 | IoT và cảnh báo | 0:50 |
| 5 | Nói thẳng về phần cứng | 0:20 |
| 6 | Trợ lý AI | 0:40 |
| 7 | Dự báo và bản tin đầu ngày | 0:20 |
| 8 | **Thư quan tâm Hội Chữ thập đỏ** | 0:35 |
| 9 | Chốt và chuyển demo | 0:20 |
| | **Tổng** | **~4:15** |

**Nếu bị bó xuống 3 phút:** cắt mục 3 và mục 7, rút mục 4 còn lại quy tắc "hai dấu
hiệu cùng lúc". **Tuyệt đối không cắt mục 5 và mục 8.**

# Lời dẫn quay video — đọc thẳng, không phải soạn lại

Ba phần đầu video, **tổng 3 phút 30**, trước khi vào phần thao tác trong [KICH-BAN-DEMO.md](KICH-BAN-DEMO.md).

Chỗ nào có `[dấu ngoặc vuông]` là phần anh tự điền. Phần còn lại đọc y nguyên.

> **Cách đọc:** chậm hơn nói chuyện bình thường một chút. Ngắt ở dấu chấm. Đừng đọc như đọc bài — cứ nói như đang giải thích cho một người bạn.

---

# PHẦN MỞ ĐẦU — 40 giây

**Hình:** anh ngồi trước máy, hoặc màn hình logo Ứng phó nhanh.

> Xin chào ban giám khảo.
>
> Tôi là **[họ tên]**, **[vai trò — ví dụ: trưởng nhóm phát triển]** của nhóm **[tên nhóm]**.
>
> Sản phẩm chúng tôi mang đến hôm nay tên là **Ứng phó nhanh** — một hệ thống điều phối cứu hộ và quản lý kho cứu trợ cho cấp xã.
>
> Trong mười lăm phút tới, tôi sẽ không kể tính năng. Tôi sẽ chạy thẳng một trận lũ giả định từ đầu đến cuối, trên đúng phần mềm đang chạy thật, với số liệu thật.

**Ngừng 1 giây. Chuyển hình.**

---

# PHẦN GIỚI THIỆU NHÓM — 50 giây

**Hình:** slide tên các thành viên, hoặc quay cả nhóm.

> Nhóm chúng tôi gồm **[số]** thành viên.
>
> **[Tên]** phụ trách **[phần việc]**.
> **[Tên]** phụ trách **[phần việc]**.
> **[Tên]** phụ trách **[phần việc]**.

**Rồi nói tiếp — phần này quan trọng hơn danh sách tên:**

> Chúng tôi bắt đầu dự án này không phải từ một ý tưởng công nghệ, mà từ một câu hỏi rất cụ thể: **lúc bão vào, người trực ở kho xã đang phải làm gì bằng tay?**
>
> Câu trả lời là: họ tính định mức cứu trợ bằng máy tính bỏ túi, tra tồn kho bằng sổ giấy, và gọi điện từng thôn để hỏi còn hàng không. Ba việc đó, mỗi việc mất hàng chục phút — đúng lúc từng phút đều quý.
>
> Phần mềm này làm đúng ba việc ấy. Không hơn.

**Ngừng. Chuyển hình.**

---

# PHẦN SƠ LƯỢC ỨNG DỤNG — 2 phút

**Hình:** màn hình Tổng quan, chưa thao tác gì.

## Bài toán

> Một xã miền Trung có một kho trung tâm và mười mấy kho thôn. Lúc bình thường thì không sao. Lúc lũ về thì ba việc xảy ra cùng lúc:
>
> Thứ nhất — **tin báo dồn về từ nhiều thôn**, mỗi nơi một kiểu, có nơi gọi điện, có nơi nhắn tin.
>
> Thứ hai — **phải quyết ngay cần bao nhiêu hàng, lấy ở đâu**, mà tồn kho thì nằm rải ở mười mấy nơi.
>
> Thứ ba — **đường truyền và điện chập chờn**, đúng lúc cần nhất.

## Ba nguyên tắc chúng tôi chọn

> Từ ba việc đó, chúng tôi đặt ra ba nguyên tắc, và toàn bộ phần mềm xây quanh chúng.
>
> **Một — máy tính, người quyết.**
> Hệ thống làm phép tính và đưa ra phương án có số. Nhưng mọi lệnh xuất hàng, mọi lần đồng ý cho mượn, đều phải có người bấm. Máy không tự động xuất hàng của ai bao giờ.
>
> **Hai — không bịa số.**
> Trợ lý trả lời bằng chữ chạy trên máy chủ đặt tại xã. Nó chỉ được dùng những con số có thật trong kho. Trả lời xong, hệ thống đối chiếu lại từng số; số nào không có trong dữ liệu thì thay cả câu bằng câu an toàn. Tí nữa tôi sẽ cho ban giám khảo thấy nó từ chối như thế nào.
>
> **Ba — hỏng cũng phải dùng được.**
> Mất internet vẫn dùng đủ, vì mô hình chạy ngay trên máy này chứ không gọi dịch vụ ngoài. Mất mạng giữa hai xã thì hệ thống lùi về đúng cách hai xã vẫn làm với nhau từ trước khi có phần mềm — gọi điện, rồi mỗi bên ghi sổ. Khác là sổ giờ cộng trừ kho thật.

## Hệ thống gồm những gì

**Hình:** lần lượt chỉ vào từng màn hình đã mở sẵn.

> Hệ thống có ba ứng dụng, dùng chung một máy chủ đặt tại xã.
>
> **Màn hình quản trị** — nơi người trực xã nhận tin, lập phương án, theo dõi toàn bộ kho.
>
> **Ứng dụng điện thoại** — cho trưởng thôn báo tình huống và cho đội hiện trường đi lấy hàng. Họ làm việc ngoài trời, dưới mưa, nên mọi thứ phải bấm được bằng một tay.
>
> **Ứng dụng cảm biến** — theo dõi nhiệt độ, độ ẩm, cửa kho. Vượt ngưỡng là tự tạo sự cố, không đợi người phát hiện.

## Điểm chúng tôi muốn ban giám khảo chú ý

> Có một điều tôi muốn nói trước, vì nó dễ bị bỏ qua.
>
> **Mỗi xã là một hệ thống hoàn toàn độc lập.** Cơ sở dữ liệu riêng, máy chủ riêng. Xã này không nhìn thấy kho của xã kia, và không bao giờ nhìn thấy được.
>
> Khi hai xã cần mượn hàng của nhau, sợi dây duy nhất nối họ là một thông báo. Mỗi bên tự cộng trừ kho của mình.
>
> Chúng tôi chọn cách khó hơn này vì một lý do: **một xã hỏng thì các xã khác vẫn chạy.** Không có máy chủ trung tâm nào để sập cả. Và nhân rộng ra hàng nghìn xã thì không cần thêm hạ tầng gì.

**Ngừng 2 giây.**

> Giờ tôi bắt đầu.

---

# CHUYỂN VÀO PHẦN THAO TÁC

Từ đây chạy theo [KICH-BAN-DEMO.md](KICH-BAN-DEMO.md), bắt đầu từ **Phần 2 — Nhận tin từ hiện trường**.

Câu nối:

> Chúng ta bắt đầu từ nơi mọi chuyện bắt đầu: một trưởng thôn, một chiếc điện thoại, và nước đang lên.

---

# PHẦN KẾT — 1 phút

**Hình:** màn hình Vật tư, sau khi đã đối chiếu số.

> Vừa rồi là một vòng trọn vẹn: từ lúc trưởng thôn nói vào điện thoại, tới lúc hàng ra khỏi kho và có người ký nhận.
>
> Con số tồn kho đầu buổi tôi đã ghi ra giấy. Sau tất cả các thao tác — xuất, mượn, trả — nó khớp từng đơn vị. Mọi thao tác đều có dấu vết trong nhật ký: ai làm, lúc nào, đổi gì.

**Rồi nói phần thật lòng — đây là chỗ ăn điểm:**

> Chúng tôi biết phần mềm này chưa hoàn hảo. Nhưng có ba điều chúng tôi làm nghiêm túc.
>
> **Một** — mọi con số trên màn hình đều suy ra từ sổ kho, không có con số nào được nuôi song song để rồi lệch nhau.
>
> **Hai** — chúng tôi thử cả những lúc hệ thống hỏng: mất mạng, hai người bấm cùng lúc, máy chủ sập giữa lúc đang chuyển hàng. Không phải vì chúng tôi bi quan, mà vì lúc bão thì đúng những thứ đó xảy ra.
>
> **Ba** — chỗ nào máy không chắc, chúng tôi để máy nói thẳng là không chắc, thay vì đoán một câu nghe hay.
>
> Xin cảm ơn ban giám khảo đã lắng nghe.

---

# Bảng nhắc nhanh khi quay

| | Nội dung | Thời lượng | Hình |
|---|---|---|---|
| 1 | Mở đầu — giới thiệu bản thân | 40s | Mặt hoặc logo |
| 2 | Giới thiệu nhóm + lý do làm | 50s | Slide tên / cả nhóm |
| 3 | Bài toán, ba nguyên tắc, ba ứng dụng | 2 phút | Màn hình Tổng quan |
| 4 | **Thao tác** — theo KICH-BAN-DEMO.md | 15–28 phút | Năm màn hình |
| 5 | Kết — đối chiếu số + ba điều làm nghiêm túc | 1 phút | Màn hình Vật tư |

---

# Mẹo quay cho phần nói

**Đừng học thuộc.** Đọc trôi hơn nhớ vấp. Nếu đọc từ màn hình thì đặt kịch bản ngay dưới ống kính, đừng để mắt liếc sang bên.

**Quay phần nói sau cùng.** Chạy thao tác trước, biết chắc mọi thứ chạy được rồi mới quay phần giới thiệu — lúc đó anh nói tự tin hơn hẳn vì đã biết đoạn sau ổn.

**Vấp thì quay lại từ đầu câu**, đừng quay lại cả đoạn. Cắt ghép ở chỗ ngừng giữa hai câu thì không ai nhận ra.

**Ba chỗ nên ngừng hẳn 2 giây**: sau "Tôi sẽ chạy thẳng một trận lũ giả định", sau "Phần mềm này làm đúng ba việc ấy. Không hơn.", và trước "Giờ tôi bắt đầu."

**Đừng nói "chúng em"** với ban giám khảo trừ khi đây là cuộc thi học sinh sinh viên và ban tổ chức yêu cầu. "Chúng tôi" nghe chắc chắn hơn.

---

# Việc phải làm trước khi bấm máy

1. Điền hết các chỗ `[dấu ngoặc vuông]` trong tài liệu này.
2. Đọc to một lượt, bấm giờ — nếu quá 4 phút cho ba phần đầu thì cắt bớt phần giới thiệu nhóm.
3. Làm xong mục **Chuẩn bị** trong [KICH-BAN-DEMO.md](KICH-BAN-DEMO.md): đóng bớt trình duyệt, đăng nhập 5 màn hình, ghi tồn kho ra giấy.
4. Chạy thử một lượt toàn bộ thao tác với bảng kiểm — **trước** khi quay thật.

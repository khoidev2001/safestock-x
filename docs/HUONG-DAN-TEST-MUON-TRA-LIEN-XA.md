# Hướng dẫn thử luồng mượn — trả liên xã

Tài liệu này trả lời đúng một câu hỏi: **bấm những gì, theo thứ tự nào, để chạy trọn một vòng mượn — trả giữa hai xã, và nhìn vào đâu để biết nó đúng.**

## Điều phải hiểu trước khi bấm

Hai xã là **hai hệ thống hoàn toàn tách rời**: cơ sở dữ liệu riêng, kho riêng, tài khoản riêng. Xã A **không nhìn thấy** tồn kho xã B, và không bao giờ nhìn thấy được.

Sợi dây duy nhất nối hai bên là **thông báo** đi qua đường truyền HTTPS. Mỗi bên tự cộng trừ kho của mình dựa trên thông báo nhận được. Không có "kho chung", không có "giao dịch hai pha".

Hệ quả trực tiếp, và đây là chỗ hay hiểu nhầm nhất khi thử:

- Trừ kho bên A và cộng kho bên B là **hai việc riêng biệt**, xảy ra ở hai máy chủ, cách nhau vài giây.
- **Mất mạng thì không có thông báo nào cả.** Đó không phải lỗi. Lúc đó hai xã gọi điện cho nhau rồi mỗi bên tự ghi tay vào tab Mượn, trả — đúng như cách họ vẫn làm với nhau từ trước khi có phần mềm.

## Chuẩn bị

### Cấu hình đường truyền giữa hai xã

Mỗi máy chủ khai xã lân cận bằng một biến môi trường, đặt trong `apps/backend/.env`:

```
COMMUNE_PEER_<TEN_VIET_HOA>=<Tên xã>|<địa chỉ máy chủ xã đó>|<khoá chung>
```

Ví dụ, trên máy chủ **xã Đồng Xuân** khai xã Xuân Thọ:

```
COMMUNE_PEER_XUAN_THO=Xuân Thọ|https://xuantho.ungphonhanh.life|khoa-chung-doi-nhau-biet
```

Và trên máy chủ **xã Xuân Thọ** khai ngược lại:

```
COMMUNE_PEER_DONG_XUAN=Đồng Xuân|https://dongxuan.ungphonhanh.life|khoa-chung-doi-nhau-biet
```

Ba điều dễ sai:

1. **Khoá phải giống nhau ở cả hai bên.** Đó là thứ duy nhất chứng minh yêu cầu đến từ một xã đã đăng ký chứ không phải người lạ.
2. **Tên xã trong biến phải khớp** với tên người dùng gõ vào ô "Xã cho mượn" trên màn hình. Lệch một dấu là không tìm ra xã, và yêu cầu nằm im không đi đâu cả.
3. **Khai xong phải khởi động lại backend.** Biến môi trường chỉ đọc lúc khởi động.

### Hai xã, hai máy chủ

Mỗi xã **phải** có máy chủ riêng. Dựng một máy chủ phục vụ hai xã để cho tiện thử là tự tạo ra một tình huống không có thật, và mọi thứ nhìn sẽ sai — nhất là tên xã gửi: hai xã dùng chung một khoá thì tên suy ra sai một nửa. Đây là tình huống KHÔNG có thật ngoài đời, nên đừng vá mã để chiều nó.

Muốn thử nhanh mà không dựng hai máy chủ thật thì chạy hai bản backend trên hai cổng khác nhau, mỗi bản trỏ vào một cơ sở dữ liệu riêng, rồi khai địa chỉ `http://localhost:<cổng>` cho nhau.

### Hai trình duyệt

Mỗi bên đăng nhập bằng một tài khoản quản trị khác nhau, **mở ở hai trình duyệt khác nhau** (hoặc một cửa sổ thường và một cửa sổ ẩn danh). Hai tab cùng trình duyệt sẽ dùng chung phiên đăng nhập và đè lên nhau.

## Vòng thử đầy đủ

Mọi thao tác đều nằm ở tab **Mượn, trả**.

### Bước 1 — Xã A xin mượn

Ở trình duyệt của **xã A** (bên đi mượn):

1. Vào tab Mượn, trả, khối "Mượn của xã khác".
2. Điền: xã cho mượn, mã vật tư, tên vật tư, đơn vị, số lượng. Ghi chú nếu muốn.
3. Bấm gửi.

**Nhìn vào đâu để biết đúng:** dòng mới hiện ở danh sách với trạng thái **Chờ bên kia quyết**.

**Kho A chưa động gì cả** — chưa ai đồng ý, chưa có hàng nào rời chỗ. Nếu thấy tồn kho A thay đổi ở bước này thì đó là lỗi.

### Bước 2 — Xã B nhận được thông báo

Ở trình duyệt của **xã B**, thông báo hiện ở góc phải màn hình trong vòng vài giây.

**Nhìn vào đâu để biết đúng:** trong tab Mượn, trả của B xuất hiện một dòng mới, chiều **Cho mượn**, tên xã gửi là **A**, trạng thái **Chờ bên kia quyết** (ở đây bên kia là chính mình).

**Không thấy gì?** Kiểm theo thứ tự này:

| Hiện tượng | Nguyên nhân thường gặp |
|---|---|
| Bên A vẫn "Chờ bên kia quyết" mãi | Bên B chưa nhận được. Xem nhật ký backend A tìm dòng gửi thất bại. |
| Nhật ký A báo lỗi mạng | Địa chỉ máy chủ B khai sai, hoặc B đang tắt. |
| Nhật ký B báo 401 | Khoá chung hai bên không khớp. |
| B nhận được nhưng không thấy trên màn hình | B có nhiều đơn vị trong cơ sở dữ liệu; yêu cầu vào nhầm đơn vị khác. |

### Bước 3 — Xã B đồng ý cho mượn

Ở **xã B**, bấm **Đồng ý cho mượn** trên dòng đó, chọn lô hàng sẽ xuất.

**Nhìn vào đâu để biết đúng:**

- Tồn kho B **giảm** đúng số lượng đó.
- Dòng đổi sang trạng thái **Đang nợ**.
- Tab Vật tư của B hiện nhãn **"Hàng đang mắc nợ với xã khác"** với dòng "đang cho mượn … chiếc".

### Bước 4 — Xã A nhận hàng vào kho

Xã A nhận được thông báo B đã đồng ý.

Ở **xã A**, bấm **Xác nhận đã nhận hàng**, chọn lô để nhập vào.

**Nhìn vào đâu để biết đúng:**

- Tồn kho A **tăng** đúng số lượng đó.
- Tab Vật tư của A hiện nhãn **"đang mượn … (có trong kho nhưng phải trả)"**.

Cái nhãn này là điểm mấu chốt: tồn kho là một con số duy nhất, không nói được bao nhiêu trong đó là hàng đi mượn. Người điều phối nhìn con số trần sẽ tưởng mình có nhiều hơn thực tế mình sở hữu.

### Bước 5 — Xã A trả hàng

Ở **xã A**, bấm **Ghi nhận đã trả**, nhập số lượng trả (có thể trả từng phần), chọn lô để xuất.

**Nhìn vào đâu để biết đúng:**

- Tồn kho A **giảm** đúng số đã trả.
- Trả một phần → trạng thái **Đã trả một phần**, nhãn ở tab Vật tư chỉ còn phần chưa trả.
- Trả hết → trạng thái **Đã trả xong**, nhãn biến mất khỏi tab Vật tư của cả hai bên.

### Bước 6 — Xã B nhận lại hàng

Xã B nhận thông báo, bấm **Ghi nhận nhận lại**, chọn lô để nhập.

**Nhìn vào đâu để biết đúng:** tồn kho B **tăng** trở lại, và cộng dồn cả vòng thì tồn kho hai bên trở về đúng như trước bước 1.

**Đây là phép kiểm cuối cùng và quan trọng nhất.** Ghi lại tồn kho hai bên trước bước 1, so lại sau bước 6. Lệch một đơn vị nghĩa là có một bước cộng trừ sai.

## Các nhánh phải thử thêm

Chạy được vòng thuận chưa đủ. Năm nhánh dưới đây là nơi lỗi hay nấp.

### Xã B từ chối

Ở bước 3, bấm **Từ chối** và ghi lý do.

Đúng: dòng bên A đổi sang **Bị từ chối** kèm lý do; **kho hai bên không đổi gì**.

### Xã A huỷ yêu cầu trước khi B trả lời

Bên A bấm **Huỷ yêu cầu**.

Đúng: dòng thành **Đã huỷ**; kho không đổi. Sau đó B bấm đồng ý phải bị từ chối, không được cho đi tiếp.

### Mất mạng giữa chừng

Tắt máy chủ B rồi gửi yêu cầu từ A.

Đúng: **yêu cầu vẫn được ghi vào sổ bên A**, chỉ là không sang được B. Màn hình A không báo lỗi đỏ làm người dùng hoảng. Lúc này hai xã gọi điện cho nhau, rồi mỗi bên tự ghi tay vào sổ.

Bấm nút **"Ghi tay khoản đã thoả thuận qua điện thoại"** ở đầu tab Mượn, trả, chọn chiều (cho mượn hay đi mượn), điền tên xã bên kia, mã lô vật tư, số lượng và ghi chú ai gọi lúc mấy giờ.

Ghi tay **vẫn cộng trừ kho thật** như luồng tự động, chỉ khác là không có thông báo nào đi qua mạng. Khoản ghi tay hiện trên danh sách với nhãn `· ghi tay` để sau này đối chiếu còn phân biệt được.

Mã lô chép từ tab Vật tư. Bắt điền mã lô chứ không cho chọn tên vật tư là có chủ đích: một vật tư có nhiều lô với hạn dùng khác nhau, chọn nhầm lô là trừ nhầm hàng sắp hết hạn hoặc hàng còn mới.

### Hai người cùng bấm một lúc

Mở hai cửa sổ cùng một tài khoản, cùng bấm **Ghi nhận đã trả** trên một dòng.

Đúng: **một người thành công, người kia nhận câu "Khoản mượn vừa được cập nhật ở nơi khác. Tải lại rồi thao tác tiếp."**

Sai — và đây là lỗi đã từng xảy ra thật: cả hai cùng thành công, kho trừ hai lần mà sổ chỉ ghi một lần.

### Máy chủ sập giữa lúc chuyển kho

Khó dựng bằng tay, nhưng nếu gặp: sổ và kho nằm ở hai bước ghi khác nhau, nên có một khe hẹp giữa chúng. Hệ thống ghi lại "lời hứa chuyển kho" và **tự làm nốt lúc khởi động lại**. Nhật ký backend lúc khởi động sẽ có dòng `lần chuyển kho còn dở từ lần chạy trước — đang làm nốt`.

Nếu thấy dòng `phải đối chiếu tay` thì dữ liệu đã méo, phải mở tab Vật tư đối chiếu bằng mắt.

## Dọn dẹp sau khi thử

Dữ liệu thử để lại sẽ làm rối màn hình lúc trình diễn. Sau mỗi lượt thử:

1. Xoá các dòng mượn thử ở **cả hai xã** (chỉ xoá dòng nào mình tạo ra để thử).
2. Đối chiếu tồn kho hai bên với số đã ghi trước bước 1.
3. Nếu lệch, tìm lại ở tab lịch sử giao dịch xem bước nào cộng trừ sai, sửa bằng kiểm kê.

## Tài liệu liên quan

- [Hướng dẫn cài đặt và chạy](HUONG-DAN-CAI-DAT-VA-CHAY.md) — dựng máy chủ và cơ sở dữ liệu
- [Tài khoản demo](TAI-KHOAN-DEMO.md) — tài khoản đăng nhập hai xã
- [Bàn giao vận hành](BAN-GIAO-VAN-HANH.md) — cách các dịch vụ chạy nền trên máy demo

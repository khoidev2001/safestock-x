# Báo cáo E2E RAG qua giao diện

_Thực hiện ngày: 2026-07-23 · Branch: `feat/operational-readiness-seed-map`_

## Kết luận

**Đạt sau khi nạp lại đúng working tree hiện tại.** Luồng ADMIN → frontend → backend → AI service → Ollama trả bằng chứng nguyên văn và nguồn Sphere cho câu hỏi nước; các câu insulin/calo/thuốc không gắn nguồn sai; fast-answer kho không gọi AI service; double-click không nhân đôi request; khi AI service tắt, UI degrade an toàn và tự phục hồi sau khi service chạy lại.

Không commit/push, không seed/reset database và không sửa code nghiệp vụ trong lượt kiểm thử này.

## Sự cố preflight quan trọng

Scheduled Task AI service khởi động lúc 20:12, trong khi `knowledge.py` và `main.py` được sửa khoảng 21:40–21:45. Uvicorn chạy không có `--reload`, nên lần chạy đầu dùng code cũ và trả sai nguồn Sphere về nước cho câu insulin.

Kiểm tra cùng câu bằng code trên đĩa hiện tại cho `hits=[]`. Sau khi build lại backend và restart đúng hai task `UngPhoNhanh-Backend`/`UngPhoNhanh-AiService`, endpoint live cũng cho `hits=[]`; E2E được chạy lại từ browser session sạch. Kết quả sai trước restart là lỗi lệch phiên bản runtime, không phải kết quả của source hiện tại.

## Kết quả kiểm thử

| Ca | Kết quả | Bằng chứng chính |
|---|---|---|
| Đăng nhập ADMIN, mở trợ lý | Đạt | Login `201`; dashboard và cửa sổ trợ lý hiển thị đúng |
| Câu hỏi định mức nước | Đạt | Trả nguyên văn mức `15 lít/người/ngày`, nêu giới hạn áp dụng và nguồn Sphere 2018 thật |
| Insulin ngoài corpus | Đạt an toàn | Không có citation; trả từ chối theo phạm vi |
| Calo ngoài corpus | Đạt an toàn | Nói tài liệu hiện có chưa quy định cụ thể; không có citation |
| `15 viên thuốc/ngày` | Đạt an toàn | Từ chối theo phạm vi; không có citation |
| Fast-answer áo phao | Đạt | Trả `48 chiếc Áo phao người lớn` từ snapshot/backend, không có nguồn corpus |
| Gửi lại sau khi hoàn tất | Đạt | Mỗi thao tác tạo đúng một cặp question/answer |
| Double-click nút gửi | Đạt | Chỉ tạo một `POST /api/assistant` với HTTP `201` |
| Fast-answer không gọi AI | Đạt | Số `POST /assistant` trong log AI giữ nguyên trước/sau hai lần hỏi áo phao |
| AI service tắt | Đạt degrade | Backend trả `503`; UI hiện `Dịch vụ tra cứu đang tạm gián đoạn. Vui lòng thử lại sau.`; không gắn nguồn |
| AI service chạy lại | Đạt phục hồi | Request tiếp theo `201`, RAG trả lại bằng chứng + nguồn Sphere |
| Console/page error | Đạt | Không có page error; console chỉ có React DevTools/Fast Refresh ở chế độ dev |

## Review rủi ro

- **False-positive:** quantity-unit guard của source hiện tại loại đúng insulin/calo/thuốc; câu nước là ca duy nhất trong bộ browser này nhận nguồn.
- **Duplicate/spam:** nút gửi bị khóa đủ sớm; `dblclick` chỉ sinh một request. Gửi lại sau khi hoàn tất được coi là thao tác mới và tạo đúng một response mới.
- **Security:** browser session cô lập, chỉ allowlist localhost; không đọc cookie/localStorage/token; không ghi HAR. Endpoint UI chỉ trả answer, không lộ vector hoặc toàn index.
- **Degrade:** AI service tắt không làm sập dashboard/fast-answer; câu RAG trả thông báo tạm gián đoạn và phục hồi sau restart.
- **Runtime drift:** Scheduled Task có thể giữ code cũ sau khi source thay đổi. Demo/deploy phải build/restart service có kiểm soát trước nghiệm thu.
- **Phụ thuộc ngoài:** frontend vẫn thử tải Google Fonts/Material Symbols từ `fonts.googleapis.com`. Request bị browser allowlist chặn nhưng UI vẫn dùng được; đây là rủi ro offline không chặn E2E RAG.

## Bằng chứng ảnh

- `docs/evidence/e2e-rag/01-dashboard-admin.png`
- `docs/evidence/e2e-rag/02-rag-nuoc-co-nguon.png`
- `docs/evidence/e2e-rag/03-insulin-khong-nguon-sai.png`
- `docs/evidence/e2e-rag/04-calo-thuoc-khong-nguon-sai.png`
- `docs/evidence/e2e-rag/05-fast-answer-lap-lai-khong-goi-ai.png`
- `docs/evidence/e2e-rag/06-ai-service-tat-degrade-an-toan.png`
- `docs/evidence/e2e-rag/07-ai-service-khoi-phuc-rag.png`

## Chưa thực hiện trong lượt này

- Không quay video; đã lưu screenshot cho từng trạng thái chính.
- Không đánh giá WER PhoWhisper/model voice thật.
- Không triển khai P0 mission prepare atomic; chỉ lập kế hoạch riêng.

## Câu hỏi chưa giải quyết

Không có.

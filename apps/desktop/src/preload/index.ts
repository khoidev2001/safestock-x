// Preload tối thiểu: renderer chạy như web app thường (fetch + socket.io-client tới
// backend localhost). Không expose Node API nào — app chỉ gửi input cảm biến + hiển thị.
// Giữ file để contextIsolation mặc định an toàn; mở rộng sau nếu cần IPC.
export {};

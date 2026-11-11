# GROUP11-LTWEB-012012103105

## Chạy trang nhóm và Lingo Studio

1. Bật MySQL trong XAMPP. Nếu chưa có database, chạy `translate-web/database/schema.sql` trong phpMyAdmin.
2. Từ thư mục gốc project, chạy `C:\xampp\php\php.exe -S 127.0.0.1:8082 -t .`.
3. Mở `http://127.0.0.1:8082/` để xem trang nhóm; các nút Lingo Studio dẫn tới `/translate-web/`. Lịch sử dịch được lưu qua API PHP `translate-web/api/history.php`.

Thông tin kết nối MySQL mặc định và cách dùng tài khoản khác có trong [hướng dẫn API](translate-web/api/README.md).

## Đưa lên mạng từ GitHub

GitHub giữ mã nguồn; GitHub Pages chỉ chạy trang tĩnh và không thực thi PHP/MySQL. Để người ngoài lưu lịch sử dịch, cần hosting hỗ trợ PHP + MySQL. Trên InfinityFree, chọn database đã tạo trong phpMyAdmin rồi chạy `translate-web/database/schema-hosting.sql` (không chạy `schema.sql`, vì file đó có lệnh tạo database). Sau đó upload giao diện và API PHP, rồi cấu hình kết nối theo hướng dẫn API. Không đưa mật khẩu MySQL vào GitHub.

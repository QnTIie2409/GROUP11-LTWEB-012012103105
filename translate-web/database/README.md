# MySQL cho lịch sử dịch

1. Bật MySQL trong XAMPP. Nếu cài mới, chạy `schema.sql` trong phpMyAdmin. Database `group11_lingo_studio` của nhóm đã được tạo trên máy hiện tại.
2. Từ thư mục gốc project, chạy `C:\xampp\php\php.exe -S 127.0.0.1:8082 -t .`. Mở trang nhóm tại `http://127.0.0.1:8082/`, hoặc ứng dụng tại `http://127.0.0.1:8082/translate-web/`.
3. Nếu MySQL dùng tài khoản khác, xem cách cấu hình trong `translate-web/api/README.md`. Mặc định là `127.0.0.1`, `3306`, `root`, mật khẩu trống và `group11_lingo_studio`. Không đưa mật khẩu vào Git.

Lịch sử và dấu sao được lưu trong MySQL theo cookie ẩn danh của từng trình duyệt. Theme vẫn ở `localStorage`. Lần mở đầu tiên sau khi chuyển, ứng dụng hợp nhất lịch sử cũ từ khóa `google_translate_history`, rồi xóa khóa này sau khi lưu thành công.

Nếu trước đây mở web bằng Live Server hoặc địa chỉ/cổng khác, `localStorage` cũ thuộc origin khác. Trên trang cũ, mở DevTools Console và chạy `copy(localStorage.getItem('google_translate_history'))`. Sau đó mở `http://127.0.0.1:8082/translate-web/`, chạy `localStorage.setItem('google_translate_history', prompt('Dán JSON cũ'))`, dán nội dung vừa sao chép và tải lại trang. Kiểm tra lịch sử trên trang mới trước khi xóa dữ liệu ở trang cũ.

Chưa có tài khoản hoặc đồng bộ nhiều thiết bị. Nếu xóa cookie, trình duyệt sẽ được xem như người dùng mới; dữ liệu cũ vẫn còn trong MySQL nhưng không truy cập được từ trình duyệt đó.

# API lịch sử bằng PHP

`history.php` nhận `GET` để đọc và `PUT` để lưu tối đa 50 bản dịch trong MySQL. Cookie `lingo_owner` xác định lịch sử của từng trình duyệt; API giữ cùng định dạng dữ liệu với API Node trước đây.

Để thử trên máy: bật MySQL trong XAMPP, chạy `translate-web/database/schema.sql` nếu chưa có database, rồi từ thư mục gốc của project chạy:

```powershell
C:\xampp\php\php.exe -S 127.0.0.1:8082 -t .
```

API ở `http://127.0.0.1:8082/translate-web/api/history.php`. Mặc định kết nối MySQL `127.0.0.1:3306`, user `root`, mật khẩu trống, database `group11_lingo_studio`.

Nếu thông tin MySQL khác mặc định, đặt các biến môi trường `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, hoặc tạo `translate-web/api/config.local.php` với nội dung `<?php return ['host' => '...', 'port' => '3306', 'user' => '...', 'password' => '...', 'name' => '...'];`. File này đã được thêm vào `.gitignore`; không commit mật khẩu.

Trang dịch gọi `api/history.php` trên cùng địa chỉ web. Hãy mở trang bằng PHP server hoặc hosting hỗ trợ PHP; Live Server và GitHub Pages không thực thi PHP. Trên InfinityFree, chạy `database/schema-hosting.sql` trong database đã tạo sẵn.

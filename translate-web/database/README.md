# MySQL cho lịch sử dịch và tài khoản Google

## Cài mới

1. Bật MySQL trong XAMPP (hoặc tạo database trên hosting như InfinityFree).
2. Nếu cài mới trên máy cá nhân, chạy `schema.sql` trong phpMyAdmin để tạo database `group11_lingo_studio` cùng 2 bảng:
   - `users`: `id`, `google_sub` (UNIQUE), `email`, `display_name`, `avatar_url`, `created_at`, `updated_at`.
   - `translation_history`: `id`, `owner_id`, `user_id` (FK tới `users(id) ON DELETE SET NULL`), `source_lang`, `target_lang`, `source_text`, `target_text`, `starred`, `translated_at`, kèm index `idx_history_owner_time` và `idx_history_user_time`.
3. Trên hosting miễn phí không cho phép `CREATE DATABASE` / `USE`, hãy chọn database có sẵn trong phpMyAdmin và chạy `schema-hosting.sql`.

## Nâng cấp database cũ (Migration)

Nếu database của bạn đã tạo bảng `translation_history` từ phiên bản trước (chưa có `users` và cột `user_id`), hãy kiểm tra `SHOW COLUMNS FROM translation_history LIKE 'user_id';` trước. Nếu chưa có, chạy các lệnh sau trong đúng database:

```sql
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  google_sub VARCHAR(255) NOT NULL UNIQUE,
  email VARCHAR(255) NOT NULL,
  display_name VARCHAR(255) NULL,
  avatar_url TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE translation_history
  ADD COLUMN user_id INT NULL AFTER owner_id,
  ADD KEY idx_history_user_time (user_id, translated_at),
  ADD CONSTRAINT fk_history_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
```

## Cách lưu lịch sử

- **Khi chưa đăng nhập**: Lịch sử và dấu sao được lưu trong MySQL theo cookie ẩn danh `lingo_owner` của từng trình duyệt (`user_id IS NULL`).
- **Khi đăng nhập Google**: Server xác thực ID token phía backend, upsert bản ghi trong `users`, tự động gán `user_id` cho lịch sử ẩn danh hiện tại (`owner_id = lingo_owner AND user_id IS NULL`), và đồng bộ lịch sử theo `user_id` trên mọi thiết bị.
- **Theme**: Vẫn lưu ở `localStorage` của trình duyệt.
- **Bảo mật**: Không đưa mật khẩu DB, `GOOGLE_CLIENT_ID` bí mật nếu dùng nội bộ, `SESSION_SECRET`, hoặc `translate-web/api/config.local.php` lên Git. Xem thêm cấu hình trong `translate-web/api/README.md`.

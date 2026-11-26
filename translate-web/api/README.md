# Lingo Studio Backend & API

Ứng dụng hỗ trợ chạy đồng thời trên **Node.js server** (đầy đủ OCR, TTS proxy, Dictionary, Google Auth, History, và định tuyến trang gốc) hoặc **PHP + MySQL hosting** (như XAMPP hoặc InfinityFree; riêng OCR yêu cầu Node server).

## 1. Chạy bằng Node.js (khuyên dùng khi phát triển & dùng OCR)

Từ thư mục `translate-web/`:

```powershell
npm install
npm start
```

Mặc định server chạy tại `http://localhost:8080` (có thể đổi bằng biến môi trường `PORT`).

- `GET /`: Mở trực tiếp giao diện dịch `translate-web/index.html` (chèn `<base href="/translate-web/">`).
- `GET /group`, `GET /group/`, `GET /group.html`: Trang giới thiệu Nhóm 11.
- `GET /api/health`: Trả về `{ "status": "ok", "ocr": "chrome-lens-ocr", "googleAuthConfigured": true|false }`.
- `POST /api/ocr`: Nhận binary ảnh (upload hoặc paste) và trả về `{ "success": true, "text": "..." }` qua `chrome-lens-ocr`.
- `GET /api/tts?tl=...&q=...`: Proxy âm thanh Google Translate TTS.
- `GET /api/dictionary?word=...&lang=en` (alias `api/dictionary.php`): Tra từ điển tiếng Anh từ `api.dictionaryapi.dev` (có cache RAM 10 phút trên Node), trả về `{ word, phonetic, audioUrl, meanings, synonyms, examples }`.
- `GET /api/history` & `PUT /api/history` (alias `api/history.php`): Đọc/lưu tối đa 50 bản dịch trong MySQL. Khi đã đăng nhập Google, dữ liệu gắn với `user_id`; khi ẩn danh, dùng cookie `lingo_owner`.
- `GET /api/auth/me` (alias `api/auth/me.php`): Trả về `{ authenticated, user, googleClientId, googleOAuthReady, googleRedirectUri }`.
- `GET /api/auth/google/start` (alias `api/auth/google-start.php`): Khởi tạo luồng Google OAuth 2.0 Authorization Code Redirect (đặt cookie `lingo_oauth_state` HttpOnly, `SameSite=Lax` và redirect 302 sang Google).
- `GET /api/auth/google/callback` (alias `api/auth/google-callback.php`): Xác thực `state`, đổi `code` lấy `id_token` qua `https://oauth2.googleapis.com/token`, kiểm tra token qua `tokeninfo`, upsert/liên kết tài khoản trong `users`, gộp lịch sử ẩn danh `lingo_owner`, đặt cookie phiên `lingo_session`, và redirect về `../../index.html`.
- `POST /api/auth/google` (alias `api/auth/google.php`): Nhận `{ "credential": "<google_id_token>" }` (fallback GIS), xác thực token phía server qua Google `tokeninfo`, upsert/liên kết `users`, gộp lịch sử ẩn danh `lingo_owner` vào `user_id`, và đặt cookie HttpOnly ký HMAC-SHA256 `lingo_session`.
- `POST /api/auth/logout` (alias `api/auth/logout.php`): Xóa cookie `lingo_session`.

### Biến môi trường cho Node.js

- `PORT`: Cổng HTTP (mặc định `8080`).
- `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`: Kết nối MySQL (mặc định `127.0.0.1`, `3306`, `root`, mật khẩu trống, `group11_lingo_studio`).
- `GOOGLE_CLIENT_ID`: OAuth 2.0 Client ID của Google (dùng cho luồng OAuth 2.0 redirect, kiểm tra `aud`, và fallback GIS).
- `GOOGLE_CLIENT_SECRET`: OAuth 2.0 Client Secret của Google (bắt buộc để chạy luồng GitHub-style Google OAuth 2.0 redirect `google-start`/`google-callback`).
- `GOOGLE_REDIRECT_URI`: (Tùy chọn) Ghi đè Redirect URI; nếu bỏ trống sẽ tự tính `http(s)://<host>/translate-web/api/auth/google-callback.php` (hoặc `/api/auth/google/callback`).
- `SESSION_SECRET`: Chuỗi bí mật để ký cookie phiên `lingo_session` (nếu bỏ trống trên Node, server tạo khóa ngẫu nhiên theo phiên chạy).

## 2. Chạy bằng PHP + MySQL (XAMPP / Hosting)

Để thử bằng PHP trên máy (bật MySQL trong XAMPP trước, chạy `translate-web/database/schema.sql`), từ thư mục gốc project:

```powershell
C:\xampp\php\php.exe -S 127.0.0.1:8082 -t .
```

- Mở `http://127.0.0.1:8082/` sẽ chuyển hướng sang `translate-web/index.html`; trang nhóm ở `/group.html`.
- Trang dịch gọi đường dẫn tương đối (`api/history.php`, `api/dictionary.php`, `api/auth/me.php`, `api/auth/google-start.php`, `api/auth/google-callback.php`, `api/auth/google.php`, `api/auth/logout.php`) nên hoạt động giống nhau trên cả Node lẫn PHP hosting.
- Lưu ý: Live Server và GitHub Pages không thực thi PHP hoặc `/api/ocr`. Khi chạy thuần PHP/static hosting, ảnh OCR sẽ báo hướng dẫn khởi động Node server (`npm start` trong `translate-web/`).

### Cấu hình `translate-web/api/config.local.php`

Có thể dùng biến môi trường hoặc tạo file `translate-web/api/config.local.php` (đã nằm trong `.gitignore`, **không bao giờ commit lên Git**):

```php
<?php
return [
    'host' => '127.0.0.1',
    'port' => '3306',
    'user' => 'root',
    'password' => '',
    'name' => 'group11_lingo_studio',
    'google_client_id' => 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com',
    'google_client_secret' => 'YOUR_GOOGLE_CLIENT_SECRET',
    'google_redirect_uri' => '', // Để trống để tự động dùng .../translate-web/api/auth/google-callback.php
    'session_secret' => 'replace-with-long-random-secret',
];
```

### Cấu hình Google Cloud Console (OAuth 2.0 Web Application)

Trong **Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client ID**:
- **Authorized JavaScript origins**:
  - Production: `https://lingostudio.ifree.page`
  - Local dev: `http://localhost:8080`, `http://127.0.0.1:8082`
- **Authorized redirect URIs**:
  - Production: `https://lingostudio.ifree.page/translate-web/api/auth/google-callback.php`
  - Local dev: `http://localhost:8080/translate-web/api/auth/google-callback.php`, `http://127.0.0.1:8082/translate-web/api/auth/google-callback.php`

Trên InfinityFree, chạy `translate-web/database/schema-hosting.sql` trong database đã tạo sẵn trên hosting.

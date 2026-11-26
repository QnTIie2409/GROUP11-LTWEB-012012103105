# Hướng dẫn Deploy lên InfinityFree (Group 11 · Lingo Studio)

Hướng dẫn ngắn gọn để đưa **Group 11 Showcase + Lingo Studio** lên InfinityFree (PHP + MySQL).

---

## Bước 1: Import cơ sở dữ liệu MySQL trên phpMyAdmin

1. Đăng nhập **InfinityFree Control Panel** → **MySQL Databases** và tạo một database mới (ví dụ `if0_XXXXXXXX_lingo_studio`).
2. Mở **phpMyAdmin** của database vừa tạo.
3. Chọn tab **Import**, tải lên file `translate-web/database/schema-hosting.sql` và nhấn **Go** (hoặc **Import**).
   - File này đã bỏ qua `CREATE DATABASE` / `USE` nên chạy trực tiếp trên shared hosting.

---

## Bước 2: Tạo `config.local.php` trực tiếp trên InfinityFree

File `translate-web/api/config.local.php` không nằm trong Git và bị loại trừ khỏi mọi bước sync FTP để không bao giờ ghi đè thông tin bảo mật trên server thật.

1. Mở **Online File Manager** (hoặc FileZilla) trên InfinityFree, đi tới `/lingostudio.ifree.page/htdocs/translate-web/api/`.
2. Tạo file mới tên **`config.local.php`** dựa theo mẫu `translate-web/api/config.local.example.php`:

```php
<?php
return [
    'host' => 'sqlXXX.infinityfree.com',      // MySQL Hostname trong Control Panel
    'port' => '3306',
    'user' => 'if0_XXXXXXXX',                 // MySQL Username
    'password' => 'YOUR_MYSQL_PASSWORD',      // MySQL Password
    'name' => 'if0_XXXXXXXX_lingo_studio',    // Tên database đã tạo ở Bước 1
    'google_client_id' => 'YOUR_CLIENT_ID.apps.googleusercontent.com',
    'google_client_secret' => 'YOUR_CLIENT_SECRET',
    'google_redirect_uri' => '', // Để trống để tự nhận https://lingostudio.ifree.page/translate-web/api/auth/google-callback.php
    'session_secret' => 'chuoi-bi-mat-ngau-nhien-dai-it-nhat-32-ky-tu',
];
```

---

## Bước 3A: Tự động deploy bằng GitHub Actions

Workflow `.github/workflows/deploy-infinityfree.yml` tự động chạy khi `git push` vào nhánh `main` (hoặc chạy tay qua **Actions → Deploy to InfinityFree → Run workflow**).

1. Trong repo GitHub, vào **Settings → Secrets and variables → Actions → New repository secret**, thêm 3 secret:
   - `FTP_SERVER`: FTP Hostname trong InfinityFree (ví dụ `ftpupload.net`)
   - `FTP_USERNAME`: FTP Username (ví dụ `if0_XXXXXXXX`)
   - `FTP_PASSWORD`: FTP Password
2. Push code lên `main`. Workflow sẽ sync các file web vào `/lingostudio.ifree.page/htdocs/` và tự động bỏ qua `node_modules/`, `*.mjs`, `database/`, `scripts/`, `translate-web/api/config.local.php`, v.v.

---

## Bước 3B: Deploy thủ công từ máy bằng PowerShell

Script `scripts/deploy-infinityfree.ps1` đóng gói đúng các file cần thiết vào `dist-infinityfree/` (bỏ qua file dev và `config.local.php`).

- **Cách 1 — Tạo file ZIP để upload qua FileZilla / File Manager:**
  ```powershell
  .\scripts\deploy-infinityfree.ps1 -PackageOnly -Zip
  ```
  Giải nén và upload toàn bộ nội dung trong `dist-infinityfree.zip` vào `/lingostudio.ifree.page/htdocs/` trên InfinityFree.

- **Cách 2 — Upload trực tiếp từ PowerShell qua FTP:**
  ```powershell
  $env:FTP_SERVER = "ftpupload.net"
  $env:FTP_USERNAME = "if0_XXXXXXXX"
  $env:FTP_PASSWORD = "YOUR_FTP_PASSWORD"
  .\scripts\deploy-infinityfree.ps1
  ```

---

## Bước 4: Lưu ý quan trọng sau khi deploy

1. **OCR hình ảnh (`chrome-lens-ocr`) cần Node.js server riêng:**
   InfinityFree chỉ hỗ trợ PHP + MySQL, không chạy được `translate-web/server.mjs`. Tính năng dịch văn bản, TTS (`api/tts.php`), Từ điển (`api/dictionary.php`), Lịch sử dịch (`api/history.php`) và Đăng nhập Google (`api/auth/*`) hoạt động bình thường trên InfinityFree; riêng OCR cần host Node server riêng nếu muốn dùng trên production.
2. **Cấu hình Google Cloud Console (OAuth 2.0 Redirect + Account Linking):**
   Để dùng nút **"Tiếp tục với Google"**, vào **Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client ID** (loại *Web application*):
   - **Authorized JavaScript origins:** thêm `https://lingostudio.ifree.page` (hoặc domain InfinityFree của bạn).
   - **Authorized redirect URIs:** thêm `https://lingostudio.ifree.page/translate-web/api/auth/google-callback.php`.
   - Sao chép **Client ID** và **Client Secret** vào `google_client_id` và `google_client_secret` trong `translate-web/api/config.local.php`.
   - Nếu người dùng đã có tài khoản email/mật khẩu trùng email Google, hệ thống tự động liên kết `google_sub` vào tài khoản đó.

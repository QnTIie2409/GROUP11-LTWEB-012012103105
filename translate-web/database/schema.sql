CREATE DATABASE IF NOT EXISTS group11_lingo_studio CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE group11_lingo_studio;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  google_sub VARCHAR(191) NULL UNIQUE,
  email VARCHAR(191) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NULL,
  display_name VARCHAR(255) NULL,
  avatar_url TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS translation_history (
  id VARCHAR(64) NOT NULL,
  owner_id CHAR(36) NOT NULL,
  user_id INT NULL,
  source_lang VARCHAR(12) NOT NULL,
  target_lang VARCHAR(12) NOT NULL,
  source_text TEXT NOT NULL,
  target_text TEXT NOT NULL,
  starred BOOLEAN NOT NULL DEFAULT FALSE,
  translated_at BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (id),
  KEY idx_history_owner_time (owner_id, translated_at),
  KEY idx_history_user_time (user_id, translated_at),
  CONSTRAINT fk_history_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

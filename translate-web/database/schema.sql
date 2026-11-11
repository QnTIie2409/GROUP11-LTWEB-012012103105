CREATE DATABASE IF NOT EXISTS group11_lingo_studio CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE group11_lingo_studio;

CREATE TABLE IF NOT EXISTS translation_history (
  id VARCHAR(64) NOT NULL,
  owner_id CHAR(36) NOT NULL,
  source_lang VARCHAR(12) NOT NULL,
  target_lang VARCHAR(12) NOT NULL,
  source_text TEXT NOT NULL,
  target_text TEXT NOT NULL,
  starred BOOLEAN NOT NULL DEFAULT FALSE,
  translated_at BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (id),
  KEY idx_history_owner_time (owner_id, translated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

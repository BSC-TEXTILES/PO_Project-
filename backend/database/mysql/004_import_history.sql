-- ============================================================================
-- 004 — product import sessions (routes/import.js, utils/importProcessor.js)
-- Legacy migration 014 was never applied to the live database and its column
-- names did not match the code; these tables follow what the code reads/writes.
-- Additive only.
-- ============================================================================

CREATE TABLE IF NOT EXISTS `import_history` (
  `id` CHAR(36) NOT NULL DEFAULT (UUID()),
  `file_name` VARCHAR(500) NOT NULL,
  `file_type` VARCHAR(16) NOT NULL,
  `file_size_bytes` BIGINT NOT NULL DEFAULT 0,
  `mime_type` VARCHAR(255) NULL,
  `storage_key` VARCHAR(1000) NULL,
  `uploaded_by` CHAR(36) NULL,
  `status` ENUM('processing','awaiting_confirmation','imported','partially_imported','failed','cancelled') NOT NULL DEFAULT 'processing',
  `rows_found` INT NOT NULL DEFAULT 0,
  `imported_count` INT NOT NULL DEFAULT 0,
  `updated_count` INT NOT NULL DEFAULT 0,
  `skipped_count` INT NOT NULL DEFAULT 0,
  `failed_count` INT NOT NULL DEFAULT 0,
  `error_summary` TEXT NULL,
  `started_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `parsed_at` DATETIME(6) NULL,
  `preview_ready_at` DATETIME(6) NULL,
  `finished_at` DATETIME(6) NULL,
  PRIMARY KEY (`id`),
  KEY `idx_import_history_started` (`started_at`),
  KEY `idx_import_history_status` (`status`),
  CONSTRAINT `fk_import_history_uploaded_by` FOREIGN KEY (`uploaded_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `import_records` (
  `id` CHAR(36) NOT NULL DEFAULT (UUID()),
  `import_id` CHAR(36) NOT NULL,
  `row_index` INT NOT NULL,
  `sheet` VARCHAR(255) NULL,
  `original_values` JSON NULL,
  `mapped_values` JSON NULL,
  `operation` VARCHAR(32) NULL,
  `warnings` JSON NULL,
  `errors` JSON NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_import_records_import` (`import_id`, `row_index`),
  CONSTRAINT `fk_import_records_import` FOREIGN KEY (`import_id`) REFERENCES `import_history` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Product audit columns written by the import processor (were missing from the legacy schema).
-- @column products.created_by
ALTER TABLE `products` ADD COLUMN `created_by` CHAR(36) NULL;
-- @column products.updated_by
ALTER TABLE `products` ADD COLUMN `updated_by` CHAR(36) NULL;

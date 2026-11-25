-- ============================================================================
-- POMS — MySQL 8.0 schema (single source of truth)
-- Generated from the legacy PostgreSQL catalog by tools/pg-to-mysql/generate-schema.mjs
-- then committed and reviewed. Apply with: cd backend && npm run db:migrate
--
-- Conventions
--   * All timestamps are DATETIME(6) holding UTC. The application pool uses timezone 'Z'.
--   * Primary keys are CHAR(36) UUIDs (preserved from the legacy database) except audit_logs (BIGINT).
--   * utf8mb4_0900_ai_ci collation: comparisons/unique keys are case-insensitive (same as legacy ILIKE / lower()).
--   * *_uk INVISIBLE columns emulate PostgreSQL "UNIQUE NULLS NOT DISTINCT".
-- Idempotent: every statement uses IF NOT EXISTS, so re-running is safe.
-- ============================================================================

SET NAMES utf8mb4;
SET time_zone = '+00:00';

CREATE TABLE IF NOT EXISTS `approval_actions` (
  `id` CHAR(36) NOT NULL DEFAULT (UUID()),
  `instance_id` CHAR(36) NOT NULL,
  `level_no` INT NOT NULL,
  `approver_id` CHAR(36) NOT NULL,
  `action` ENUM('submitted','approved','rejected','send_back','hold','escalated') NOT NULL,
  `comments` TEXT NULL,
  `acted_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  CONSTRAINT `chk_approval_actions_1` CHECK (((`action` IN ('submitted', 'approved', 'escalated')) OR (`comments` IS NOT NULL)))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `approval_instances` (
  `id` CHAR(36) NOT NULL DEFAULT (UUID()),
  `po_id` CHAR(36) NOT NULL,
  `rule_id` CHAR(36) NULL,
  `current_level` INT NOT NULL DEFAULT 1,
  `status` ENUM('draft','submitted','under_review','approved','issued','partially_received','received','closed','cancelled') NOT NULL DEFAULT 'under_review',
  `created_by` CHAR(36) NOT NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `resolved_at` DATETIME(6) NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `approval_levels` (
  `id` CHAR(36) NOT NULL DEFAULT (UUID()),
  `rule_id` CHAR(36) NOT NULL,
  `level_no` INT NOT NULL,
  `approver_role_id` CHAR(36) NULL,
  `approver_user_id` CHAR(36) NULL,
  `auto_escalate_after_hours` INT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `approval_levels_rule_id_level_no_key` (`rule_id`, `level_no`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `approval_rules` (
  `id` CHAR(36) NOT NULL DEFAULT (UUID()),
  `name` TEXT NOT NULL,
  `priority` INT NOT NULL DEFAULT 100,
  `min_value` DECIMAL(14,2) NULL DEFAULT 0,
  `max_value` DECIMAL(14,2) NULL,
  `division_id` CHAR(36) NULL,
  `department_id` CHAR(36) NULL,
  `section_id` CHAR(36) NULL,
  `supplier_id` CHAR(36) NULL,
  `category_id` CHAR(36) NULL,
  `min_discount_percent` DECIMAL(5,2) NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  CONSTRAINT `chk_approval_rules_1` CHECK (((`max_value` IS NULL) OR (`max_value` >= `min_value`)))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `attachments` (
  `id` CHAR(36) NOT NULL DEFAULT (UUID()),
  `entity_type` VARCHAR(255) NOT NULL,
  `entity_id` CHAR(36) NOT NULL,
  `file_name` TEXT NOT NULL,
  `mime_type` TEXT NOT NULL,
  `size_bytes` BIGINT NOT NULL,
  `storage_key` TEXT NOT NULL,
  `checksum` TEXT NULL,
  `uploaded_by` CHAR(36) NOT NULL,
  `uploaded_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_attach_entity` (`entity_type`, `entity_id`),
  KEY `idx_attachments_entity` (`entity_type`, `entity_id`, `uploaded_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `audit_logs` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `event_id` CHAR(36) NOT NULL DEFAULT (UUID()),
  `occurred_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `user_id` CHAR(36) NULL,
  `user_role` TEXT NULL,
  `division_id` CHAR(36) NULL,
  `section_id` CHAR(36) NULL,
  `action_type` TEXT NOT NULL,
  `entity_type` VARCHAR(255) NOT NULL,
  `entity_id` CHAR(36) NOT NULL,
  `before_value` JSON NULL,
  `after_value` JSON NULL,
  `reason` TEXT NULL,
  `request_id` TEXT NULL,
  `ip_address` VARCHAR(45) NULL,
  PRIMARY KEY (`id`),
  KEY `idx_audit_entity` (`entity_type`, `entity_id`, `occurred_at`),
  KEY `idx_audit_occurred` (`occurred_at`),
  KEY `idx_audit_user` (`user_id`, `occurred_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `brand_collections` (
  `brand_id` CHAR(36) NOT NULL,
  `collection_id` CHAR(36) NOT NULL,
  PRIMARY KEY (`brand_id`, `collection_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `brands` (
  `id` CHAR(36) NOT NULL DEFAULT (UUID()),
  `brand_number` VARCHAR(255) NOT NULL,
  `brand_serial` VARCHAR(255) NOT NULL,
  `brand_name` TEXT NOT NULL,
  `brand_code` TEXT NULL,
  `manufacturer` TEXT NULL,
  `valid_from` DATE NULL,
  `valid_to` DATE NULL,
  `status` ENUM('active','inactive','archived') NOT NULL DEFAULT 'active',
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `logo_url` TEXT NULL,
  `image_url` TEXT NULL,
  `description` TEXT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `brands_brand_number_key` (`brand_number`),
  UNIQUE KEY `brands_brand_serial_key` (`brand_serial`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `categories` (
  `id` CHAR(36) NOT NULL DEFAULT (UUID()),
  `section_id` CHAR(36) NOT NULL,
  `parent_category_id` CHAR(36) NULL,
  `code` VARCHAR(255) NOT NULL,
  `name` TEXT NOT NULL,
  `status` ENUM('active','inactive','archived') NOT NULL DEFAULT 'active',
  `parent_category_id_uk` VARCHAR(36) GENERATED ALWAYS AS (IFNULL(`parent_category_id`, '')) VIRTUAL INVISIBLE,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_cat` (`section_id`, `parent_category_id_uk`, `code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `chat_messages` (
  `id` CHAR(36) NOT NULL DEFAULT (UUID()),
  `division_id` CHAR(36) NULL,
  `user_id` CHAR(36) NOT NULL,
  `body` TEXT NOT NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_chat_div_time` (`division_id`, `created_at`),
  CONSTRAINT `chk_chat_messages_1` CHECK ((CHAR_LENGTH(TRIM(`body`)) > 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `collections` (
  `id` CHAR(36) NOT NULL DEFAULT (UUID()),
  `code` VARCHAR(255) NOT NULL,
  `name` TEXT NOT NULL,
  `description` TEXT NULL,
  `display_order` INT NOT NULL DEFAULT 0,
  `status` ENUM('active','inactive','archived') NOT NULL DEFAULT 'active',
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `collections_code_key` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `colours` (
  `id` CHAR(36) NOT NULL DEFAULT (UUID()),
  `code` VARCHAR(255) NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `colour_family` TEXT NULL,
  `swatch_hex` CHAR(7) NULL,
  `is_custom` TINYINT(1) NOT NULL DEFAULT 0,
  `status` ENUM('active','inactive','archived') NOT NULL DEFAULT 'active',
  `image_url` TEXT NULL,
  `description` TEXT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `colours_code_key` (`code`),
  UNIQUE KEY `uq_colour_name_ci` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `comments` (
  `id` CHAR(36) NOT NULL DEFAULT (UUID()),
  `entity_type` TEXT NOT NULL,
  `entity_id` CHAR(36) NOT NULL,
  `author_id` CHAR(36) NOT NULL,
  `body` TEXT NOT NULL,
  `visibility` TEXT NOT NULL DEFAULT ('internal'),
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  CONSTRAINT `chk_comments_1` CHECK ((`visibility` IN ('internal', 'approval')))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `company_settings` (
  `id` CHAR(36) NOT NULL DEFAULT (UUID()),
  `company_name` TEXT NOT NULL DEFAULT ('BSC Exclusive Pvt. Ltd.'),
  `logo_url` TEXT NULL,
  `address` TEXT NULL,
  `city` TEXT NULL,
  `state` TEXT NULL,
  `pin_code` TEXT NULL,
  `phone` TEXT NULL,
  `email` TEXT NULL,
  `gst_number` TEXT NULL,
  `website` TEXT NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `dealers` (
  `id` CHAR(36) NOT NULL DEFAULT (UUID()),
  `code` VARCHAR(255) NOT NULL,
  `company_name` TEXT NOT NULL,
  `contact_person` TEXT NULL,
  `phone` TEXT NULL,
  `email` TEXT NULL,
  `address` TEXT NULL,
  `city` TEXT NULL,
  `state` TEXT NULL,
  `gstin` TEXT NULL,
  `pan` TEXT NULL,
  `payment_terms` ENUM('advance','net_30','net_60','against_delivery','custom') NOT NULL DEFAULT 'net_30',
  `notes` TEXT NULL,
  `status` ENUM('active','inactive','archived') NOT NULL DEFAULT 'active',
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `dealers_code_key` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `departments` (
  `id` CHAR(36) NOT NULL DEFAULT (UUID()),
  `code` VARCHAR(255) NOT NULL,
  `name` TEXT NOT NULL,
  `division_id` CHAR(36) NULL,
  `is_global` TINYINT(1) NOT NULL DEFAULT 0,
  `status` ENUM('active','inactive','archived') NOT NULL DEFAULT 'active',
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `division_id_uk` VARCHAR(36) GENERATED ALWAYS AS (IFNULL(`division_id`, '')) VIRTUAL INVISIBLE,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_dept` (`division_id_uk`, `code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `divisions` (
  `id` CHAR(36) NOT NULL DEFAULT (UUID()),
  `org_id` CHAR(36) NOT NULL,
  `code` VARCHAR(255) NOT NULL,
  `name` TEXT NOT NULL,
  `location` TEXT NULL,
  `contact_phone` TEXT NULL,
  `contact_email` TEXT NULL,
  `status` ENUM('active','inactive','archived') NOT NULL DEFAULT 'active',
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `divisions_code_key` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `export_jobs` (
  `id` CHAR(36) NOT NULL DEFAULT (UUID()),
  `job_type` TEXT NOT NULL,
  `filters` JSON NULL,
  `format` TEXT NOT NULL DEFAULT ('xlsx'),
  `status` ENUM('pending','processing','completed','failed','partial') NOT NULL DEFAULT 'pending',
  `storage_key` TEXT NULL,
  `requested_by` CHAR(36) NOT NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `completed_at` DATETIME(6) NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `chk_export_jobs_1` CHECK ((`format` IN ('xlsx', 'csv', 'pdf')))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `file_attachments` (
  `id` CHAR(36) NOT NULL DEFAULT (UUID()),
  `file_name` TEXT NOT NULL,
  `mime_type` TEXT NOT NULL DEFAULT ('application/octet-stream'),
  `size_bytes` BIGINT NOT NULL,
  `storage_key` TEXT NOT NULL,
  `description` TEXT NULL,
  `uploaded_by` CHAR(36) NOT NULL,
  `uploaded_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_file_attachments_uploaded` (`uploaded_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `import_jobs` (
  `id` CHAR(36) NOT NULL DEFAULT (UUID()),
  `job_type` TEXT NOT NULL,
  `storage_key` TEXT NOT NULL,
  `status` ENUM('pending','processing','completed','failed','partial') NOT NULL DEFAULT 'pending',
  `total_rows` INT NULL,
  `valid_rows` INT NULL,
  `error_rows` INT NULL,
  `error_report` JSON NULL,
  `requested_by` CHAR(36) NOT NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `completed_at` DATETIME(6) NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `inventory_transactions` (
  `id` CHAR(36) NOT NULL DEFAULT (UUID()),
  `division_id` CHAR(36) NOT NULL,
  `product_id` CHAR(36) NOT NULL,
  `size_id` CHAR(36) NULL,
  `receipt_item_id` CHAR(36) NULL,
  `txn_type` ENUM('receipt','adjustment','issue') NOT NULL,
  `quantity` INT NOT NULL,
  `unit_cost` DECIMAL(12,2) NULL,
  `created_by` CHAR(36) NOT NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_inv_lookup` (`division_id`, `product_id`, `size_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `locations` (
  `id` CHAR(36) NOT NULL DEFAULT (UUID()),
  `code` VARCHAR(255) NOT NULL,
  `name` TEXT NOT NULL,
  `address` TEXT NULL,
  `city` TEXT NULL,
  `state` TEXT NULL,
  `country` TEXT NULL DEFAULT ('India'),
  `latitude` DECIMAL(10,7) NULL,
  `longitude` DECIMAL(10,7) NULL,
  `contact_person` TEXT NULL,
  `phone` TEXT NULL,
  `notes` TEXT NULL,
  `status` ENUM('active','inactive','archived') NOT NULL DEFAULT 'active',
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `locations_code_key` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `manufacturers` (
  `id` CHAR(36) NOT NULL DEFAULT (UUID()),
  `code` VARCHAR(255) NOT NULL,
  `name` TEXT NOT NULL,
  `contact_person` TEXT NULL,
  `phone` TEXT NULL,
  `email` TEXT NULL,
  `address` TEXT NULL,
  `city` TEXT NULL,
  `state` TEXT NULL,
  `country` TEXT NULL DEFAULT ('India'),
  `gstin` TEXT NULL,
  `notes` TEXT NULL,
  `status` ENUM('active','inactive','archived') NOT NULL DEFAULT 'active',
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `manufacturers_code_key` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `notifications` (
  `id` CHAR(36) NOT NULL DEFAULT (UUID()),
  `user_id` CHAR(36) NOT NULL,
  `channel` ENUM('in_app','email','sms','whatsapp') NOT NULL DEFAULT 'in_app',
  `event_type` TEXT NOT NULL,
  `entity_type` TEXT NULL,
  `entity_id` CHAR(36) NULL,
  `title` TEXT NOT NULL,
  `body` TEXT NULL,
  `is_read` TINYINT(1) NOT NULL DEFAULT 0,
  `sent_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `read_at` DATETIME(6) NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `number_sequences` (
  `id` CHAR(36) NOT NULL DEFAULT (UUID()),
  `entity_type` VARCHAR(255) NOT NULL,
  `division_id` CHAR(36) NULL,
  `seq_year` INT NOT NULL,
  `prefix` TEXT NOT NULL,
  `current_value` BIGINT NOT NULL DEFAULT 0,
  `division_id_uk` VARCHAR(36) GENERATED ALWAYS AS (IFNULL(`division_id`, '')) VIRTUAL INVISIBLE,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_seq` (`entity_type`, `division_id_uk`, `seq_year`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `organizations` (
  `id` CHAR(36) NOT NULL DEFAULT (UUID()),
  `name` TEXT NOT NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `permissions` (
  `id` CHAR(36) NOT NULL DEFAULT (UUID()),
  `code` VARCHAR(255) NOT NULL,
  `module` TEXT NOT NULL,
  `description` TEXT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `permissions_code_key` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `product_colours` (
  `product_id` CHAR(36) NOT NULL,
  `colour_id` CHAR(36) NOT NULL,
  PRIMARY KEY (`product_id`, `colour_id`),
  KEY `idx_product_colours_colour` (`colour_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `product_images` (
  `id` CHAR(36) NOT NULL DEFAULT (UUID()),
  `product_id` CHAR(36) NOT NULL,
  `file_name` TEXT NOT NULL,
  `mime_type` TEXT NOT NULL,
  `size_bytes` BIGINT NOT NULL,
  `storage_key` TEXT NOT NULL,
  `is_primary` TINYINT(1) NOT NULL DEFAULT 0,
  `sort_order` INT NOT NULL DEFAULT 0,
  `uploaded_by` CHAR(36) NULL,
  `uploaded_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_product_images_product` (`product_id`, `is_primary`, `sort_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `product_manufacturers` (
  `product_id` CHAR(36) NOT NULL,
  `manufacturer_id` CHAR(36) NOT NULL,
  PRIMARY KEY (`product_id`, `manufacturer_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `product_sizes` (
  `product_id` CHAR(36) NOT NULL,
  `size_id` CHAR(36) NOT NULL,
  PRIMARY KEY (`product_id`, `size_id`),
  KEY `idx_product_sizes_size` (`size_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `product_types` (
  `id` CHAR(36) NOT NULL DEFAULT (UUID()),
  `section_id` CHAR(36) NOT NULL,
  `category_id` CHAR(36) NULL,
  `subcategory_id` CHAR(36) NULL,
  `code` VARCHAR(255) NOT NULL,
  `name` TEXT NOT NULL,
  `status` ENUM('active','inactive','archived') NOT NULL DEFAULT 'active',
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_product_type` (`section_id`, `category_id`, `subcategory_id`, `code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `product_variants` (
  `id` CHAR(36) NOT NULL DEFAULT (UUID()),
  `product_id` CHAR(36) NOT NULL,
  `size_id` CHAR(36) NULL,
  `colour_id` CHAR(36) NULL,
  `style` VARCHAR(255) NULL,
  `size_id_uk` VARCHAR(36) GENERATED ALWAYS AS (IFNULL(`size_id`, '')) VIRTUAL INVISIBLE,
  `colour_id_uk` VARCHAR(36) GENERATED ALWAYS AS (IFNULL(`colour_id`, '')) VIRTUAL INVISIBLE,
  `style_uk` VARCHAR(255) GENERATED ALWAYS AS (IFNULL(`style`, '')) VIRTUAL INVISIBLE,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_variant` (`product_id`, `size_id_uk`, `colour_id_uk`, `style_uk`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `products` (
  `id` CHAR(36) NOT NULL DEFAULT (UUID()),
  `product_serial` VARCHAR(255) NOT NULL,
  `sku` VARCHAR(255) NOT NULL,
  `barcode` VARCHAR(255) NULL,
  `name` TEXT NOT NULL,
  `description` TEXT NULL,
  `brand_id` CHAR(36) NOT NULL,
  `department_id` CHAR(36) NULL,
  `section_id` CHAR(36) NOT NULL,
  `category_id` CHAR(36) NULL,
  `subcategory_id` CHAR(36) NULL,
  `attributes` JSON NOT NULL DEFAULT (JSON_OBJECT()),
  `hsn_sac` TEXT NULL,
  `tax_category` TEXT NULL,
  `status` ENUM('active','inactive','archived') NOT NULL DEFAULT 'active',
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `material` VARCHAR(255) NULL,
  `pattern` TEXT NULL,
  `fit` TEXT NULL,
  `neck_type` TEXT NULL,
  `sleeve_type` TEXT NULL,
  `season` TEXT NULL,
  `gender` VARCHAR(255) NULL DEFAULT 'men',
  `collection` VARCHAR(255) NULL DEFAULT 'mens_wear',
  `purchase_price` DECIMAL(12,2) NULL DEFAULT 0,
  `selling_price` DECIMAL(12,2) NULL DEFAULT 0,
  `internal_ref` TEXT NULL,
  `profit_amount` DECIMAL(12,2) GENERATED ALWAYS AS (`selling_price` - `purchase_price`) STORED,
  `profit_margin` DECIMAL(5,2) GENERATED ALWAYS AS (CASE WHEN `purchase_price` > 0 THEN ROUND(((`selling_price` - `purchase_price`) / `purchase_price`) * 100, 2) ELSE 0 END) STORED,
  `product_type_id` CHAR(36) NULL,
  `manual_size` TEXT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `products_barcode_key` (`barcode`),
  UNIQUE KEY `products_product_serial_key` (`product_serial`),
  KEY `idx_products_category` (`category_id`),
  KEY `idx_products_collection` (`collection`),
  KEY `idx_products_gender` (`gender`),
  KEY `idx_products_material` (`material`),
  KEY `idx_products_status` (`status`),
  UNIQUE KEY `uq_product_sku` (`sku`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `purchase_order_charges` (
  `id` CHAR(36) NOT NULL DEFAULT (UUID()),
  `po_id` CHAR(36) NOT NULL,
  `charge_type` ENUM('freight','packing','transport','installation','assembly','other') NOT NULL,
  `description` TEXT NULL,
  `amount` DECIMAL(14,2) NOT NULL,
  `is_supplier_billed` TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  CONSTRAINT `chk_purchase_order_charges_1` CHECK ((`amount` >= 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `purchase_order_discounts` (
  `id` CHAR(36) NOT NULL DEFAULT (UUID()),
  `po_id` CHAR(36) NOT NULL,
  `discount_type` ENUM('percent','flat') NOT NULL,
  `discount_value` DECIMAL(12,2) NOT NULL,
  `discount_amount` DECIMAL(14,2) NOT NULL,
  `reason` TEXT NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `chk_purchase_order_discounts_1` CHECK ((`discount_amount` >= 0)),
  CONSTRAINT `chk_purchase_order_discounts_2` CHECK ((`discount_value` >= 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `purchase_order_items` (
  `id` CHAR(36) NOT NULL DEFAULT (UUID()),
  `po_id` CHAR(36) NOT NULL,
  `line_no` INT NOT NULL,
  `product_id` CHAR(36) NOT NULL,
  `product_snapshot` JSON NOT NULL,
  `brand_snapshot` JSON NOT NULL,
  `colour_id` CHAR(36) NULL,
  `colour_snapshot` JSON NULL,
  `description` TEXT NULL,
  `purchase_price` DECIMAL(12,2) NOT NULL,
  `margin_percent` DECIMAL(5,2) NOT NULL DEFAULT 0,
  `margin_amount` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `net_value_per_unit` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `discount_type` ENUM('percent','flat') NULL,
  `discount_value` DECIMAL(12,2) NULL,
  `discount_amount` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `final_value_per_unit` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `total_quantity` INT NOT NULL,
  `line_total` DECIMAL(14,2) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `purchase_order_items_po_id_line_no_key` (`po_id`, `line_no`),
  KEY `idx_po_items_po` (`po_id`),
  CONSTRAINT `chk_purchase_order_items_1` CHECK ((`discount_amount` >= 0)),
  CONSTRAINT `chk_purchase_order_items_2` CHECK ((`line_total` >= 0)),
  CONSTRAINT `chk_purchase_order_items_3` CHECK ((`margin_percent` >= 0)),
  CONSTRAINT `chk_purchase_order_items_4` CHECK ((`purchase_price` >= 0)),
  CONSTRAINT `chk_purchase_order_items_5` CHECK ((`total_quantity` > 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `purchase_order_quantities` (
  `id` CHAR(36) NOT NULL DEFAULT (UUID()),
  `po_item_id` CHAR(36) NOT NULL,
  `size_id` CHAR(36) NULL,
  `size_label` TEXT NOT NULL,
  `quantity` INT NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `purchase_order_quantities_po_item_id_size_id_key` (`po_item_id`, `size_id`),
  CONSTRAINT `chk_purchase_order_quantities_1` CHECK ((`quantity` >= 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `purchase_order_taxes` (
  `id` CHAR(36) NOT NULL DEFAULT (UUID()),
  `po_id` CHAR(36) NOT NULL,
  `po_item_id` CHAR(36) NULL,
  `tax_name` TEXT NOT NULL,
  `rate` DECIMAL(5,2) NOT NULL,
  `taxable_base` DECIMAL(14,2) NOT NULL,
  `tax_amount` DECIMAL(14,2) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `purchase_orders` (
  `id` CHAR(36) NOT NULL DEFAULT (UUID()),
  `po_number` VARCHAR(255) NOT NULL,
  `version` INT NOT NULL DEFAULT 1,
  `parent_po_id` CHAR(36) NULL,
  `division_id` CHAR(36) NOT NULL,
  `department_id` CHAR(36) NOT NULL,
  `section_id` CHAR(36) NOT NULL,
  `supplier_id` CHAR(36) NOT NULL,
  `created_by` CHAR(36) NOT NULL,
  `po_date` DATE NOT NULL DEFAULT (CURRENT_DATE),
  `status` ENUM('draft','submitted','under_review','approved','issued','partially_received','received','closed','cancelled') NOT NULL DEFAULT 'draft',
  `payment_terms` ENUM('advance','net_30','net_60','against_delivery','custom') NULL,
  `delivery_terms` TEXT NULL,
  `currency` CHAR(3) NOT NULL DEFAULT 'INR',
  `tax_scheme` TEXT NULL,
  `expected_delivery_date` DATE NULL,
  `subtotal` DECIMAL(14,2) NOT NULL DEFAULT 0,
  `order_discount_amount` DECIMAL(14,2) NOT NULL DEFAULT 0,
  `tax_amount` DECIMAL(14,2) NOT NULL DEFAULT 0,
  `charges_amount` DECIMAL(14,2) NOT NULL DEFAULT 0,
  `grand_total` DECIMAL(14,2) NOT NULL DEFAULT 0,
  `header_snapshot` JSON NULL,
  `remarks` TEXT NULL,
  `qr_code` TEXT NULL,
  `idempotency_key` CHAR(36) NULL,
  `submitted_at` DATETIME(6) NULL,
  `approved_at` DATETIME(6) NULL,
  `issued_at` DATETIME(6) NULL,
  `closed_at` DATETIME(6) NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `location_id` CHAR(36) NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `purchase_orders_po_number_key` (`po_number`),
  KEY `idx_po_created` (`created_at`),
  KEY `idx_po_div_status` (`division_id`, `status`),
  KEY `idx_po_supplier` (`supplier_id`),
  UNIQUE KEY `uq_po_idempotency_key` (`idempotency_key`),
  CONSTRAINT `chk_purchase_orders_1` CHECK ((`charges_amount` >= 0)),
  CONSTRAINT `chk_purchase_orders_2` CHECK ((`grand_total` >= 0)),
  CONSTRAINT `chk_purchase_orders_3` CHECK ((`order_discount_amount` >= 0)),
  CONSTRAINT `chk_purchase_orders_4` CHECK ((`subtotal` >= 0)),
  CONSTRAINT `chk_purchase_orders_5` CHECK ((`tax_amount` >= 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `receipt_items` (
  `id` CHAR(36) NOT NULL DEFAULT (UUID()),
  `receipt_id` CHAR(36) NOT NULL,
  `po_item_id` CHAR(36) NOT NULL,
  `ordered_qty` INT NOT NULL,
  `received_qty` INT NOT NULL,
  `damaged_qty` INT NOT NULL DEFAULT 0,
  `rejected_qty` INT NOT NULL DEFAULT 0,
  `accepted_qty` INT GENERATED ALWAYS AS (`received_qty` - `damaged_qty` - `rejected_qty`) STORED,
  `remarks` TEXT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_receipt_items_po_item` (`po_item_id`),
  CONSTRAINT `chk_receipt_items_1` CHECK (((`damaged_qty` + `rejected_qty`) <= `received_qty`)),
  CONSTRAINT `chk_receipt_items_2` CHECK ((`damaged_qty` >= 0)),
  CONSTRAINT `chk_receipt_items_3` CHECK ((`received_qty` >= 0)),
  CONSTRAINT `chk_receipt_items_4` CHECK ((`rejected_qty` >= 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `receipts` (
  `id` CHAR(36) NOT NULL DEFAULT (UUID()),
  `receipt_number` VARCHAR(255) NOT NULL,
  `po_id` CHAR(36) NOT NULL,
  `supplier_id` CHAR(36) NOT NULL,
  `division_id` CHAR(36) NOT NULL,
  `delivery_date` DATE NULL,
  `invoice_number` TEXT NULL,
  `invoice_date` DATE NULL,
  `received_by` CHAR(36) NOT NULL,
  `status` ENUM('draft','posted','cancelled') NOT NULL DEFAULT 'draft',
  `remarks` TEXT NULL,
  `attachments` JSON NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `receipts_receipt_number_key` (`receipt_number`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `role_permissions` (
  `role_id` CHAR(36) NOT NULL,
  `permission_id` CHAR(36) NOT NULL,
  PRIMARY KEY (`role_id`, `permission_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `roles` (
  `id` CHAR(36) NOT NULL DEFAULT (UUID()),
  `code` VARCHAR(255) NOT NULL,
  `name` TEXT NOT NULL,
  `description` TEXT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `roles_code_key` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `section_attributes` (
  `id` CHAR(36) NOT NULL DEFAULT (UUID()),
  `section_id` CHAR(36) NOT NULL,
  `attribute_key` VARCHAR(255) NOT NULL,
  `attribute_label` TEXT NOT NULL,
  `data_type` TEXT NOT NULL DEFAULT ('text'),
  `options` JSON NULL,
  `is_required` TINYINT(1) NOT NULL DEFAULT 0,
  `display_order` INT NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `section_attributes_section_id_attribute_key_key` (`section_id`, `attribute_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `sections` (
  `id` CHAR(36) NOT NULL DEFAULT (UUID()),
  `code` VARCHAR(255) NOT NULL,
  `name` TEXT NOT NULL,
  `department_id` CHAR(36) NOT NULL,
  `parent_group` TEXT NULL,
  `sizing_method_id` CHAR(36) NOT NULL,
  `display_order` INT NOT NULL DEFAULT 0,
  `attributes` JSON NOT NULL DEFAULT (JSON_OBJECT()),
  `icon_url` TEXT NULL,
  `status` ENUM('active','inactive','archived') NOT NULL DEFAULT 'active',
  `created_by` CHAR(36) NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_section` (`department_id`, `code`),
  KEY `idx_sections_status` (`department_id`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `settings` (
  `key` VARCHAR(255) NOT NULL,
  `value` JSON NOT NULL,
  `description` TEXT NULL,
  `updated_by` CHAR(36) NULL,
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `size_methods` (
  `id` CHAR(36) NOT NULL DEFAULT (UUID()),
  `code` VARCHAR(255) NOT NULL,
  `name` TEXT NOT NULL,
  `is_custom` TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `size_methods_code_key` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `sizes` (
  `id` CHAR(36) NOT NULL DEFAULT (UUID()),
  `size_method_id` CHAR(36) NOT NULL,
  `label` VARCHAR(255) NOT NULL,
  `numeric_value` DECIMAL(14,4) NULL,
  `display_order` INT NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `sizes_size_method_id_label_key` (`size_method_id`, `label`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `supplier_brands` (
  `supplier_id` CHAR(36) NOT NULL,
  `brand_id` CHAR(36) NOT NULL,
  PRIMARY KEY (`supplier_id`, `brand_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `supplier_divisions` (
  `supplier_id` CHAR(36) NOT NULL,
  `division_id` CHAR(36) NOT NULL,
  PRIMARY KEY (`supplier_id`, `division_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `suppliers` (
  `id` CHAR(36) NOT NULL DEFAULT (UUID()),
  `code` VARCHAR(255) NOT NULL,
  `company_name` TEXT NOT NULL,
  `contact_person` TEXT NULL,
  `mobile` TEXT NULL,
  `email` TEXT NULL,
  `address` TEXT NULL,
  `gstin` TEXT NULL,
  `pan` TEXT NULL,
  `payment_terms` ENUM('advance','net_30','net_60','against_delivery','custom') NOT NULL DEFAULT 'net_30',
  `preferred_brands` JSON NULL,
  `internal_rating` DECIMAL(3,1) NULL,
  `bank_details` JSON NULL,
  `notes` TEXT NULL,
  `status` ENUM('active','inactive','archived') NOT NULL DEFAULT 'active',
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `suppliers_code_key` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `user_collections` (
  `user_id` CHAR(36) NOT NULL,
  `collection_id` CHAR(36) NOT NULL,
  PRIMARY KEY (`user_id`, `collection_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `user_divisions` (
  `user_id` CHAR(36) NOT NULL,
  `division_id` CHAR(36) NOT NULL,
  PRIMARY KEY (`user_id`, `division_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `user_roles` (
  `user_id` CHAR(36) NOT NULL,
  `role_id` CHAR(36) NOT NULL,
  PRIMARY KEY (`user_id`, `role_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `user_sections` (
  `user_id` CHAR(36) NOT NULL,
  `section_id` CHAR(36) NOT NULL,
  PRIMARY KEY (`user_id`, `section_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `user_sessions` (
  `id` CHAR(36) NOT NULL DEFAULT (UUID()),
  `user_id` CHAR(36) NOT NULL,
  `tab_id` VARCHAR(255) NOT NULL,
  `login_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `logout_at` DATETIME(6) NULL,
  `last_seen_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `ip_address` TEXT NULL,
  `user_agent` TEXT NULL,
  `device_type` TEXT NULL,
  `browser` TEXT NULL,
  `os` TEXT NULL,
  `screen` TEXT NULL,
  `current_route` TEXT NULL,
  `current_title` TEXT NULL,
  `latitude` DOUBLE NULL,
  `longitude` DOUBLE NULL,
  `location_accuracy` DOUBLE NULL,
  `devtools_seen` TINYINT(1) NOT NULL DEFAULT 0,
  `ended_reason` TEXT NULL,
  `token_hash` VARCHAR(255) NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_user_session_tab` (`user_id`, `tab_id`),
  KEY `idx_user_sessions_seen` (`last_seen_at`),
  KEY `idx_user_sessions_token` (`token_hash`),
  KEY `idx_user_sessions_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `users` (
  `id` CHAR(36) NOT NULL DEFAULT (UUID()),
  `email` VARCHAR(255) NOT NULL,
  `username` VARCHAR(255) NOT NULL,
  `employee_id` VARCHAR(64) NULL,
  `password_hash` TEXT NOT NULL,
  `full_name` TEXT NOT NULL,
  `phone` TEXT NULL,
  `mfa_enabled` TINYINT(1) NOT NULL DEFAULT 0,
  `force_password_reset` TINYINT(1) NOT NULL DEFAULT 0,
  `failed_attempts` INT NOT NULL DEFAULT 0,
  `locked_until` DATETIME(6) NULL,
  `last_login_at` DATETIME(6) NULL,
  `status` ENUM('active','inactive','archived') NOT NULL DEFAULT 'active',
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `profile_photo_url` TEXT NULL,
  `designation` TEXT NULL,
  `profile_updated_at` DATETIME(6) NULL,
  `reset_otp_phone` VARCHAR(10) NULL,
  `mfa_otp` VARCHAR(10) NULL,
  `mfa_otp_expires_at` DATETIME(6) NULL,
  `password_changed_at` DATETIME(6) NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `users_email_key` (`email`),
  UNIQUE KEY `users_username_key` (`username`),
  KEY `idx_users_password_changed_at` (`password_changed_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `user_permissions` (
  `user_id` CHAR(36) NOT NULL,
  `permission_id` CHAR(36) NOT NULL,
  `effect` ENUM('allow','deny') NOT NULL DEFAULT 'allow',
  `updated_by` CHAR(36) NULL,
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`user_id`, `permission_id`),
  KEY `idx_user_permissions_perm` (`permission_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `videos` (
  `id` CHAR(36) NOT NULL DEFAULT (UUID()),
  `title` TEXT NOT NULL,
  `description` TEXT NULL,
  `category` VARCHAR(255) NOT NULL DEFAULT 'general',
  `module` TEXT NULL,
  `file_name` TEXT NOT NULL,
  `mime_type` TEXT NOT NULL,
  `size_bytes` BIGINT NOT NULL,
  `storage_key` TEXT NOT NULL,
  `thumbnail_key` TEXT NULL,
  `duration_seconds` INT NULL,
  `status` ENUM('active','inactive','archived') NOT NULL DEFAULT 'active',
  `uploaded_by` CHAR(36) NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_videos_category` (`category`, `status`),
  KEY `idx_videos_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ---------------------------------------------------------------------------
-- Foreign keys. Each is preceded by an "@fk table.name" marker: the migration runner
-- skips constraints that already exist (MySQL has no ADD CONSTRAINT IF NOT EXISTS).
-- ---------------------------------------------------------------------------
-- @fk approval_actions.approval_actions_approver_id_fkey
ALTER TABLE `approval_actions` ADD CONSTRAINT `approval_actions_approver_id_fkey` FOREIGN KEY (`approver_id`) REFERENCES `users` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;
-- @fk approval_actions.approval_actions_instance_id_fkey
ALTER TABLE `approval_actions` ADD CONSTRAINT `approval_actions_instance_id_fkey` FOREIGN KEY (`instance_id`) REFERENCES `approval_instances` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;
-- @fk approval_instances.approval_instances_created_by_fkey
ALTER TABLE `approval_instances` ADD CONSTRAINT `approval_instances_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;
-- @fk approval_instances.approval_instances_po_id_fkey
ALTER TABLE `approval_instances` ADD CONSTRAINT `approval_instances_po_id_fkey` FOREIGN KEY (`po_id`) REFERENCES `purchase_orders` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;
-- @fk approval_instances.approval_instances_rule_id_fkey
ALTER TABLE `approval_instances` ADD CONSTRAINT `approval_instances_rule_id_fkey` FOREIGN KEY (`rule_id`) REFERENCES `approval_rules` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;
-- @fk approval_levels.approval_levels_approver_role_id_fkey
ALTER TABLE `approval_levels` ADD CONSTRAINT `approval_levels_approver_role_id_fkey` FOREIGN KEY (`approver_role_id`) REFERENCES `roles` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;
-- @fk approval_levels.approval_levels_approver_user_id_fkey
ALTER TABLE `approval_levels` ADD CONSTRAINT `approval_levels_approver_user_id_fkey` FOREIGN KEY (`approver_user_id`) REFERENCES `users` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;
-- @fk approval_levels.approval_levels_rule_id_fkey
ALTER TABLE `approval_levels` ADD CONSTRAINT `approval_levels_rule_id_fkey` FOREIGN KEY (`rule_id`) REFERENCES `approval_rules` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION;
-- @fk approval_rules.approval_rules_category_id_fkey
ALTER TABLE `approval_rules` ADD CONSTRAINT `approval_rules_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;
-- @fk approval_rules.approval_rules_department_id_fkey
ALTER TABLE `approval_rules` ADD CONSTRAINT `approval_rules_department_id_fkey` FOREIGN KEY (`department_id`) REFERENCES `departments` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;
-- @fk approval_rules.approval_rules_division_id_fkey
ALTER TABLE `approval_rules` ADD CONSTRAINT `approval_rules_division_id_fkey` FOREIGN KEY (`division_id`) REFERENCES `divisions` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;
-- @fk approval_rules.approval_rules_section_id_fkey
ALTER TABLE `approval_rules` ADD CONSTRAINT `approval_rules_section_id_fkey` FOREIGN KEY (`section_id`) REFERENCES `sections` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;
-- @fk approval_rules.approval_rules_supplier_id_fkey
ALTER TABLE `approval_rules` ADD CONSTRAINT `approval_rules_supplier_id_fkey` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;
-- @fk attachments.attachments_uploaded_by_fkey
ALTER TABLE `attachments` ADD CONSTRAINT `attachments_uploaded_by_fkey` FOREIGN KEY (`uploaded_by`) REFERENCES `users` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;
-- @fk brand_collections.brand_collections_brand_id_fkey
ALTER TABLE `brand_collections` ADD CONSTRAINT `brand_collections_brand_id_fkey` FOREIGN KEY (`brand_id`) REFERENCES `brands` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION;
-- @fk brand_collections.brand_collections_collection_id_fkey
ALTER TABLE `brand_collections` ADD CONSTRAINT `brand_collections_collection_id_fkey` FOREIGN KEY (`collection_id`) REFERENCES `collections` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION;
-- @fk categories.categories_parent_category_id_fkey
ALTER TABLE `categories` ADD CONSTRAINT `categories_parent_category_id_fkey` FOREIGN KEY (`parent_category_id`) REFERENCES `categories` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;
-- @fk categories.categories_section_id_fkey
ALTER TABLE `categories` ADD CONSTRAINT `categories_section_id_fkey` FOREIGN KEY (`section_id`) REFERENCES `sections` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;
-- @fk chat_messages.chat_messages_division_id_fkey
ALTER TABLE `chat_messages` ADD CONSTRAINT `chat_messages_division_id_fkey` FOREIGN KEY (`division_id`) REFERENCES `divisions` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;
-- @fk chat_messages.chat_messages_user_id_fkey
ALTER TABLE `chat_messages` ADD CONSTRAINT `chat_messages_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;
-- @fk comments.comments_author_id_fkey
ALTER TABLE `comments` ADD CONSTRAINT `comments_author_id_fkey` FOREIGN KEY (`author_id`) REFERENCES `users` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;
-- @fk departments.departments_division_id_fkey
ALTER TABLE `departments` ADD CONSTRAINT `departments_division_id_fkey` FOREIGN KEY (`division_id`) REFERENCES `divisions` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;
-- @fk divisions.divisions_org_id_fkey
ALTER TABLE `divisions` ADD CONSTRAINT `divisions_org_id_fkey` FOREIGN KEY (`org_id`) REFERENCES `organizations` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;
-- @fk export_jobs.export_jobs_requested_by_fkey
ALTER TABLE `export_jobs` ADD CONSTRAINT `export_jobs_requested_by_fkey` FOREIGN KEY (`requested_by`) REFERENCES `users` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;
-- @fk file_attachments.file_attachments_uploaded_by_fkey
ALTER TABLE `file_attachments` ADD CONSTRAINT `file_attachments_uploaded_by_fkey` FOREIGN KEY (`uploaded_by`) REFERENCES `users` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;
-- @fk import_jobs.import_jobs_requested_by_fkey
ALTER TABLE `import_jobs` ADD CONSTRAINT `import_jobs_requested_by_fkey` FOREIGN KEY (`requested_by`) REFERENCES `users` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;
-- @fk inventory_transactions.inventory_transactions_created_by_fkey
ALTER TABLE `inventory_transactions` ADD CONSTRAINT `inventory_transactions_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;
-- @fk inventory_transactions.inventory_transactions_division_id_fkey
ALTER TABLE `inventory_transactions` ADD CONSTRAINT `inventory_transactions_division_id_fkey` FOREIGN KEY (`division_id`) REFERENCES `divisions` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;
-- @fk inventory_transactions.inventory_transactions_product_id_fkey
ALTER TABLE `inventory_transactions` ADD CONSTRAINT `inventory_transactions_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;
-- @fk inventory_transactions.inventory_transactions_receipt_item_id_fkey
ALTER TABLE `inventory_transactions` ADD CONSTRAINT `inventory_transactions_receipt_item_id_fkey` FOREIGN KEY (`receipt_item_id`) REFERENCES `receipt_items` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;
-- @fk inventory_transactions.inventory_transactions_size_id_fkey
ALTER TABLE `inventory_transactions` ADD CONSTRAINT `inventory_transactions_size_id_fkey` FOREIGN KEY (`size_id`) REFERENCES `sizes` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;
-- @fk notifications.notifications_user_id_fkey
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;
-- @fk number_sequences.number_sequences_division_id_fkey
ALTER TABLE `number_sequences` ADD CONSTRAINT `number_sequences_division_id_fkey` FOREIGN KEY (`division_id`) REFERENCES `divisions` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;
-- @fk product_colours.product_colours_colour_id_fkey
ALTER TABLE `product_colours` ADD CONSTRAINT `product_colours_colour_id_fkey` FOREIGN KEY (`colour_id`) REFERENCES `colours` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;
-- @fk product_colours.product_colours_product_id_fkey
ALTER TABLE `product_colours` ADD CONSTRAINT `product_colours_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION;
-- @fk product_images.product_images_product_id_fkey
ALTER TABLE `product_images` ADD CONSTRAINT `product_images_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION;
-- @fk product_images.product_images_uploaded_by_fkey
ALTER TABLE `product_images` ADD CONSTRAINT `product_images_uploaded_by_fkey` FOREIGN KEY (`uploaded_by`) REFERENCES `users` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;
-- @fk product_manufacturers.product_manufacturers_manufacturer_id_fkey
ALTER TABLE `product_manufacturers` ADD CONSTRAINT `product_manufacturers_manufacturer_id_fkey` FOREIGN KEY (`manufacturer_id`) REFERENCES `manufacturers` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;
-- @fk product_manufacturers.product_manufacturers_product_id_fkey
ALTER TABLE `product_manufacturers` ADD CONSTRAINT `product_manufacturers_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION;
-- @fk product_sizes.product_sizes_product_id_fkey
ALTER TABLE `product_sizes` ADD CONSTRAINT `product_sizes_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION;
-- @fk product_sizes.product_sizes_size_id_fkey
ALTER TABLE `product_sizes` ADD CONSTRAINT `product_sizes_size_id_fkey` FOREIGN KEY (`size_id`) REFERENCES `sizes` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;
-- @fk product_types.product_types_category_id_fkey
ALTER TABLE `product_types` ADD CONSTRAINT `product_types_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;
-- @fk product_types.product_types_section_id_fkey
ALTER TABLE `product_types` ADD CONSTRAINT `product_types_section_id_fkey` FOREIGN KEY (`section_id`) REFERENCES `sections` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;
-- @fk product_types.product_types_subcategory_id_fkey
ALTER TABLE `product_types` ADD CONSTRAINT `product_types_subcategory_id_fkey` FOREIGN KEY (`subcategory_id`) REFERENCES `categories` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;
-- @fk product_variants.product_variants_colour_id_fkey
ALTER TABLE `product_variants` ADD CONSTRAINT `product_variants_colour_id_fkey` FOREIGN KEY (`colour_id`) REFERENCES `colours` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;
-- @fk product_variants.product_variants_product_id_fkey
ALTER TABLE `product_variants` ADD CONSTRAINT `product_variants_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION;
-- @fk product_variants.product_variants_size_id_fkey
ALTER TABLE `product_variants` ADD CONSTRAINT `product_variants_size_id_fkey` FOREIGN KEY (`size_id`) REFERENCES `sizes` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;
-- @fk products.products_brand_id_fkey
ALTER TABLE `products` ADD CONSTRAINT `products_brand_id_fkey` FOREIGN KEY (`brand_id`) REFERENCES `brands` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;
-- @fk products.products_category_id_fkey
ALTER TABLE `products` ADD CONSTRAINT `products_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;
-- @fk products.products_department_id_fkey
ALTER TABLE `products` ADD CONSTRAINT `products_department_id_fkey` FOREIGN KEY (`department_id`) REFERENCES `departments` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;
-- @fk products.products_product_type_id_fkey
ALTER TABLE `products` ADD CONSTRAINT `products_product_type_id_fkey` FOREIGN KEY (`product_type_id`) REFERENCES `product_types` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;
-- @fk products.products_section_id_fkey
ALTER TABLE `products` ADD CONSTRAINT `products_section_id_fkey` FOREIGN KEY (`section_id`) REFERENCES `sections` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;
-- @fk products.products_subcategory_id_fkey
ALTER TABLE `products` ADD CONSTRAINT `products_subcategory_id_fkey` FOREIGN KEY (`subcategory_id`) REFERENCES `categories` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;
-- @fk purchase_order_charges.purchase_order_charges_po_id_fkey
ALTER TABLE `purchase_order_charges` ADD CONSTRAINT `purchase_order_charges_po_id_fkey` FOREIGN KEY (`po_id`) REFERENCES `purchase_orders` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION;
-- @fk purchase_order_discounts.purchase_order_discounts_po_id_fkey
ALTER TABLE `purchase_order_discounts` ADD CONSTRAINT `purchase_order_discounts_po_id_fkey` FOREIGN KEY (`po_id`) REFERENCES `purchase_orders` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION;
-- @fk purchase_order_items.purchase_order_items_colour_id_fkey
ALTER TABLE `purchase_order_items` ADD CONSTRAINT `purchase_order_items_colour_id_fkey` FOREIGN KEY (`colour_id`) REFERENCES `colours` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;
-- @fk purchase_order_items.purchase_order_items_po_id_fkey
ALTER TABLE `purchase_order_items` ADD CONSTRAINT `purchase_order_items_po_id_fkey` FOREIGN KEY (`po_id`) REFERENCES `purchase_orders` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION;
-- @fk purchase_order_items.purchase_order_items_product_id_fkey
ALTER TABLE `purchase_order_items` ADD CONSTRAINT `purchase_order_items_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;
-- @fk purchase_order_quantities.purchase_order_quantities_po_item_id_fkey
ALTER TABLE `purchase_order_quantities` ADD CONSTRAINT `purchase_order_quantities_po_item_id_fkey` FOREIGN KEY (`po_item_id`) REFERENCES `purchase_order_items` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION;
-- @fk purchase_order_quantities.purchase_order_quantities_size_id_fkey
ALTER TABLE `purchase_order_quantities` ADD CONSTRAINT `purchase_order_quantities_size_id_fkey` FOREIGN KEY (`size_id`) REFERENCES `sizes` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;
-- @fk purchase_order_taxes.purchase_order_taxes_po_id_fkey
ALTER TABLE `purchase_order_taxes` ADD CONSTRAINT `purchase_order_taxes_po_id_fkey` FOREIGN KEY (`po_id`) REFERENCES `purchase_orders` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION;
-- @fk purchase_order_taxes.purchase_order_taxes_po_item_id_fkey
ALTER TABLE `purchase_order_taxes` ADD CONSTRAINT `purchase_order_taxes_po_item_id_fkey` FOREIGN KEY (`po_item_id`) REFERENCES `purchase_order_items` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;
-- @fk purchase_orders.purchase_orders_created_by_fkey
ALTER TABLE `purchase_orders` ADD CONSTRAINT `purchase_orders_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;
-- @fk purchase_orders.purchase_orders_department_id_fkey
ALTER TABLE `purchase_orders` ADD CONSTRAINT `purchase_orders_department_id_fkey` FOREIGN KEY (`department_id`) REFERENCES `departments` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;
-- @fk purchase_orders.purchase_orders_division_id_fkey
ALTER TABLE `purchase_orders` ADD CONSTRAINT `purchase_orders_division_id_fkey` FOREIGN KEY (`division_id`) REFERENCES `divisions` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;
-- @fk purchase_orders.purchase_orders_location_id_fkey
ALTER TABLE `purchase_orders` ADD CONSTRAINT `purchase_orders_location_id_fkey` FOREIGN KEY (`location_id`) REFERENCES `locations` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;
-- @fk purchase_orders.purchase_orders_parent_po_id_fkey
ALTER TABLE `purchase_orders` ADD CONSTRAINT `purchase_orders_parent_po_id_fkey` FOREIGN KEY (`parent_po_id`) REFERENCES `purchase_orders` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;
-- @fk purchase_orders.purchase_orders_section_id_fkey
ALTER TABLE `purchase_orders` ADD CONSTRAINT `purchase_orders_section_id_fkey` FOREIGN KEY (`section_id`) REFERENCES `sections` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;
-- @fk purchase_orders.purchase_orders_supplier_id_fkey
ALTER TABLE `purchase_orders` ADD CONSTRAINT `purchase_orders_supplier_id_fkey` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;
-- @fk receipt_items.receipt_items_po_item_id_fkey
ALTER TABLE `receipt_items` ADD CONSTRAINT `receipt_items_po_item_id_fkey` FOREIGN KEY (`po_item_id`) REFERENCES `purchase_order_items` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;
-- @fk receipt_items.receipt_items_receipt_id_fkey
ALTER TABLE `receipt_items` ADD CONSTRAINT `receipt_items_receipt_id_fkey` FOREIGN KEY (`receipt_id`) REFERENCES `receipts` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION;
-- @fk receipts.receipts_division_id_fkey
ALTER TABLE `receipts` ADD CONSTRAINT `receipts_division_id_fkey` FOREIGN KEY (`division_id`) REFERENCES `divisions` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;
-- @fk receipts.receipts_po_id_fkey
ALTER TABLE `receipts` ADD CONSTRAINT `receipts_po_id_fkey` FOREIGN KEY (`po_id`) REFERENCES `purchase_orders` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;
-- @fk receipts.receipts_received_by_fkey
ALTER TABLE `receipts` ADD CONSTRAINT `receipts_received_by_fkey` FOREIGN KEY (`received_by`) REFERENCES `users` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;
-- @fk receipts.receipts_supplier_id_fkey
ALTER TABLE `receipts` ADD CONSTRAINT `receipts_supplier_id_fkey` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;
-- @fk role_permissions.role_permissions_permission_id_fkey
ALTER TABLE `role_permissions` ADD CONSTRAINT `role_permissions_permission_id_fkey` FOREIGN KEY (`permission_id`) REFERENCES `permissions` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION;
-- @fk role_permissions.role_permissions_role_id_fkey
ALTER TABLE `role_permissions` ADD CONSTRAINT `role_permissions_role_id_fkey` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION;
-- @fk section_attributes.section_attributes_section_id_fkey
ALTER TABLE `section_attributes` ADD CONSTRAINT `section_attributes_section_id_fkey` FOREIGN KEY (`section_id`) REFERENCES `sections` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION;
-- @fk sections.sections_department_id_fkey
ALTER TABLE `sections` ADD CONSTRAINT `sections_department_id_fkey` FOREIGN KEY (`department_id`) REFERENCES `departments` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;
-- @fk sections.sections_sizing_method_id_fkey
ALTER TABLE `sections` ADD CONSTRAINT `sections_sizing_method_id_fkey` FOREIGN KEY (`sizing_method_id`) REFERENCES `size_methods` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;
-- @fk sizes.sizes_size_method_id_fkey
ALTER TABLE `sizes` ADD CONSTRAINT `sizes_size_method_id_fkey` FOREIGN KEY (`size_method_id`) REFERENCES `size_methods` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;
-- @fk supplier_brands.supplier_brands_brand_id_fkey
ALTER TABLE `supplier_brands` ADD CONSTRAINT `supplier_brands_brand_id_fkey` FOREIGN KEY (`brand_id`) REFERENCES `brands` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;
-- @fk supplier_brands.supplier_brands_supplier_id_fkey
ALTER TABLE `supplier_brands` ADD CONSTRAINT `supplier_brands_supplier_id_fkey` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION;
-- @fk supplier_divisions.supplier_divisions_division_id_fkey
ALTER TABLE `supplier_divisions` ADD CONSTRAINT `supplier_divisions_division_id_fkey` FOREIGN KEY (`division_id`) REFERENCES `divisions` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;
-- @fk supplier_divisions.supplier_divisions_supplier_id_fkey
ALTER TABLE `supplier_divisions` ADD CONSTRAINT `supplier_divisions_supplier_id_fkey` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION;
-- @fk user_collections.user_collections_collection_id_fkey
ALTER TABLE `user_collections` ADD CONSTRAINT `user_collections_collection_id_fkey` FOREIGN KEY (`collection_id`) REFERENCES `collections` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION;
-- @fk user_collections.user_collections_user_id_fkey
ALTER TABLE `user_collections` ADD CONSTRAINT `user_collections_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION;
-- @fk user_divisions.user_divisions_division_id_fkey
ALTER TABLE `user_divisions` ADD CONSTRAINT `user_divisions_division_id_fkey` FOREIGN KEY (`division_id`) REFERENCES `divisions` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;
-- @fk user_divisions.user_divisions_user_id_fkey
ALTER TABLE `user_divisions` ADD CONSTRAINT `user_divisions_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION;
-- @fk user_roles.user_roles_role_id_fkey
ALTER TABLE `user_roles` ADD CONSTRAINT `user_roles_role_id_fkey` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;
-- @fk user_roles.user_roles_user_id_fkey
ALTER TABLE `user_roles` ADD CONSTRAINT `user_roles_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION;
-- @fk user_sections.user_sections_section_id_fkey
ALTER TABLE `user_sections` ADD CONSTRAINT `user_sections_section_id_fkey` FOREIGN KEY (`section_id`) REFERENCES `sections` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;
-- @fk user_sections.user_sections_user_id_fkey
ALTER TABLE `user_sections` ADD CONSTRAINT `user_sections_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION;
-- @fk user_sessions.user_sessions_user_id_fkey
ALTER TABLE `user_sessions` ADD CONSTRAINT `user_sessions_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION;
-- @fk videos.videos_uploaded_by_fkey
ALTER TABLE `videos` ADD CONSTRAINT `videos_uploaded_by_fkey` FOREIGN KEY (`uploaded_by`) REFERENCES `users` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

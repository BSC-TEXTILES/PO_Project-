-- ============================================================================
-- 008_lr_tracking_system.sql
-- Complete LR (Lorry Receipt) Tracking, OCR extraction, and Shipment Management
-- ============================================================================

-- 1. Transporter Integrations Catalog
CREATE TABLE IF NOT EXISTS `transporter_integrations` (
  `id` CHAR(36) NOT NULL DEFAULT (UUID()),
  `code` VARCHAR(50) NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `logo_url` TEXT NULL,
  `api_endpoint` VARCHAR(255) NULL,
  `auth_type` ENUM('none', 'api_key', 'oauth', 'basic') NOT NULL DEFAULT 'none',
  `api_key` TEXT NULL,
  `tracking_url_template` VARCHAR(255) NULL,
  `is_active` BOOLEAN NOT NULL DEFAULT TRUE,
  `poll_interval_minutes` INT NOT NULL DEFAULT 60,
  `rate_limit_per_minute` INT NOT NULL DEFAULT 30,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_transporter_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Shipment Store Locations (Belagavi, Davanagere, Shivamogga)
CREATE TABLE IF NOT EXISTS `shipment_locations` (
  `id` CHAR(36) NOT NULL DEFAULT (UUID()),
  `code` VARCHAR(50) NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `city` VARCHAR(100) NOT NULL,
  `state` VARCHAR(100) NOT NULL DEFAULT 'Karnataka',
  `address` TEXT NULL,
  `contact_person` VARCHAR(100) NULL,
  `phone` VARCHAR(50) NULL,
  `is_hub` BOOLEAN NOT NULL DEFAULT FALSE,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_shipment_loc_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Uploaded LR Documents (Camera & Gallery Uploads)
CREATE TABLE IF NOT EXISTS `lr_documents` (
  `id` CHAR(36) NOT NULL DEFAULT (UUID()),
  `file_url` TEXT NOT NULL,
  `original_filename` VARCHAR(255) NOT NULL,
  `mime_type` VARCHAR(100) NOT NULL,
  `file_size` BIGINT NOT NULL,
  `sha256_hash` CHAR(64) NULL,
  `pages_count` INT NOT NULL DEFAULT 1,
  `uploaded_by` CHAR(36) NOT NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_lr_docs_uploaded_by` (`uploaded_by`),
  KEY `idx_lr_docs_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Extracted LR Details (OCR & Document Intelligence)
CREATE TABLE IF NOT EXISTS `lr_extracted_details` (
  `id` CHAR(36) NOT NULL DEFAULT (UUID()),
  `lr_document_id` CHAR(36) NOT NULL,
  `lr_number` VARCHAR(100) NOT NULL,
  `transporter_name` VARCHAR(100) NOT NULL,
  `transporter_code` VARCHAR(50) NOT NULL DEFAULT 'other',
  `consignor_name` VARCHAR(255) NULL,
  `consignee_name` VARCHAR(255) NULL,
  `origin_location` VARCHAR(100) NULL,
  `destination_location` VARCHAR(100) NULL,
  `booking_date` DATE NULL,
  `dispatch_date` DATE NULL,
  `invoice_number` VARCHAR(100) NULL,
  `eway_bill_number` VARCHAR(100) NULL,
  `package_count` INT NULL DEFAULT 1,
  `total_weight_kg` DECIMAL(10,2) NULL,
  `goods_description` TEXT NULL,
  `vehicle_number` VARCHAR(50) NULL,
  `contact_phone` VARCHAR(50) NULL,
  `booking_office` VARCHAR(150) NULL,
  `destination_branch` VARCHAR(150) NULL,
  `raw_ocr_text` LONGTEXT NULL,
  `ocr_confidence` JSON NULL,
  `is_verified` BOOLEAN NOT NULL DEFAULT FALSE,
  `verified_by` CHAR(36) NULL,
  `verified_at` DATETIME(6) NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_lr_extracted_doc` (`lr_document_id`),
  KEY `idx_lr_extracted_num` (`lr_number`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Primary LR Tracking & Shipment Registry
CREATE TABLE IF NOT EXISTS `lr_tracking` (
  `id` CHAR(36) NOT NULL DEFAULT (UUID()),
  `lr_number` VARCHAR(100) NOT NULL,
  `transporter_code` VARCHAR(50) NOT NULL DEFAULT 'vrl',
  `transporter_name` VARCHAR(100) NOT NULL,
  `po_id` CHAR(36) NULL,
  `po_number` VARCHAR(100) NULL,
  `lr_document_id` CHAR(36) NULL,
  `supplier_id` CHAR(36) NULL,
  `supplier_name` VARCHAR(255) NULL,
  `invoice_number` VARCHAR(100) NULL,
  `origin` VARCHAR(100) NOT NULL DEFAULT 'Origin',
  `destination_store` VARCHAR(50) NOT NULL DEFAULT 'BEL',
  `destination_location_id` CHAR(36) NULL,
  `current_status` ENUM('booked', 'dispatched', 'in_transit', 'at_hub', 'out_for_delivery', 'delivered', 'delayed', 'exception', 'cancelled') NOT NULL DEFAULT 'booked',
  `store_received_status` ENUM('pending', 'partially_received', 'received_verified', 'discrepancy') NOT NULL DEFAULT 'pending',
  `current_location` VARCHAR(255) NULL,
  `package_count` INT NULL DEFAULT 1,
  `total_weight_kg` DECIMAL(10,2) NULL,
  `booking_date` DATE NULL,
  `dispatch_date` DATE NULL,
  `expected_delivery_date` DATE NULL,
  `transporter_delivered_at` DATETIME(6) NULL,
  `store_received_at` DATETIME(6) NULL,
  `last_sync_at` DATETIME(6) NULL,
  `sync_status` VARCHAR(50) NOT NULL DEFAULT 'initial',
  `sync_error` TEXT NULL,
  `notes` TEXT NULL,
  `created_by` CHAR(36) NOT NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_transporter_lr` (`transporter_code`, `lr_number`),
  KEY `idx_lr_status` (`current_status`),
  KEY `idx_lr_store_received` (`store_received_status`),
  KEY `idx_lr_dest_store` (`destination_store`),
  KEY `idx_lr_po_id` (`po_id`),
  KEY `idx_lr_booking_date` (`booking_date`),
  KEY `idx_lr_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Detailed Shipment Tracking Milestones & Events Timeline
CREATE TABLE IF NOT EXISTS `lr_tracking_events` (
  `id` CHAR(36) NOT NULL DEFAULT (UUID()),
  `lr_tracking_id` CHAR(36) NOT NULL,
  `event_time` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `status` VARCHAR(50) NOT NULL,
  `location` VARCHAR(255) NULL,
  `remarks` TEXT NULL,
  `source` VARCHAR(50) NOT NULL DEFAULT 'manual_update',
  `created_by` CHAR(36) NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_lr_events_tracking_id` (`lr_tracking_id`, `event_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. Delivery Proofs & Photos (POD)
CREATE TABLE IF NOT EXISTS `shipment_delivery_proofs` (
  `id` CHAR(36) NOT NULL DEFAULT (UUID()),
  `lr_tracking_id` CHAR(36) NOT NULL,
  `proof_type` ENUM('pod_document', 'delivery_photo', 'damaged_goods_photo', 'gate_pass', 'other') NOT NULL DEFAULT 'pod_document',
  `file_url` TEXT NOT NULL,
  `file_name` VARCHAR(255) NOT NULL,
  `file_size` BIGINT NOT NULL DEFAULT 0,
  `mime_type` VARCHAR(100) NOT NULL DEFAULT 'image/jpeg',
  `uploaded_by` CHAR(36) NOT NULL,
  `notes` TEXT NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_delivery_proofs_lr` (`lr_tracking_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 8. Store Goods Receiving & Verification
CREATE TABLE IF NOT EXISTS `shipment_receipts` (
  `id` CHAR(36) NOT NULL DEFAULT (UUID()),
  `lr_tracking_id` CHAR(36) NOT NULL,
  `po_id` CHAR(36) NULL,
  `received_by` CHAR(36) NOT NULL,
  `receiving_employee_name` VARCHAR(255) NOT NULL,
  `received_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `packages_expected` INT NOT NULL DEFAULT 0,
  `packages_received` INT NOT NULL DEFAULT 0,
  `packages_damaged` INT NOT NULL DEFAULT 0,
  `packages_missing` INT NOT NULL DEFAULT 0,
  `condition_status` ENUM('good', 'damaged', 'partial', 'excess') NOT NULL DEFAULT 'good',
  `remarks` TEXT NULL,
  `pod_number` VARCHAR(100) NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_receipts_lr` (`lr_tracking_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 9. Transporter Background Sync Logs
CREATE TABLE IF NOT EXISTS `shipment_sync_logs` (
  `id` CHAR(36) NOT NULL DEFAULT (UUID()),
  `lr_tracking_id` CHAR(36) NOT NULL,
  `transporter_code` VARCHAR(50) NOT NULL,
  `sync_type` ENUM('scheduled', 'manual_refresh', 'webhook', 'on_demand') NOT NULL DEFAULT 'manual_refresh',
  `status` ENUM('success', 'failed', 'rate_limited', 'no_change') NOT NULL,
  `request_payload` JSON NULL,
  `response_payload` JSON NULL,
  `error_message` TEXT NULL,
  `duration_ms` INT NOT NULL DEFAULT 0,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_sync_logs_lr` (`lr_tracking_id`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 10. LR Audit Trail
CREATE TABLE IF NOT EXISTS `lr_audit_logs` (
  `id` CHAR(36) NOT NULL DEFAULT (UUID()),
  `lr_tracking_id` CHAR(36) NULL,
  `action_type` VARCHAR(50) NOT NULL,
  `performed_by` CHAR(36) NOT NULL,
  `details` JSON NULL,
  `ip_address` VARCHAR(50) NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_lr_audit_lr` (`lr_tracking_id`),
  KEY `idx_lr_audit_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add tracking columns to purchase_orders if they don't exist
-- @column purchase_orders.lr_number
ALTER TABLE `purchase_orders` ADD COLUMN `lr_number` VARCHAR(100) NULL;
-- @column purchase_orders.transporter_name
ALTER TABLE `purchase_orders` ADD COLUMN `transporter_name` VARCHAR(100) NULL;
-- @column purchase_orders.transporter_code
ALTER TABLE `purchase_orders` ADD COLUMN `transporter_code` VARCHAR(50) NULL;
-- @column purchase_orders.dispatch_date
ALTER TABLE `purchase_orders` ADD COLUMN `dispatch_date` DATE NULL;
-- @column purchase_orders.shipment_status
ALTER TABLE `purchase_orders` ADD COLUMN `shipment_status` VARCHAR(50) NULL DEFAULT 'pending';

-- Seed default transporter integrations
INSERT INTO `transporter_integrations` (`id`, `code`, `name`, `tracking_url_template`, `is_active`, `poll_interval_minutes`, `rate_limit_per_minute`)
VALUES
  (UUID(), 'vrl', 'VRL Logistics Ltd', 'https://www.vrlgroup.in/track_consignment.aspx?lr={lr_number}', TRUE, 30, 20),
  (UUID(), 'tci', 'TCI Express', 'https://www.tciexpress.in/tracking.aspx?docket={lr_number}', TRUE, 60, 20),
  (UUID(), 'safexpress', 'Safexpress', 'https://www.safexpress.com/track?waybill={lr_number}', TRUE, 60, 20),
  (UUID(), 'delhivery', 'Delhivery Surface', 'https://www.delhivery.com/track/package/{lr_number}', TRUE, 30, 30),
  (UUID(), 'rivigo', 'Rivigo Prime', 'https://www.rivigo.com/track/{lr_number}', TRUE, 60, 20),
  (UUID(), 'other', 'Other Transporter', '', TRUE, 120, 10)
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`), `tracking_url_template` = VALUES(`tracking_url_template`);

-- Seed default BSC Exclusive Store Branches
INSERT INTO `shipment_locations` (`id`, `code`, `name`, `city`, `state`, `address`)
VALUES
  (UUID(), 'BEL', 'BSC Exclusive — Belagavi (BEL)', 'Belagavi', 'Karnataka', 'College Road, Belagavi - 590001'),
  (UUID(), 'DAV', 'BSC Exclusive — Davanagere (DAV)', 'Davanagere', 'Karnataka', 'PB Road, Davanagere - 577002'),
  (UUID(), 'SHI', 'BSC Exclusive — Shivamogga (SHI)', 'Shivamogga', 'Karnataka', 'B.H. Road, Shivamogga - 577201')
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`), `city` = VALUES(`city`);

-- Seed default LR Tracking permissions into permissions catalog
INSERT INTO `permissions` (`code`, `module`, `description`)
VALUES
  ('lr.view', 'lr_tracking', 'View LR tracking dashboard, shipments, and timelines'),
  ('lr.upload', 'lr_tracking', 'Upload LR documents via camera or gallery'),
  ('lr.track', 'lr_tracking', 'Execute live transporter tracking updates'),
  ('lr.receive', 'lr_tracking', 'Confirm goods received and upload POD delivery proofs')
ON DUPLICATE KEY UPDATE `module` = VALUES(`module`), `description` = VALUES(`description`);

-- Assign LR tracking permissions to all existing active roles so every user has access by default
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id
FROM `roles` r
CROSS JOIN `permissions` p
WHERE p.code IN ('lr.view', 'lr.upload', 'lr.track', 'lr.receive')
  AND r.status = 'active';

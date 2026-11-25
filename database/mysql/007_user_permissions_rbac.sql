-- 006_user_permissions_rbac.sql
-- Adds individual user permission overrides (allow/deny), employee_id on users,
-- role status (active/inactive), and ensures complete module-level permissions.
-- Additive and idempotent: preserves all existing users, roles, and permissions.

-- @column users.employee_id
ALTER TABLE `users` ADD COLUMN `employee_id` VARCHAR(64) NULL AFTER `username`;

-- @column roles.status
ALTER TABLE `roles` ADD COLUMN `status` ENUM('active','inactive') NOT NULL DEFAULT 'active';

CREATE TABLE IF NOT EXISTS `user_permissions` (
  `user_id` CHAR(36) NOT NULL,
  `permission_id` CHAR(36) NOT NULL,
  `effect` ENUM('allow','deny') NOT NULL DEFAULT 'allow',
  `updated_by` CHAR(36) NULL,
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`user_id`, `permission_id`),
  KEY `idx_user_permissions_perm` (`permission_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- @fk user_permissions.user_permissions_user_id_fkey
ALTER TABLE `user_permissions` ADD CONSTRAINT `user_permissions_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- @fk user_permissions.user_permissions_permission_id_fkey
ALTER TABLE `user_permissions` ADD CONSTRAINT `user_permissions_permission_id_fkey` FOREIGN KEY (`permission_id`) REFERENCES `permissions` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- Ensure comprehensive module-level permissions exist (non-destructive)
INSERT IGNORE INTO `permissions` (`id`, `code`, `module`, `description`) VALUES
  (UUID(), 'products.delete', 'product', 'Delete or archive products'),
  (UUID(), 'brands.delete', 'brand', 'Delete or archive brands'),
  (UUID(), 'categories.delete', 'category', 'Delete or archive categories'),
  (UUID(), 'po.delete', 'po', 'Delete draft purchase orders'),
  (UUID(), 'po.approve', 'po', 'Approve purchase orders'),
  (UUID(), 'po.reject', 'po', 'Reject purchase orders'),
  (UUID(), 'po.download', 'po', 'Download / export purchase orders'),
  (UUID(), 'reports.download', 'report', 'Download reports'),
  (UUID(), 'calendar.manage', 'calendar', 'Manage PO calendar events'),
  (UUID(), 'settings.view', 'settings', 'View system settings'),
  (UUID(), 'audit.export', 'audit', 'Export audit trail logs'),
  (UUID(), 'users.view', 'user', 'View user directory'),
  (UUID(), 'roles.manage', 'user', 'Create, edit, and assign roles & permissions'),
  (UUID(), 'collections.men', 'collection', 'Access Men''s Collection'),
  (UUID(), 'collections.women', 'collection', 'Access Women''s Collection'),
  (UUID(), 'collections.kids', 'collection', 'Access Kids Collection'),
  (UUID(), 'collections.home', 'collection', 'Access Home & Furnishing Collection');

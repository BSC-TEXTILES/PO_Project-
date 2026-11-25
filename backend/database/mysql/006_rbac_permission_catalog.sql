-- ============================================================================
-- 006 — RBAC permission catalogue + role grants
--
-- The frontend route guards and several backend endpoints reference permission
-- codes (catalogue.view, products.view, collections.manage, …) that were not
-- part of the original seed. As a result every non-super-admin account could
-- authenticate but was refused access to most pages.
--
-- This migration is additive and idempotent: it only inserts missing permission
-- codes and missing role grants. Existing grants and all business data are
-- preserved.
-- ============================================================================

INSERT INTO `permissions` (`code`, `module`, `description`) VALUES
  ('dashboard.view', 'dashboard', 'View the operational dashboard'),
  ('catalogue.view', 'catalogue', 'Browse the product catalogue'),
  ('products.view', 'product', 'View products'),
  ('products.create', 'product', 'Create products/SKUs'),
  ('products.edit', 'product', 'Edit products/SKUs'),
  ('brands.view', 'brand', 'View brands'),
  ('brands.manage', 'brand', 'Create/edit brands'),
  ('categories.view', 'category', 'View categories'),
  ('categories.manage', 'category', 'Create/edit categories'),
  ('product_types.view', 'product_type', 'View product types'),
  ('product_types.manage', 'product_type', 'Create/edit product types'),
  ('colors.view', 'colour', 'View colours'),
  ('colors.manage', 'colour', 'Create/edit colours'),
  ('sizes.view', 'size', 'View sizes and size methods'),
  ('sizes.manage', 'size', 'Create/edit sizes and size methods'),
  ('manufacturers.view', 'manufacturer', 'View manufacturers'),
  ('manufacturers.manage', 'manufacturer', 'Create/edit manufacturers'),
  ('locations.view', 'location', 'View locations and warehouses'),
  ('locations.manage', 'location', 'Create/edit locations and warehouses'),
  ('orders.manage', 'location', 'Manage order-related location settings'),
  ('collections.view', 'collection', 'View collections'),
  ('collections.manage', 'collection', 'Create/edit collections and brand links'),
  ('dealers.view', 'dealer', 'View dealers'),
  ('dealers.manage', 'dealer', 'Create/edit dealers'),
  ('company.view', 'company', 'View company settings'),
  ('company.manage', 'company', 'Edit company settings'),
  ('attachments.view', 'attachment', 'View attachments'),
  ('attachments.manage', 'attachment', 'Upload/manage attachments'),
  ('pricing.view', 'pricing', 'View price lists'),
  ('pricing.manage', 'pricing', 'Manage price lists'),
  ('calendar.view', 'calendar', 'View the PO calendar'),
  ('chat.view', 'chat', 'Use team chat'),
  ('videos.view', 'video', 'View training videos'),
  ('videos.manage', 'video', 'Manage training videos'),
  ('auctions.view', 'auction', 'View auctions'),
  ('import.manage', 'import', 'Import product/master data'),
  ('reports.export', 'report', 'Export reports and data extracts')
ON DUPLICATE KEY UPDATE `code` = `code`;

-- Super Admin: every permission in the catalogue.
INSERT INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id FROM `roles` r CROSS JOIN `permissions` p
 WHERE r.code = 'super_admin'
ON DUPLICATE KEY UPDATE `role_id` = `role_id`;

-- Domain Admin: full operational management inside its divisions.
INSERT INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id FROM `roles` r JOIN `permissions` p
 WHERE r.code = 'domain_admin' AND p.code IN (
  'masters.view', 'dashboard.view', 'catalogue.view', 'products.view', 'brands.view',
  'categories.view', 'product_types.view', 'colors.view', 'sizes.view',
  'manufacturers.view', 'locations.view', 'collections.view', 'dealers.view',
  'company.view', 'attachments.view', 'pricing.view', 'calendar.view', 'chat.view',
  'videos.view', 'auctions.view', 'inventory.view', 'reports.view', 'po.view',
  'masters.manage', 'products.create', 'products.edit', 'brands.manage',
  'categories.manage', 'product_types.manage', 'colors.manage', 'sizes.manage',
  'manufacturers.manage', 'locations.manage', 'orders.manage', 'collections.manage',
  'dealers.manage', 'company.manage', 'attachments.manage', 'pricing.manage',
  'videos.manage', 'import.manage', 'reports.export',
  'po.create', 'po.edit', 'po.submit', 'po.amend', 'po.issue', 'po.close',
  'po.commercial.override', 'approvals.view', 'approvals.act',
  'receipt.view', 'receipt.create', 'audit.view')
ON DUPLICATE KEY UPDATE `role_id` = `role_id`;

-- Purchase Manager: procurement actions + read-only master data.
INSERT INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id FROM `roles` r JOIN `permissions` p
 WHERE r.code = 'purchase_manager' AND p.code IN (
  'masters.view', 'dashboard.view', 'catalogue.view', 'products.view', 'brands.view',
  'categories.view', 'product_types.view', 'colors.view', 'sizes.view',
  'manufacturers.view', 'locations.view', 'collections.view', 'dealers.view',
  'company.view', 'attachments.view', 'pricing.view', 'calendar.view', 'chat.view',
  'videos.view', 'auctions.view', 'inventory.view', 'reports.view', 'po.view',
  'products.create', 'products.edit', 'reports.export',
  'po.create', 'po.edit', 'po.submit', 'po.amend', 'po.issue', 'po.close',
  'po.commercial.override', 'approvals.view', 'approvals.act')
ON DUPLICATE KEY UPDATE `role_id` = `role_id`;

-- Purchase Executive: draft POs and add new SKUs; no master-data management.
INSERT INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id FROM `roles` r JOIN `permissions` p
 WHERE r.code = 'purchase_executive' AND p.code IN (
  'masters.view', 'dashboard.view', 'catalogue.view', 'products.view', 'brands.view',
  'categories.view', 'product_types.view', 'colors.view', 'sizes.view',
  'manufacturers.view', 'locations.view', 'collections.view', 'dealers.view',
  'company.view', 'attachments.view', 'pricing.view', 'calendar.view', 'chat.view',
  'videos.view', 'auctions.view', 'inventory.view', 'reports.view', 'po.view',
  'products.create', 'po.create', 'po.edit', 'po.submit')
ON DUPLICATE KEY UPDATE `role_id` = `role_id`;

-- Approver: read-only browsing + approval queue actions.
INSERT INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id FROM `roles` r JOIN `permissions` p
 WHERE r.code = 'approver' AND p.code IN (
  'masters.view', 'dashboard.view', 'catalogue.view', 'products.view', 'brands.view',
  'categories.view', 'product_types.view', 'colors.view', 'sizes.view',
  'manufacturers.view', 'locations.view', 'collections.view', 'dealers.view',
  'company.view', 'attachments.view', 'pricing.view', 'calendar.view', 'chat.view',
  'videos.view', 'auctions.view', 'inventory.view', 'reports.view', 'po.view',
  'approvals.view', 'approvals.act')
ON DUPLICATE KEY UPDATE `role_id` = `role_id`;

-- Receiving User: read-only browsing + receipts/inventory.
INSERT INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id FROM `roles` r JOIN `permissions` p
 WHERE r.code = 'receiving_user' AND p.code IN (
  'masters.view', 'dashboard.view', 'catalogue.view', 'products.view', 'brands.view',
  'categories.view', 'product_types.view', 'colors.view', 'sizes.view',
  'manufacturers.view', 'locations.view', 'collections.view', 'dealers.view',
  'company.view', 'attachments.view', 'pricing.view', 'calendar.view', 'chat.view',
  'videos.view', 'auctions.view', 'inventory.view', 'reports.view', 'po.view',
  'receipt.view', 'receipt.create')
ON DUPLICATE KEY UPDATE `role_id` = `role_id`;

-- Viewer: strictly read-only across operational screens.
INSERT INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id FROM `roles` r JOIN `permissions` p
 WHERE r.code = 'viewer' AND p.code IN (
  'masters.view', 'dashboard.view', 'catalogue.view', 'products.view', 'brands.view',
  'categories.view', 'product_types.view', 'colors.view', 'sizes.view',
  'manufacturers.view', 'locations.view', 'collections.view', 'dealers.view',
  'company.view', 'attachments.view', 'pricing.view', 'calendar.view', 'chat.view',
  'videos.view', 'auctions.view', 'inventory.view', 'reports.view', 'po.view')
ON DUPLICATE KEY UPDATE `role_id` = `role_id`;

-- Division Supervisor: read-only, section scope enforced by the API.
INSERT INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id FROM `roles` r JOIN `permissions` p
 WHERE r.code = 'division_supervisor' AND p.code IN (
  'masters.view', 'dashboard.view', 'catalogue.view', 'products.view', 'brands.view',
  'categories.view', 'product_types.view', 'colors.view', 'sizes.view',
  'manufacturers.view', 'locations.view', 'collections.view', 'dealers.view',
  'company.view', 'attachments.view', 'pricing.view', 'calendar.view', 'chat.view',
  'videos.view', 'auctions.view', 'inventory.view', 'reports.view', 'po.view')
ON DUPLICATE KEY UPDATE `role_id` = `role_id`;

-- Auditor: read-only browsing + the immutable audit trail.
INSERT INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id FROM `roles` r JOIN `permissions` p
 WHERE r.code = 'auditor' AND p.code IN (
  'masters.view', 'dashboard.view', 'catalogue.view', 'products.view', 'brands.view',
  'categories.view', 'product_types.view', 'colors.view', 'sizes.view',
  'manufacturers.view', 'locations.view', 'collections.view', 'dealers.view',
  'company.view', 'attachments.view', 'pricing.view', 'calendar.view', 'chat.view',
  'videos.view', 'auctions.view', 'inventory.view', 'reports.view', 'po.view',
  'audit.view')
ON DUPLICATE KEY UPDATE `role_id` = `role_id`;

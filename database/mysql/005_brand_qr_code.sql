-- ============================================================================
-- 005 — brands.qr_code: the brand QR (PNG data URL) written by brand creation
-- (routes/masters.js, routes/purchaseOrders.js) was missing from the legacy schema,
-- so creating a brand failed. Additive only.
-- ============================================================================

-- @column brands.qr_code
ALTER TABLE `brands` ADD COLUMN `qr_code` MEDIUMTEXT NULL AFTER `image_url`;

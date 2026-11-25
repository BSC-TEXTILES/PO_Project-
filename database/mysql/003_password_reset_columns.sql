-- ============================================================================
-- 003 — columns used by the forgot-password flow (routes/auth.js) that were
-- missing from the legacy schema: the reset OTP and its expiry.
-- Additive only; idempotent via the runner's @column guard.
-- ============================================================================

-- @column users.reset_otp
ALTER TABLE `users` ADD COLUMN `reset_otp` VARCHAR(10) NULL AFTER `reset_otp_phone`;

-- @column users.reset_otp_expires_at
ALTER TABLE `users` ADD COLUMN `reset_otp_expires_at` DATETIME(6) NULL AFTER `reset_otp`;

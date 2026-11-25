-- ============================================================================
-- 002 — audit_logs is append-only (replaces PostgreSQL trigger forbid_audit_mutation)
-- @optional  (needs TRIGGER privilege; skipped with a warning if unavailable)
--
-- Requires the TRIGGER privilege. When binary logging is on (the MySQL 8 default)
-- and the migrating account lacks SUPER, the server also needs
--   SET GLOBAL log_bin_trust_function_creators = 1;
-- The runner reports a clear error if the triggers cannot be created; the
-- application never issues UPDATE/DELETE on audit_logs either way.
-- ============================================================================

DROP TRIGGER IF EXISTS `trg_audit_logs_no_update`;
DROP TRIGGER IF EXISTS `trg_audit_logs_no_delete`;

CREATE TRIGGER `trg_audit_logs_no_update` BEFORE UPDATE ON `audit_logs`
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'audit_logs is append-only';

CREATE TRIGGER `trg_audit_logs_no_delete` BEFORE DELETE ON `audit_logs`
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'audit_logs is append-only';

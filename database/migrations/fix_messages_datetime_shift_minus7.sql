-- Hotfix migration: If `messages` DATETIME columns were shifted +7 hours during TIMESTAMP->DATETIME conversion,
-- shift them back -7 hours to match the original WIB wall-clock values.
--
-- This is safe to run only when you observe data like:
-- - expected: 2026-01-13 00:26:44
-- - actual:   2026-01-13 07:26:44
--
USE wa_manager;

UPDATE messages
SET
  created_at = CASE WHEN created_at IS NOT NULL THEN DATE_SUB(created_at, INTERVAL 7 HOUR) ELSE NULL END,
  updated_at = CASE WHEN updated_at IS NOT NULL THEN DATE_SUB(updated_at, INTERVAL 7 HOUR) ELSE NULL END,
  webhook_sent_at = CASE WHEN webhook_sent_at IS NOT NULL THEN DATE_SUB(webhook_sent_at, INTERVAL 7 HOUR) ELSE NULL END,
  deleted_at = CASE WHEN deleted_at IS NOT NULL THEN DATE_SUB(deleted_at, INTERVAL 7 HOUR) ELSE NULL END,
  retracted_at = CASE WHEN retracted_at IS NOT NULL THEN DATE_SUB(retracted_at, INTERVAL 7 HOUR) ELSE NULL END;


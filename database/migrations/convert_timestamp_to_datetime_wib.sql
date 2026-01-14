-- Migration: Convert TIMESTAMP columns to DATETIME (preserve WIB display)
-- Why:
-- - TIMESTAMP is timezone-aware in MySQL (converted on read/write based on session time_zone)
-- - This caused UTC/WIB shifts and inconsistent statistics.
-- - DATETIME stores the literal date+time (no timezone conversion), which matches the business rule:
--   "values stored in DB are already WIB".
--
-- IMPORTANT:
-- - We set session time_zone to +07:00 BEFORE altering, so existing TIMESTAMP values are converted to
--   the SAME WIB wall-clock time when stored as DATETIME.
--
USE wa_manager;
SET time_zone = '+07:00';

-- messages
ALTER TABLE messages
  MODIFY created_at     DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
  MODIFY updated_at     DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  MODIFY webhook_sent_at DATETIME NULL DEFAULT NULL,
  MODIFY deleted_at     DATETIME NULL DEFAULT NULL,
  MODIFY retracted_at   DATETIME NULL DEFAULT NULL;

-- contacts
ALTER TABLE contacts
  MODIFY created_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
  MODIFY updated_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

-- sessions
ALTER TABLE sessions
  MODIFY created_at     DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
  MODIFY updated_at     DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  MODIFY connected_at   DATETIME NULL DEFAULT NULL,
  MODIFY last_activity  DATETIME NULL DEFAULT NULL,
  MODIFY qr_expires_at  DATETIME NULL DEFAULT NULL;

-- users
ALTER TABLE users
  MODIFY created_at        DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
  MODIFY updated_at        DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  MODIFY last_otp_sent_at  DATETIME NULL DEFAULT NULL,
  MODIFY otp_expires_at    DATETIME NULL DEFAULT NULL;

-- otp_requests
ALTER TABLE otp_requests
  MODIFY created_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
  MODIFY expires_at DATETIME NOT NULL,
  MODIFY used_at    DATETIME NULL DEFAULT NULL;

-- statistics_settings
ALTER TABLE statistics_settings
  MODIFY created_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
  MODIFY updated_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

-- webhooks
ALTER TABLE webhooks
  MODIFY created_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
  MODIFY updated_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

-- skip_messages
ALTER TABLE skip_messages
  MODIFY created_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
  MODIFY updated_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

-- message_reactions / message_replies / message_status_history
ALTER TABLE message_reactions
  MODIFY created_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE message_replies
  MODIFY created_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE message_status_history
  MODIFY changed_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP;

-- logs
ALTER TABLE response_time_log
  MODIFY created_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE deleted_messages_log
  MODIFY deleted_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP;

-- attachments
ALTER TABLE attachments
  MODIFY created_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP;

-- broadcast tables
ALTER TABLE broadcast_lists
  MODIFY created_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
  MODIFY updated_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

ALTER TABLE broadcast_messages
  MODIFY created_at   DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
  MODIFY completed_at DATETIME NULL DEFAULT NULL;

ALTER TABLE broadcast_recipients
  MODIFY created_at    DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
  MODIFY sent_at       DATETIME NULL DEFAULT NULL,
  MODIFY delivered_at  DATETIME NULL DEFAULT NULL,
  MODIFY read_at       DATETIME NULL DEFAULT NULL;


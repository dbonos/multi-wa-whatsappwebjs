-- Migration: add attachment_url column to messages
-- This stores a public URL for attachments so clients/webhooks can access files directly.
USE wa_manager;

-- MySQL version-safe add (works without ADD COLUMN IF NOT EXISTS)
SET @tablename = 'messages';
SET @columnname = 'attachment_url';
SET @addcol = (
  SELECT IF(
    EXISTS(
      SELECT 1
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = @tablename
        AND COLUMN_NAME = @columnname
    ),
    'SELECT 1',
    CONCAT('ALTER TABLE ', @tablename, ' ADD COLUMN ', @columnname, ' VARCHAR(1024) NULL AFTER attachment_path')
  )
);
PREPARE stmt FROM @addcol;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;


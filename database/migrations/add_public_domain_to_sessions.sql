-- Migration: add public_domain column to sessions
-- This stores the admin-configured domain used for public attachment URLs.
USE wa_manager;

-- MySQL version-safe add (works without ADD COLUMN IF NOT EXISTS)
SET @tablename = 'sessions';
SET @columnname = 'public_domain';
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
    CONCAT('ALTER TABLE ', @tablename, ' ADD COLUMN ', @columnname, ' VARCHAR(255) NULL AFTER display_name')
  )
);
PREPARE stmt FROM @addcol;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;


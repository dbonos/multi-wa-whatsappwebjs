-- Migration: add attachment_url column to messages
-- This stores a public URL for attachments so clients/webhooks can access files directly.
USE wa_manager;

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS attachment_url VARCHAR(1024) NULL AFTER attachment_path;


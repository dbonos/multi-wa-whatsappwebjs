-- Add is_deleted and is_retracted columns to messages table
-- Migration: Add deleted/retracted message tracking

USE wa_manager;

ALTER TABLE messages 
ADD COLUMN is_deleted BOOLEAN DEFAULT FALSE AFTER status,
ADD COLUMN is_retracted BOOLEAN DEFAULT FALSE AFTER is_deleted,
ADD COLUMN deleted_at TIMESTAMP NULL AFTER is_retracted,
ADD COLUMN retracted_at TIMESTAMP NULL AFTER deleted_at,
ADD COLUMN reply_to_message_id VARCHAR(255) NULL AFTER retracted_at;

-- Add indexes for better query performance
ALTER TABLE messages 
ADD INDEX idx_is_deleted (is_deleted),
ADD INDEX idx_is_retracted (is_retracted),
ADD INDEX idx_reply_to_message_id (reply_to_message_id);


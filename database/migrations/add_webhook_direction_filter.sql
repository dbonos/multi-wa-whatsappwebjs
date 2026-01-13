-- Add direction_filter column to webhooks table
USE wa_manager;

ALTER TABLE webhooks 
ADD COLUMN direction_filter ENUM('incoming', 'outgoing', 'both') DEFAULT 'both' 
COMMENT 'Filter messages by direction: incoming only, outgoing only, or both' 
AFTER events;


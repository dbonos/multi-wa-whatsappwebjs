-- Migration: Delete messages with message_id containing "status@broadcast"
-- These are status messages that should not be stored in the database

USE wa_manager;

-- Check count before deletion
SELECT COUNT(*) as count_before FROM messages WHERE message_id LIKE '%status@broadcast%';

-- Delete messages with status@broadcast in message_id
DELETE FROM messages WHERE message_id LIKE '%status@broadcast%';

-- Verify deletion
SELECT COUNT(*) as count_after FROM messages WHERE message_id LIKE '%status@broadcast%';


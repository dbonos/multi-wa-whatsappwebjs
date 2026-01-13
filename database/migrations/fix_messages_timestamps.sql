-- Migration: Fix messages table timestamps
-- This fixes created_at, updated_at, and webhook_sent_at timestamps

USE wa_manager;

-- 1. Fix records with id 1-1101: Add 7 hours to webhook_sent_at, created_at, updated_at
UPDATE messages 
SET 
    webhook_sent_at = CASE 
        WHEN webhook_sent_at IS NOT NULL THEN DATE_ADD(webhook_sent_at, INTERVAL 7 HOUR)
        ELSE NULL
    END,
    created_at = DATE_ADD(created_at, INTERVAL 7 HOUR),
    updated_at = DATE_ADD(updated_at, INTERVAL 7 HOUR)
WHERE id BETWEEN 1 AND 1101;

-- 2. Fix records with id >= 1102
-- 2a. If webhook_sent_at is not null: sync created_at and updated_at hours/minutes with webhook_sent_at
UPDATE messages 
SET 
    created_at = CASE 
        WHEN webhook_sent_at IS NOT NULL AND TIME(created_at) != TIME(webhook_sent_at) THEN
            CONCAT(DATE(created_at), ' ', TIME_FORMAT(webhook_sent_at, '%H:%i'), ':', SECOND(created_at))
        ELSE created_at
    END,
    updated_at = CASE 
        WHEN webhook_sent_at IS NOT NULL AND TIME(updated_at) != TIME(webhook_sent_at) THEN
            CONCAT(DATE(updated_at), ' ', TIME_FORMAT(webhook_sent_at, '%H:%i'), ':', SECOND(updated_at))
        ELSE updated_at
    END
WHERE id >= 1102 AND webhook_sent_at IS NOT NULL;

-- 2b. If webhook_sent_at is null: sync created_at and updated_at (use the later time)
-- If created_at jam/menit > updated_at jam/menit, update updated_at jam/menit menjadi created_at
-- If updated_at jam/menit > created_at jam/menit, update created_at jam/menit menjadi updated_at
UPDATE messages 
SET 
    updated_at = CASE 
        WHEN webhook_sent_at IS NULL AND TIME_FORMAT(created_at, '%H:%i') > TIME_FORMAT(updated_at, '%H:%i') THEN
            CONCAT(DATE(updated_at), ' ', TIME_FORMAT(created_at, '%H:%i'), ':', SECOND(updated_at))
        ELSE updated_at
    END,
    created_at = CASE 
        WHEN webhook_sent_at IS NULL AND TIME_FORMAT(updated_at, '%H:%i') > TIME_FORMAT(created_at, '%H:%i') THEN
            CONCAT(DATE(created_at), ' ', TIME_FORMAT(updated_at, '%H:%i'), ':', SECOND(created_at))
        ELSE created_at
    END
WHERE id >= 1102 AND webhook_sent_at IS NULL;


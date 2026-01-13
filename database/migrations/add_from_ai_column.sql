-- Migration: Add fromAI column to messages table
-- This column indicates if message was sent from AI/API (1) or regular user (0)
-- Useful for preventing endless loops in n8n automation

USE wa_manager;

-- Add fromAI column to messages table
ALTER TABLE messages 
ADD COLUMN IF NOT EXISTS fromAI TINYINT(1) DEFAULT 0 COMMENT '1 if sent from AI/API, 0 if regular message' AFTER direction;

-- Add index for faster filtering
ALTER TABLE messages 
ADD INDEX IF NOT EXISTS idx_from_ai (fromAI);

-- Update existing messages to 0 (not from AI)
UPDATE messages SET fromAI = 0 WHERE fromAI IS NULL;


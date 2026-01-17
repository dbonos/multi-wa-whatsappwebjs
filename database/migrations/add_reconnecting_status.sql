-- Add 'reconnecting' status to sessions table
-- This allows restart without destroying auth data

ALTER TABLE sessions 
MODIFY COLUMN status ENUM(
    'initializing',
    'qr_generated',
    'authenticated',
    'reconnecting',
    'ready',
    'disconnected',
    'stopped'
) DEFAULT 'initializing';

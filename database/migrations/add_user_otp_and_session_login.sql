-- Migration: Add OTP and session-based login for users
-- Users can login with session name (phone number) and use OTP or password

USE wa_manager;

-- Add columns to users table for OTP support
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS session_id VARCHAR(100) NULL UNIQUE AFTER username,
ADD COLUMN IF NOT EXISTS phone_number VARCHAR(20) NULL AFTER session_id,
ADD COLUMN IF NOT EXISTS otp_code VARCHAR(6) NULL AFTER password_hash,
ADD COLUMN IF NOT EXISTS otp_expires_at TIMESTAMP NULL AFTER otp_code,
ADD COLUMN IF NOT EXISTS otp_attempts INT DEFAULT 0 AFTER otp_expires_at,
ADD COLUMN IF NOT EXISTS last_otp_sent_at TIMESTAMP NULL AFTER otp_attempts;

-- Add index for session_id lookup (for user login)
ALTER TABLE users ADD INDEX IF NOT EXISTS idx_session_id (session_id);
ALTER TABLE users ADD INDEX IF NOT EXISTS idx_phone_number (phone_number);

-- Update sessions table to link with users
ALTER TABLE sessions 
ADD COLUMN IF NOT EXISTS user_id INT NULL AFTER id,
ADD INDEX IF NOT EXISTS idx_user_id (user_id);

-- Add foreign key constraint
-- Note: Using MODIFY instead of ADD CONSTRAINT to avoid errors if already exists
-- ALTER TABLE sessions ADD CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

-- Create OTP requests log table
CREATE TABLE IF NOT EXISTS otp_requests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    session_id VARCHAR(100) NOT NULL,
    phone_number VARCHAR(20) NOT NULL,
    otp_code VARCHAR(6) NOT NULL,
    ip_address VARCHAR(45),
    user_agent TEXT,
    expires_at TIMESTAMP NOT NULL,
    used BOOLEAN DEFAULT FALSE,
    used_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_session_id (session_id),
    INDEX idx_phone_number (phone_number),
    INDEX idx_otp_code (otp_code),
    INDEX idx_expires_at (expires_at),
    INDEX idx_used (used)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Update existing sessions to have user_id NULL (admin managed)
-- Sessions will be linked to users when user logs in with session name


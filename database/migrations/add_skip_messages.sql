-- Migration: Add skip messages feature
-- This allows skipping saving messages from specific groups or contacts to database

USE wa_manager;

-- Skip messages table (for groups and contacts)
CREATE TABLE IF NOT EXISTS skip_messages (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    session_id VARCHAR(100) NOT NULL,
    type ENUM('group', 'contact') NOT NULL,
    group_id VARCHAR(255) NULL COMMENT 'WhatsApp group ID (for type=group)',
    contact_id VARCHAR(255) NULL COMMENT 'Contact ID or phone number (for type=contact)',
    phone_number VARCHAR(20) NULL COMMENT 'Phone number (for type=contact, for easier lookup)',
    name VARCHAR(255) NULL COMMENT 'Display name for reference',
    description TEXT NULL COMMENT 'Optional description/reason',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    created_by INT NULL COMMENT 'User ID who created this skip rule',
    INDEX idx_session_id (session_id),
    INDEX idx_type (type),
    INDEX idx_group_id (group_id),
    INDEX idx_contact_id (contact_id),
    INDEX idx_phone_number (phone_number),
    INDEX idx_is_active (is_active),
    FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add index for faster lookups
CREATE INDEX idx_skip_lookup ON skip_messages(session_id, type, is_active, group_id, contact_id, phone_number);


-- Migration: Add support for reactions, replies, and deleted/retracted messages
-- Run this migration to add new features

USE wa_manager;

-- Add columns to messages table for deleted/retracted status
ALTER TABLE messages 
ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS is_retracted BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL,
ADD COLUMN IF NOT EXISTS retracted_at TIMESTAMP NULL,
ADD COLUMN IF NOT EXISTS reply_to_message_id VARCHAR(255) NULL,
ADD INDEX idx_is_deleted (is_deleted),
ADD INDEX idx_is_retracted (is_retracted),
ADD INDEX idx_reply_to_message_id (reply_to_message_id);

-- Message reactions table
CREATE TABLE IF NOT EXISTS message_reactions (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    message_id VARCHAR(255) NOT NULL,
    session_id VARCHAR(100) NOT NULL,
    from_number VARCHAR(20) NOT NULL,
    from_contact_id VARCHAR(255),
    reaction_emoji VARCHAR(10) NOT NULL,
    reaction_text VARCHAR(50),
    timestamp BIGINT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY unique_message_reaction (message_id, from_number, reaction_emoji),
    INDEX idx_message_id (message_id),
    INDEX idx_session_id (session_id),
    INDEX idx_from_number (from_number),
    INDEX idx_timestamp (timestamp),
    FOREIGN KEY (message_id) REFERENCES messages(message_id) ON DELETE CASCADE,
    FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Message replies table (for tracking reply relationships)
CREATE TABLE IF NOT EXISTS message_replies (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    message_id VARCHAR(255) NOT NULL UNIQUE,
    reply_to_message_id VARCHAR(255) NOT NULL,
    session_id VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_message_id (message_id),
    INDEX idx_reply_to_message_id (reply_to_message_id),
    INDEX idx_session_id (session_id),
    FOREIGN KEY (message_id) REFERENCES messages(message_id) ON DELETE CASCADE,
    FOREIGN KEY (reply_to_message_id) REFERENCES messages(message_id) ON DELETE CASCADE,
    FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Deleted messages log (for audit trail)
CREATE TABLE IF NOT EXISTS deleted_messages_log (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    message_id VARCHAR(255) NOT NULL,
    session_id VARCHAR(100) NOT NULL,
    from_number VARCHAR(20),
    to_number VARCHAR(20),
    message_type VARCHAR(50),
    body_preview TEXT,
    deleted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deletion_type ENUM('deleted', 'retracted') NOT NULL,
    INDEX idx_message_id (message_id),
    INDEX idx_session_id (session_id),
    INDEX idx_deleted_at (deleted_at),
    INDEX idx_deletion_type (deletion_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;


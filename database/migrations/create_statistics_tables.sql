-- Migration: Create statistics tables for response time tracking
-- This allows tracking response time statistics per period for hotline center evaluation

USE wa_manager;

-- Statistics settings table (per session)
CREATE TABLE IF NOT EXISTS statistics_settings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    session_id VARCHAR(100) NOT NULL,
    is_enabled BOOLEAN DEFAULT FALSE,
    recipient_phone VARCHAR(20) NOT NULL,
    send_time TIME DEFAULT '08:00:00',
    periods JSON NOT NULL COMMENT 'Array of period configs: [{"start": "00:00", "end": "08:00", "label": "Malam"}, ...]',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_session_id (session_id),
    INDEX idx_is_enabled (is_enabled),
    FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE,
    UNIQUE KEY unique_session (session_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Response time log table (for caching and detailed tracking)
CREATE TABLE IF NOT EXISTS response_time_log (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    session_id VARCHAR(100) NOT NULL,
    incoming_message_id VARCHAR(255) NOT NULL,
    outgoing_message_id VARCHAR(255),
    contact_id VARCHAR(255) NOT NULL,
    is_new_customer BOOLEAN DEFAULT FALSE,
    response_time_seconds INT,
    period_index INT NOT NULL COMMENT 'Index dari periods array (0, 1, 2, ...)',
    period_label VARCHAR(50),
    date DATE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_session_date (session_id, date),
    INDEX idx_period (session_id, date, period_index),
    INDEX idx_contact_id (contact_id),
    INDEX idx_incoming_message_id (incoming_message_id),
    FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


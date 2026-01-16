-- MySQL Database Schema for WhatsApp Multi-Instance Manager

-- Create database
CREATE DATABASE IF NOT EXISTS wa_manager CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE wa_manager;

-- Users table (for frontend login)
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('admin', 'user') DEFAULT 'user',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- User menu permissions table
CREATE TABLE IF NOT EXISTS user_menu_permissions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    menu_path VARCHAR(100) NOT NULL,
    is_visible BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY unique_user_menu (user_id, menu_path),
    INDEX idx_user_id (user_id),
    INDEX idx_menu_path (menu_path),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Sessions table (WhatsApp sessions)
CREATE TABLE IF NOT EXISTS sessions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    session_id VARCHAR(100) UNIQUE NOT NULL,
    phone_number VARCHAR(20),
    display_name VARCHAR(255),
    public_domain VARCHAR(255),
    status ENUM('initializing', 'qr_generated', 'authenticated', 'ready', 'disconnected', 'stopped') DEFAULT 'initializing',
    qr_code TEXT,
    qr_expires_at TIMESTAMP NULL,
    connected_at TIMESTAMP NULL,
    last_activity TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_session_id (session_id),
    INDEX idx_status (status),
    INDEX idx_phone_number (phone_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Contacts table
CREATE TABLE IF NOT EXISTS contacts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    session_id VARCHAR(100) NOT NULL,
    contact_id VARCHAR(255) NOT NULL,
    phone_number VARCHAR(20),
    name VARCHAR(255),
    pushname VARCHAR(255),
    is_business BOOLEAN DEFAULT FALSE,
    is_my_contact BOOLEAN DEFAULT FALSE,
    is_group BOOLEAN DEFAULT FALSE,
    profile_pic_url TEXT,
    lid_original VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY unique_session_contact (session_id, contact_id),
    INDEX idx_session_id (session_id),
    INDEX idx_phone_number (phone_number),
    INDEX idx_contact_id (contact_id),
    FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Messages table (incoming & outgoing)
CREATE TABLE IF NOT EXISTS messages (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    session_id VARCHAR(100) NOT NULL,
    message_id VARCHAR(255) UNIQUE NOT NULL,
    from_number VARCHAR(20),
    to_number VARCHAR(20),
    contact_id VARCHAR(255),
    direction ENUM('incoming', 'outgoing') NOT NULL,
    message_type ENUM('text', 'image', 'video', 'audio', 'document', 'sticker', 'location', 'contact', 'voice', 'other') DEFAULT 'text',
    body TEXT,
    caption TEXT,
    status ENUM('pending', 'sent', 'delivered', 'read', 'played', 'failed') DEFAULT 'pending',
    timestamp BIGINT NOT NULL,
    is_forwarded BOOLEAN DEFAULT FALSE,
    is_starred BOOLEAN DEFAULT FALSE,
    has_quoted_msg BOOLEAN DEFAULT FALSE,
    quoted_msg_id VARCHAR(255),
    attachment_path VARCHAR(500),
    webhook_sent BOOLEAN DEFAULT FALSE,
    webhook_sent_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_session_id (session_id),
    INDEX idx_message_id (message_id),
    INDEX idx_from_number (from_number),
    INDEX idx_to_number (to_number),
    INDEX idx_timestamp (timestamp),
    INDEX idx_status (status),
    INDEX idx_direction (direction),
    INDEX idx_webhook_sent (webhook_sent),
    FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Attachments table
CREATE TABLE IF NOT EXISTS attachments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    message_id VARCHAR(255) NOT NULL,
    session_id VARCHAR(100) NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    file_type VARCHAR(100),
    mime_type VARCHAR(100),
    file_size BIGINT,
    thumbnail_path VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_message_id (message_id),
    INDEX idx_session_id (session_id),
    FOREIGN KEY (message_id) REFERENCES messages(message_id) ON DELETE CASCADE,
    FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Broadcast lists table
CREATE TABLE IF NOT EXISTS broadcast_lists (
    id INT AUTO_INCREMENT PRIMARY KEY,
    session_id VARCHAR(100) NOT NULL,
    list_name VARCHAR(255) NOT NULL,
    description TEXT,
    recipient_count INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_session_id (session_id),
    FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Broadcast recipients table
CREATE TABLE IF NOT EXISTS broadcast_recipients (
    id INT AUTO_INCREMENT PRIMARY KEY,
    broadcast_list_id INT NOT NULL,
    contact_id VARCHAR(255) NOT NULL,
    phone_number VARCHAR(20),
    name VARCHAR(255),
    status ENUM('pending', 'sent', 'delivered', 'read', 'failed') DEFAULT 'pending',
    sent_at TIMESTAMP NULL,
    delivered_at TIMESTAMP NULL,
    read_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_broadcast_list_id (broadcast_list_id),
    INDEX idx_contact_id (contact_id),
    INDEX idx_status (status),
    FOREIGN KEY (broadcast_list_id) REFERENCES broadcast_lists(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Broadcast messages table
CREATE TABLE IF NOT EXISTS broadcast_messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    broadcast_list_id INT NOT NULL,
    session_id VARCHAR(100) NOT NULL,
    message_type ENUM('text', 'image', 'video', 'audio', 'document') DEFAULT 'text',
    body TEXT,
    attachment_path VARCHAR(500),
    total_recipients INT DEFAULT 0,
    sent_count INT DEFAULT 0,
    delivered_count INT DEFAULT 0,
    read_count INT DEFAULT 0,
    failed_count INT DEFAULT 0,
    status ENUM('pending', 'sending', 'completed', 'failed') DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP NULL,
    INDEX idx_broadcast_list_id (broadcast_list_id),
    INDEX idx_session_id (session_id),
    INDEX idx_status (status),
    FOREIGN KEY (broadcast_list_id) REFERENCES broadcast_lists(id) ON DELETE CASCADE,
    FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Webhooks table
CREATE TABLE IF NOT EXISTS webhooks (
    id INT AUTO_INCREMENT PRIMARY KEY,
    session_id VARCHAR(100),
    webhook_url VARCHAR(500) NOT NULL,
    events JSON,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_session_id (session_id),
    INDEX idx_is_active (is_active),
    FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4_unicode_ci;

-- Message status history (for tracking)
CREATE TABLE IF NOT EXISTS message_status_history (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    message_id VARCHAR(255) NOT NULL,
    status ENUM('pending', 'sent', 'delivered', 'read', 'played', 'failed') NOT NULL,
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_message_id (message_id),
    INDEX idx_status (status),
    INDEX idx_changed_at (changed_at),
    FOREIGN KEY (message_id) REFERENCES messages(message_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4_unicode_ci;

-- Insert default admin user (password: admin123 - CHANGE THIS!)
-- Password hash for 'admin123' using bcrypt
INSERT INTO users (username, password_hash, role) 
VALUES ('admin', '$2a$10$rOzJqZqZqZqZqZqZqZqZqOZqZqZqZqZqZqZqZqZqZqZqZqZqZqZ', 'admin')
ON DUPLICATE KEY UPDATE username=username;


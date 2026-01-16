-- Migration: Create user_menu_permissions table
-- Allows admin to control which menus are visible for each user/session
USE wa_manager;

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

-- Insert default permissions for existing users (all menus visible by default)
INSERT INTO user_menu_permissions (user_id, menu_path, is_visible)
SELECT id, 'dashboard', TRUE FROM users
ON DUPLICATE KEY UPDATE is_visible = TRUE;

INSERT INTO user_menu_permissions (user_id, menu_path, is_visible)
SELECT id, 'messages', TRUE FROM users
ON DUPLICATE KEY UPDATE is_visible = TRUE;

INSERT INTO user_menu_permissions (user_id, menu_path, is_visible)
SELECT id, 'contacts', TRUE FROM users
ON DUPLICATE KEY UPDATE is_visible = TRUE;

INSERT INTO user_menu_permissions (user_id, menu_path, is_visible)
SELECT id, 'skip-messages', TRUE FROM users
ON DUPLICATE KEY UPDATE is_visible = TRUE;

INSERT INTO user_menu_permissions (user_id, menu_path, is_visible)
SELECT id, 'statistics', TRUE FROM users
ON DUPLICATE KEY UPDATE is_visible = TRUE;

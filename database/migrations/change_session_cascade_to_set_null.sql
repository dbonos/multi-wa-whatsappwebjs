-- Change foreign key constraints from CASCADE to SET NULL
-- This preserves data when a session is deleted

-- First, allow session_id to be NULL (if currently NOT NULL)
ALTER TABLE contacts MODIFY COLUMN session_id VARCHAR(100) NULL;
ALTER TABLE messages MODIFY COLUMN session_id VARCHAR(100) NULL;
ALTER TABLE attachments MODIFY COLUMN session_id VARCHAR(100) NULL;
ALTER TABLE broadcast_lists MODIFY COLUMN session_id VARCHAR(100) NULL;
ALTER TABLE broadcast_messages MODIFY COLUMN session_id VARCHAR(100) NULL;
ALTER TABLE webhooks MODIFY COLUMN session_id VARCHAR(100) NULL;
ALTER TABLE skip_messages MODIFY COLUMN session_id VARCHAR(100) NULL;
ALTER TABLE statistics_settings MODIFY COLUMN session_id VARCHAR(100) NULL;
ALTER TABLE response_time_log MODIFY COLUMN session_id VARCHAR(100) NULL;

-- Drop existing foreign keys
ALTER TABLE contacts DROP FOREIGN KEY contacts_ibfk_1;
ALTER TABLE messages DROP FOREIGN KEY messages_ibfk_1;
ALTER TABLE attachments DROP FOREIGN KEY attachments_ibfk_2;
ALTER TABLE broadcast_lists DROP FOREIGN KEY broadcast_lists_ibfk_1;
ALTER TABLE broadcast_messages DROP FOREIGN KEY broadcast_messages_ibfk_2;
ALTER TABLE webhooks DROP FOREIGN KEY webhooks_ibfk_1;
ALTER TABLE skip_messages DROP FOREIGN KEY skip_messages_ibfk_1;
ALTER TABLE statistics_settings DROP FOREIGN KEY statistics_settings_ibfk_1;
ALTER TABLE response_time_log DROP FOREIGN KEY response_time_log_ibfk_1;

-- Recreate with SET NULL
ALTER TABLE contacts 
    ADD CONSTRAINT contacts_ibfk_1 
    FOREIGN KEY (session_id) REFERENCES sessions(session_id) 
    ON DELETE SET NULL;

ALTER TABLE messages 
    ADD CONSTRAINT messages_ibfk_1 
    FOREIGN KEY (session_id) REFERENCES sessions(session_id) 
    ON DELETE SET NULL;

ALTER TABLE attachments 
    ADD CONSTRAINT attachments_ibfk_2 
    FOREIGN KEY (session_id) REFERENCES sessions(session_id) 
    ON DELETE SET NULL;

ALTER TABLE broadcast_lists 
    ADD CONSTRAINT broadcast_lists_ibfk_1 
    FOREIGN KEY (session_id) REFERENCES sessions(session_id) 
    ON DELETE SET NULL;

ALTER TABLE broadcast_messages 
    ADD CONSTRAINT broadcast_messages_ibfk_2 
    FOREIGN KEY (session_id) REFERENCES sessions(session_id) 
    ON DELETE SET NULL;

ALTER TABLE webhooks 
    ADD CONSTRAINT webhooks_ibfk_1 
    FOREIGN KEY (session_id) REFERENCES sessions(session_id) 
    ON DELETE SET NULL;

ALTER TABLE skip_messages 
    ADD CONSTRAINT skip_messages_ibfk_1 
    FOREIGN KEY (session_id) REFERENCES sessions(session_id) 
    ON DELETE SET NULL;

ALTER TABLE statistics_settings 
    ADD CONSTRAINT statistics_settings_ibfk_1 
    FOREIGN KEY (session_id) REFERENCES sessions(session_id) 
    ON DELETE SET NULL;

ALTER TABLE response_time_log 
    ADD CONSTRAINT response_time_log_ibfk_1 
    FOREIGN KEY (session_id) REFERENCES sessions(session_id) 
    ON DELETE SET NULL;

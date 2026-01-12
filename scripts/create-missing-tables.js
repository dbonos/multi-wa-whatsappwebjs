require('dotenv').config();
const pool = require('../src/config/database');

async function createMissingTables() {
    try {
        console.log('🔍 Checking for missing tables...');
        
        // Check if message_status_history exists
        const [tables] = await pool.execute(`
            SELECT COUNT(*) as count 
            FROM information_schema.tables 
            WHERE table_schema = DATABASE() 
            AND table_name = 'message_status_history'
        `);
        
        if (tables[0].count === 0) {
            console.log('📝 Creating message_status_history table...');
            // First check the message_id column type in messages table
            const [msgCols] = await pool.execute('DESCRIBE messages');
            const msgIdCol = msgCols.find(c => c.Field === 'message_id');
            const msgIdType = msgIdCol ? msgIdCol.Type : 'VARCHAR(255)';
            console.log(`   Found message_id type: ${msgIdType}`);
            
            // Create table without foreign key first (to avoid charset/collation issues)
            await pool.execute(`
                CREATE TABLE IF NOT EXISTS message_status_history (
                    id BIGINT AUTO_INCREMENT PRIMARY KEY,
                    message_id ${msgIdType} NOT NULL,
                    status ENUM('pending', 'sent', 'delivered', 'read', 'played', 'failed') NOT NULL,
                    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_message_id (message_id),
                    INDEX idx_status (status),
                    INDEX idx_changed_at (changed_at)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
            `);
            
            // Try to add foreign key constraint separately (may fail if charset mismatch, but that's OK)
            try {
                await pool.execute(`
                    ALTER TABLE message_status_history 
                    ADD CONSTRAINT fk_message_status_history_message_id 
                    FOREIGN KEY (message_id) REFERENCES messages(message_id) ON DELETE CASCADE
                `);
                console.log('✅ Foreign key constraint added');
            } catch (fkError) {
                console.log('⚠️  Foreign key constraint skipped (may already exist or charset mismatch)');
            }
            console.log('✅ message_status_history table created!');
        } else {
            console.log('✅ message_status_history table already exists');
        }
        
        // Check and create message_reactions table
        const [reactionsCheck] = await pool.execute(`
            SELECT COUNT(*) as count 
            FROM information_schema.tables 
            WHERE table_schema = DATABASE() 
            AND table_name = 'message_reactions'
        `);
        
        if (reactionsCheck[0].count === 0) {
            console.log('📝 Creating message_reactions table...');
            await pool.execute(`
                CREATE TABLE IF NOT EXISTS message_reactions (
                    id BIGINT AUTO_INCREMENT PRIMARY KEY,
                    message_id VARCHAR(255) NOT NULL,
                    from_number VARCHAR(20) NOT NULL,
                    reaction_emoji VARCHAR(10),
                    reaction_text VARCHAR(255),
                    timestamp BIGINT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_message_id (message_id),
                    INDEX idx_from_number (from_number),
                    UNIQUE KEY unique_reaction (message_id, from_number, reaction_emoji)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
            `);
            console.log('✅ message_reactions table created!');
        } else {
            console.log('✅ message_reactions table already exists');
        }
        
        // Check and create message_replies table (if needed)
        const [repliesCheck] = await pool.execute(`
            SELECT COUNT(*) as count 
            FROM information_schema.tables 
            WHERE table_schema = DATABASE() 
            AND table_name = 'message_replies'
        `);
        
        if (repliesCheck[0].count === 0) {
            console.log('📝 Creating message_replies table...');
            await pool.execute(`
                CREATE TABLE IF NOT EXISTS message_replies (
                    id BIGINT AUTO_INCREMENT PRIMARY KEY,
                    message_id VARCHAR(255) NOT NULL,
                    reply_to_message_id VARCHAR(255) NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_message_id (message_id),
                    INDEX idx_reply_to (reply_to_message_id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
            `);
            console.log('✅ message_replies table created!');
        } else {
            console.log('✅ message_replies table already exists');
        }
        
        // Check and create deleted_messages_log table (if needed)
        const [deletedCheck] = await pool.execute(`
            SELECT COUNT(*) as count 
            FROM information_schema.tables 
            WHERE table_schema = DATABASE() 
            AND table_name = 'deleted_messages_log'
        `);
        
        if (deletedCheck[0].count === 0) {
            console.log('📝 Creating deleted_messages_log table...');
            await pool.execute(`
                CREATE TABLE IF NOT EXISTS deleted_messages_log (
                    id BIGINT AUTO_INCREMENT PRIMARY KEY,
                    message_id VARCHAR(255) NOT NULL,
                    session_id VARCHAR(100) NOT NULL,
                    deleted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    deleted_by VARCHAR(20),
                    INDEX idx_message_id (message_id),
                    INDEX idx_session_id (session_id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
            `);
            console.log('✅ deleted_messages_log table created!');
        } else {
            console.log('✅ deleted_messages_log table already exists');
        }
        
        console.log('✅ All checks completed!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

createMissingTables();


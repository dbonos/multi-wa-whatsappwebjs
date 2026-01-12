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
        
        // Check other tables that might be missing
        const requiredTables = [
            'message_reactions',
            'message_replies',
            'deleted_messages_log'
        ];
        
        for (const tableName of requiredTables) {
            const [check] = await pool.execute(`
                SELECT COUNT(*) as count 
                FROM information_schema.tables 
                WHERE table_schema = DATABASE() 
                AND table_name = ?
            `, [tableName]);
            
            if (check[0].count === 0) {
                console.log(`⚠️  Table ${tableName} is missing (optional, will be created if needed)`);
            } else {
                console.log(`✅ Table ${tableName} exists`);
            }
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


#!/usr/bin/env node

/**
 * Script to delete messages with message_id containing "status@broadcast"
 * These are status messages that should not be stored in the database
 */

const pool = require('../src/config/database');

async function deleteStatusBroadcastMessages() {
    try {
        console.log('🔍 Checking for messages with status@broadcast...');
        
        // Check count before deletion
        const [beforeCount] = await pool.execute(
            `SELECT COUNT(*) as count FROM messages WHERE message_id LIKE '%status@broadcast%'`
        );
        
        const countBefore = beforeCount[0]?.count || 0;
        console.log(`📊 Found ${countBefore} messages with status@broadcast`);
        
        if (countBefore === 0) {
            console.log('✅ No messages to delete');
            process.exit(0);
        }
        
        // Delete messages
        console.log('🗑️  Deleting messages...');
        const [result] = await pool.execute(
            `DELETE FROM messages WHERE message_id LIKE '%status@broadcast%'`
        );
        
        console.log(`✅ Deleted ${result.affectedRows} messages`);
        
        // Verify deletion
        const [afterCount] = await pool.execute(
            `SELECT COUNT(*) as count FROM messages WHERE message_id LIKE '%status@broadcast%'`
        );
        
        const countAfter = afterCount[0]?.count || 0;
        console.log(`📊 Remaining messages with status@broadcast: ${countAfter}`);
        
        if (countAfter === 0) {
            console.log('✅ All status@broadcast messages deleted successfully');
        } else {
            console.log(`⚠️  Warning: ${countAfter} messages still remain`);
        }
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Error deleting messages:', error);
        process.exit(1);
    }
}

deleteStatusBroadcastMessages();


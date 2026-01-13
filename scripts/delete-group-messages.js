#!/usr/bin/env node

/**
 * Script to delete messages with message_id containing "@g.us"
 * These are group messages that should not be stored in the database
 */

const pool = require('../src/config/database');

async function deleteGroupMessages() {
    try {
        console.log('🔍 Checking for messages with @g.us in message_id...');
        
        // Check count before deletion
        const [beforeCount] = await pool.execute(
            `SELECT COUNT(*) as count FROM messages WHERE message_id LIKE '%@g.us%'`
        );
        
        const countBefore = beforeCount[0]?.count || 0;
        console.log(`📊 Found ${countBefore} messages with @g.us in message_id`);
        
        if (countBefore === 0) {
            console.log('✅ No messages to delete');
            process.exit(0);
        }
        
        // Show sample messages before deletion
        const [samples] = await pool.execute(
            `SELECT message_id, direction, from_number, to_number, contact_id, created_at 
             FROM messages 
             WHERE message_id LIKE '%@g.us%' 
             LIMIT 5`
        );
        
        if (samples.length > 0) {
            console.log('\n📋 Sample messages to be deleted:');
            samples.forEach((msg, idx) => {
                console.log(`  ${idx + 1}. message_id: ${msg.message_id}`);
                console.log(`     direction: ${msg.direction}, contact_id: ${msg.contact_id}`);
            });
        }
        
        // Ask for confirmation (in production, you might want to add a prompt)
        console.log('\n🗑️  Deleting messages...');
        
        // Delete messages
        const [result] = await pool.execute(
            `DELETE FROM messages WHERE message_id LIKE '%@g.us%'`
        );
        
        console.log(`✅ Deleted ${result.affectedRows} messages`);
        
        // Verify deletion
        const [afterCount] = await pool.execute(
            `SELECT COUNT(*) as count FROM messages WHERE message_id LIKE '%@g.us%'`
        );
        
        const countAfter = afterCount[0]?.count || 0;
        console.log(`📊 Remaining messages with @g.us: ${countAfter}`);
        
        if (countAfter === 0) {
            console.log('✅ All @g.us messages deleted successfully');
        } else {
            console.log(`⚠️  Warning: ${countAfter} messages still remain`);
        }
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Error deleting messages:', error);
        process.exit(1);
    }
}

deleteGroupMessages();


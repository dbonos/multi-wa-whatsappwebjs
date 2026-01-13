#!/usr/bin/env node

/**
 * Script to debug statistics calculation
 * Check new customer vs previous customer classification
 */

const pool = require('../src/config/database');

async function debugStatistics() {
    try {
        // Get today's date in WIB
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const dateStr = today.toISOString().split('T')[0];
        const dateObj = new Date(dateStr + 'T00:00:00+07:00');
        const dateStartWIB = Math.floor(dateObj.getTime() / 1000);
        const dateEndObj = new Date(dateStr + 'T23:59:59+07:00');
        const dateEndWIB = Math.floor(dateEndObj.getTime() / 1000);
        
        console.log('📅 Date:', dateStr);
        console.log('📅 Timestamp range:', dateStartWIB, 'to', dateEndWIB);
        console.log('');
        
        // Get all sessions
        const [sessions] = await pool.execute('SELECT session_id FROM sessions ORDER BY session_id LIMIT 1');
        if (sessions.length === 0) {
            console.log('❌ No sessions found');
            process.exit(1);
        }
        
        const sessionId = sessions[0].session_id;
        console.log('📱 Session ID:', sessionId);
        console.log('');
        
        // Get incoming messages for today
        const [incomingMessages] = await pool.execute(
            `SELECT message_id, contact_id, from_number, timestamp, 
                    FROM_UNIXTIME(timestamp) as time_str
             FROM messages 
             WHERE session_id = ? 
             AND direction = 'incoming'
             AND timestamp >= ? 
             AND timestamp <= ?
             ORDER BY timestamp ASC`,
            [sessionId, dateStartWIB, dateEndWIB]
        );
        
        console.log('📨 Incoming messages today:', incomingMessages.length);
        console.log('');
        
        let newCustomerCount = 0;
        let previousCustomerCount = 0;
        
        // Check each message
        for (const msg of incomingMessages) {
            const [beforeMessages] = await pool.execute(
                `SELECT COUNT(*) as count FROM messages 
                 WHERE session_id = ? 
                 AND contact_id = ? 
                 AND direction = 'incoming'
                 AND timestamp < ?`,
                [sessionId, msg.contact_id, dateStartWIB]
            );
            
            const isNew = beforeMessages[0].count === 0;
            
            if (isNew) {
                newCustomerCount++;
            } else {
                previousCustomerCount++;
            }
            
            console.log(`Message: ${msg.message_id.substring(0, 40)}...`);
            console.log(`  Contact: ${msg.contact_id}`);
            console.log(`  From: ${msg.from_number || 'N/A'}`);
            console.log(`  Time: ${msg.time_str}`);
            console.log(`  Messages before today: ${beforeMessages[0].count}`);
            console.log(`  Is New Customer: ${isNew ? '✅ YES' : '❌ NO'}`);
            console.log('');
        }
        
        console.log('═══════════════════════════════════════');
        console.log('📊 SUMMARY:');
        console.log(`  New Customer: ${newCustomerCount}`);
        console.log(`  Previous Customer: ${previousCustomerCount}`);
        console.log(`  Total: ${incomingMessages.length}`);
        console.log('═══════════════════════════════════════');
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

debugStatistics();


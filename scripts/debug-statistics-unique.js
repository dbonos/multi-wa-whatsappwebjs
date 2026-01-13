#!/usr/bin/env node

/**
 * Script to debug statistics - check unique customers vs total messages
 */

const pool = require('../src/config/database');

async function debugUniqueCustomers() {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const dateStr = today.toISOString().split('T')[0];
        const dateObj = new Date(dateStr + 'T00:00:00+07:00');
        const dateStartWIB = Math.floor(dateObj.getTime() / 1000);
        const dateEndObj = new Date(dateStr + 'T23:59:59+07:00');
        const dateEndWIB = Math.floor(dateEndObj.getTime() / 1000);
        
        const [sessions] = await pool.execute('SELECT session_id FROM sessions ORDER BY session_id LIMIT 1');
        const sessionId = sessions[0].session_id;
        
        // Period S1: 08:00 - 11:59
        const s1Start = new Date(dateStr + 'T08:00:00+07:00');
        const s1End = new Date(dateStr + 'T11:59:59+07:00');
        const s1StartWIB = Math.floor(s1Start.getTime() / 1000);
        const s1EndWIB = Math.floor(s1End.getTime() / 1000);
        
        console.log('📅 Period S1 (08:00 - 11:59)');
        console.log('Timestamp range:', s1StartWIB, 'to', s1EndWIB);
        console.log('');
        
        // Get all incoming messages in S1
        const [messages] = await pool.execute(
            `SELECT message_id, from_number, timestamp, FROM_UNIXTIME(timestamp) as time_str
             FROM messages 
             WHERE session_id = ? 
             AND direction = 'incoming'
             AND from_number IS NOT NULL
             AND timestamp >= ? 
             AND timestamp <= ?
             ORDER BY timestamp ASC`,
            [sessionId, s1StartWIB, s1EndWIB]
        );
        
        console.log('📨 Total incoming messages in S1:', messages.length);
        console.log('');
        
        // Get unique customers (by from_number)
        const uniqueCustomers = new Set();
        messages.forEach(msg => {
            if (msg.from_number) {
                uniqueCustomers.add(msg.from_number);
            }
        });
        
        console.log('👥 Unique customers (by from_number):', uniqueCustomers.size);
        console.log('');
        
        // Check which are new customers
        let newCustomerCount = 0;
        let previousCustomerCount = 0;
        
        for (const fromNumber of uniqueCustomers) {
            const [beforeMessages] = await pool.execute(
                `SELECT COUNT(*) as count FROM messages 
                 WHERE session_id = ? 
                 AND from_number = ? 
                 AND direction = 'incoming'
                 AND timestamp < ?`,
                [sessionId, fromNumber, dateStartWIB]
            );
            
            if (beforeMessages[0].count === 0) {
                newCustomerCount++;
            } else {
                previousCustomerCount++;
            }
        }
        
        console.log('📊 By unique customer:');
        console.log('  New Customer:', newCustomerCount);
        console.log('  Previous Customer:', previousCustomerCount);
        console.log('');
        
        // Count messages per customer
        const customerMessageCount = {};
        messages.forEach(msg => {
            if (msg.from_number) {
                if (!customerMessageCount[msg.from_number]) {
                    customerMessageCount[msg.from_number] = {
                        count: 0,
                        isNew: false
                    };
                }
                customerMessageCount[msg.from_number].count++;
            }
        });
        
        // Check new/previous for each customer
        for (const fromNumber in customerMessageCount) {
            const [beforeMessages] = await pool.execute(
                `SELECT COUNT(*) as count FROM messages 
                 WHERE session_id = ? 
                 AND from_number = ? 
                 AND direction = 'incoming'
                 AND timestamp < ?`,
                [sessionId, fromNumber, dateStartWIB]
            );
            
            customerMessageCount[fromNumber].isNew = beforeMessages[0].count === 0;
        }
        
        let newCustomerMessages = 0;
        let previousCustomerMessages = 0;
        
        for (const fromNumber in customerMessageCount) {
            if (customerMessageCount[fromNumber].isNew) {
                newCustomerMessages += customerMessageCount[fromNumber].count;
            } else {
                previousCustomerMessages += customerMessageCount[fromNumber].count;
            }
        }
        
        console.log('📊 By total messages:');
        console.log('  New Customer messages:', newCustomerMessages);
        console.log('  Previous Customer messages:', previousCustomerMessages);
        console.log('');
        
        console.log('📋 Detail per customer:');
        for (const fromNumber in customerMessageCount) {
            const info = customerMessageCount[fromNumber];
            console.log(`  ${fromNumber}: ${info.count} messages (${info.isNew ? 'NEW' : 'PREVIOUS'})`);
        }
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

debugUniqueCustomers();


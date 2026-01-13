#!/usr/bin/env node

/**
 * Script to verify statistics calculation manually
 * Check S0 and S1 periods in detail
 */

const pool = require('../src/config/database');
const { timestampToWIB } = require('../src/utils/timezone');

async function verifyCalculation() {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const dateStr = today.toISOString().split('T')[0];
        const dateObj = new Date(dateStr + 'T00:00:00+07:00');
        const dateStartWIB = Math.floor(dateObj.getTime() / 1000);
        
        const [sessions] = await pool.execute('SELECT session_id FROM sessions ORDER BY session_id LIMIT 1');
        const sessionId = sessions[0].session_id;
        
        console.log('📱 Session ID:', sessionId);
        console.log('📅 Date:', dateStr);
        console.log('');
        
        // Period S0: 00:00 - 07:59
        const s0Start = new Date(dateStr + 'T00:00:00+07:00');
        const s0End = new Date(dateStr + 'T07:59:59+07:00');
        const s0StartWIB = Math.floor(s0Start.getTime() / 1000);
        const s0EndWIB = Math.floor(s0End.getTime() / 1000);
        
        // Period S1: 08:00 - 11:59
        const s1Start = new Date(dateStr + 'T08:00:00+07:00');
        const s1End = new Date(dateStr + 'T11:59:59+07:00');
        const s1StartWIB = Math.floor(s1Start.getTime() / 1000);
        const s1EndWIB = Math.floor(s1End.getTime() / 1000);
        
        console.log('═══════════════════════════════════════');
        console.log('📊 PERIOD S0 (00:00 - 07:59)');
        console.log('═══════════════════════════════════════');
        console.log('Timestamp range:', s0StartWIB, 'to', s0EndWIB);
        console.log('');
        
        // Get all incoming messages in S0
        const [s0Messages] = await pool.execute(
            `SELECT message_id, from_number, timestamp, FROM_UNIXTIME(timestamp) as time_str
             FROM messages 
             WHERE session_id = ? 
             AND direction = 'incoming'
             AND from_number IS NOT NULL
             AND timestamp >= ? 
             AND timestamp <= ?
             ORDER BY timestamp ASC`,
            [sessionId, s0StartWIB, s0EndWIB]
        );
        
        console.log('📨 Total incoming messages in S0:', s0Messages.length);
        console.log('');
        
        // Group by customer and check new/previous
        const s0Customers = {};
        for (const msg of s0Messages) {
            if (!s0Customers[msg.from_number]) {
                s0Customers[msg.from_number] = {
                    messages: [],
                    isNew: null,
                    hasReply: false,
                    fastestReply: null
                };
            }
            s0Customers[msg.from_number].messages.push(msg);
        }
        
        console.log('👥 Unique customers in S0:', Object.keys(s0Customers).length);
        console.log('');
        
        // Check each customer
        for (const fromNumber in s0Customers) {
            const customer = s0Customers[fromNumber];
            
            // Check if new customer
            const [beforeMessages] = await pool.execute(
                `SELECT COUNT(*) as count FROM messages 
                 WHERE session_id = ? 
                 AND from_number = ? 
                 AND direction = 'incoming'
                 AND timestamp < ?`,
                [sessionId, fromNumber, dateStartWIB]
            );
            
            customer.isNew = beforeMessages[0].count === 0;
            
            // Check for replies
            for (const msg of customer.messages) {
                const [replies] = await pool.execute(
                    `SELECT message_id, timestamp
                    FROM messages 
                    WHERE session_id = ?
                    AND direction = 'outgoing'
                    AND to_number = ?
                    AND timestamp > ?
                    AND timestamp <= ?
                    ORDER BY timestamp ASC
                    LIMIT 1`,
                    [sessionId, fromNumber, msg.timestamp, msg.timestamp + 86400]
                );
                
                if (replies.length > 0) {
                    const responseTime = replies[0].timestamp - msg.timestamp;
                    if (responseTime > 0 && responseTime <= 86400) {
                        customer.hasReply = true;
                        if (!customer.fastestReply || responseTime < customer.fastestReply) {
                            customer.fastestReply = responseTime;
                        }
                    }
                }
            }
            
            console.log(`Customer: ${fromNumber}`);
            console.log(`  Messages: ${customer.messages.length}`);
            console.log(`  Is New: ${customer.isNew ? '✅ YES' : '❌ NO'}`);
            console.log(`  Has Reply: ${customer.hasReply ? '✅ YES' : '❌ NO'}`);
            if (customer.fastestReply) {
                console.log(`  Fastest Reply: ${customer.fastestReply}s (${Math.round(customer.fastestReply/60)} min)`);
            }
            console.log('');
        }
        
        // Count summary
        let s0NewWithReply = 0;
        let s0NewWithoutReply = 0;
        let s0PreviousWithReply = 0;
        let s0PreviousWithoutReply = 0;
        
        for (const fromNumber in s0Customers) {
            const customer = s0Customers[fromNumber];
            if (customer.isNew) {
                if (customer.hasReply) {
                    s0NewWithReply++;
                } else {
                    s0NewWithoutReply++;
                }
            } else {
                if (customer.hasReply) {
                    s0PreviousWithReply++;
                } else {
                    s0PreviousWithoutReply++;
                }
            }
        }
        
        console.log('═══════════════════════════════════════');
        console.log('📊 S0 SUMMARY:');
        console.log(`  New Customer (with reply): ${s0NewWithReply}`);
        console.log(`  New Customer (without reply): ${s0NewWithoutReply}`);
        console.log(`  Previous Customer (with reply): ${s0PreviousWithReply}`);
        console.log(`  Previous Customer (without reply): ${s0PreviousWithoutReply}`);
        console.log(`  Total New Customer: ${s0NewWithReply + s0NewWithoutReply}`);
        console.log(`  Total Previous Customer: ${s0PreviousWithReply + s0PreviousWithoutReply}`);
        console.log('═══════════════════════════════════════');
        console.log('');
        
        // ============================================
        // PERIOD S1
        // ============================================
        
        console.log('═══════════════════════════════════════');
        console.log('📊 PERIOD S1 (08:00 - 11:59)');
        console.log('═══════════════════════════════════════');
        console.log('Timestamp range:', s1StartWIB, 'to', s1EndWIB);
        console.log('');
        
        // Get all incoming messages in S1
        const [s1Messages] = await pool.execute(
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
        
        console.log('📨 Total incoming messages in S1:', s1Messages.length);
        console.log('');
        
        // Group by customer and check new/previous
        const s1Customers = {};
        for (const msg of s1Messages) {
            if (!s1Customers[msg.from_number]) {
                s1Customers[msg.from_number] = {
                    messages: [],
                    isNew: null,
                    hasReply: false,
                    fastestReply: null
                };
            }
            s1Customers[msg.from_number].messages.push(msg);
        }
        
        console.log('👥 Unique customers in S1:', Object.keys(s1Customers).length);
        console.log('');
        
        // Check each customer
        for (const fromNumber in s1Customers) {
            const customer = s1Customers[fromNumber];
            
            // Check if new customer
            const [beforeMessages] = await pool.execute(
                `SELECT COUNT(*) as count FROM messages 
                 WHERE session_id = ? 
                 AND from_number = ? 
                 AND direction = 'incoming'
                 AND timestamp < ?`,
                [sessionId, fromNumber, dateStartWIB]
            );
            
            customer.isNew = beforeMessages[0].count === 0;
            
            // Check for replies
            for (const msg of customer.messages) {
                const [replies] = await pool.execute(
                    `SELECT message_id, timestamp
                    FROM messages 
                    WHERE session_id = ?
                    AND direction = 'outgoing'
                    AND to_number = ?
                    AND timestamp > ?
                    AND timestamp <= ?
                    ORDER BY timestamp ASC
                    LIMIT 1`,
                    [sessionId, fromNumber, msg.timestamp, msg.timestamp + 86400]
                );
                
                if (replies.length > 0) {
                    const responseTime = replies[0].timestamp - msg.timestamp;
                    if (responseTime > 0 && responseTime <= 86400) {
                        customer.hasReply = true;
                        if (!customer.fastestReply || responseTime < customer.fastestReply) {
                            customer.fastestReply = responseTime;
                        }
                    }
                }
            }
            
            console.log(`Customer: ${fromNumber}`);
            console.log(`  Messages: ${customer.messages.length}`);
            console.log(`  Is New: ${customer.isNew ? '✅ YES' : '❌ NO'}`);
            console.log(`  Has Reply: ${customer.hasReply ? '✅ YES' : '❌ NO'}`);
            if (customer.fastestReply) {
                console.log(`  Fastest Reply: ${customer.fastestReply}s (${Math.round(customer.fastestReply/60)} min)`);
            }
            console.log('');
        }
        
        // Count summary
        let s1NewWithReply = 0;
        let s1NewWithoutReply = 0;
        let s1PreviousWithReply = 0;
        let s1PreviousWithoutReply = 0;
        
        for (const fromNumber in s1Customers) {
            const customer = s1Customers[fromNumber];
            if (customer.isNew) {
                if (customer.hasReply) {
                    s1NewWithReply++;
                } else {
                    s1NewWithoutReply++;
                }
            } else {
                if (customer.hasReply) {
                    s1PreviousWithReply++;
                } else {
                    s1PreviousWithoutReply++;
                }
            }
        }
        
        console.log('═══════════════════════════════════════');
        console.log('📊 S1 SUMMARY:');
        console.log(`  New Customer (with reply): ${s1NewWithReply}`);
        console.log(`  New Customer (without reply): ${s1NewWithoutReply}`);
        console.log(`  Previous Customer (with reply): ${s1PreviousWithReply}`);
        console.log(`  Previous Customer (without reply): ${s1PreviousWithoutReply}`);
        console.log(`  Total New Customer: ${s1NewWithReply + s1NewWithoutReply}`);
        console.log(`  Total Previous Customer: ${s1PreviousWithReply + s1PreviousWithoutReply}`);
        console.log('═══════════════════════════════════════');
        console.log('');
        
        console.log('🎯 EXPECTED RESULTS:');
        console.log('  S0: New Customer = 6, Previous Customer = 0');
        console.log('  S1: New Customer = 6, Previous Customer = 0');
        console.log('');
        console.log('📊 ACTUAL RESULTS:');
        console.log(`  S0: New Customer = ${s0NewWithReply + s0NewWithoutReply}, Previous Customer = ${s0PreviousWithReply + s0PreviousWithoutReply}`);
        console.log(`  S1: New Customer = ${s1NewWithReply + s1NewWithoutReply}, Previous Customer = ${s1PreviousWithReply + s1PreviousWithoutReply}`);
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

verifyCalculation();


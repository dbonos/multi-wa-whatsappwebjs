#!/usr/bin/env node

/**
 * Script to debug unreplied customer calculation
 * Shows detailed calculation for new customer and previous customer unreplied counts
 */

const pool = require('../src/config/database');
const statisticsService = require('../src/services/statisticsService');

async function debugUnrepliedCalculation() {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const dateStr = today.toISOString().split('T')[0];
        
        const [sessions] = await pool.execute('SELECT session_id FROM sessions ORDER BY session_id LIMIT 1');
        const sessionId = sessions[0].session_id;
        
        console.log('═══════════════════════════════════════════════════════════════');
        console.log('DEBUG: UNREPLIED CUSTOMER CALCULATION');
        console.log('═══════════════════════════════════════════════════════════════');
        console.log('📅 Date:', dateStr);
        console.log('📱 Session ID:', sessionId);
        console.log('');
        
        // Get periods from settings
        const [settings] = await pool.execute(
            `SELECT periods FROM statistics_settings WHERE session_id = ?`,
            [sessionId]
        );
        
        let periods = statisticsService.getDefaultPeriods();
        if (settings.length > 0 && settings[0].periods) {
            periods = typeof settings[0].periods === 'string' 
                ? JSON.parse(settings[0].periods) 
                : settings[0].periods;
        }
        
        console.log('📊 Periods:', JSON.stringify(periods, null, 2));
        console.log('');
        
        // Convert periods to array format
        const periodsArray = periods.map(p => ({
            start: p.start,
            end: p.end,
            label: p.label
        }));
        
        // Calculate date range
        const dateObj = new Date(dateStr + 'T00:00:00+07:00');
        const dateStartWIB = Math.floor(dateObj.getTime() / 1000);
        const dateEndObj = new Date(dateStr + 'T23:59:59+07:00');
        const dateEndWIB = Math.floor(dateEndObj.getTime() / 1000);
        
        // Get all incoming messages for the date
        const [incomingMessages] = await pool.execute(
            `SELECT message_id, contact_id, timestamp, from_number, to_number
            FROM messages 
            WHERE session_id = ? 
            AND direction = 'incoming'
            AND from_number IS NOT NULL
            AND timestamp >= ? 
            AND timestamp <= ?
            ORDER BY timestamp ASC`,
            [sessionId, dateStartWIB, dateEndWIB]
        );
        
        console.log(`📨 Total incoming messages: ${incomingMessages.length}`);
        console.log('');
        
        // Group by period
        const periodData = {};
        
        for (const msg of incomingMessages) {
            const periodIndex = statisticsService.getPeriodIndex(msg.timestamp, periodsArray);
            
            if (periodIndex === null) {
                console.warn(`⚠️ Message ${msg.message_id} at timestamp ${msg.timestamp} does not fall into any period`);
                continue;
            }
            
            if (!periodData[periodIndex]) {
                periodData[periodIndex] = {
                    period: periodsArray[periodIndex],
                    messages: [],
                    customers: new Set(),
                    newCustomers: new Set(),
                    previousCustomers: new Set(),
                    repliedCustomers: new Set(),
                    unrepliedCustomers: new Set()
                };
            }
            
            periodData[periodIndex].messages.push(msg);
            periodData[periodIndex].customers.add(msg.from_number);
        }
        
        // Process each period
        for (const periodIndex in periodData) {
            const data = periodData[periodIndex];
            const period = data.period;
            
            console.log('═══════════════════════════════════════════════════════════════');
            console.log(`PERIOD ${periodIndex}: ${period.label} (${period.start} - ${period.end})`);
            console.log('═══════════════════════════════════════════════════════════════');
            console.log(`📨 Total messages: ${data.messages.length}`);
            console.log(`👥 Unique customers: ${data.customers.size}`);
            console.log('');
            
            // Track first message per customer per period
            const customerFirstMessage = new Map();
            
            for (const msg of data.messages) {
                const key = `${periodIndex}_${msg.from_number}`;
                if (!customerFirstMessage.has(key)) {
                    customerFirstMessage.set(key, msg.timestamp);
                }
            }
            
            // Check each unique customer
            console.log('📋 DETAILED CUSTOMER ANALYSIS:');
            console.log('');
            
            for (const fromNumber of data.customers) {
                const key = `${periodIndex}_${fromNumber}`;
                const firstMessageTime = customerFirstMessage.get(key);
                
                // Check if new customer
                const isNew = await statisticsService.isNewCustomer(sessionId, fromNumber, dateStr);
                
                if (isNew) {
                    data.newCustomers.add(fromNumber);
                } else {
                    data.previousCustomers.add(fromNumber);
                }
                
                // Find reply
                const [replies] = await pool.execute(
                    `SELECT message_id, timestamp, fromAI, to_number, contact_id, session_id
                    FROM messages 
                    WHERE direction = 'outgoing'
                    AND to_number = ?
                    AND timestamp > ?
                    AND timestamp <= ?
                    ORDER BY timestamp ASC
                    LIMIT 1`,
                    [fromNumber, firstMessageTime, dateEndWIB]
                );
                
                const hasReply = replies.length > 0;
                const responseTime = hasReply ? (replies[0].timestamp - firstMessageTime) : null;
                
                if (hasReply) {
                    data.repliedCustomers.add(fromNumber);
                } else {
                    data.unrepliedCustomers.add(fromNumber);
                }
                
                // Format timestamp for display
                const firstMsgDate = new Date(firstMessageTime * 1000);
                const firstMsgTimeStr = firstMsgDate.toLocaleString('id-ID', { 
                    timeZone: 'Asia/Jakarta',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit'
                });
                
                const replyTimeStr = hasReply 
                    ? new Date(replies[0].timestamp * 1000).toLocaleString('id-ID', { 
                        timeZone: 'Asia/Jakarta',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit'
                    })
                    : 'TIDAK DIBALAS';
                
                const responseTimeStr = hasReply 
                    ? `${Math.floor(responseTime / 60)} menit ${responseTime % 60} detik`
                    : '-';
                
                console.log(`  Customer: ${fromNumber}`);
                console.log(`    Type: ${isNew ? '🆕 NEW' : '💬 PREVIOUS'}`);
                console.log(`    First message: ${firstMsgTimeStr}`);
                console.log(`    Reply: ${replyTimeStr}`);
                console.log(`    Response time: ${responseTimeStr}`);
                console.log(`    Status: ${hasReply ? '✅ DIBALAS' : '❌ TIDAK DIBALAS'}`);
                console.log('');
            }
            
            // Summary
            console.log('📊 SUMMARY:');
            console.log(`  New Customers: ${data.newCustomers.size}`);
            console.log(`    - Dibalas: ${[...data.newCustomers].filter(c => data.repliedCustomers.has(c)).length}`);
            console.log(`    - Tidak dibalas: ${[...data.newCustomers].filter(c => data.unrepliedCustomers.has(c)).length}`);
            console.log(`  Previous Customers: ${data.previousCustomers.size}`);
            console.log(`    - Dibalas: ${[...data.previousCustomers].filter(c => data.repliedCustomers.has(c)).length}`);
            console.log(`    - Tidak dibalas: ${[...data.previousCustomers].filter(c => data.unrepliedCustomers.has(c)).length}`);
            console.log('');
            
            // Verify calculation
            const newReplied = [...data.newCustomers].filter(c => data.repliedCustomers.has(c)).length;
            const newUnreplied = [...data.newCustomers].filter(c => data.unrepliedCustomers.has(c)).length;
            const previousReplied = [...data.previousCustomers].filter(c => data.repliedCustomers.has(c)).length;
            const previousUnreplied = [...data.previousCustomers].filter(c => data.unrepliedCustomers.has(c)).length;
            
            console.log('✅ VERIFICATION:');
            console.log(`  New Customer:`);
            console.log(`    Count: ${data.newCustomers.size} (should be ${newReplied + newUnreplied})`);
            console.log(`    Unreplied: ${newUnreplied}`);
            console.log(`  Previous Customer:`);
            console.log(`    Count: ${data.previousCustomers.size} (should be ${previousReplied + previousUnreplied})`);
            console.log(`    Unreplied: ${previousUnreplied}`);
            console.log('');
            
            // Compare with actual statistics
            const actualStats = await statisticsService.calculateResponseTime(sessionId, dateStr, periodsArray);
            const actualStat = actualStats[parseInt(periodIndex)];
            
            console.log('🔍 COMPARISON WITH ACTUAL STATISTICS:');
            console.log(`  New Customer:`);
            console.log(`    Actual count: ${actualStat.new_customer.count}`);
            console.log(`    Actual unreplied: ${actualStat.new_customer.unreplied_count}`);
            console.log(`    Expected count: ${data.newCustomers.size}`);
            console.log(`    Expected unreplied: ${newUnreplied}`);
            console.log(`    Match: ${actualStat.new_customer.count === data.newCustomers.size && actualStat.new_customer.unreplied_count === newUnreplied ? '✅' : '❌'}`);
            console.log(`  Previous Customer:`);
            console.log(`    Actual count: ${actualStat.previous_customer.count}`);
            console.log(`    Actual unreplied: ${actualStat.previous_customer.unreplied_count}`);
            console.log(`    Expected count: ${data.previousCustomers.size}`);
            console.log(`    Expected unreplied: ${previousUnreplied}`);
            console.log(`    Match: ${actualStat.previous_customer.count === data.previousCustomers.size && actualStat.previous_customer.unreplied_count === previousUnreplied ? '✅' : '❌'}`);
            console.log('');
        }
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error);
        console.error(error.stack);
        process.exit(1);
    }
}

debugUnrepliedCalculation();


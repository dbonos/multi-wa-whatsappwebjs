const pool = require('../src/config/database');
const statisticsService = require('../src/services/statisticsService');

async function testNewPreviousCustomer() {
    try {
        const sessionId = process.argv[2] || '628112298898';
        const dateStr = process.argv[3] || '2025-01-13';
        
        console.log(`\n🧪 [TEST] Testing New/Previous Customer Logic`);
        console.log(`📅 Date: ${dateStr}`);
        console.log(`📱 Session: ${sessionId}\n`);
        
        // Get default periods
        const periods = statisticsService.getDefaultPeriods();
        console.log(`📊 Periods:`, JSON.stringify(periods, null, 2));
        console.log(`\n`);
        
        // Get all incoming messages for the date
        const [incomingMessages] = await pool.execute(
            `SELECT message_id, contact_id, timestamp, from_number, to_number, created_at
            FROM messages 
            WHERE session_id = ? 
            AND direction = 'incoming'
            AND from_number IS NOT NULL
            AND DATE(created_at) = ?
            ORDER BY created_at ASC`,
            [sessionId, dateStr]
        );
        
        console.log(`📨 Total incoming messages: ${incomingMessages.length}\n`);
        
        // Group by period
        const messagesByPeriod = {};
        for (const msg of incomingMessages) {
            if (!msg.created_at) continue;
            
            const periodIndex = statisticsService.getPeriodIndex(msg.created_at, periods);
            if (periodIndex === null) continue;
            
            if (!messagesByPeriod[periodIndex]) {
                messagesByPeriod[periodIndex] = [];
            }
            messagesByPeriod[periodIndex].push(msg);
        }
        
        // Show messages per period
        for (let i = 0; i < periods.length; i++) {
            const periodMsgs = messagesByPeriod[i] || [];
            const uniqueNumbers = new Set(periodMsgs.map(m => m.from_number));
            if (periods[i]) {
                console.log(`\n📊 Period ${i} (${periods[i].label}): ${periodMsgs.length} messages, ${uniqueNumbers.size} unique numbers`);
            }
            console.log(`   Numbers: ${Array.from(uniqueNumbers).join(', ')}`);
        }
        
        // Test new/previous customer logic for each period
        console.log(`\n\n🔍 Testing New/Previous Customer Logic:\n`);
        
        for (let periodIndex = 0; periodIndex < periods.length; periodIndex++) {
            const periodMsgs = messagesByPeriod[periodIndex] || [];
            if (periodMsgs.length === 0) continue;
            
            console.log(`\n📊 Period ${periodIndex} (${periods[periodIndex].label}):`);
            
            const newCustomers = new Set();
            const previousCustomers = new Set();
            
            for (const msg of periodMsgs) {
                if (!msg.created_at || !msg.from_number) continue;
                
                const isNew = await statisticsService.isNewCustomerForPeriod(
                    sessionId,
                    msg.from_number,
                    dateStr,
                    periodIndex,
                    periods,
                    incomingMessages
                );
                
                if (isNew) {
                    newCustomers.add(msg.from_number);
                } else {
                    previousCustomers.add(msg.from_number);
                }
            }
            
            console.log(`   ✅ New Customer: ${newCustomers.size} (${Array.from(newCustomers).join(', ')})`);
            console.log(`   ✅ Previous Customer: ${previousCustomers.size} (${Array.from(previousCustomers).join(', ')})`);
        }
        
        // Compare with actual statistics calculation
        console.log(`\n\n📊 Comparing with calculateResponseTime:\n`);
        const statistics = await statisticsService.calculateResponseTime(sessionId, dateStr, periods);
        
        for (const stat of statistics) {
            console.log(`\n📊 Period ${stat.period_index} (${stat.period_label}):`);
            console.log(`   New Customer: ${stat.new_customer.count}`);
            console.log(`   Previous Customer: ${stat.previous_customer.count}`);
        }
        
        await pool.end();
        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

testNewPreviousCustomer();


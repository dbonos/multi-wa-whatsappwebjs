#!/usr/bin/env node

/**
 * Script to debug new customer calculation
 * Compare our calculation with expected results
 */

const pool = require('../src/config/database');
const statisticsService = require('../src/services/statisticsService');

async function debugNewCustomer() {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const dateStr = today.toISOString().split('T')[0];
        
        const [sessions] = await pool.execute('SELECT session_id FROM sessions ORDER BY session_id LIMIT 1');
        const sessionId = sessions[0].session_id;
        
        console.log('📅 Date:', dateStr);
        console.log('📱 Session ID:', sessionId);
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
        
        const dateStartWIB = Math.floor(new Date(dateStr + 'T00:00:00+07:00').getTime() / 1000);
        
        console.log('═══════════════════════════════════════');
        console.log('PERIOD S0 (00:00 - 07:59)');
        console.log('═══════════════════════════════════════');
        
        // Get unique customers in S0
        const [s0Customers] = await pool.execute(
            `SELECT DISTINCT from_number
             FROM messages 
             WHERE session_id = ? 
             AND direction = 'incoming'
             AND from_number IS NOT NULL
             AND timestamp >= ? 
             AND timestamp <= ?`,
            [sessionId, s0StartWIB, s0EndWIB]
        );
        
        console.log('📨 Unique customers in S0:', s0Customers.length);
        
        let s0New = 0;
        let s0Previous = 0;
        const s0Details = [];
        
        for (const customer of s0Customers) {
            // Check if customer has messages before today (across all sessions)
            const [before] = await pool.execute(
                `SELECT COUNT(*) as count FROM messages 
                 WHERE from_number = ? 
                 AND direction = 'incoming'
                 AND timestamp < ?`,
                [customer.from_number, dateStartWIB]
            );
            
            const isNew = before[0].count === 0;
            s0Details.push({
                from_number: customer.from_number,
                isNew: isNew,
                messagesBeforeToday: before[0].count
            });
            
            if (isNew) {
                s0New++;
            } else {
                s0Previous++;
            }
        }
        
        console.log('  New Customer:', s0New);
        console.log('  Previous Customer:', s0Previous);
        console.log('');
        console.log('📋 Details:');
        s0Details.forEach((detail, idx) => {
            console.log(`  ${idx + 1}. ${detail.from_number}: ${detail.isNew ? 'NEW' : 'PREVIOUS'} (messages before today: ${detail.messagesBeforeToday})`);
        });
        console.log('');
        
        console.log('═══════════════════════════════════════');
        console.log('PERIOD S1 (08:00 - 11:59)');
        console.log('═══════════════════════════════════════');
        
        // Get unique customers in S1
        const [s1Customers] = await pool.execute(
            `SELECT DISTINCT from_number
             FROM messages 
             WHERE session_id = ? 
             AND direction = 'incoming'
             AND from_number IS NOT NULL
             AND timestamp >= ? 
             AND timestamp <= ?`,
            [sessionId, s1StartWIB, s1EndWIB]
        );
        
        console.log('📨 Unique customers in S1:', s1Customers.length);
        
        let s1New = 0;
        let s1Previous = 0;
        const s1Details = [];
        
        for (const customer of s1Customers) {
            // Check if customer has messages before today (across all sessions)
            const [before] = await pool.execute(
                `SELECT COUNT(*) as count FROM messages 
                 WHERE from_number = ? 
                 AND direction = 'incoming'
                 AND timestamp < ?`,
                [customer.from_number, dateStartWIB]
            );
            
            const isNew = before[0].count === 0;
            s1Details.push({
                from_number: customer.from_number,
                isNew: isNew,
                messagesBeforeToday: before[0].count
            });
            
            if (isNew) {
                s1New++;
            } else {
                s1Previous++;
            }
        }
        
        console.log('  New Customer:', s1New);
        console.log('  Previous Customer:', s1Previous);
        console.log('');
        console.log('📋 Details:');
        s1Details.forEach((detail, idx) => {
            console.log(`  ${idx + 1}. ${detail.from_number}: ${detail.isNew ? 'NEW' : 'PREVIOUS'} (messages before today: ${detail.messagesBeforeToday})`);
        });
        console.log('');
        
        // Check if any S1 customers also appear in S0
        const s0Numbers = new Set(s0Customers.map(c => c.from_number));
        const s1Numbers = new Set(s1Customers.map(c => c.from_number));
        const overlap = [...s1Numbers].filter(num => s0Numbers.has(num));
        
        console.log('═══════════════════════════════════════');
        console.log('OVERLAP ANALYSIS');
        console.log('═══════════════════════════════════════');
        console.log('Customers in both S0 and S1:', overlap.length);
        if (overlap.length > 0) {
            overlap.forEach(num => {
                const s0Detail = s0Details.find(d => d.from_number === num);
                const s1Detail = s1Details.find(d => d.from_number === num);
                console.log(`  ${num}: S0=${s0Detail.isNew ? 'NEW' : 'PREVIOUS'}, S1=${s1Detail.isNew ? 'NEW' : 'PREVIOUS'}`);
            });
        }
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

debugNewCustomer();


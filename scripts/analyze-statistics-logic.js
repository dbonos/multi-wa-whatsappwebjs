#!/usr/bin/env node

/**
 * Script to analyze statistics calculation logic
 * Check what the expected behavior should be
 */

const pool = require('../src/config/database');

async function analyzeLogic() {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const dateStr = today.toISOString().split('T')[0];
        
        const [sessions] = await pool.execute('SELECT session_id FROM sessions ORDER BY session_id');
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
        
        console.log('═══════════════════════════════════════');
        console.log('PERIOD S0 (00:00 - 07:59)');
        console.log('═══════════════════════════════════════');
        
        // Get all incoming messages in S0
        const [s0Messages] = await pool.execute(
            `SELECT DISTINCT from_number, COUNT(*) as msg_count
             FROM messages 
             WHERE session_id = ? 
             AND direction = 'incoming'
             AND from_number IS NOT NULL
             AND timestamp >= ? 
             AND timestamp <= ?
             GROUP BY from_number
             ORDER BY from_number`,
            [sessionId, s0StartWIB, s0EndWIB]
        );
        
        console.log('📨 Unique customers in S0:', s0Messages.length);
        
        let s0New = 0;
        let s0Previous = 0;
        
        for (const msg of s0Messages) {
            // Check if customer has messages BEFORE S0 start (before today 00:00)
            const dateStartWIB = Math.floor(new Date(dateStr + 'T00:00:00+07:00').getTime() / 1000);
            const [before] = await pool.execute(
                `SELECT COUNT(*) as count FROM messages 
                 WHERE session_id = ? 
                 AND from_number = ? 
                 AND direction = 'incoming'
                 AND timestamp < ?`,
                [sessionId, msg.from_number, dateStartWIB]
            );
            
            if (before[0].count === 0) {
                s0New++;
            } else {
                s0Previous++;
            }
        }
        
        console.log('  New Customer:', s0New);
        console.log('  Previous Customer:', s0Previous);
        console.log('');
        
        console.log('═══════════════════════════════════════');
        console.log('PERIOD S1 (08:00 - 11:59)');
        console.log('═══════════════════════════════════════');
        
        // Get all incoming messages in S1
        const [s1Messages] = await pool.execute(
            `SELECT DISTINCT from_number, COUNT(*) as msg_count
             FROM messages 
             WHERE session_id = ? 
             AND direction = 'incoming'
             AND from_number IS NOT NULL
             AND timestamp >= ? 
             AND timestamp <= ?
             GROUP BY from_number
             ORDER BY from_number`,
            [sessionId, s1StartWIB, s1EndWIB]
        );
        
        console.log('📨 Unique customers in S1:', s1Messages.length);
        
        let s1New = 0;
        let s1Previous = 0;
        
        for (const msg of s1Messages) {
            // Check if customer has messages BEFORE S1 start (before today 08:00)
            const [before] = await pool.execute(
                `SELECT COUNT(*) as count FROM messages 
                 WHERE session_id = ? 
                 AND from_number = ? 
                 AND direction = 'incoming'
                 AND timestamp < ?`,
                [sessionId, msg.from_number, s1StartWIB]
            );
            
            if (before[0].count === 0) {
                s1New++;
            } else {
                s1Previous++;
            }
        }
        
        console.log('  New Customer:', s1New);
        console.log('  Previous Customer:', s1Previous);
        console.log('');
        
        console.log('═══════════════════════════════════════');
        console.log('CROSS-SESSION REPLY CHECK');
        console.log('═══════════════════════════════════════');
        
        // Check if there are replies from different sessions
        const [crossSessionReplies] = await pool.execute(
            `SELECT 
                i.session_id as incoming_session,
                i.from_number,
                i.message_id as incoming_msg_id,
                i.timestamp as incoming_timestamp,
                o.session_id as outgoing_session,
                o.message_id as outgoing_msg_id,
                o.timestamp as outgoing_timestamp
             FROM messages i
             LEFT JOIN messages o ON (
                 o.direction = 'outgoing'
                 AND o.to_number = i.from_number
                 AND o.timestamp > i.timestamp
                 AND o.timestamp <= i.timestamp + 86400
             )
             WHERE i.session_id = ?
             AND i.direction = 'incoming'
             AND i.from_number IS NOT NULL
             AND i.timestamp >= ?
             AND i.timestamp <= ?
             AND o.message_id IS NOT NULL
             LIMIT 10`,
            [sessionId, s0StartWIB, s1EndWIB]
        );
        
        console.log('📨 Sample cross-session replies:', crossSessionReplies.length);
        crossSessionReplies.forEach((reply, idx) => {
            if (reply.incoming_session !== reply.outgoing_session) {
                console.log(`  ${idx + 1}. Incoming session: ${reply.incoming_session}, Outgoing session: ${reply.outgoing_session}`);
                console.log(`     From: ${reply.from_number}`);
            }
        });
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

analyzeLogic();


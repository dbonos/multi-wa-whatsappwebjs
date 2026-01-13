#!/usr/bin/env node

/**
 * Script to debug statistics calculation per period
 * Check new customer vs previous customer classification per period
 */

const pool = require('../src/config/database');
const statisticsService = require('../src/services/statisticsService');

async function debugStatisticsPeriod() {
    try {
        // Get today's date in WIB
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const dateStr = today.toISOString().split('T')[0];
        
        console.log('📅 Date:', dateStr);
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
        
        // Get periods from settings or use default
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
        
        console.log('⏰ Periods:', JSON.stringify(periods, null, 2));
        console.log('');
        
        // Calculate statistics
        const statistics = await statisticsService.getAllPeriodsStatistics(sessionId, dateStr, periods);
        
        console.log('═══════════════════════════════════════');
        console.log('📊 STATISTICS PER PERIOD:');
        console.log('═══════════════════════════════════════');
        console.log('');
        
        statistics.forEach((stat, index) => {
            console.log(`📅 Period ${index + 1}: ${stat.period_label} (${stat.start_time} - ${stat.end_time})`);
            console.log(`   New Customer:`);
            console.log(`     - Count: ${stat.new_customer.count}`);
            console.log(`     - Avg Response Time: ${stat.new_customer.avg_response_time_seconds}s (${stat.new_customer.avg_response_time_minutes} min)`);
            console.log(`     - Unreplied: ${stat.new_customer.unreplied_count}`);
            console.log(`   Previous Customer:`);
            console.log(`     - Count: ${stat.previous_customer.count}`);
            console.log(`     - Avg Response Time: ${stat.previous_customer.avg_response_time_seconds}s (${stat.previous_customer.avg_response_time_minutes} min)`);
            console.log(`     - Unreplied: ${stat.previous_customer.unreplied_count}`);
            console.log('');
        });
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

debugStatisticsPeriod();


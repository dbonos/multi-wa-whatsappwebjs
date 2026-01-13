const cron = require('node-cron');
const pool = require('../config/database');
const statisticsService = require('./statisticsService');
const { formatWIB } = require('../utils/timezone');

class SchedulerService {
    constructor(clients) {
        this.clients = clients;
        this.job = null;
    }

    /**
     * Start the daily statistics scheduler
     */
    start() {
        // Run at 08:00 WIB every day
        // Cron format: minute hour day month dayOfWeek
        // 08:00 WIB = 01:00 UTC (but we're using WIB timezone, so 08:00 local)
        // Since server is in UTC, we need to adjust: 08:00 WIB = 01:00 UTC
        // But to be safe, let's use the send_time from settings
        
        // For now, schedule at 01:00 UTC (08:00 WIB) as default
        // Individual sessions can have different send_time, but we'll check all at once
        this.job = cron.schedule('0 1 * * *', async () => {
            console.log('📊 [SCHEDULER] Running daily statistics job...');
            await this.sendDailyStatistics();
        }, {
            scheduled: true,
            timezone: 'UTC' // Server timezone
        });

        console.log('✅ [SCHEDULER] Daily statistics scheduler started (runs at 01:00 UTC / 08:00 WIB)');
    }

    /**
     * Stop the scheduler
     */
    stop() {
        if (this.job) {
            this.job.stop();
            console.log('🛑 [SCHEDULER] Daily statistics scheduler stopped');
        }
    }

    /**
     * Send daily statistics for all enabled sessions
     */
    async sendDailyStatistics() {
        try {
            // Get yesterday's date in WIB
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            const yesterdayStr = formatWIB(yesterday, 'YYYY-MM-DD'); // Format as YYYY-MM-DD in WIB

            // Get all enabled settings
            const [settings] = await pool.execute(
                `SELECT * FROM statistics_settings WHERE is_enabled = TRUE`
            );

            console.log(`📊 [SCHEDULER] Found ${settings.length} enabled statistics settings`);

            for (const setting of settings) {
                try {
                    const periods = typeof setting.periods === 'string' 
                        ? JSON.parse(setting.periods) 
                        : setting.periods;

                    // Calculate statistics
                    const statistics = await statisticsService.getAllPeriodsStatistics(
                        setting.session_id,
                        yesterdayStr,
                        periods
                    );

                    // Send via WhatsApp
                    const sent = await statisticsService.sendStatisticsViaWhatsApp(
                        setting.session_id,
                        statistics,
                        setting.recipient_phone,
                        periods,
                        yesterdayStr,
                        this.clients
                    );

                    if (sent) {
                        console.log(`✅ [SCHEDULER] Statistics sent for session ${setting.session_id}`);
                    } else {
                        console.error(`❌ [SCHEDULER] Failed to send statistics for session ${setting.session_id}`);
                    }
                } catch (error) {
                    console.error(`❌ [SCHEDULER] Error processing statistics for session ${setting.session_id}:`, error);
                }
            }
        } catch (error) {
            console.error('❌ [SCHEDULER] Error in daily statistics job:', error);
        }
    }
}

module.exports = SchedulerService;


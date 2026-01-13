const pool = require('../config/database');
const { getWIBTimestamp, convertUTCToWIBTimestamp } = require('../utils/timezone');

class StatisticsService {
    /**
     * Default periods configuration
     */
    getDefaultPeriods() {
        return [
            { start: "00:00", end: "08:00", label: "Malam" },
            { start: "08:00", end: "17:00", label: "Pagi-Siang" },
            { start: "17:00", end: "21:00", label: "Sore" },
            { start: "21:00", end: "23:59", label: "Malam" }
        ];
    }

    /**
     * Validate periods configuration
     * @param {Array} periods - Array of period configs
     * @returns {Object} { valid: boolean, error: string }
     */
    validatePeriods(periods) {
        if (!Array.isArray(periods) || periods.length === 0) {
            return { valid: false, error: 'Periods must be an array with at least 1 period' };
        }

        if (periods.length > 5) {
            return { valid: false, error: 'Maximum 5 periods allowed' };
        }

        // Validate each period
        for (let i = 0; i < periods.length; i++) {
            const period = periods[i];
            
            if (!period.start || !period.end || !period.label) {
                return { valid: false, error: `Period ${i + 1} must have start, end, and label` };
            }

            // Validate time format (HH:mm)
            const timeRegex = /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/;
            if (!timeRegex.test(period.start) || !timeRegex.test(period.end)) {
                return { valid: false, error: `Period ${i + 1} has invalid time format. Use HH:mm format` };
            }

            // Parse times
            const [startHour, startMin] = period.start.split(':').map(Number);
            const [endHour, endMin] = period.end.split(':').map(Number);
            const startMinutes = startHour * 60 + startMin;
            const endMinutes = endHour * 60 + endMin;

            // Check if start < end
            if (startMinutes >= endMinutes) {
                return { valid: false, error: `Period ${i + 1}: start time must be before end time` };
            }
        }

        // Check for overlaps
        const sortedPeriods = [...periods].sort((a, b) => {
            const [aHour, aMin] = a.start.split(':').map(Number);
            const [bHour, bMin] = b.start.split(':').map(Number);
            return (aHour * 60 + aMin) - (bHour * 60 + bMin);
        });

        for (let i = 0; i < sortedPeriods.length - 1; i++) {
            const current = sortedPeriods[i];
            const next = sortedPeriods[i + 1];
            
            const [currentEndHour, currentEndMin] = current.end.split(':').map(Number);
            const [nextStartHour, nextStartMin] = next.start.split(':').map(Number);
            const currentEndMinutes = currentEndHour * 60 + currentEndMin;
            const nextStartMinutes = nextStartHour * 60 + nextStartMin;

            if (currentEndMinutes > nextStartMinutes) {
                return { valid: false, error: `Periods overlap: ${current.label} and ${next.label}` };
            }
        }

        return { valid: true, error: null };
    }

    /**
     * Check if customer is new (no messages before the given date)
     * @param {string} sessionId - Session ID
     * @param {string} contactId - Contact ID
     * @param {Date|string} date - Date to check (YYYY-MM-DD)
     * @returns {Promise<boolean>}
     */
    async isNewCustomer(sessionId, contactId, date) {
        try {
            const dateStr = typeof date === 'string' ? date : date.toISOString().split('T')[0];
            
            const [messages] = await pool.execute(
                `SELECT id FROM messages 
                WHERE session_id = ? 
                AND contact_id = ? 
                AND direction = 'incoming'
                AND DATE(FROM_UNIXTIME(timestamp + 25200)) < ?
                LIMIT 1`,
                [sessionId, contactId, dateStr]
            );

            return messages.length === 0;
        } catch (error) {
            console.error('Error checking new customer:', error);
            return false; // Default to false on error
        }
    }

    /**
     * Get period index for a given timestamp
     * @param {number} timestamp - Unix timestamp (seconds)
     * @param {Array} periods - Periods configuration
     * @returns {number|null} Period index or null if not in any period
     */
    getPeriodIndex(timestamp, periods) {
        const date = new Date(timestamp * 1000);
        const hours = date.getHours();
        const minutes = date.getMinutes();
        const totalMinutes = hours * 60 + minutes;

        for (let i = 0; i < periods.length; i++) {
            const period = periods[i];
            const [startHour, startMin] = period.start.split(':').map(Number);
            const [endHour, endMin] = period.end.split(':').map(Number);
            const startMinutes = startHour * 60 + startMin;
            const endMinutes = endHour * 60 + endMin;

            // Handle period that spans midnight (e.g., 21:00 - 00:00)
            if (endMinutes < startMinutes) {
                if (totalMinutes >= startMinutes || totalMinutes < endMinutes) {
                    return i;
                }
            } else {
                if (totalMinutes >= startMinutes && totalMinutes < endMinutes) {
                    return i;
                }
            }
        }

        return null;
    }

    /**
     * Calculate response time for a date
     * @param {string} sessionId - Session ID
     * @param {Date|string} date - Date to calculate (YYYY-MM-DD)
     * @param {Array} periods - Periods configuration
     * @returns {Promise<Object>} Statistics object
     */
    async calculateResponseTime(sessionId, date, periods) {
        try {
            const dateStr = typeof date === 'string' ? date : date.toISOString().split('T')[0];
            
            // Parse periods if string
            const periodsArray = typeof periods === 'string' ? JSON.parse(periods) : periods;

            // Get all incoming messages for the date
            const [incomingMessages] = await pool.execute(
                `SELECT message_id, contact_id, timestamp, from_number
                FROM messages 
                WHERE session_id = ? 
                AND direction = 'incoming'
                AND DATE(FROM_UNIXTIME(timestamp + 25200)) = ?
                ORDER BY timestamp ASC`,
                [sessionId, dateStr]
            );

            const statistics = periodsArray.map((period, index) => ({
                period_index: index,
                period_label: period.label,
                start_time: period.start,
                end_time: period.end,
                new_customer: {
                    response_times: [],
                    count: 0,
                    avg_response_time_seconds: 0,
                    avg_response_time_minutes: 0,
                    unreplied_count: 0
                },
                previous_message: {
                    response_times: [],
                    count: 0,
                    avg_response_time_seconds: 0,
                    avg_response_time_minutes: 0,
                    unreplied_count: 0
                }
            }));

            // Process each incoming message
            for (const incomingMsg of incomingMessages) {
                const periodIndex = this.getPeriodIndex(incomingMsg.timestamp, periodsArray);
                if (periodIndex === null) continue;

                // Check if new customer
                const isNew = await this.isNewCustomer(sessionId, incomingMsg.contact_id, dateStr);

                // Find first reply (outgoing, fromAI=1, has reply_to_message_id)
                const [replies] = await pool.execute(
                    `SELECT message_id, timestamp 
                    FROM messages 
                    WHERE session_id = ?
                    AND direction = 'outgoing'
                    AND fromAI = 1
                    AND reply_to_message_id = ?
                    AND timestamp > ?
                    ORDER BY timestamp ASC
                    LIMIT 1`,
                    [sessionId, incomingMsg.message_id, incomingMsg.timestamp]
                );

                const stat = statistics[periodIndex];
                const category = isNew ? stat.new_customer : stat.previous_message;

                if (replies.length > 0) {
                    const reply = replies[0];
                    const responseTimeSeconds = reply.timestamp - incomingMsg.timestamp;

                    // Only count if response time is reasonable (within 24 hours)
                    if (responseTimeSeconds > 0 && responseTimeSeconds <= 86400) {
                        category.response_times.push(responseTimeSeconds);
                        category.count++;
                    } else {
                        // Message replied but outside 24 hours window - count as unreplied
                        category.unreplied_count++;
                    }
                } else {
                    // No reply found - count as unreplied
                    category.unreplied_count++;
                }
            }

            // Calculate averages
            statistics.forEach(stat => {
                ['new_customer', 'previous_message'].forEach(category => {
                    const data = stat[category];
                    if (data.count > 0) {
                        const sum = data.response_times.reduce((a, b) => a + b, 0);
                        data.avg_response_time_seconds = Math.round(sum / data.count);
                        data.avg_response_time_minutes = Math.round((sum / data.count) / 60 * 100) / 100;
                    }
                    delete data.response_times; // Remove raw data
                });
            });

            return statistics;
        } catch (error) {
            console.error('Error calculating response time:', error);
            throw error;
        }
    }

    /**
     * Get statistics for all periods
     * @param {string} sessionId - Session ID
     * @param {Date|string} date - Date to get statistics for
     * @param {Array} periods - Periods configuration
     * @returns {Promise<Object>} Statistics object
     */
    async getAllPeriodsStatistics(sessionId, date, periods) {
        return await this.calculateResponseTime(sessionId, date, periods);
    }

    /**
     * Format statistics for WhatsApp message
     * @param {Array} statistics - Statistics array
     * @param {Array} periods - Periods configuration
     * @param {string} sessionId - Session ID
     * @param {string} date - Date string
     * @returns {string} Formatted message
     */
    formatStatisticsForWhatsApp(statistics, periods, sessionId, date) {
        let message = `📊 STATISTIK RESPONSIVITAS HOTLINE\n`;
        message += `Tanggal: ${date}\n`;
        message += `Session: ${sessionId}\n\n`;

        statistics.forEach((stat, index) => {
            const period = periods[index];
            message += `⏰ ${stat.period_label} (${period.start} - ${period.end})\n`;
            
            // New Customer
            if (stat.new_customer.count > 0) {
                const minutes = Math.floor(stat.new_customer.avg_response_time_seconds / 60);
                const seconds = stat.new_customer.avg_response_time_seconds % 60;
                message += `📨 New Customer:\n`;
                message += `   • Rata-rata: ${minutes} menit ${seconds} detik\n`;
                message += `   • Jumlah: ${stat.new_customer.count} customer\n`;
            } else {
                message += `📨 New Customer: Tidak ada data\n`;
            }
            
            // New Customer - Unreplied
            if (stat.new_customer.unreplied_count > 0) {
                message += `   ⚠️ Tidak dibalas: ${stat.new_customer.unreplied_count} customer\n`;
            }

            // Previous Message
            if (stat.previous_message.count > 0) {
                const minutes = Math.floor(stat.previous_message.avg_response_time_seconds / 60);
                const seconds = stat.previous_message.avg_response_time_seconds % 60;
                message += `💬 Previous Message:\n`;
                message += `   • Rata-rata: ${minutes} menit ${seconds} detik\n`;
                message += `   • Jumlah: ${stat.previous_message.count} customer\n`;
            } else {
                message += `💬 Previous Message: Tidak ada data\n`;
            }
            
            // Previous Message - Unreplied
            if (stat.previous_message.unreplied_count > 0) {
                message += `   ⚠️ Tidak dibalas: ${stat.previous_message.unreplied_count} customer\n`;
            }

            message += `\n`;
        });

        return message;
    }

    /**
     * Send statistics via WhatsApp
     * @param {string} sessionId - Session ID
     * @param {Array} statistics - Statistics array
     * @param {string} recipientPhone - Recipient phone number
     * @param {Array} periods - Periods configuration
     * @param {string} date - Date string
     * @param {Map} clients - Clients map from server
     * @returns {Promise<boolean>}
     */
    async sendStatisticsViaWhatsApp(sessionId, statistics, recipientPhone, periods, date, clients) {
        try {
            const client = clients.get(sessionId);

            if (!client) {
                console.error(`Client not found for session: ${sessionId}`);
                return false;
            }

            const message = this.formatStatisticsForWhatsApp(statistics, periods, sessionId, date);
            
            // Send message
            await client.sendMessage(`${recipientPhone}@c.us`, message);
            
            console.log(`✅ Statistics sent via WhatsApp to ${recipientPhone} for session ${sessionId}`);
            return true;
        } catch (error) {
            console.error('Error sending statistics via WhatsApp:', error);
            return false;
        }
    }
}

module.exports = new StatisticsService();


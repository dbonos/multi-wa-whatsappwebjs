const pool = require('../config/database');
const { getWIBTimestamp, convertUTCToWIBTimestamp, timestampToWIB } = require('../utils/timezone');

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
    /**
     * Check if customer is new for a specific period
     * New customer = from_number yang baru, belum pernah ada di periode sebelumnya di hari itu dan hari sebelumnya
     * Previous customer = sudah pernah ada di periode sebelumnya di hari itu atau hari sebelumnya
     * @param {string} sessionId - Session ID
     * @param {string} fromNumber - Customer phone number
     * @param {string} dateStr - Date string (YYYY-MM-DD)
     * @param {number} currentPeriodIndex - Current period index (0, 1, 2, ...)
     * @param {Array} periodsArray - All periods configuration
     * @param {Array} allIncomingMessagesToday - All incoming messages for today (to check previous periods efficiently)
     * @returns {Promise<boolean>} True if new customer for this period
     */
    async isNewCustomerForPeriod(sessionId, fromNumber, dateStr, currentPeriodIndex, periodsArray, allIncomingMessagesToday) {
        try {
            if (!fromNumber) {
                return false;
            }
            
            // Check if customer has appeared in:
            // 1. Previous periods in the same day (periods with index < currentPeriodIndex)
            // 2. Any period in previous days (before dateStr)
            
            // Check previous periods in the same day using already-fetched messages
            if (currentPeriodIndex > 0 && allIncomingMessagesToday) {
                // Check messages in previous periods (index < currentPeriodIndex)
                for (const msg of allIncomingMessagesToday) {
                    if (msg.from_number === fromNumber && msg.created_at) {
                        const msgPeriodIndex = this.getPeriodIndex(msg.created_at, periodsArray);
                        if (msgPeriodIndex !== null && msgPeriodIndex < currentPeriodIndex) {
                            // Customer appeared in a previous period of the same day = previous customer
                            console.log(`📊 [NEW CUSTOMER CHECK] ${fromNumber} found in period ${msgPeriodIndex} (current: ${currentPeriodIndex})`);
                            return false;
                        }
                    }
                }
            }
            
            // Check previous days (any period)
            const dateStartDatetime = dateStr + ' 00:00:00';
            const [messagesInPreviousDays] = await pool.execute(
                `SELECT id FROM messages 
                WHERE session_id = ?
                AND from_number = ? 
                AND direction = 'incoming'
                AND created_at < ?
                LIMIT 1`,
                [sessionId, fromNumber, dateStartDatetime]
            );
            
            if (messagesInPreviousDays.length > 0) {
                // Customer appeared in previous days = previous customer
                console.log(`📊 [NEW CUSTOMER CHECK] ${fromNumber} found in previous days`);
                return false;
            }
            
            // Customer has never appeared before = new customer
            console.log(`📊 [NEW CUSTOMER CHECK] ${fromNumber} is NEW for period ${currentPeriodIndex}`);
            return true;
        } catch (error) {
            console.error('Error checking new customer for period:', error);
            return false; // Default to false on error
        }
    }

    /**
     * Get period index for a given created_at datetime
     * @param {string|Date} created_at - Created_at datetime string or Date object
     * @param {Array} periods - Periods configuration
     * @returns {number|null} Period index or null if not in any period
     */
    getPeriodIndex(created_at, periods) {
        // Convert created_at to Date object (already in WIB)
        const date = created_at instanceof Date ? created_at : new Date(created_at);
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
            // Use created_at for all calculations (more readable and debuggable)
            // Convert date to datetime range for comparison
            const dateStartDatetime = dateStr + ' 00:00:00';
            const dateEndDatetime = dateStr + ' 23:59:59';
            
            console.log(`📊 [STATISTICS] Querying messages for date ${dateStr} (created_at range: ${dateStartDatetime} to ${dateEndDatetime})`);
            
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
            
            console.log(`📊 [STATISTICS] Found ${incomingMessages.length} incoming messages for date ${dateStr}`);

            const statistics = periodsArray.map((period, index) => ({
                period_index: index,
                period_label: period.label,
                start_time: period.start,
                end_time: period.end,
                new_customer: {
                    response_times: [],
                    count: 0,
                    fastest_response_time_seconds: 0,
                    fastest_response_time_minutes: 0,
                    avg_response_time_seconds: 0,
                    avg_response_time_minutes: 0,
                    slowest_response_time_seconds: 0,
                    slowest_response_time_minutes: 0,
                    unreplied_count: 0
                },
                previous_customer: {
                    response_times: [],
                    count: 0,
                    fastest_response_time_seconds: 0,
                    fastest_response_time_minutes: 0,
                    avg_response_time_seconds: 0,
                    avg_response_time_minutes: 0,
                    slowest_response_time_seconds: 0,
                    slowest_response_time_minutes: 0,
                    unreplied_count: 0
                }
            }));

            console.log(`📊 [STATISTICS] Processing ${incomingMessages.length} incoming messages for date ${dateStr}`);
            
            // Group messages by period and customer (from_number)
            // Structure: periodIndex -> { new: Set<from_number>, previous: Set<from_number>, replies: Map<from_number, responseTime>, firstMessage: Map<from_number, {timestamp, created_at}> }
            const periodCustomers = {};
            
            // Track first message per customer per period (NOT per session)
            // Key: periodIndex_fromNumber -> { timestamp, created_at }
            const customerFirstMessagePerPeriod = new Map();
            
            // Track customers who have been replied to AT ALL during the entire day (across all periods)
            // Key: from_number -> boolean (true if replied at any point during the day)
            const customersRepliedDuringDay = new Set();
            
            // First pass: Group messages by period and find first message per customer per period
            // Use created_at for period determination
            for (const incomingMsg of incomingMessages) {
                // Skip if created_at is missing
                if (!incomingMsg.created_at) {
                    console.warn(`⚠️ [STATISTICS] Message ${incomingMsg.message_id} has no created_at, skipping`);
                    continue;
                }
                
                const periodIndex = this.getPeriodIndex(incomingMsg.created_at, periodsArray);
                if (periodIndex === null) {
                    console.warn(`⚠️ [STATISTICS] Message ${incomingMsg.message_id} at created_at ${incomingMsg.created_at} does not fall into any period`);
                    continue;
                }

                if (!periodCustomers[periodIndex]) {
                    periodCustomers[periodIndex] = {
                        newCustomers: new Set(),
                        previousCustomers: new Set(),
                        customerReplies: new Map() // from_number -> responseTimeSeconds (from first message in period to first reply)
                    };
                }

                // Track first message per customer per period (use created_at)
                const periodCustomerKey = `${periodIndex}_${incomingMsg.from_number}`;
                if (!customerFirstMessagePerPeriod.has(periodCustomerKey)) {
                    customerFirstMessagePerPeriod.set(periodCustomerKey, {
                        created_at: incomingMsg.created_at
                    });
                }
            }
            
            // Second pass: Check for replies for each unique customer during the entire day
            // Reply = to_number yang sama dengan from_number dan created_at > created_at message pertama customer di periode tersebut
            // Unreplied = tidak ada to_number yang sama dengan from_number sepanjang hari
            const allUniqueCustomers = new Set();
            for (const incomingMsg of incomingMessages) {
                allUniqueCustomers.add(incomingMsg.from_number);
            }
            
            for (const fromNumber of allUniqueCustomers) {
                // Skip if fromNumber is invalid
                if (!fromNumber || fromNumber === 'undefined' || fromNumber === 'null') {
                    console.warn(`⚠️ [STATISTICS] Skipping invalid fromNumber: ${fromNumber}`);
                    continue;
                }
                
                // Find first reply: outgoing message where to_number = from_number (any time during the day)
                // Search across ALL sessions, not just the same session
                const [replies] = await pool.execute(
                    `SELECT message_id, timestamp, created_at, fromAI, to_number, contact_id, session_id
                    FROM messages 
                    WHERE direction = 'outgoing'
                    AND to_number = ?
                    AND DATE(created_at) = DATE(?)
                    ORDER BY created_at ASC
                    LIMIT 1`,
                    [
                        fromNumber,
                        dateStr + ' 00:00:00' // Use date string for comparison
                    ]
                );
                
                if (replies.length > 0) {
                    customersRepliedDuringDay.add(fromNumber);
                }
            }
            
            // Third pass: Calculate response time per period for each customer
            for (const [periodCustomerKey, firstMessageInfo] of customerFirstMessagePerPeriod.entries()) {
                const [periodIndex, fromNumber] = periodCustomerKey.split('_');
                
                // Skip if fromNumber is invalid
                if (!fromNumber || fromNumber === 'undefined' || fromNumber === 'null') {
                    continue;
                }
                
                // Use created_at directly (no fallback needed)
                if (!firstMessageInfo.created_at) {
                    console.warn(`⚠️ [STATISTICS] No created_at for ${fromNumber} in period ${periodIndex}, skipping`);
                    continue;
                }
                
                const firstIncomingCreatedAtDatetime = firstMessageInfo.created_at;
                
                // Find first reply: outgoing message where to_number = from_number and created_at > first message created_at in this period
                // Search across ALL sessions, not just the same session
                const [replies] = await pool.execute(
                    `SELECT message_id, timestamp, created_at, fromAI, to_number, contact_id, session_id
                    FROM messages 
                    WHERE direction = 'outgoing'
                    AND to_number = ?
                    AND created_at > ?
                    AND DATE(created_at) = DATE(?)
                    ORDER BY created_at ASC
                    LIMIT 1`,
                    [
                        fromNumber,
                        firstIncomingCreatedAtDatetime, // Use created_at datetime string
                        firstIncomingCreatedAtDatetime  // For date comparison
                    ]
                );
                
                if (replies.length > 0) {
                    const reply = replies[0];
                    // Response time = selisih created_at reply pertama dengan created_at message pertama customer di periode tersebut
                    // Both in seconds (Unix timestamp)
                    const firstIncomingCreatedAt = new Date(firstIncomingCreatedAtDatetime).getTime() / 1000;
                    const replyCreatedAt = new Date(reply.created_at).getTime() / 1000;
                    
                    // Response time in seconds
                    const responseTimeSeconds = Math.floor(replyCreatedAt - firstIncomingCreatedAt);
                    
                    if (responseTimeSeconds > 0) {
                        // Store the response time for this customer in this period
                        const existingTime = periodCustomers[periodIndex].customerReplies.get(fromNumber);
                        if (!existingTime || responseTimeSeconds < existingTime) {
                            periodCustomers[periodIndex].customerReplies.set(fromNumber, responseTimeSeconds);
                        }
                    }
                }
            }
            
            // Fourth pass: Assign customers to periods and categorize as new/previous
            // Use created_at for period determination
            // New customer = belum pernah ada di periode sebelumnya di hari itu dan hari sebelumnya
            // Previous customer = sudah pernah ada di periode sebelumnya di hari itu atau hari sebelumnya
            // IMPORTANT: Only count each unique from_number once per period
            const processedCustomersPerPeriod = {}; // Track which customers we've already processed per period
            
            for (const incomingMsg of incomingMessages) {
                // Skip if created_at is missing
                if (!incomingMsg.created_at) {
                    continue;
                }
                
                const periodIndex = this.getPeriodIndex(incomingMsg.created_at, periodsArray);
                if (periodIndex === null) {
                    continue;
                }

                // Initialize tracking for this period if needed
                if (!processedCustomersPerPeriod[periodIndex]) {
                    processedCustomersPerPeriod[periodIndex] = new Set();
                }
                
                // Skip if we've already processed this customer in this period
                if (processedCustomersPerPeriod[periodIndex].has(incomingMsg.from_number)) {
                    continue;
                }
                
                // Mark as processed
                processedCustomersPerPeriod[periodIndex].add(incomingMsg.from_number);

                // Check if new customer for this period
                // Pass allIncomingMessagesToday to avoid re-querying database
                const isNew = await this.isNewCustomerForPeriod(
                    sessionId, 
                    incomingMsg.from_number, 
                    dateStr, 
                    periodIndex, 
                    periodsArray,
                    incomingMessages // Pass all messages for today to check previous periods efficiently
                );
                
                const customerSet = isNew ? periodCustomers[periodIndex].newCustomers : periodCustomers[periodIndex].previousCustomers;
                customerSet.add(incomingMsg.from_number);
                
                console.log(`📊 [CATEGORIZE] Period ${periodIndex}, ${incomingMsg.from_number}: ${isNew ? 'NEW' : 'PREVIOUS'}`);
            }
            
            // Now calculate statistics per period based on unique customers
            for (const periodIndex in periodCustomers) {
                const periodData = periodCustomers[periodIndex];
                const stat = statistics[parseInt(periodIndex)];
                
                // Process new customers
                // count = total unique customers (yang punya reply + yang tidak punya reply)
                // unreplied_count = unique customers yang TIDAK PERNAH dibalas sepanjang hari (bukan per periode)
                for (const fromNumber of periodData.newCustomers) {
                    // Count all unique customers
                    stat.new_customer.count++;
                    
                    // If customer has at least one reply (in customerReplies), record response time
                    if (periodData.customerReplies.has(fromNumber)) {
                        const responseTime = periodData.customerReplies.get(fromNumber);
                        stat.new_customer.response_times.push(responseTime);
                    }
                    
                    // Unreplied = customer yang TIDAK PERNAH dibalas sepanjang hari (cek dari customersRepliedDuringDay)
                    if (!customersRepliedDuringDay.has(fromNumber)) {
                        stat.new_customer.unreplied_count++;
                    }
                }
                
                // Process previous customers
                // count = total unique customers (yang punya reply + yang tidak punya reply)
                // unreplied_count = unique customers yang TIDAK PERNAH dibalas sepanjang hari (bukan per periode)
                for (const fromNumber of periodData.previousCustomers) {
                    // Count all unique customers
                    stat.previous_customer.count++;
                    
                    // If customer has at least one reply (in customerReplies), record response time
                    if (periodData.customerReplies.has(fromNumber)) {
                        const responseTime = periodData.customerReplies.get(fromNumber);
                        stat.previous_customer.response_times.push(responseTime);
                    }
                    
                    // Unreplied = customer yang TIDAK PERNAH dibalas sepanjang hari (cek dari customersRepliedDuringDay)
                    if (!customersRepliedDuringDay.has(fromNumber)) {
                        stat.previous_customer.unreplied_count++;
                    }
                }
            }

            // Calculate fastest, average, and slowest response times
            statistics.forEach((stat, periodIdx) => {
                ['new_customer', 'previous_customer'].forEach(category => {
                    const data = stat[category];
                    if (data.response_times.length > 0) {
                        // Find fastest (minimum) and slowest (maximum) response time
                        const fastest = Math.min(...data.response_times);
                        const slowest = Math.max(...data.response_times);
                        
                        // Calculate average (response times are in SECONDS)
                        const sum = data.response_times.reduce((a, b) => a + b, 0);
                        const avg = Math.round(sum / data.response_times.length);
                        
                        // Store in seconds
                        data.fastest_response_time_seconds = fastest;
                        data.avg_response_time_seconds = avg;
                        data.slowest_response_time_seconds = slowest;
                        
                        // Convert to minutes for display (seconds / 60)
                        // Round to 2 decimal places
                        data.fastest_response_time_minutes = Math.round((fastest / 60) * 100) / 100;
                        data.avg_response_time_minutes = Math.round((avg / 60) * 100) / 100;
                        data.slowest_response_time_minutes = Math.round((slowest / 60) * 100) / 100;
                        
                        // Log for debugging (show both seconds and minutes)
                        console.log(`📊 [STATISTICS] Period ${periodIdx} (${stat.period_label}): ${category} - Count: ${data.count}, Unreplied: ${data.unreplied_count}, Fastest: ${data.fastest_response_time_minutes} min (${fastest}s), Avg: ${data.avg_response_time_minutes} min (${avg}s), Slowest: ${data.slowest_response_time_minutes} min (${slowest}s)`);
                    }
                    // Log statistics for debugging (if no replies)
                    if (data.count > 0 && data.response_times.length === 0) {
                        console.log(`📊 [STATISTICS] Period ${periodIdx} (${stat.period_label}): ${category} - Count: ${data.count}, Unreplied: ${data.unreplied_count}, No replies`);
                    }
                    delete data.response_times; // Remove raw data
                });
            });

            console.log(`✅ [STATISTICS] Statistics calculation completed for ${dateStr}`);
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
                message += `📨 New Customer:\n`;
                message += `   • Jumlah: ${stat.new_customer.count} customer\n`;
                
                if (stat.new_customer.fastest_response_time_seconds > 0) {
                    const fastestMin = Math.floor(stat.new_customer.fastest_response_time_seconds / 60);
                    const fastestSec = stat.new_customer.fastest_response_time_seconds % 60;
                    const slowestMin = Math.floor(stat.new_customer.slowest_response_time_seconds / 60);
                    const slowestSec = stat.new_customer.slowest_response_time_seconds % 60;
                    message += `   • Tercepat: ${fastestMin} menit ${fastestSec} detik\n`;
                    message += `   • Terlama: ${slowestMin} menit ${slowestSec} detik\n`;
                }
            } else {
                message += `📨 New Customer: Tidak ada data\n`;
            }
            
            // New Customer - Unreplied
            if (stat.new_customer.unreplied_count > 0) {
                message += `   ⚠️ Tidak dibalas: ${stat.new_customer.unreplied_count} customer\n`;
            }

            // Previous Customer
            if (stat.previous_customer.count > 0) {
                message += `💬 Previous Customer:\n`;
                message += `   • Jumlah: ${stat.previous_customer.count} customer\n`;
                
                if (stat.previous_customer.fastest_response_time_seconds > 0) {
                    const fastestMin = Math.floor(stat.previous_customer.fastest_response_time_seconds / 60);
                    const fastestSec = stat.previous_customer.fastest_response_time_seconds % 60;
                    const avgMin = Math.floor(stat.previous_customer.avg_response_time_seconds / 60);
                    const avgSec = stat.previous_customer.avg_response_time_seconds % 60;
                    const slowestMin = Math.floor(stat.previous_customer.slowest_response_time_seconds / 60);
                    const slowestSec = stat.previous_customer.slowest_response_time_seconds % 60;
                    message += `   • Tercepat: ${fastestMin} menit ${fastestSec} detik\n`;
                    message += `   • Rata-rata: ${avgMin} menit ${avgSec} detik\n`;
                    message += `   • Terlama: ${slowestMin} menit ${slowestSec} detik\n`;
                }
            } else {
                message += `💬 Previous Customer: Tidak ada data\n`;
            }
            
            // Previous Customer - Unreplied
            if (stat.previous_customer.unreplied_count > 0) {
                message += `   ⚠️ Tidak dibalas: ${stat.previous_customer.unreplied_count} customer\n`;
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


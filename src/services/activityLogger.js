const pool = require('../config/database');

/**
 * Activity Logger Service
 * Logs user activities for admin monitoring
 * Does NOT log message content (already in messages table)
 */
class ActivityLogger {
    /**
     * Log a user activity
     * @param {Object} options
     * @param {number} options.userId - User ID
     * @param {string} options.username - Username
     * @param {string} options.action - Action performed (e.g., 'login', 'send_message', 'add_skip_rule')
     * @param {string} [options.sessionId] - Session ID if applicable
     * @param {string} [options.resourceType] - Type of resource (e.g., 'session', 'message', 'skip_rule')
     * @param {string} [options.resourceId] - ID of the resource
     * @param {string} [options.description] - Human-readable description
     * @param {string} [options.ipAddress] - IP address of the request
     * @param {string} [options.userAgent] - User agent of the request
     * @param {Object} [options.metadata] - Additional metadata (will be stored as JSON)
     */
    async log({
        userId,
        username,
        action,
        sessionId = null,
        resourceType = null,
        resourceId = null,
        description = null,
        ipAddress = null,
        userAgent = null,
        metadata = null
    }) {
        try {
            // Validate required fields
            if (!userId || !action) {
                console.error('❌ [ACTIVITY LOGGER] Missing required fields: userId or action');
                return;
            }

            // Ensure all values are properly formatted (no undefined)
            const params = [
                parseInt(userId) || null,
                username || null,
                sessionId || null,
                action || null,
                resourceType || null,
                resourceId ? String(resourceId) : null,
                description || null,
                ipAddress || null,
                userAgent || null,
                metadata ? JSON.stringify(metadata) : null
            ];

            await pool.execute(
                `INSERT INTO activity_logs 
                (user_id, username, session_id, action, resource_type, resource_id, description, ip_address, user_agent, metadata)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                params
            );
        } catch (error) {
            // Don't throw - logging failures shouldn't break the app
            console.error('❌ [ACTIVITY LOGGER] Failed to log activity:', error.message);
            console.error('❌ [ACTIVITY LOGGER] Error details:', {
                userId,
                username,
                action,
                error: error.message,
                stack: error.stack
            });
        }
    }

    /**
     * Get activity logs with filters (admin only)
     * @param {Object} options
     * @param {number} [options.userId] - Filter by user ID
     * @param {string} [options.sessionId] - Filter by session ID
     * @param {string} [options.action] - Filter by action
     * @param {string} [options.resourceType] - Filter by resource type
     * @param {Date} [options.startDate] - Start date filter
     * @param {Date} [options.endDate] - End date filter
     * @param {number} [options.limit] - Limit results (default: 100)
     * @param {number} [options.offset] - Offset for pagination (default: 0)
     */
    async getLogs({
        userId = null,
        sessionId = null,
        action = null,
        resourceType = null,
        startDate = null,
        endDate = null,
        limit = 100,
        offset = 0
    } = {}) {
        try {
            let query = `
                SELECT 
                    al.*,
                    u.username as user_username,
                    u.role as user_role
                FROM activity_logs al
                LEFT JOIN users u ON al.user_id = u.id
                WHERE 1=1
            `;
            const params = [];

            // Validate and add filters
            if (userId) {
                const userIdInt = parseInt(userId);
                if (!isNaN(userIdInt)) {
                    query += ' AND al.user_id = ?';
                    params.push(userIdInt);
                }
            }

            if (sessionId) {
                query += ' AND al.session_id = ?';
                params.push(String(sessionId));
            }

            if (action) {
                query += ' AND al.action = ?';
                params.push(String(action));
            }

            if (resourceType) {
                query += ' AND al.resource_type = ?';
                params.push(String(resourceType));
            }

            if (startDate) {
                query += ' AND al.created_at >= ?';
                params.push(String(startDate));
            }

            if (endDate) {
                query += ' AND al.created_at <= ?';
                params.push(String(endDate));
            }

            // LIMIT and OFFSET must be integers, not parameters
            // MySQL doesn't support LIMIT/OFFSET as prepared statement parameters in some versions
            const limitInt = Math.max(1, Math.min(1000, parseInt(limit) || 100));
            const offsetInt = Math.max(0, parseInt(offset) || 0);
            query += ` ORDER BY al.created_at DESC LIMIT ${limitInt} OFFSET ${offsetInt}`;

            const [logs] = await pool.execute(query, params);

            // Parse JSON metadata
            return logs.map(log => ({
                ...log,
                metadata: log.metadata ? JSON.parse(log.metadata) : null
            }));
        } catch (error) {
            console.error('❌ [ACTIVITY LOGGER] Failed to get logs:', error.message);
            throw error;
        }
    }

    /**
     * Get activity log count (for pagination)
     */
    async getLogCount({
        userId = null,
        sessionId = null,
        action = null,
        resourceType = null,
        startDate = null,
        endDate = null
    } = {}) {
        try {
            let query = 'SELECT COUNT(*) as count FROM activity_logs WHERE 1=1';
            const params = [];

            // Validate and add filters
            if (userId) {
                const userIdInt = parseInt(userId);
                if (!isNaN(userIdInt)) {
                    query += ' AND user_id = ?';
                    params.push(userIdInt);
                }
            }

            if (sessionId) {
                query += ' AND session_id = ?';
                params.push(String(sessionId));
            }

            if (action) {
                query += ' AND action = ?';
                params.push(String(action));
            }

            if (resourceType) {
                query += ' AND resource_type = ?';
                params.push(String(resourceType));
            }

            if (startDate) {
                query += ' AND created_at >= ?';
                params.push(String(startDate));
            }

            if (endDate) {
                query += ' AND created_at <= ?';
                params.push(String(endDate));
            }

            const [result] = await pool.execute(query, params);
            return result[0].count;
        } catch (error) {
            console.error('❌ [ACTIVITY LOGGER] Failed to get log count:', error.message);
            throw error;
        }
    }
}

module.exports = new ActivityLogger();

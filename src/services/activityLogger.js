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
            await pool.execute(
                `INSERT INTO activity_logs 
                (user_id, username, session_id, action, resource_type, resource_id, description, ip_address, user_agent, metadata)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    userId,
                    username,
                    sessionId,
                    action,
                    resourceType,
                    resourceId,
                    description,
                    ipAddress,
                    userAgent,
                    metadata ? JSON.stringify(metadata) : null
                ]
            );
        } catch (error) {
            // Don't throw - logging failures shouldn't break the app
            console.error('❌ [ACTIVITY LOGGER] Failed to log activity:', error.message);
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

            if (userId) {
                query += ' AND al.user_id = ?';
                params.push(userId);
            }

            if (sessionId) {
                query += ' AND al.session_id = ?';
                params.push(sessionId);
            }

            if (action) {
                query += ' AND al.action = ?';
                params.push(action);
            }

            if (resourceType) {
                query += ' AND al.resource_type = ?';
                params.push(resourceType);
            }

            if (startDate) {
                query += ' AND al.created_at >= ?';
                params.push(startDate);
            }

            if (endDate) {
                query += ' AND al.created_at <= ?';
                params.push(endDate);
            }

            query += ' ORDER BY al.created_at DESC LIMIT ? OFFSET ?';
            params.push(limit, offset);

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

            if (userId) {
                query += ' AND user_id = ?';
                params.push(userId);
            }

            if (sessionId) {
                query += ' AND session_id = ?';
                params.push(sessionId);
            }

            if (action) {
                query += ' AND action = ?';
                params.push(action);
            }

            if (resourceType) {
                query += ' AND resource_type = ?';
                params.push(resourceType);
            }

            if (startDate) {
                query += ' AND created_at >= ?';
                params.push(startDate);
            }

            if (endDate) {
                query += ' AND created_at <= ?';
                params.push(endDate);
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

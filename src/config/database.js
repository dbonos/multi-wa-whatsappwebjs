const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5508,
    user: process.env.DB_USER || 'wa_manager',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'wa_manager',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
    // NOTE: Do NOT set timezone here - data is already stored in WIB
    // Setting timezone: '+07:00' causes double conversion when reading
    // The SET time_zone wrapper below handles INSERT/UPDATE operations
    typeCast: function (field, next) {
        if (field.type === 'TIMESTAMP' || field.type === 'DATETIME' || field.type === 'DATE') {
            return field.string();
        }
        return next();
    }
});

// Set timezone for all connections using connection initialization
// This is more reliable than setting it per query
pool.on('connection', function (connection) {
    // Note: This event doesn't fire with mysql2/promise, so we use wrapper instead
});

// Get original getConnection for use in wrappers
const originalGetConnection = pool.getConnection.bind(pool);

// Note: DO NOT set timezone in getConnection wrapper
// Timezone is only needed for INSERT/UPDATE operations
// Setting it globally causes double offset when reading DATETIME columns

/**
 * Ensure every pooled connection uses WIB (+07:00) consistently.
 *
 * IMPORTANT:
 * - `messages.created_at` is a TIMESTAMP column, so MySQL converts values based on the connection/session time_zone.
 * - Previously we only did `SET time_zone` for write queries; then the same connection could be reused for SELECT,
 *   causing inconsistent reads (sometimes WIB, sometimes SYSTEM/UTC), which broke DATE(created_at)=? filtering and periods.
 *
 * Strategy:
 * - Set `time_zone = '+07:00'` ONCE per pooled connection (cached via a flag) for both reads and writes.
 * - Do NOT replace CURRENT_TIMESTAMP; with session time_zone set, CURRENT_TIMESTAMP/NOW() are already WIB.
 */
async function ensureWibTimezone(connection) {
    if (connection.__wibTimeZoneSet) return;
    await connection.query("SET time_zone = '+07:00'");
    connection.__wibTimeZoneSet = true;
}

// Wrap execute() so every connection is consistently WIB
const originalExecute = pool.execute.bind(pool);
pool.execute = async function(sql, params) {
    const connection = await originalGetConnection();
    try {
        await ensureWibTimezone(connection);
        const result = await connection.execute(sql, params);
        return result;
    } catch (error) {
        console.error(`❌ [DB] Error in execute wrapper:`, error.message);
        throw error;
    } finally {
        connection.release();
    }
};

// Wrap query() so every connection is consistently WIB
const originalQuery = pool.query.bind(pool);
pool.query = async function(sql, params) {
    const connection = await originalGetConnection();
    try {
        await ensureWibTimezone(connection);
        const result = await connection.query(sql, params);
        return result;
    } finally {
        connection.release();
    }
};

// Test connection
pool.getConnection()
    .then(async (connection) => {
        console.log('✅ Database connected');
        // Note: We set session time_zone to WIB (+07:00) per pooled connection in wrappers.
        try {
            const [rows] = await connection.query("SELECT NOW() as db_time, @@session.time_zone as session_tz");
            if (rows && rows[0]) {
                console.log(`📊 Database info - Server time: ${rows[0].db_time}, Session TZ: ${rows[0].session_tz}`);
            }
        } catch (err) {
            // Silent fail for timezone check
        }
        connection.release();
    })
    .catch(err => {
        console.error('❌ Database connection error:', err.message);
    });

module.exports = pool;


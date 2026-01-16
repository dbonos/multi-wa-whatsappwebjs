const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5508,
    user: process.env.DB_USER || 'wa_manager',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'wa_manager',
    waitForConnections: true,
    connectionLimit: 50, // Increased from 10 to 50 to handle burst requests
    queueLimit: 0,
    maxIdle: 10, // Maximum idle connections to keep
    idleTimeout: 60000, // Close idle connections after 60 seconds
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
    // NOTE:
    // We set MySQL session time_zone in the wrappers below (per pooled connection).
    // This keeps NOW()/CURRENT_TIMESTAMP consistent (WIB) and avoids mixed behavior across pooled connections.
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

// Note:
// We intentionally set session time_zone per pooled connection inside execute/query wrappers.

/**
 * Ensure every pooled connection uses a fixed time_zone consistently.
 *
 * IMPORTANT:
 * - We store times in DB as WIB "wall-clock" values (business rule).
 * - After migrating timestamp columns to DATETIME, reads are no longer timezone-shifted by MySQL.
 * - We still set session time_zone to WIB (+07:00) so NOW()/CURRENT_TIMESTAMP used by INSERT/UPDATE are WIB.
 *
 * Also:
 * - We set it ONCE per pooled connection (cached via a flag) for both reads and writes to avoid mixed behavior.
 */
async function ensureFixedTimezone(connection) {
    if (connection.__fixedTimeZoneSet) return;
    await connection.query("SET time_zone = '+07:00'");
    connection.__fixedTimeZoneSet = true;
}

// Wrap execute() so every connection is consistently WIB
const originalExecute = pool.execute.bind(pool);
pool.execute = async function(sql, params) {
    const connection = await originalGetConnection();
    try {
        await ensureFixedTimezone(connection);
        const result = await connection.execute(sql, params);
        return result;
    } catch (error) {
        console.error(`❌ [DB] Error in execute wrapper:`, error.message);
        console.error(`❌ [DB] SQL:`, sql?.substring(0, 200) || 'N/A');
        console.error(`❌ [DB] Params:`, params);
        throw error;
    } finally {
        // Always release connection, even if there's an error
        try {
            connection.release();
        } catch (releaseError) {
            console.error(`❌ [DB] Error releasing connection:`, releaseError.message);
        }
    }
};

// Wrap query() so every connection is consistently WIB
const originalQuery = pool.query.bind(pool);
pool.query = async function(sql, params) {
    const connection = await originalGetConnection();
    try {
        await ensureFixedTimezone(connection);
        const result = await connection.query(sql, params);
        return result;
    } catch (error) {
        console.error(`❌ [DB] Error in query wrapper:`, error.message);
        console.error(`❌ [DB] SQL:`, sql?.substring(0, 200) || 'N/A');
        console.error(`❌ [DB] Params:`, params);
        throw error;
    } finally {
        // Always release connection, even if there's an error
        try {
            connection.release();
        } catch (releaseError) {
            console.error(`❌ [DB] Error releasing connection:`, releaseError.message);
        }
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


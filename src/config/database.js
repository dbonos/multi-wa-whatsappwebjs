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

// Wrap execute() to ensure CURRENT_TIMESTAMP uses WIB for INSERT/UPDATE
// NOTE: SET time_zone only for write operations, not SELECT (causes double offset on read)
const originalExecute = pool.execute.bind(pool);
pool.execute = async function(sql, params) {
    const connection = await originalGetConnection();
    try {
        let modifiedSql = sql;
        const upperSql = sql.toUpperCase().trim();
        const isWriteQuery = upperSql.startsWith('INSERT') || upperSql.startsWith('UPDATE') || upperSql.startsWith('REPLACE');
        
        // Only set timezone for write queries (INSERT/UPDATE)
        // This ensures NOW() and CURRENT_TIMESTAMP use WIB
        // Do NOT set for SELECT - data is already stored in WIB
        if (isWriteQuery) {
            await connection.query("SET time_zone = '+07:00'");
            
            // For INSERT/UPDATE queries with CURRENT_TIMESTAMP, replace with explicit WIB conversion
            if (sql.includes('CURRENT_TIMESTAMP')) {
                modifiedSql = sql.replace(/CURRENT_TIMESTAMP/g, "CONVERT_TZ(NOW(), '+00:00', '+07:00')");
            }
        }
        
        const result = await connection.execute(modifiedSql, params);
        return result;
    } catch (error) {
        console.error(`❌ [DB] Error in execute wrapper:`, error.message);
        throw error;
    } finally {
        connection.release();
    }
};

// Wrap query() to ensure CURRENT_TIMESTAMP uses WIB for INSERT/UPDATE
// NOTE: SET time_zone only for write operations, not SELECT (causes double offset on read)
const originalQuery = pool.query.bind(pool);
pool.query = async function(sql, params) {
    const connection = await originalGetConnection();
    try {
        let modifiedSql = sql;
        const upperSql = sql.toUpperCase().trim();
        const isWriteQuery = upperSql.startsWith('INSERT') || upperSql.startsWith('UPDATE') || upperSql.startsWith('REPLACE');
        
        // Only set timezone for write queries (INSERT/UPDATE)
        if (isWriteQuery) {
            await connection.query("SET time_zone = '+07:00'");
            
            // For INSERT/UPDATE queries with CURRENT_TIMESTAMP, replace with explicit WIB conversion
            if (sql.includes('CURRENT_TIMESTAMP')) {
                modifiedSql = sql.replace(/CURRENT_TIMESTAMP/g, "CONVERT_TZ(NOW(), '+00:00', '+07:00')");
            }
        }
        
        const result = await connection.query(modifiedSql, params);
        return result;
    } finally {
        connection.release();
    }
};

// Test connection
pool.getConnection()
    .then(async (connection) => {
        console.log('✅ Database connected');
        // Note: Timezone is set only for INSERT/UPDATE queries (not SELECT)
        // Data is stored in WIB, so no conversion needed when reading
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


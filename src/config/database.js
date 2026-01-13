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
    timezone: '+07:00', // WIB (UTC+7)
    // Set timezone for every new connection automatically
    // This ensures CURRENT_TIMESTAMP uses WIB timezone
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

// Wrapper to ensure timezone is set for each connection
const originalGetConnection = pool.getConnection.bind(pool);
const connectionsWithTimezone = new WeakSet();

pool.getConnection = async function() {
    const connection = await originalGetConnection();
    // Only set timezone once per connection
    if (!connectionsWithTimezone.has(connection)) {
        try {
            await connection.query("SET time_zone = '+07:00'");
            connectionsWithTimezone.add(connection);
        } catch (err) {
            // Silent fail - timezone might already be set
        }
    }
    return connection;
};

// Wrap execute() to ensure timezone is set before each query
// CRITICAL: Always set timezone to ensure CURRENT_TIMESTAMP uses WIB
const originalExecute = pool.execute.bind(pool);
pool.execute = async function(sql, params) {
    const connection = await originalGetConnection();
    try {
        // CRITICAL: ALWAYS set timezone BEFORE executing query
        // This ensures CURRENT_TIMESTAMP in INSERT/UPDATE uses WIB
        await connection.query("SET time_zone = '+07:00'");
        const result = await connection.execute(sql, params);
        return result;
    } finally {
        connection.release();
    }
};

// Wrap query() to ensure timezone is set before each query
const originalQuery = pool.query.bind(pool);
pool.query = async function(sql, params) {
    const connection = await originalGetConnection();
    try {
        // CRITICAL: ALWAYS set timezone BEFORE executing query
        await connection.query("SET time_zone = '+07:00'");
        const result = await connection.query(sql, params);
        return result;
    } finally {
        connection.release();
    }
};

// Test connection and set timezone
pool.getConnection()
    .then(async (connection) => {
        console.log('✅ Database connected');
        // Set MySQL session timezone to WIB
        try {
            await connection.query("SET time_zone = '+07:00'");
            const [rows] = await connection.query("SELECT NOW() as current_time, @@session.time_zone as timezone FROM DUAL");
            if (rows && rows[0]) {
                console.log(`✅ Database timezone set to WIB (UTC+7) - Current DB time: ${rows[0].current_time}, Timezone: ${rows[0].timezone}`);
            } else {
                console.log('✅ Database timezone set to WIB (UTC+7)');
            }
        } catch (err) {
            console.error('⚠️ Warning: Could not set timezone:', err.message);
        }
        connection.release();
    })
    .catch(err => {
        console.error('❌ Database connection error:', err.message);
    });

module.exports = pool;


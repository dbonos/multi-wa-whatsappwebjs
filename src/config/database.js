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
    timezone: '+07:00' // WIB (UTC+7)
});

// Wrapper to ensure timezone is set for each connection
const originalGetConnection = pool.getConnection.bind(pool);
pool.getConnection = async function() {
    const connection = await originalGetConnection();
    try {
        await connection.query("SET time_zone = '+07:00'");
    } catch (err) {
        // Silent fail - timezone might already be set
    }
    return connection;
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


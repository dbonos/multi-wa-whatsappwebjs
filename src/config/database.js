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

// Test connection and set timezone
pool.getConnection()
    .then(async (connection) => {
        console.log('✅ Database connected');
        // Set MySQL session timezone to WIB
        await connection.query("SET time_zone = '+07:00'");
        connection.release();
        console.log('✅ Database timezone set to WIB (UTC+7)');
    })
    .catch(err => {
        console.error('❌ Database connection error:', err.message);
    });

// Set timezone for all new connections
pool.on('connection', async (connection) => {
    await connection.query("SET time_zone = '+07:00'");
});

module.exports = pool;


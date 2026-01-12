const bcrypt = require('bcryptjs');
const mysql = require('mysql2/promise');
require('dotenv').config();

async function setupAdmin() {
    try {
        const password = 'admin123';
        const hash = await bcrypt.hash(password, 10);
        
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            port: process.env.DB_PORT || 5508,
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'wa_web'
        });
        
        await connection.execute(
            `INSERT INTO users (username, password_hash, role) 
             VALUES (?, ?, 'admin')
             ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash)`,
            ['admin', hash]
        );
        
        console.log('✅ Admin user created/updated successfully!');
        console.log('   Username: admin');
        console.log('   Password: admin123');
        console.log('   ⚠️  Please change password after first login!');
        
        await connection.end();
    } catch (error) {
        console.error('❌ Error:', error.message);
        console.log('');
        console.log('Please make sure:');
        console.log('1. Database is created and schema is imported');
        console.log('2. .env file has correct database credentials');
        process.exit(1);
    }
}

setupAdmin();


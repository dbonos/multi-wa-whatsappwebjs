const pool = require('../config/database');
const crypto = require('crypto');

// Generate 6-digit OTP
const generateOTP = () => {
    return crypto.randomInt(100000, 999999).toString();
};

// Send OTP via WhatsApp (using the session)
const sendOTP = async (sessionId, phoneNumber, otpCode) => {
    try {
        // Get WhatsApp client for this session
        const { Client } = require('whatsapp-web.js');
        // This will be handled by the main server.js
        // We'll return the OTP and let server.js handle sending
        
        // For now, just log it (in production, integrate with WhatsApp API)
        console.log(`OTP for ${phoneNumber} (session: ${sessionId}): ${otpCode}`);
        
        return { success: true, otp: otpCode };
    } catch (error) {
        console.error('Error sending OTP:', error);
        return { success: false, error: error.message };
    }
};

// Request OTP for login
const requestOTP = async (sessionId, phoneNumber, ipAddress = null, userAgent = null) => {
    try {
        // Check if session exists
        const [sessions] = await pool.execute(
            'SELECT * FROM sessions WHERE session_id = ?',
            [sessionId]
        );

        if (sessions.length === 0) {
            return { success: false, error: 'Session not found' };
        }

        const session = sessions[0];

        // Check if user exists for this session
        let [users] = await pool.execute(
            'SELECT * FROM users WHERE session_id = ? OR phone_number = ?',
            [sessionId, phoneNumber]
        );

        let user;
        if (users.length === 0) {
            // Create user if doesn't exist
            const bcrypt = require('bcryptjs');
            const defaultPassword = await bcrypt.hash('changeme', 10);
            
            await pool.execute(
                `INSERT INTO users (username, session_id, phone_number, password_hash, role) 
                 VALUES (?, ?, ?, ?, 'user')`,
                [sessionId, sessionId, phoneNumber, defaultPassword]
            );

            [users] = await pool.execute(
                'SELECT * FROM users WHERE session_id = ?',
                [sessionId]
            );
        }

        user = users[0];

        // Check rate limiting (max 3 OTP requests per 15 minutes)
        const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
        const [recentRequests] = await pool.execute(
            'SELECT COUNT(*) as count, MIN(created_at) as oldest_request FROM otp_requests WHERE session_id = ? AND created_at > ?',
            [sessionId, fifteenMinutesAgo]
        );

        if (recentRequests[0].count >= 3) {
            // Calculate when the oldest request will expire (15 minutes from oldest request)
            const oldestRequest = recentRequests[0].oldest_request;
            if (oldestRequest) {
                const oldestRequestTime = new Date(oldestRequest);
                const waitUntil = new Date(oldestRequestTime.getTime() + 15 * 60 * 1000);
                const waitMinutes = Math.ceil((waitUntil - Date.now()) / (60 * 1000));
                
                return { 
                    success: false, 
                    error: `Too many OTP requests. Maximum 3 requests per 15 minutes. Please try again in ${waitMinutes} minute(s).`,
                    retryAfter: waitUntil.toISOString(),
                    retryAfterMinutes: waitMinutes
                };
            } else {
                return { 
                    success: false, 
                    error: 'Too many OTP requests. Maximum 3 requests per 15 minutes. Please try again in 15 minutes.',
                    retryAfterMinutes: 15
                };
            }
        }

        // Generate OTP
        const otpCode = generateOTP();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

        // Save OTP request
        await pool.execute(
            `INSERT INTO otp_requests (session_id, phone_number, otp_code, ip_address, user_agent, expires_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [sessionId, phoneNumber, otpCode, ipAddress, userAgent, expiresAt]
        );

        // Update user OTP info
        await pool.execute(
            `UPDATE users SET otp_code = ?, otp_expires_at = ?, last_otp_sent_at = NOW()
             WHERE id = ?`,
            [otpCode, expiresAt, user.id]
        );

        // Send OTP via WhatsApp (using the session's WhatsApp client)
        // This will be handled by server.js which has access to WhatsApp clients
        // For now, return OTP (in production, send via WhatsApp)

        return {
            success: true,
            message: 'OTP sent successfully',
            expiresIn: 600 // 10 minutes in seconds
        };
    } catch (error) {
        console.error('Error requesting OTP:', error);
        return { success: false, error: error.message };
    }
};

// Verify OTP
const verifyOTP = async (sessionId, otpCode) => {
    try {
        // Find valid OTP request
        const [otpRequests] = await pool.execute(
            `SELECT * FROM otp_requests 
             WHERE session_id = ? AND otp_code = ? AND expires_at > NOW() AND used = FALSE
             ORDER BY created_at DESC LIMIT 1`,
            [sessionId, otpCode]
        );

        if (otpRequests.length === 0) {
            return { success: false, error: 'Invalid or expired OTP' };
        }

        const otpRequest = otpRequests[0];

        // Mark as used
        await pool.execute(
            'UPDATE otp_requests SET used = TRUE, used_at = NOW() WHERE id = ?',
            [otpRequest.id]
        );

        // Get user
        const [users] = await pool.execute(
            'SELECT * FROM users WHERE session_id = ?',
            [sessionId]
        );

        if (users.length === 0) {
            return { success: false, error: 'User not found' };
        }

        return { success: true, user: users[0] };
    } catch (error) {
        console.error('Error verifying OTP:', error);
        return { success: false, error: error.message };
    }
};

module.exports = {
    generateOTP,
    sendOTP,
    requestOTP,
    verifyOTP
};


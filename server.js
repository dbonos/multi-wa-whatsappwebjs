require('dotenv').config();

// Set timezone to WIB (Asia/Jakarta, UTC+7)
process.env.TZ = 'Asia/Jakarta';

const express = require('express');
const http = require('http');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const bcrypt = require('bcryptjs');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { buildAttachmentUrl } = require('./src/utils/attachments');

// Import services and middleware
const pool = require('./src/config/database');
const messageHandler = require('./src/services/messageHandler');
const { authenticate, requireAdmin, requireUser, requireSessionOwner, generateToken } = require('./src/middleware/auth');
const SocketHandler = require('./src/services/socketHandler');
const otpService = require('./src/services/otpService');
const statisticsService = require('./src/services/statisticsService');
const SchedulerService = require('./src/services/schedulerService');
const activityLogger = require('./src/services/activityLogger');
const { getWIBTime, getWIBTimestamp, getWIBToday, formatWIBDisplay, toWIBISOString } = require('./src/utils/timezone');

const app = express();
const server = http.createServer(app);
const socketHandler = new SocketHandler(server);
socketHandler.initialize();

const PORT = process.env.PORT || 3000;
const DEFAULT_OTP_SESSION_ID = process.env.DEFAULT_OTP_SESSION_ID || '628112298898';

// Store multiple WhatsApp clients
const clients = new Map();
const qrCodes = new Map(); // sessionId -> qrCode
const sessionStatuses = new Map(); // sessionId -> status

// Initialize scheduler service
const schedulerService = new SchedulerService(clients);

// Middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"], // Allow inline scripts for React
            styleSrc: ["'self'", "'unsafe-inline'", "https:"], // Allow inline styles
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", "http://108.137.37.171:3000", "ws://108.137.37.171:3000"], // Allow WebSocket
            fontSrc: ["'self'", "data:", "https:"],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'"],
            frameSrc: ["'none'"],
            upgradeInsecureRequests: null, // Disable upgrade to HTTPS (we're using HTTP)
        },
    },
    crossOriginOpenerPolicy: false, // Disable COOP for HTTP
    crossOriginResourcePolicy: false, // Disable CORP for HTTP
}));
app.use(cors());
// IMPORTANT: express.json() and express.urlencoded() should NOT parse multipart/form-data
// They automatically skip multipart requests, but to be safe, we'll use conditional middleware
app.use((req, res, next) => {
    const contentType = req.headers['content-type'] || '';
    if (contentType.includes('multipart/form-data')) {
        // Skip json/urlencoded parsing for multipart requests - let multer handle it
        // But we need to ensure multer can parse fields even without files
        return next();
    }
    // For other requests, use json/urlencoded parsing
    express.json({ limit: '50mb' })(req, res, (err) => {
        if (err) return next(err);
        express.urlencoded({ extended: true, limit: '50mb' })(req, res, next);
    });
});

// Rate limiting - General API rate limit
const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: parseInt(process.env.API_RATE_LIMIT_MAX || '100'), // Default: 100 requests per 15 minutes
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    skip: (req) => {
        // Skip rate limiting for WebSocket upgrade requests
        return req.headers.upgrade === 'websocket';
    }
});

// Stricter rate limit for authentication endpoints
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: parseInt(process.env.AUTH_RATE_LIMIT_MAX || '10'), // Default: 10 login attempts per 15 minutes
    message: 'Too many authentication attempts, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true, // Don't count successful requests
});

// Stricter rate limit for message sending
const messageSendLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: parseInt(process.env.MESSAGE_RATE_LIMIT_MAX || '30'), // Default: 30 messages per minute
    message: 'Too many messages sent, please slow down.',
    standardHeaders: true,
    legacyHeaders: false,
});

// Apply rate limiters
app.use('/api/', generalLimiter); // General API rate limit
app.use('/api/auth/login', authLimiter); // Stricter for login
app.use('/api/auth/request-otp', authLimiter); // Stricter for OTP requests
app.use('/api/messages/send', messageSendLimiter); // Stricter for sending messages

// Serve static files (frontend)
app.use(express.static('public'));
// Serve attachments
app.use('/attachments', express.static(process.env.ATTACHMENTS_DIR || './attachments'));

// ============================================
// AUTHENTICATION ENDPOINTS
// ============================================

// Login - Support both admin (username/password) and user (session name + password/OTP)
app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, sessionName, password, otp, loginMethod } = req.body;

        // Admin login: username + password
        if (username && password && !sessionName) {
            const [users] = await pool.execute(
                'SELECT * FROM users WHERE username = ? AND role = ?',
                [username, 'admin']
            );

            if (users.length === 0) {
                return res.status(401).json({ error: 'Invalid credentials' });
            }

            const user = users[0];
            const validPassword = await bcrypt.compare(password, user.password_hash);

            if (!validPassword) {
                return res.status(401).json({ error: 'Invalid credentials' });
            }

            const token = generateToken(user.id);

            // Log admin login
            await activityLogger.log({
                userId: user.id,
                username: user.username,
                action: 'login',
                description: 'Admin login',
                ipAddress: req.ip || req.connection.remoteAddress,
                userAgent: req.get('user-agent')
            });

            return res.json({
                success: true,
                token,
                user: {
                    id: user.id,
                    username: user.username,
                    role: user.role
                }
            });
        }

        // User login: session name (phone number) + password or OTP
        if (sessionName && (password || otp)) {
            // Check if session exists
            const [sessions] = await pool.execute(
                'SELECT * FROM sessions WHERE session_id = ?',
                [sessionName]
            );

            if (sessions.length === 0) {
                return res.status(404).json({ error: 'Session not found' });
            }

            // Find or create user for this session
            let [users] = await pool.execute(
                'SELECT * FROM users WHERE session_id = ? OR phone_number = ?',
                [sessionName, sessionName]
            );

            let user;
            if (users.length === 0) {
                // Create user if doesn't exist
                const defaultPassword = await bcrypt.hash('changeme', 10);
                await pool.execute(
                    `INSERT INTO users (username, session_id, phone_number, password_hash, role) 
                     VALUES (?, ?, ?, ?, 'user')`,
                    [sessionName, sessionName, sessionName, defaultPassword]
                );

                [users] = await pool.execute(
                    'SELECT * FROM users WHERE session_id = ?',
                    [sessionName]
                );
            }

            user = users[0];

            // Login with password
            if (password && loginMethod !== 'otp') {
                const validPassword = await bcrypt.compare(password, user.password_hash);

                if (!validPassword) {
                    return res.status(401).json({ error: 'Invalid password' });
                }

                const token = generateToken(user.id);

                return res.json({
                    success: true,
                    token,
                    user: {
                        id: user.id,
                        username: user.username || user.session_id,
                        session_id: user.session_id,
                        phone_number: user.phone_number,
                        role: user.role
                    }
                });
            }

            // Login with OTP
            if (otp && loginMethod === 'otp') {
                const otpResult = await otpService.verifyOTP(sessionName, otp);

                if (!otpResult.success) {
                    return res.status(401).json({ error: otpResult.error || 'Invalid OTP' });
                }

                const token = generateToken(user.id);

                // Log user login with OTP
                await activityLogger.log({
                    userId: user.id,
                    username: user.username || user.session_id,
                    sessionId: user.session_id,
                    action: 'login',
                    description: `User login with OTP (session: ${user.session_id})`,
                    ipAddress: req.ip || req.connection.remoteAddress,
                    userAgent: req.get('user-agent')
                });

                return res.json({
                    success: true,
                    token,
                    user: {
                        id: user.id,
                        username: user.username || user.session_id,
                        session_id: user.session_id,
                        phone_number: user.phone_number,
                        role: user.role
                    }
                });
            }

            return res.status(400).json({ error: 'Password or OTP required' });
        }

        return res.status(400).json({ error: 'Invalid login parameters' });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

// Request OTP for user login
app.post('/api/auth/request-otp', async (req, res) => {
    try {
        const { sessionName } = req.body;

        if (!sessionName) {
            return res.status(400).json({ error: 'Session name (phone number) required' });
        }

        // Check if target session exists (user login session)
        const [sessions] = await pool.execute(
            'SELECT * FROM sessions WHERE session_id = ?',
            [sessionName]
        );

        if (sessions.length === 0) {
            return res.status(404).json({ error: 'Session not found' });
        }

        // Check default OTP sender session exists
        const [senderSessions] = await pool.execute(
            'SELECT * FROM sessions WHERE session_id = ?',
            [DEFAULT_OTP_SESSION_ID]
        );

        if (senderSessions.length === 0) {
            return res.status(500).json({ error: `Default OTP session not found: ${DEFAULT_OTP_SESSION_ID}` });
        }

        const ipAddress = req.ip || req.connection.remoteAddress;
        const userAgent = req.headers['user-agent'];

        const result = await otpService.requestOTP(sessionName, sessionName, ipAddress, userAgent);

        if (!result.success) {
            return res.status(429).json({ 
                error: result.error,
                retryAfter: result.retryAfter || null,
                retryAfterMinutes: result.retryAfterMinutes || 15
            });
        }

        // Send OTP via default WhatsApp session if client is ready
        const client = clients.get(DEFAULT_OTP_SESSION_ID);
        let otpSent = false;
        let otpSendError = null;
        if (client && client.info) {
            try {
                // Get OTP code from database
                const [users] = await pool.execute(
                    'SELECT otp_code FROM users WHERE session_id = ?',
                    [sessionName]
                );

                if (users.length > 0 && users[0].otp_code) {
                    const otpMessage = `Your login OTP code is: ${users[0].otp_code}\n\nThis code will expire in 10 minutes.`;
                    // Avoid sendSeen to prevent markedUnread crash on some WA versions
                    await client.sendMessage(`${sessionName}@c.us`, otpMessage, { sendSeen: false });
                    otpSent = true;
                } else {
                    otpSendError = 'OTP not found in database';
                }
            } catch (error) {
                console.error('Error sending OTP via WhatsApp:', error);
                otpSendError = error.message;
            }
        } else {
            otpSendError = `Default session not ready: ${DEFAULT_OTP_SESSION_ID}`;
            console.warn(`⚠️ [OTP] ${otpSendError}`);
        }

        res.json({
            success: otpSent,
            sent: otpSent,
            message: otpSent ? 'OTP sent successfully' : 'OTP generated but not sent',
            error: otpSendError,
            expiresIn: result.expiresIn
        });
    } catch (error) {
        console.error('Request OTP error:', error);
        res.status(500).json({ error: 'Failed to request OTP' });
    }
});

// Change password (for both admin and user)
app.post('/api/auth/change-password', authenticate, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({ error: 'Current password and new password required' });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({ error: 'New password must be at least 6 characters' });
        }

        // Get user with password hash
        const [users] = await pool.execute(
            'SELECT * FROM users WHERE id = ?',
            [req.user.id]
        );

        if (users.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const user = users[0];
        const validPassword = await bcrypt.compare(currentPassword, user.password_hash);

        if (!validPassword) {
            return res.status(401).json({ error: 'Current password is incorrect' });
        }

        // Hash new password
        const newPasswordHash = await bcrypt.hash(newPassword, 10);

        // Update password
        await pool.execute(
            'UPDATE users SET password_hash = ? WHERE id = ?',
            [newPasswordHash, user.id]
        );

        res.json({
            success: true,
            message: 'Password changed successfully'
        });
    } catch (error) {
        console.error('Change password error:', error);
        res.status(500).json({ error: 'Failed to change password' });
    }
});

// Get current user
app.get('/api/auth/me', authenticate, async (req, res) => {
    res.json({
        success: true,
        user: req.user
    });
});

// ============================================
// SESSION MANAGEMENT ENDPOINTS
// ============================================

// Get all sessions (Admin: all sessions, User: only their session)
app.get('/api/sessions', authenticate, async (req, res) => {
    try {
        let query = `SELECT s.*, 
             COUNT(DISTINCT m.id) as message_count,
             COUNT(DISTINCT c.id) as contact_count
             FROM sessions s
             LEFT JOIN messages m ON m.session_id = s.session_id
             LEFT JOIN contacts c ON c.session_id = s.session_id`;

        // User can only see their own session
        if (req.user.role !== 'admin') {
            query += ` WHERE s.session_id = ?`;
        }

        query += ` GROUP BY s.id ORDER BY s.created_at DESC`;

        let sessions;
        if (req.user.role === 'admin') {
            [sessions] = await pool.execute(query);
        } else {
            [sessions] = await pool.execute(query, [req.user.session_id]);
        }

        // Add real-time status from memory
        const sessionsWithStatus = sessions.map(s => ({
            ...s,
            realtime_status: sessionStatuses.get(s.session_id) || s.status,
            is_active: clients.has(s.session_id)
        }));

        res.json({ success: true, sessions: sessionsWithStatus });
    } catch (error) {
        console.error('Error getting sessions:', error);
        res.status(500).json({ error: error.message });
    }
});

// Create new session (Admin only)
app.post('/api/sessions', authenticate, requireAdmin, async (req, res) => {
    try {
        const { sessionId } = req.body;

        if (!sessionId) {
            return res.status(400).json({ error: 'sessionId is required' });
        }

        // Check if session already exists
        const [existing] = await pool.execute(
            'SELECT * FROM sessions WHERE session_id = ?',
            [sessionId]
        );

        if (existing.length > 0 && clients.has(sessionId)) {
            return res.status(400).json({ error: 'Session already exists and is active' });
        }

        // Create client instance
        const client = createClient(sessionId);
        clients.set(sessionId, client);

        // Save to database
        await pool.execute(
            `INSERT INTO sessions (session_id, status) VALUES (?, 'initializing')
             ON DUPLICATE KEY UPDATE status = 'initializing', updated_at = CURRENT_TIMESTAMP`,
            [sessionId]
        );

        sessionStatuses.set(sessionId, 'initializing');

        // Initialize client
        console.log(`🚀 [CREATE SESSION] Starting initialization for session: ${sessionId}`);
        client.initialize().then(() => {
            console.log(`✅ [CREATE SESSION] Client initialization started successfully for: ${sessionId}`);
        }).catch(err => {
            console.error(`❌ [CREATE SESSION] Error initializing session ${sessionId}:`, err);
            console.error(`❌ [CREATE SESSION] Error stack:`, err.stack);
        });

        // Log activity
        await activityLogger.log({
            userId: req.user.id,
            username: req.user.username,
            sessionId: sessionId,
            action: 'create_session',
            resourceType: 'session',
            resourceId: sessionId,
            description: `Created new WhatsApp session: ${sessionId}`,
            ipAddress: req.ip || req.connection.remoteAddress,
            userAgent: req.get('user-agent')
        });

        res.json({
            success: true,
            message: `Session ${sessionId} initialized. QR code will be available shortly.`,
            sessionId
        });
    } catch (error) {
        console.error('Error creating session:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get session details (Admin: any session, User: only their session)
app.get('/api/sessions/:sessionId', authenticate, requireSessionOwner, async (req, res) => {
    try {
        const { sessionId } = req.params;

        const [sessions] = await pool.execute(
            'SELECT * FROM sessions WHERE session_id = ?',
            [sessionId]
        );

        if (sessions.length === 0) {
            return res.status(404).json({ error: 'Session not found' });
        }

        const session = sessions[0];
        const client = clients.get(sessionId);

        res.json({
            success: true,
            session: {
                ...session,
                realtime_status: sessionStatuses.get(sessionId) || session.status,
                is_active: !!client,
                info: client?.info || null
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update session public domain (Admin only)
app.put('/api/sessions/:sessionId/domain', authenticate, requireAdmin, async (req, res) => {
    try {
        const { sessionId } = req.params;
        const { publicDomain } = req.body;

        if (publicDomain !== null && publicDomain !== undefined && typeof publicDomain !== 'string') {
            return res.status(400).json({ error: 'publicDomain must be a string' });
        }

        const normalizedDomain = publicDomain ? publicDomain.trim() : null;

        await pool.execute(
            `UPDATE sessions SET public_domain = ?, updated_at = CURRENT_TIMESTAMP WHERE session_id = ?`,
            [normalizedDomain || null, sessionId]
        );

        // Log activity
        await activityLogger.log({
            userId: req.user.id,
            username: req.user.username,
            sessionId: sessionId,
            action: 'update_session_domain',
            resourceType: 'session',
            resourceId: sessionId,
            description: `Updated public domain for session ${sessionId} to ${normalizedDomain || 'null'}`,
            ipAddress: req.ip || req.connection.remoteAddress,
            userAgent: req.get('user-agent'),
            metadata: {
                publicDomain: normalizedDomain || null
            }
        });

        res.json({ success: true, public_domain: normalizedDomain || null });
    } catch (error) {
        console.error('Error updating session domain:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get QR code (with auto-refresh support)
app.get('/api/sessions/:sessionId/qr', authenticate, async (req, res) => {
    try {
        const { sessionId } = req.params;
        const qrCode = qrCodes.get(sessionId);

        if (!qrCode) {
            // Check database for QR code and expiration
            const [sessions] = await pool.execute(
                'SELECT qr_code, qr_expires_at FROM sessions WHERE session_id = ?',
                [sessionId]
            );
            
            if (sessions.length === 0 || !sessions[0].qr_code) {
                return res.status(404).json({ error: 'QR code not available. Session may be authenticated or not initialized.' });
            }
            
            // Return QR from database
            const session = sessions[0];
            return res.json({
                success: true,
                qrCode: session.qr_code,
                qrExpiresAt: session.qr_expires_at ? new Date(session.qr_expires_at).toISOString() : null
            });
        }

        // Get expiration from database
        const [sessions] = await pool.execute(
            'SELECT qr_expires_at FROM sessions WHERE session_id = ?',
            [sessionId]
        );
        
        const expiresAt = sessions.length > 0 && sessions[0].qr_expires_at 
            ? new Date(sessions[0].qr_expires_at).toISOString()
            : toWIBISOString(new Date(getWIBTime().getTime() + 20000));

        // Generate QR code image
        const qrImage = await qrcode.toDataURL(qrCode);

        res.json({
            success: true,
            qrCode: qrCode,
            qrImage: qrImage,
            qrExpiresAt: expiresAt
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Restart session (stop and reinitialize)
app.post('/api/sessions/:sessionId/restart', authenticate, async (req, res) => {
    try {
        const { sessionId } = req.params;
        console.log(`🔄 [RESTART SESSION] Starting restart for session: ${sessionId}`);
        
        // Check if user has permission (admin or own session)
        if (req.user.role !== 'admin' && req.user.session_id !== sessionId) {
            return res.status(403).json({ error: 'You can only restart your own session' });
        }
        
        const client = clients.get(sessionId);

        if (client) {
            console.log(`🔄 [RESTART SESSION] Destroying existing client for: ${sessionId}`);
            try {
                await client.destroy();
            } catch (err) {
                console.error(`⚠️  [RESTART SESSION] Error destroying client: ${err.message}`);
            }
            clients.delete(sessionId);
            console.log(`🔄 [RESTART SESSION] Client destroyed: ${sessionId}`);
        }

        qrCodes.delete(sessionId);
        sessionStatuses.delete(sessionId);
        console.log(`🔄 [RESTART SESSION] Cleared QR code and status: ${sessionId}`);

        // Update database status
        await pool.execute(
            `UPDATE sessions SET status = 'initializing', updated_at = CURRENT_TIMESTAMP WHERE session_id = ?`,
            [sessionId]
        );

        // Wait a bit before recreating
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Create new client instance
        const newClient = createClient(sessionId);
        clients.set(sessionId, newClient);
        sessionStatuses.set(sessionId, 'initializing');

        // Initialize client
        console.log(`🔄 [RESTART SESSION] Initializing new client for: ${sessionId}`);
        newClient.initialize().then(() => {
            console.log(`✅ [RESTART SESSION] Client initialization started for: ${sessionId}`);
        }).catch(err => {
            console.error(`❌ [RESTART SESSION] Error initializing session ${sessionId}:`, err.message);
            clients.delete(sessionId);
            sessionStatuses.delete(sessionId);
        });

        console.log(`✅ [RESTART SESSION] Session ${sessionId} restart initiated`);
        
        // Log activity
        await activityLogger.log({
            userId: req.user.id,
            username: req.user.username || req.user.session_id,
            sessionId: sessionId,
            action: 'restart_session',
            resourceType: 'session',
            resourceId: sessionId,
            description: `Restarted WhatsApp session: ${sessionId}`,
            ipAddress: req.ip || req.connection.remoteAddress,
            userAgent: req.get('user-agent')
        });
        
        res.json({ 
            success: true, 
            message: `Session ${sessionId} restart initiated. Status will update shortly.`,
            sessionId 
        });
    } catch (error) {
        console.error(`❌ [RESTART SESSION] Error restarting session:`, error);
        res.status(500).json({ error: error.message });
    }
});

// Delete session (Admin only)
app.delete('/api/sessions/:sessionId', authenticate, requireAdmin, async (req, res) => {
    try {
        const { sessionId } = req.params;
        console.log(`🗑️  [DELETE SESSION] Starting deletion for session: ${sessionId}`);
        
        const client = clients.get(sessionId);

        if (client) {
            console.log(`🗑️  [DELETE SESSION] Destroying WhatsApp client for: ${sessionId}`);
            await client.destroy();
            clients.delete(sessionId);
            console.log(`🗑️  [DELETE SESSION] Client destroyed and removed from memory: ${sessionId}`);
        } else {
            console.log(`🗑️  [DELETE SESSION] No active client found for: ${sessionId}`);
        }

        qrCodes.delete(sessionId);
        sessionStatuses.delete(sessionId);
        console.log(`🗑️  [DELETE SESSION] Removed QR code and status from memory: ${sessionId}`);

        // Delete from database (cascade will delete related records)
        const [result] = await pool.execute('DELETE FROM sessions WHERE session_id = ?', [sessionId]);
        console.log(`🗑️  [DELETE SESSION] Deleted from database (affected rows: ${result.affectedRows}): ${sessionId}`);

        // Delete session folder
        const sessionAuthDir = path.join(process.cwd(), '.wwebjs_auth', `session-${sessionId}`);
        try {
            await fs.rm(sessionAuthDir, { recursive: true, force: true });
            console.log(`🗑️  [DELETE SESSION] Deleted session folder: ${sessionAuthDir}`);
        } catch (err) {
            console.log(`⚠️  [DELETE SESSION] Error deleting session folder (may not exist): ${err.message}`);
        }

        console.log(`✅ [DELETE SESSION] Session ${sessionId} deleted successfully`);
        
        // Log activity
        await activityLogger.log({
            userId: req.user.id,
            username: req.user.username,
            sessionId: sessionId,
            action: 'delete_session',
            resourceType: 'session',
            resourceId: sessionId,
            description: `Deleted WhatsApp session: ${sessionId}`,
            ipAddress: req.ip || req.connection.remoteAddress,
            userAgent: req.get('user-agent')
        });
        
        res.json({ success: true, message: `Session ${sessionId} deleted successfully` });
    } catch (error) {
        console.error(`❌ [DELETE SESSION] Error deleting session ${req.params.sessionId}:`, error);
        res.status(500).json({ error: error.message });
    }
});

// Get session status (real-time)
app.get('/api/sessions/:sessionId/status', authenticate, async (req, res) => {
    try {
        const { sessionId } = req.params;
        const client = clients.get(sessionId);

        if (!client) {
            return res.status(404).json({ error: 'Session not found' });
        }

        const status = sessionStatuses.get(sessionId) || 'unknown';

        res.json({
            success: true,
            sessionId,
            status,
            isReady: status === 'ready',
            info: client.info || null
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// MENU PERMISSIONS ENDPOINTS (Admin only)
// ============================================

// Get all users (Admin only)
app.get('/api/users', authenticate, requireAdmin, async (req, res) => {
    try {
        const [users] = await pool.execute(
            `SELECT id, username, role, session_id, phone_number, created_at 
             FROM users 
             ORDER BY created_at DESC`
        );
        res.json({ success: true, users });
    } catch (error) {
        console.error('Error getting users:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get menu permissions for a user
app.get('/api/users/:userId/menu-permissions', authenticate, requireAdmin, async (req, res) => {
    try {
        const { userId } = req.params;
        const [permissions] = await pool.execute(
            'SELECT menu_path, is_visible FROM user_menu_permissions WHERE user_id = ?',
            [userId]
        );
        res.json({ success: true, permissions });
    } catch (error) {
        console.error('Error getting menu permissions:', error);
        res.status(500).json({ error: error.message });
    }
});

// Update menu permissions for a user
app.put('/api/users/:userId/menu-permissions', authenticate, requireAdmin, async (req, res) => {
    try {
        const { userId } = req.params;
        const { permissions } = req.body; // Array of { menu_path, is_visible }

        if (!Array.isArray(permissions)) {
            return res.status(400).json({ error: 'permissions must be an array' });
        }

        // Delete existing permissions for this user
        await pool.execute('DELETE FROM user_menu_permissions WHERE user_id = ?', [userId]);

        // Insert new permissions
        if (permissions.length > 0) {
            const values = permissions.map(p => [userId, p.menu_path, p.is_visible]);
            await pool.query(
                'INSERT INTO user_menu_permissions (user_id, menu_path, is_visible) VALUES ?',
                [values]
            );
        }

        // Log activity
        await activityLogger.log({
            userId: req.user.id,
            username: req.user.username,
            action: 'update_menu_permissions',
            resourceType: 'user',
            resourceId: userId.toString(),
            description: `Updated menu permissions for user ID ${userId}`,
            ipAddress: req.ip || req.connection.remoteAddress,
            userAgent: req.get('user-agent'),
            metadata: {
                targetUserId: userId,
                permissionsCount: permissions.length
            }
        });

        res.json({ success: true, message: 'Menu permissions updated successfully' });
    } catch (error) {
        console.error('Error updating menu permissions:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get current user's menu permissions
app.get('/api/auth/menu-permissions', authenticate, async (req, res) => {
    try {
        const userId = req.user.id;
        const [permissions] = await pool.execute(
            'SELECT menu_path, is_visible FROM user_menu_permissions WHERE user_id = ?',
            [userId]
        );
        
        // Convert to object for easier lookup (normalize to boolean)
        const permissionsMap = {};
        permissions.forEach(p => {
            permissionsMap[p.menu_path] = !!p.is_visible;
        });

        res.json({ success: true, permissions: permissionsMap });
    } catch (error) {
        console.error('Error getting menu permissions:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// MESSAGE ENDPOINTS
// ============================================

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: async (req, file, cb) => {
        const sessionId = req.body.sessionId || 'default';
        const today = getWIBToday();
        const uploadDir = path.join(process.env.ATTACHMENTS_DIR || './attachments', today, sessionId);
        await fs.mkdir(uploadDir, { recursive: true });
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueName = `${getWIBTimestamp()}_${file.originalname}`;
        cb(null, uniqueName);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
    // Ensure multer parses fields even without files
    preservePath: true
});

// Create a custom multer instance that always parses fields
// Use .fields() to explicitly handle both fields and files
const uploadWithFields = multer({
    storage: storage,
    limits: { fileSize: 50 * 1024 * 1024 },
    preservePath: true
}).fields([
    { name: 'sessionId', maxCount: 1 },
    { name: 'phone', maxCount: 1 },
    { name: 'message', maxCount: 1 },
    { name: 'caption', maxCount: 1 },
    { name: 'attachment', maxCount: 1 }
]);

// Also keep the original upload.any() as fallback

// Send message (text or attachment)
// Handle both JSON (no attachment) and FormData (with attachment)
app.post('/api/messages/send', authenticate, (req, res, next) => {
    console.log(`\n🚀🚀🚀 [SERVER] ==========================================`);
    console.log(`🚀 [SERVER] POST /api/messages/send - REQUEST RECEIVED`);
    console.log(`🚀 [SERVER] Started at: ${formatWIBDisplay(getWIBTime())} (WIB)`);
    console.log(`🚀 [SERVER] Timezone: ${process.env.TZ || 'UTC'}`);
    console.log(`🚀 [SERVER] ==========================================\n`);
    
    const contentType = req.headers['content-type'] || '';
    console.log(`🔍 [MIDDLEWARE] ==========================================`);
    console.log(`🔍 [MIDDLEWARE] Content-Type: ${contentType}`);
    console.log(`🔍 [MIDDLEWARE] Method: ${req.method}`);
    console.log(`🔍 [MIDDLEWARE] URL: ${req.url}`);
    console.log(`🔍 [MIDDLEWARE] Headers:`, JSON.stringify(req.headers, null, 2));
    console.log(`🔍 [MIDDLEWARE] Body before parsing:`, req.body);
    console.log(`🔍 [MIDDLEWARE] ==========================================`);
    
    if (contentType.includes('multipart/form-data')) {
        console.log(`📦 [MULTER] Detected multipart/form-data, using multer...`);
        // Use .fields() to explicitly parse both fields and files
        uploadWithFields(req, res, (err) => {
            if (err) {
                console.error(`❌ [MULTER ERROR]:`, err);
                console.error(`❌ [MULTER ERROR] Stack:`, err.stack);
                return res.status(400).json({ error: 'File upload error: ' + err.message });
                    }
            
            // Handle files from req.files (multer.fields() returns object with field names as keys)
            if (req.files && typeof req.files === 'object') {
                // Convert files object to array for easier handling
                const filesArray = [];
                Object.keys(req.files).forEach(fieldname => {
                    if (Array.isArray(req.files[fieldname])) {
                        filesArray.push(...req.files[fieldname]);
                    } else {
                        filesArray.push(req.files[fieldname]);
                    }
                });
                req.files = filesArray;
            }
            
            // Log parsed data
            console.log(`✅ [MULTER] Parsed FormData:`, {
                bodyKeys: Object.keys(req.body || {}),
                bodyValues: req.body,
                sessionId: req.body?.sessionId,
                phone: req.body?.phone,
                message: req.body?.message,
                caption: req.body?.caption,
                filesCount: req.files ? (Array.isArray(req.files) ? req.files.length : Object.keys(req.files).length) : 0,
                files: req.files ? (Array.isArray(req.files) ? req.files.map(f => ({ fieldname: f.fieldname, originalname: f.originalname })) : 'not array') : 'no files'
            });
            
            // Verify required fields are present
            if (!req.body?.sessionId || !req.body?.phone) {
                console.error(`❌ [MULTER] Missing required fields after parsing:`, {
                    hasSessionId: !!req.body?.sessionId,
                    hasPhone: !!req.body?.phone,
                    bodyKeys: Object.keys(req.body || {}),
                    bodyRaw: JSON.stringify(req.body),
                    contentType: req.headers['content-type']
                });
            }
            
            next();
        });
    } else {
        // For JSON requests, body should already be parsed by express.json()
        // But let's verify it's there
        console.log(`✅ [MIDDLEWARE] Using JSON parser (not multipart)`);
        console.log(`✅ [MIDDLEWARE] Body keys:`, Object.keys(req.body || {}));
        console.log(`✅ [MIDDLEWARE] Body content:`, req.body);
        next();
    }
}, async (req, res) => {
    try {
        // For FormData: multer populates req.body and req.files
        // For JSON: express.json() populates req.body
        // multer.none() and multer.any() both return fields as strings in req.body
        const sessionId = req.body?.sessionId?.trim();
        const phone = req.body?.phone?.trim();
        const message = req.body?.message?.trim();
        const caption = req.body?.caption?.trim() || null; // Explicitly handle caption
        
        // Handle files - multer.fields() returns object, multer.any() returns array
        let file = null;
        if (req.files) {
            if (Array.isArray(req.files)) {
                // From multer.any() - array of files
            file = req.files.find(f => f.fieldname === 'attachment') || req.files[0];
            } else if (typeof req.files === 'object') {
                // From multer.fields() - object with field names as keys
                if (req.files.attachment && Array.isArray(req.files.attachment) && req.files.attachment.length > 0) {
                    file = req.files.attachment[0];
                } else {
                    // Find first file in any field
                    const fileFields = Object.keys(req.files);
                    for (const fieldName of fileFields) {
                        if (Array.isArray(req.files[fieldName]) && req.files[fieldName].length > 0) {
                            file = req.files[fieldName][0];
                            break;
                        }
                    }
                }
            }
        }

        console.log(`📤 [SEND MESSAGE] ==========================================`);
        console.log(`📤 [SEND MESSAGE] Request received:`);
        console.log(`📤 [SEND MESSAGE]   sessionId: ${sessionId} (type: ${typeof sessionId}, exists: ${!!sessionId})`);
        console.log(`📤 [SEND MESSAGE]   phone: ${phone} (type: ${typeof phone}, exists: ${!!phone})`);
        console.log(`📤 [SEND MESSAGE]   message: ${message ? message.substring(0, 50) + '...' : 'null'} (type: ${typeof message})`);
        console.log(`📤 [SEND MESSAGE]   caption: ${caption || 'null'}`);
        console.log(`📤 [SEND MESSAGE]   hasFile: ${!!file}`);
        console.log(`📤 [SEND MESSAGE]   bodyKeys: [${Object.keys(req.body || {}).join(', ')}]`);
        console.log(`📤 [SEND MESSAGE]   contentType: ${req.headers['content-type']}`);
        console.log(`📤 [SEND MESSAGE] ==========================================`);

        // Validate required fields with better error messages
        if (!sessionId || !phone) {
            const missingFields = [];
            if (!sessionId) missingFields.push('sessionId');
            if (!phone) missingFields.push('phone');
            
            console.error(`❌ [SEND MESSAGE] Missing required fields: ${missingFields.join(', ')}`);
            console.error(`❌ [SEND MESSAGE]   req.body:`, JSON.stringify(req.body, null, 2));
            console.error(`❌ [SEND MESSAGE]   contentType: ${req.headers['content-type']}`);
            console.error(`❌ [SEND MESSAGE]   body keys:`, Object.keys(req.body || {}));
            
            return res.status(400).json({ 
                error: `Missing required fields: ${missingFields.join(', ')}`,
                received: {
                    sessionId: sessionId || null,
                    phone: phone || null,
                    bodyKeys: Object.keys(req.body || {})
                }
            });
        }

        const client = clients.get(sessionId);
        if (!client) {
            return res.status(404).json({ error: 'Session not found' });
        }

        const chatId = phone.includes('@') ? phone : `${phone}@c.us`;
        let sentMessage;

        // Send with attachment
        if (file) {
            console.log(`📎 [SEND MESSAGE] Preparing to send attachment:`, {
                filename: file.filename,
                mimetype: file.mimetype,
                size: file.size,
                path: file.path
            });
            
            let media;
            const fsSync = require('fs');
            try {
                media = MessageMedia.fromFilePath(file.path);
            } catch (mediaError) {
                console.error(`❌ [SEND MESSAGE] Error creating MessageMedia from file path:`, mediaError.message);
                // Try reading file and creating from buffer instead
                try {
                    const fileBuffer = fsSync.readFileSync(file.path);
                    const base64 = fileBuffer.toString('base64');
                    media = new MessageMedia(file.mimetype, base64, file.filename);
                    console.log(`✅ [SEND MESSAGE] Created MessageMedia from buffer instead`);
                } catch (bufferError) {
                    console.error(`❌ [SEND MESSAGE] Error creating MessageMedia from buffer:`, bufferError.message);
                    throw new Error(`Failed to create media object: ${bufferError.message}`);
                }
            }
            
            // If there's text with attachment, use it as caption
            // Priority: caption field > message field
            const mediaCaption = caption || message || null;
            const fileType = file.mimetype ? file.mimetype.split('/')[0] : 'unknown';
            const isImageOrVideo = fileType === 'image' || fileType === 'video';
            
            console.log(`📎 [SEND MESSAGE] Attachment caption:`, {
                caption: caption || 'null',
                message: message || 'null',
                mediaCaption: mediaCaption || 'null',
                fileType: fileType,
                mimetype: file.mimetype,
                isImageOrVideo: isImageOrVideo,
                willSetCaption: !!mediaCaption && isImageOrVideo
            });

            // WhatsApp only supports caption for images and videos
            // For documents/PDF, we need to send as separate message
            if (mediaCaption && isImageOrVideo) {
                media.caption = mediaCaption;
                console.log(`✅ [SEND MESSAGE] Caption set on media (${fileType}): "${mediaCaption.substring(0, 50)}${mediaCaption.length > 50 ? '...' : ''}"`);
                // Verify caption is actually set
                console.log(`✅ [SEND MESSAGE] Caption verification:`, {
                    hasCaption: !!media.caption,
                    captionValue: media.caption || 'null',
                    captionLength: media.caption ? media.caption.length : 0
                });
            } else if (mediaCaption && !isImageOrVideo) {
                console.log(`ℹ️ [SEND MESSAGE] Caption not supported for ${fileType} (${file.mimetype}). Will send text as separate message after media.`);
                // For documents/PDF, we'll send text as separate message after media
            } else {
                console.log(`⚠️ [SEND MESSAGE] No caption provided for attachment`);
            }

            // Retry mechanism for detached frame errors
            let retries = 3;
            let lastError = null;
            while (retries > 0) {
                try {
                    console.log(`📤 [SEND MESSAGE] Attempting to send message (${4 - retries}/3)...`);
                    // Ensure caption is set before each attempt
                    if (mediaCaption && !media.caption) {
                        media.caption = mediaCaption;
                        console.log(`🔄 [SEND MESSAGE] Re-setting caption before send: "${mediaCaption.substring(0, 50)}${mediaCaption.length > 50 ? '...' : ''}"`);
                    }
                    sentMessage = await client.sendMessage(chatId, media);
                    console.log(`✅ [SEND MESSAGE] Message sent successfully with caption: ${media.caption ? 'YES' : 'NO'}`);
                    break;
                } catch (sendError) {
                    lastError = sendError;
                    const isDetachedFrameError = sendError.message && (
                        sendError.message.includes('detached Frame') ||
                        sendError.message.includes('detached frame') ||
                        sendError.message.includes('Target closed') ||
                        sendError.message.includes('Session closed')
                    );
                    
                    if (isDetachedFrameError) {
                        console.error(`❌ [SEND MESSAGE] Detached frame error (attempt ${4 - retries}/3):`, sendError.message);
                        retries--;
                        if (retries > 0) {
                            // Wait longer before retry (3 seconds for PDF)
                            const waitTime = file.mimetype && file.mimetype.includes('pdf') ? 3000 : 2000;
                            console.log(`⏳ [SEND MESSAGE] Waiting ${waitTime}ms before retry...`);
                            await new Promise(resolve => setTimeout(resolve, waitTime));
                            
                            // Always recreate media object from buffer for retry (more reliable)
                            try {
                                console.log(`🔄 [SEND MESSAGE] Recreating media object from buffer...`);
                                const fileBuffer = fsSync.readFileSync(file.path);
                                const base64 = fileBuffer.toString('base64');
                                media = new MessageMedia(file.mimetype, base64, file.filename);
                                // CRITICAL: Re-set caption after recreating media
                                if (mediaCaption) {
                                    media.caption = mediaCaption;
                                    console.log(`✅ [SEND MESSAGE] Recreated media with caption: "${mediaCaption.substring(0, 50)}${mediaCaption.length > 50 ? '...' : ''}"`);
                                } else {
                                    console.log(`⚠️ [SEND MESSAGE] Recreated media without caption`);
                                }
                            } catch (recreateError) {
                                console.error(`❌ [SEND MESSAGE] Error recreating media:`, recreateError.message);
                                // Continue anyway, try with existing media
                            }
                        } else {
                            console.error(`❌ [SEND MESSAGE] All retry attempts exhausted`);
                        }
                    } else {
                        // Not a detached frame error, don't retry
                        console.error(`❌ [SEND MESSAGE] Non-retryable error:`, sendError.message);
                        throw sendError;
                    }
                }
            }
            
            if (!sentMessage && lastError) {
                console.error(`❌ [SEND MESSAGE] Failed after all retries:`, lastError.message);
                throw lastError;
            }
        } else {
            // Send text message
            if (!message) {
                return res.status(400).json({ error: 'message is required when no attachment' });
            }
            sentMessage = await client.sendMessage(chatId, message);
        }

        // Save message to database FIRST (before attachment to satisfy foreign key constraint)
        // We store created_at/updated_at as WIB wall-clock time (DATETIME after migration).
        const attachmentUrl = file ? buildAttachmentUrl(file.path) : null;
        // Count: session_id(1), message_id(2), from_number(3), to_number(4), contact_id(5), message_type(6), body(7), caption(8), timestamp(9), attachment_path(10), attachment_url(11) = 11 params
        const [result] = await pool.execute(
            `INSERT INTO messages 
             (session_id, message_id, from_number, to_number, contact_id, direction, fromAI, message_type, body, caption, status, timestamp, attachment_path, attachment_url, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, 'outgoing', 1, ?, ?, ?, 'sent', ?, ?, ?, NOW(), NOW())`,
            [
                sessionId,
                sentMessage.id._serialized,
                null, // from_number for outgoing
                phone,
                chatId,
                file ? file.mimetype.split('/')[0] : 'text', // message_type
                // For attachment: use caption if exists, otherwise message. For text: use message
                file ? (caption || message || '') : (message || ''), // body
                // Caption field: only set if there's attachment and caption exists
                file ? (caption || message || null) : null, // caption
                getWIBTimestamp(), // timestamp
                file ? file.path : null, // attachment_path
                attachmentUrl // attachment_url
            ]
        );

        // Save attachment to database AFTER message is saved (to satisfy foreign key constraint)
        if (file) {
            try {
                await pool.execute(
                    `INSERT INTO attachments (message_id, session_id, file_name, file_path, file_type, mime_type, file_size)
                     VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [
                        sentMessage.id._serialized,
                        sessionId,
                        file.filename,
                        file.path,
                        file.mimetype.split('/')[0],
                        file.mimetype,
                        file.size
                    ]
                );
                console.log(`✅ [SEND MESSAGE] Attachment saved to database`);
            } catch (attachmentError) {
                console.error(`❌ [SEND MESSAGE] Error saving attachment:`, attachmentError);
                // Don't fail the whole request if attachment save fails
                // Message is already sent and saved
            }
        }

        // Save status history
        await pool.execute(
            `INSERT INTO message_status_history (message_id, status) VALUES (?, 'sent')`,
            [sentMessage.id._serialized]
        );

        // Emit via WebSocket
        socketHandler.emitMessageStatus(sentMessage.id._serialized, 'sent', sessionId);

        // Log activity (don't log message content - already in messages table)
        await activityLogger.log({
            userId: req.user.id,
            username: req.user.username || req.user.session_id,
            sessionId: sessionId,
            action: 'send_message',
            resourceType: 'message',
            resourceId: sentMessage.id._serialized,
            description: `Sent ${file ? file.mimetype.split('/')[0] : 'text'} message to ${phone}`,
            ipAddress: req.ip || req.connection.remoteAddress,
            userAgent: req.get('user-agent'),
            metadata: {
                to: phone,
                hasAttachment: !!file,
                messageType: file ? file.mimetype.split('/')[0] : 'text'
            }
        });

        res.json({
            success: true,
            messageId: sentMessage.id._serialized,
            status: 'sent',
            timestamp: sentMessage.timestamp
        });
    } catch (error) {
        console.error('Error sending message:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get sent messages list
app.get('/api/messages', authenticate, async (req, res) => {
    try {
        const { sessionId, limit = 50, offset = 0, includeDeleted = false, direction } = req.query;
        const limitNum = parseInt(limit) || 50;
        const offsetNum = parseInt(offset) || 0;

        let query = `
            SELECT m.*, a.file_name, a.file_path, a.file_type, m.attachment_url
            FROM messages m
            LEFT JOIN attachments a ON a.message_id = m.message_id
            WHERE 1=1
        `;
        const params = [];

        const directionFilter = direction || 'outgoing';
        if (directionFilter !== 'all') {
            query += ' AND m.direction = ?';
            params.push(directionFilter);
        }

        if (sessionId) {
            query += ' AND m.session_id = ?';
            params.push(sessionId);
        }

        if (includeDeleted !== 'true') {
            query += ' AND (m.is_deleted = FALSE OR m.is_deleted IS NULL) AND (m.is_retracted = FALSE OR m.is_retracted IS NULL)';
        }

        query += ` ORDER BY m.timestamp DESC LIMIT ${limitNum} OFFSET ${offsetNum}`;

        const [messages] = await pool.execute(query, params);

        // Get status history, reactions, and replies for each message
        const messagesWithDetails = await Promise.all(
            messages.map(async (msg) => {
                const [history] = await pool.execute(
                    'SELECT status, changed_at FROM message_status_history WHERE message_id = ? ORDER BY changed_at DESC',
                    [msg.message_id]
                );

                // Get reactions
                let reactions = [];
                try {
                    const [reactionsData] = await pool.execute(
                    `SELECT reaction_emoji, reaction_text, from_number, timestamp, created_at
                    FROM message_reactions WHERE message_id = ? ORDER BY created_at DESC`,
                    [msg.message_id]
                );
                    reactions = reactionsData || [];
                } catch (error) {
                    console.warn('⚠️ [MESSAGES] Error fetching reactions (table may not exist):', error.message);
                    reactions = [];
                }

                // Get reply info if exists
                let replyToMessage = null;
                if (msg.reply_to_message_id) {
                    try {
                    const [replies] = await pool.execute(
                        `SELECT message_id, body, caption, message_type, from_number, timestamp
                        FROM messages WHERE message_id = ?`,
                        [msg.reply_to_message_id]
                    );
                    replyToMessage = replies[0] || null;
                    } catch (error) {
                        console.warn('⚠️ [MESSAGES] Error fetching reply message:', error.message);
                        replyToMessage = null;
                    }
                }

                return {
                    ...msg,
                    statusHistory: history,
                    reactions: reactions,
                    replyToMessage: replyToMessage
                };
            })
        );

        res.json({ success: true, messages: messagesWithDetails });
    } catch (error) {
        console.error('Error getting messages:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get message status
app.get('/api/messages/:messageId/status', authenticate, async (req, res) => {
    try {
        const { messageId } = req.params;

        const [messages] = await pool.execute(
            'SELECT * FROM messages WHERE message_id = ?',
            [messageId]
        );

        if (messages.length === 0) {
            return res.status(404).json({ error: 'Message not found' });
        }

        const [history] = await pool.execute(
            'SELECT * FROM message_status_history WHERE message_id = ? ORDER BY changed_at DESC',
            [messageId]
        );

        // Get reactions
        let reactions = [];
        try {
            const [reactionsData] = await pool.execute(
            `SELECT reaction_emoji, reaction_text, from_number, timestamp, created_at
            FROM message_reactions WHERE message_id = ? ORDER BY created_at DESC`,
            [messageId]
        );
            reactions = reactionsData || [];
        } catch (error) {
            console.warn('⚠️ [STATUS] Error fetching reactions (table may not exist):', error.message);
            reactions = [];
        }

        res.json({
            success: true,
            message: messages[0],
            statusHistory: history,
            reactions: reactions
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get message reactions
app.get('/api/messages/:messageId/reactions', authenticate, async (req, res) => {
    try {
        const { messageId } = req.params;

        try {
        const [reactions] = await pool.execute(
            `SELECT reaction_emoji, reaction_text, from_number, timestamp, created_at
            FROM message_reactions WHERE message_id = ? ORDER BY created_at DESC`,
            [messageId]
        );

            res.json({ success: true, reactions: reactions || [] });
        } catch (dbError) {
            // If table doesn't exist or query fails, return empty array
            console.warn('⚠️ [REACTIONS] Error fetching reactions (table may not exist):', dbError.message);
            res.json({ success: true, reactions: [] });
        }
    } catch (error) {
        console.error('❌ [REACTIONS] Error in reactions endpoint:', error);
        res.status(500).json({ 
            error: error.message,
            details: 'Failed to fetch message reactions. The message_reactions table may not exist.'
        });
    }
});

// Get message replies
app.get('/api/messages/:messageId/replies', authenticate, async (req, res) => {
    try {
        const { messageId } = req.params;
        console.log(`📬 [REPLIES] Fetching replies for message: ${messageId}`);

        // Check if message_replies table exists
        try {
            // Try to get replies
        const [replies] = await pool.execute(
            `SELECT m.*, a.file_name, a.file_path, a.file_type
            FROM message_replies mr
            JOIN messages m ON m.message_id = mr.message_id
            LEFT JOIN attachments a ON a.message_id = m.message_id
            WHERE mr.reply_to_message_id = ?
            ORDER BY m.timestamp DESC`,
            [messageId]
        );

            console.log(`✅ [REPLIES] Found ${replies.length} replies`);
            return res.json({ success: true, replies: replies || [] });
        } catch (dbError) {
            // If table doesn't exist or query fails, return empty array
            console.warn('⚠️ [REPLIES] Error fetching replies (table may not exist):', dbError.message);
            console.warn('⚠️ [REPLIES] Error code:', dbError.code);
            console.warn('⚠️ [REPLIES] Error SQL state:', dbError.sqlState);
            // Always return 200 with empty array instead of error
            return res.json({ success: true, replies: [] });
        }
    } catch (error) {
        // Catch any other errors and still return 200 with empty array
        console.error('❌ [REPLIES] Error in replies endpoint:', error);
        console.error('❌ [REPLIES] Error stack:', error.stack);
        // Return 200 with empty array instead of 500 to prevent frontend errors
        return res.json({ success: true, replies: [] });
    }
});

// Get deleted/retracted messages
app.get('/api/messages/deleted', authenticate, async (req, res) => {
    try {
        const { sessionId, limit = 50, offset = 0, type } = req.query;
        const limitNum = parseInt(limit) || 50;
        const offsetNum = parseInt(offset) || 0;

        let query = `
            SELECT m.*, a.file_name, a.file_path, a.file_type,
            dml.deletion_type, dml.deleted_at, dml.body_preview
            FROM messages m
            LEFT JOIN attachments a ON a.message_id = m.message_id
            LEFT JOIN deleted_messages_log dml ON dml.message_id = m.message_id
            WHERE (m.is_deleted = TRUE OR m.is_retracted = TRUE)
        `;
        const params = [];

        if (sessionId) {
            query += ' AND m.session_id = ?';
            params.push(sessionId);
        }

        if (type === 'deleted') {
            query += ' AND m.is_deleted = TRUE';
        } else if (type === 'retracted') {
            query += ' AND m.is_retracted = TRUE';
        }

        query += ` ORDER BY m.deleted_at DESC, m.retracted_at DESC LIMIT ${limitNum} OFFSET ${offsetNum}`;

        const [messages] = await pool.execute(query, params);

        res.json({ success: true, messages });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Send typing signal
app.post('/api/messages/typing', authenticate, async (req, res) => {
    try {
        const { sessionId, phone } = req.body;

        if (!sessionId || !phone) {
            return res.status(400).json({ error: 'sessionId and phone are required' });
        }

        const client = clients.get(sessionId);
        if (!client) {
            return res.status(404).json({ error: 'Session not found' });
        }

        const chatId = phone.includes('@') ? phone : `${phone}@c.us`;
        const chat = await client.getChatById(chatId);
        await chat.sendStateTyping();

        res.json({ success: true, message: 'Typing signal sent' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// STATUS & STORIES ENDPOINTS
// ============================================

// Set status message
app.post('/api/status/set', authenticate, upload.single('attachment'), async (req, res) => {
    try {
        const { sessionId, message } = req.body;
        const file = req.file;

        if (!sessionId) {
            return res.status(400).json({ error: 'sessionId is required' });
        }

        const client = clients.get(sessionId);
        if (!client) {
            return res.status(404).json({ error: 'Session not found' });
        }

        const statusId = 'status@broadcast';

        if (file) {
            const media = MessageMedia.fromFilePath(file.path);
            if (message) media.caption = message;
            await client.sendMessage(statusId, media);
        } else {
            if (!message) {
                return res.status(400).json({ error: 'message is required when no attachment' });
            }
            await client.sendMessage(statusId, message);
        }

        res.json({ success: true, message: 'Status updated successfully' });
    } catch (error) {
        console.error('Error setting status:', error);
        res.status(500).json({ error: error.message });
    }
});

// Set story (same as status, but can be used separately)
app.post('/api/stories/set', authenticate, upload.single('attachment'), async (req, res) => {
    try {
        const { sessionId, message } = req.body;
        const file = req.file;

        if (!sessionId) {
            return res.status(400).json({ error: 'sessionId is required' });
        }

        if (!file && !message) {
            return res.status(400).json({ error: 'Either attachment or message is required' });
        }

        const client = clients.get(sessionId);
        if (!client) {
            return res.status(404).json({ error: 'Session not found' });
        }

        const statusId = 'status@broadcast';

        if (file) {
            const media = MessageMedia.fromFilePath(file.path);
            if (message) media.caption = message;
            await client.sendMessage(statusId, media);
        } else {
            await client.sendMessage(statusId, message);
        }

        res.json({ success: true, message: 'Story posted successfully' });
    } catch (error) {
        console.error('Error setting story:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// BROADCAST ENDPOINTS
// ============================================

// Get broadcast lists
app.get('/api/broadcast/lists', authenticate, async (req, res) => {
    try {
        const { sessionId } = req.query;

        let query = 'SELECT * FROM broadcast_lists';
        const params = [];

        if (sessionId) {
            query += ' WHERE session_id = ?';
            params.push(sessionId);
        }

        query += ' ORDER BY created_at DESC';

        const [lists] = await pool.execute(query, params);

        res.json({ success: true, lists });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Create broadcast list
app.post('/api/broadcast/lists', authenticate, async (req, res) => {
    try {
        const { sessionId, listName, description, recipients } = req.body;

        if (!sessionId || !listName || !recipients || !Array.isArray(recipients)) {
            return res.status(400).json({ error: 'sessionId, listName, and recipients array are required' });
        }

        const [result] = await pool.execute(
            `INSERT INTO broadcast_lists (session_id, list_name, description, recipient_count)
             VALUES (?, ?, ?, ?)`,
            [sessionId, listName, description || null, recipients.length]
        );

        const broadcastListId = result.insertId;

        // Insert recipients
        const recipientPromises = recipients.map(recipient => {
            return pool.execute(
                `INSERT INTO broadcast_recipients (broadcast_list_id, contact_id, phone_number, name)
                 VALUES (?, ?, ?, ?)`,
                [
                    broadcastListId,
                    recipient.contactId || recipient.phone,
                    recipient.phoneNumber || recipient.phone,
                    recipient.name || null
                ]
            );
        });

        await Promise.all(recipientPromises);

        res.json({
            success: true,
            broadcastListId,
            message: 'Broadcast list created successfully'
        });
    } catch (error) {
        console.error('Error creating broadcast list:', error);
        res.status(500).json({ error: error.message });
    }
});

// Send broadcast message
app.post('/api/broadcast/send', authenticate, upload.single('attachment'), async (req, res) => {
    try {
        const sessionId = req.body?.sessionId?.trim();
        const broadcastListId = req.body?.broadcastListId?.trim();
        const message = req.body?.message?.trim() || null;
        const caption = req.body?.caption?.trim() || null;
        const file = req.file;

        if (!sessionId || !broadcastListId) {
            return res.status(400).json({ error: 'sessionId and broadcastListId are required' });
        }

        if (!file && !message) {
            return res.status(400).json({ error: 'Either attachment or message is required' });
        }

        const client = clients.get(sessionId);
        if (!client) {
            return res.status(404).json({ error: 'Session not found' });
        }

        // Get recipients
        const [recipients] = await pool.execute(
            'SELECT * FROM broadcast_recipients WHERE broadcast_list_id = ?',
            [broadcastListId]
        );

        if (recipients.length === 0) {
            return res.status(400).json({ error: 'No recipients found in broadcast list' });
        }

        // Create broadcast message record
        const [broadcastResult] = await pool.execute(
            `INSERT INTO broadcast_messages 
             (broadcast_list_id, session_id, message_type, body, attachment_path, total_recipients, status)
             VALUES (?, ?, ?, ?, ?, ?, 'sending')`,
            [
                broadcastListId,
                sessionId,
                file ? file.mimetype.split('/')[0] : 'text',
                message || '',
                file ? file.path : null,
                recipients.length
            ]
        );

        const broadcastMessageId = broadcastResult.insertId;
        console.log(`📢 [BROADCAST] Starting broadcast ${broadcastMessageId} to ${recipients.length} recipients`);

        // Send messages
        let sentCount = 0;
        let failedCount = 0;

        for (const recipient of recipients) {
            try {
                const chatId = recipient.contact_id.includes('@') 
                    ? recipient.contact_id 
                    : `${recipient.phone_number || recipient.contact_id}@c.us`;

                let sentMessage;

                if (file) {
                    let media;
                    const fsSync = require('fs');
                    try {
                        media = MessageMedia.fromFilePath(file.path);
                    } catch (mediaError) {
                        console.error(`❌ [BROADCAST] Error creating MessageMedia from file path:`, mediaError.message);
                        // Fallback to buffer-based creation
                        try {
                            const fileBuffer = fsSync.readFileSync(file.path);
                            const base64 = fileBuffer.toString('base64');
                            media = new MessageMedia(file.mimetype, base64, file.filename);
                            console.log(`✅ [BROADCAST] Created MessageMedia from buffer`);
                        } catch (bufferError) {
                            console.error(`❌ [BROADCAST] Error creating MessageMedia from buffer:`, bufferError.message);
                            throw new Error(`Failed to create media object: ${bufferError.message}`);
                        }
                    }
                    
                    // Use caption if provided, otherwise use message
                    // Priority: caption > message
                    const mediaCaption = caption || message || null;
                    console.log(`📢 [BROADCAST] Sending to ${chatId}:`, {
                        hasFile: true,
                        filename: file.filename,
                        mimetype: file.mimetype,
                        caption: caption || 'null',
                        message: message || 'null',
                        mediaCaption: mediaCaption || 'null',
                        willSetCaption: !!mediaCaption
                    });
                    if (mediaCaption) {
                        media.caption = mediaCaption;
                        console.log(`✅ [BROADCAST] Caption set: "${mediaCaption.substring(0, 50)}${mediaCaption.length > 50 ? '...' : ''}"`);
                    }
                    
                    // Retry mechanism for detached frame errors
                    let retries = 3;
                    let lastError = null;
                    while (retries > 0) {
                        try {
                    sentMessage = await client.sendMessage(chatId, media);
                            break;
                        } catch (sendError) {
                            lastError = sendError;
                            if (sendError.message && sendError.message.includes('detached Frame')) {
                                console.error(`❌ [BROADCAST] Detached frame error, retrying... (${retries} attempts left)`);
                                retries--;
                                if (retries > 0) {
                                    await new Promise(resolve => setTimeout(resolve, 2000));
                                    // Recreate media object
                                    try {
                                        const fileBuffer = fsSync.readFileSync(file.path);
                                        const base64 = fileBuffer.toString('base64');
                                        media = new MessageMedia(file.mimetype, base64, file.filename);
                                        if (mediaCaption) media.caption = mediaCaption;
                                        console.log(`🔄 [BROADCAST] Recreated media object for retry`);
                                    } catch (recreateError) {
                                        console.error(`❌ [BROADCAST] Error recreating media:`, recreateError.message);
                                    }
                                }
                } else {
                                throw sendError;
                            }
                        }
                    }
                    
                    if (!sentMessage && lastError) {
                        throw lastError;
                    }
                } else {
                    if (!message) {
                        throw new Error('Message is required when no attachment');
                    }
                    console.log(`📢 [BROADCAST] Sending text to ${chatId}:`, message.substring(0, 50));
                    sentMessage = await client.sendMessage(chatId, message);
                }

                // Update recipient status
                await pool.execute(
                    `UPDATE broadcast_recipients 
                     SET status = 'sent', sent_at = CURRENT_TIMESTAMP 
                     WHERE id = ?`,
                    [recipient.id]
                );

                sentCount++;
                console.log(`✅ [BROADCAST] Sent to ${chatId} (${sentCount}/${recipients.length})`);
            } catch (error) {
                console.error(`❌ [BROADCAST] Error sending to ${recipient.phone_number || recipient.contact_id}:`, error.message);
                try {
                await pool.execute(
                    `UPDATE broadcast_recipients 
                     SET status = 'failed' 
                     WHERE id = ?`,
                    [recipient.id]
                );
                } catch (updateError) {
                    console.error(`❌ [BROADCAST] Error updating recipient status:`, updateError.message);
                }
                failedCount++;
            }
        }

        // Update broadcast message status
        console.log(`📢 [BROADCAST] Completed: sent=${sentCount}, failed=${failedCount}, total=${recipients.length}`);
        await pool.execute(
            `UPDATE broadcast_messages 
             SET status = 'completed', sent_count = ?, failed_count = ?, completed_at = CURRENT_TIMESTAMP 
             WHERE id = ?`,
            [sentCount, failedCount, broadcastMessageId]
        );

        res.json({
            success: true,
            broadcastMessageId,
            sentCount,
            failedCount,
            totalRecipients: recipients.length
        });
    } catch (error) {
        console.error('Error sending broadcast:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get broadcast status
app.get('/api/broadcast/:broadcastMessageId/status', authenticate, async (req, res) => {
    try {
        const { broadcastMessageId } = req.params;

        const [broadcasts] = await pool.execute(
            'SELECT * FROM broadcast_messages WHERE id = ?',
            [broadcastMessageId]
        );

        if (broadcasts.length === 0) {
            return res.status(404).json({ error: 'Broadcast not found' });
        }

        const [recipients] = await pool.execute(
            'SELECT * FROM broadcast_recipients WHERE broadcast_list_id = ?',
            [broadcasts[0].broadcast_list_id]
        );

        res.json({
            success: true,
            broadcast: broadcasts[0],
            recipients
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// CONTACTS ENDPOINTS
// ============================================

// Get all contacts from database
app.get('/api/contacts', authenticate, async (req, res) => {
    try {
        const { sessionId, limit = 100, offset = 0, search } = req.query;
        const limitNum = parseInt(limit) || 100;
        const offsetNum = parseInt(offset) || 0;

        let query = `
            SELECT c.*, 
            COUNT(DISTINCT m.id) as message_count
            FROM contacts c
            LEFT JOIN messages m ON m.contact_id = c.contact_id AND m.session_id = c.session_id
        `;
        const params = [];

        if (sessionId) {
            query += ' WHERE c.session_id = ?';
            params.push(sessionId);
        } else {
            query += ' WHERE 1=1';
        }

        if (search) {
            query += ` AND (
                c.name LIKE ? OR 
                c.pushname LIKE ? OR 
                c.phone_number LIKE ? OR 
                c.contact_id LIKE ?
            )`;
            const searchTerm = `%${search}%`;
            params.push(searchTerm, searchTerm, searchTerm, searchTerm);
        }

        query += ` GROUP BY c.id ORDER BY c.name ASC, c.pushname ASC LIMIT ${limitNum} OFFSET ${offsetNum}`;

        const [contacts] = await pool.execute(query, params);

        // Get total count
        let countQuery = 'SELECT COUNT(DISTINCT c.id) as total FROM contacts c';
        const countParams = [];
        if (sessionId) {
            countQuery += ' WHERE c.session_id = ?';
            countParams.push(sessionId);
        }
        if (search) {
            countQuery += sessionId ? ' AND' : ' WHERE';
            countQuery += ` (
                c.name LIKE ? OR 
                c.pushname LIKE ? OR 
                c.phone_number LIKE ? OR 
                c.contact_id LIKE ?
            )`;
            const searchTerm = `%${search}%`;
            countParams.push(searchTerm, searchTerm, searchTerm, searchTerm);
        }
        const [countResult] = await pool.execute(countQuery, countParams);
        const total = countResult[0]?.total || 0;

        // Get statistics
        let statsQuery = `
            SELECT 
                COUNT(DISTINCT c.id) as total,
                COUNT(DISTINCT CASE WHEN c.phone_number IS NOT NULL THEN c.id END) as with_phone,
                COUNT(DISTINCT CASE WHEN c.phone_number IS NULL THEN c.id END) as without_phone,
                COUNT(DISTINCT CASE WHEN c.is_group = TRUE THEN c.id END) as \`groups\`,
                COUNT(DISTINCT CASE WHEN c.is_business = TRUE THEN c.id END) as business
            FROM contacts c
        `;
        const statsParams = [];
        if (sessionId) {
            statsQuery += ' WHERE c.session_id = ?';
            statsParams.push(sessionId);
        }
        const [stats] = await pool.execute(statsQuery, statsParams);

        res.json({
            success: true,
            contacts,
            total,
            stats: stats[0] || {}
        });
    } catch (error) {
        console.error('Error getting contacts:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get contact details with messages
app.get('/api/contacts/:contactId', authenticate, async (req, res) => {
    try {
        const { contactId } = req.params;
        const { sessionId } = req.query;

        let query = 'SELECT * FROM contacts WHERE contact_id = ?';
        const params = [contactId];

        if (sessionId) {
            query += ' AND session_id = ?';
            params.push(sessionId);
        }

        const [contacts] = await pool.execute(query, params);

        if (contacts.length === 0) {
            return res.status(404).json({ error: 'Contact not found' });
        }

        const contact = contacts[0];

        // Get messages for this contact
        const [messages] = await pool.execute(
            `SELECT * FROM messages 
            WHERE contact_id = ? AND session_id = ?
            ORDER BY timestamp DESC LIMIT 50`,
            [contactId, contact.session_id]
        );

        res.json({
            success: true,
            contact,
            messages: messages || []
        });
    } catch (error) {
        console.error('Error getting contact details:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// ADMIN ACTIVITY LOGS ENDPOINTS
// ============================================

// Get activity logs (Admin only)
app.get('/api/admin/activity-logs', authenticate, requireAdmin, async (req, res) => {
    try {
        const {
            userId,
            sessionId,
            action,
            resourceType,
            startDate,
            endDate,
            limit = 100,
            offset = 0
        } = req.query;

        const logs = await activityLogger.getLogs({
            userId: userId ? parseInt(userId) : null,
            sessionId: sessionId || null,
            action: action || null,
            resourceType: resourceType || null,
            startDate: startDate || null,
            endDate: endDate || null,
            limit: parseInt(limit) || 100,
            offset: parseInt(offset) || 0
        });

        const totalCount = await activityLogger.getLogCount({
            userId: userId ? parseInt(userId) : null,
            sessionId: sessionId || null,
            action: action || null,
            resourceType: resourceType || null,
            startDate: startDate || null,
            endDate: endDate || null
        });

        res.json({
            success: true,
            logs,
            pagination: {
                total: totalCount,
                limit: parseInt(limit) || 100,
                offset: parseInt(offset) || 0,
                hasMore: (parseInt(offset) || 0) + logs.length < totalCount
            }
        });
    } catch (error) {
        console.error('Error getting activity logs:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// SKIP MESSAGES ENDPOINTS
// ============================================

// Get skip messages list
app.get('/api/skip-messages', authenticate, async (req, res) => {
    try {
        const { sessionId, type } = req.query;
        
        let query = 'SELECT * FROM skip_messages WHERE 1=1';
        const params = [];
        
        if (sessionId) {
            query += ' AND session_id = ?';
            params.push(sessionId);
        }
        
        if (type) {
            query += ' AND type = ?';
            params.push(type);
        }
        
        // User can only see their own session's skip list
        if (req.user.role !== 'admin') {
            query += ' AND session_id = ?';
            params.push(req.user.session_id);
        }
        
        query += ' ORDER BY created_at DESC';
        
        const [skipList] = await pool.execute(query, params);
        
        res.json({ success: true, skipList });
    } catch (error) {
        console.error('Error getting skip messages:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get groups for skip list (all groups from contacts)
app.get('/api/skip-messages/groups', authenticate, async (req, res) => {
    try {
        const { sessionId } = req.query;
        const targetSessionId = req.user.role === 'admin' ? sessionId : req.user.session_id;
        
        console.log(`📋 [SKIP GROUPS] Request for sessionId: ${sessionId}, targetSessionId: ${targetSessionId}, userRole: ${req.user.role}`);
        
        if (!targetSessionId) {
            return res.status(400).json({ error: 'sessionId is required' });
        }
        
        const client = clients.get(targetSessionId);
        const sessionStatus = sessionStatuses.get(targetSessionId);
        
        if (!client) {
            console.error(`❌ [SKIP GROUPS] Client not found for sessionId: ${targetSessionId}`);
            console.error(`📊 [SKIP GROUPS] Available sessions: ${Array.from(clients.keys()).join(', ')}`);
            console.error(`📊 [SKIP GROUPS] Session status: ${sessionStatus || 'unknown'}`);
            return res.status(404).json({ 
                error: 'Session not found or not ready',
                sessionId: targetSessionId,
                availableSessions: Array.from(clients.keys()),
                sessionStatus: sessionStatus || 'unknown'
            });
        }
        
        // Check if client is ready
        if (!client.info) {
            console.warn(`⚠️ [SKIP GROUPS] Client info not available for sessionId: ${targetSessionId}`);
            return res.status(404).json({ 
                error: 'Session is not ready yet. Please wait for the session to be fully initialized.',
                sessionId: targetSessionId,
                sessionStatus: sessionStatus || 'loading'
            });
        }
        
        // Get groups from database (contacts that have messages)
        const [dbGroups] = await pool.execute(
            `SELECT DISTINCT 
                c.contact_id as group_id,
                c.name,
                c.pushname,
                c.profile_pic_url as profile_picture_url,
                COUNT(DISTINCT m.id) as message_count,
                MAX(m.timestamp) as last_message_time
            FROM contacts c
            LEFT JOIN messages m ON m.contact_id = c.contact_id AND m.session_id = c.session_id
            WHERE c.session_id = ? AND (c.is_group = TRUE OR c.is_group = 1)
            GROUP BY c.contact_id, c.name, c.pushname, c.profile_pic_url
            ORDER BY last_message_time DESC, c.name ASC`,
            [targetSessionId]
        );
        
        console.log(`📋 [SKIP GROUPS] Found ${dbGroups.length} groups from database`);
        
        // Also get groups directly from WhatsApp client
        let clientGroups = [];
        try {
            const chats = await client.getChats();
            const groups = chats.filter(chat => chat.isGroup);
            console.log(`📋 [SKIP GROUPS] Found ${groups.length} groups from WhatsApp client`);
            
            // Convert to same format and merge with database groups
            for (const group of groups) {
                const groupId = group.id._serialized;
                // Check if already in dbGroups
                const existingGroup = dbGroups.find(g => g.group_id === groupId);
                if (!existingGroup) {
                    // Add group from client that's not in database yet
                    clientGroups.push({
                        group_id: groupId,
                        name: group.name || null,
                        pushname: group.name || null,
                        message_count: 0,
                        last_message_time: null
                    });
                }
            }
        } catch (clientError) {
            console.error(`⚠️ [SKIP GROUPS] Error getting groups from client:`, clientError.message);
            // Continue with database groups only
        }
        
        // Merge database groups and client groups
        const allGroups = [...dbGroups, ...clientGroups];
        console.log(`📋 [SKIP GROUPS] Total ${allGroups.length} groups (${dbGroups.length} from DB, ${clientGroups.length} from client)`);
        
        // Get which groups are already in skip list
        const [skipGroups] = await pool.execute(
            `SELECT group_id FROM skip_messages 
            WHERE session_id = ? AND type = 'group' AND is_active = TRUE`,
            [targetSessionId]
        );
        const skippedGroupIds = new Set(skipGroups.map(g => g.group_id));
        
        console.log(`📋 [SKIP GROUPS] Found ${skipGroups.length} groups already in skip list`);
        
        // Filter out groups that are already in skip list
        // Only show groups that are NOT skipped
        const availableGroups = allGroups.filter(group => !skippedGroupIds.has(group.group_id));
        
        console.log(`📋 [SKIP GROUPS] Returning ${availableGroups.length} available groups (${allGroups.length - availableGroups.length} already skipped)`);
        
        res.json({ success: true, groups: availableGroups });
    } catch (error) {
        console.error('Error getting groups:', error);
        res.status(500).json({ error: error.message });
    }
});

// Add skip rule
app.post('/api/skip-messages', authenticate, async (req, res) => {
    try {
        const { sessionId, type, groupId, contactId, phoneNumber, name, description } = req.body;
        
        if (!sessionId || !type) {
            return res.status(400).json({ error: 'sessionId and type are required' });
        }
        
        // Validate type
        if (!['group', 'contact'].includes(type)) {
            return res.status(400).json({ error: 'type must be "group" or "contact"' });
        }
        
        // Validate based on type
        if (type === 'group' && !groupId) {
            return res.status(400).json({ error: 'groupId is required for type=group' });
        }
        
        if (type === 'contact' && !contactId && !phoneNumber) {
            return res.status(400).json({ error: 'contactId or phoneNumber is required for type=contact' });
        }
        
        // User can only add skip rules for their own session
        if (req.user.role !== 'admin' && sessionId !== req.user.session_id) {
            return res.status(403).json({ error: 'You can only add skip rules for your own session' });
        }
        
        // Check if already exists
        let checkQuery = 'SELECT id FROM skip_messages WHERE session_id = ? AND type = ? AND is_active = TRUE';
        const checkParams = [sessionId, type];
        
        if (type === 'group') {
            checkQuery += ' AND group_id = ?';
            checkParams.push(groupId);
        } else {
            checkQuery += ' AND (contact_id = ? OR phone_number = ?)';
            checkParams.push(contactId || phoneNumber, phoneNumber || contactId);
        }
        
        const [existing] = await pool.execute(checkQuery, checkParams);
        if (existing.length > 0) {
            return res.status(400).json({ error: 'Skip rule already exists' });
        }
        
        // Insert skip rule
        const [result] = await pool.execute(
            `INSERT INTO skip_messages 
            (session_id, type, group_id, contact_id, phone_number, name, description, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [sessionId, type, groupId || null, contactId || null, phoneNumber || null, name || null, description || null, req.user.id]
        );
        
        // Log activity
        await activityLogger.log({
            userId: req.user.id,
            username: req.user.username || req.user.session_id,
            sessionId: sessionId,
            action: 'add_skip_rule',
            resourceType: 'skip_rule',
            resourceId: result.insertId.toString(),
            description: `Added skip rule for ${type}: ${groupId || contactId || phoneNumber || name || 'N/A'}`,
            ipAddress: req.ip || req.connection.remoteAddress,
            userAgent: req.get('user-agent'),
            metadata: {
                type: type,
                groupId: groupId || null,
                contactId: contactId || null,
                phoneNumber: phoneNumber || null,
                name: name || null
            }
        });
        
        res.json({
            success: true,
            skipRuleId: result.insertId,
            message: 'Skip rule added successfully'
        });
    } catch (error) {
        console.error('❌ [SKIP MESSAGES] Error adding skip rule:', error);
        console.error('❌ [SKIP MESSAGES] Error stack:', error.stack);
        console.error('❌ [SKIP MESSAGES] Request body:', req.body);
        // Don't expose internal error details to client
        const errorMessage = error.message || 'Failed to add skip rule';
        res.status(500).json({ error: errorMessage });
    }
});

// Update skip rule (toggle active/inactive)
app.put('/api/skip-messages/:id', authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        const { isActive, name, description } = req.body;
        
        // Get skip rule
        const [skipRules] = await pool.execute(
            'SELECT * FROM skip_messages WHERE id = ?',
            [id]
        );
        
        if (skipRules.length === 0) {
            return res.status(404).json({ error: 'Skip rule not found' });
        }
        
        const skipRule = skipRules[0];
        
        // User can only update their own session's skip rules
        if (req.user.role !== 'admin' && skipRule.session_id !== req.user.session_id) {
            return res.status(403).json({ error: 'You can only update skip rules for your own session' });
        }
        
        // Update
        const updateFields = [];
        const updateParams = [];
        
        if (isActive !== undefined) {
            updateFields.push('is_active = ?');
            updateParams.push(isActive);
        }
        
        if (name !== undefined) {
            updateFields.push('name = ?');
            updateParams.push(name);
        }
        
        if (description !== undefined) {
            updateFields.push('description = ?');
            updateParams.push(description);
        }
        
        if (updateFields.length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }
        
        updateParams.push(id);
        
        await pool.execute(
            `UPDATE skip_messages SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            updateParams
        );
        
        res.json({ success: true, message: 'Skip rule updated successfully' });
    } catch (error) {
        console.error('Error updating skip rule:', error);
        res.status(500).json({ error: error.message });
    }
});

// Delete skip rule
app.delete('/api/skip-messages/:id', authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        
        // Get skip rule
        const [skipRules] = await pool.execute(
            'SELECT * FROM skip_messages WHERE id = ?',
            [id]
        );
        
        if (skipRules.length === 0) {
            return res.status(404).json({ error: 'Skip rule not found' });
        }
        
        const skipRule = skipRules[0];
        
        // User can only delete their own session's skip rules
        if (req.user.role !== 'admin' && skipRule.session_id !== req.user.session_id) {
            return res.status(403).json({ error: 'You can only delete skip rules for your own session' });
        }
        
        await pool.execute('DELETE FROM skip_messages WHERE id = ?', [id]);
        
        // Log activity
        await activityLogger.log({
            userId: req.user.id,
            username: req.user.username || req.user.session_id,
            sessionId: skipRule.session_id,
            action: 'delete_skip_rule',
            resourceType: 'skip_rule',
            resourceId: id,
            description: `Deleted skip rule for ${skipRule.type}: ${skipRule.group_id || skipRule.contact_id || skipRule.phone_number || skipRule.name || 'N/A'}`,
            ipAddress: req.ip || req.connection.remoteAddress,
            userAgent: req.get('user-agent'),
            metadata: {
                type: skipRule.type,
                groupId: skipRule.group_id || null,
                contactId: skipRule.contact_id || null,
                phoneNumber: skipRule.phone_number || null
            }
        });
        
        res.json({ success: true, message: 'Skip rule deleted successfully' });
    } catch (error) {
        console.error('Error deleting skip rule:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// WEBHOOK ENDPOINTS
// ============================================

// Get webhooks
app.get('/api/webhooks', authenticate, async (req, res) => {
    try {
        const { sessionId } = req.query;

        let query = 'SELECT * FROM webhooks';
        const params = [];

        if (sessionId) {
            query += ' WHERE session_id = ? OR session_id IS NULL';
            params.push(sessionId);
        }

        // Non-admin users can only see webhooks for their own session
        if (req.user.role !== 'admin') {
            if (sessionId && sessionId !== req.user.session_id) {
                return res.status(403).json({ error: 'You can only view webhooks for your own session' });
            }
            query += sessionId ? ' AND session_id = ?' : ' WHERE session_id = ?';
            params.push(req.user.session_id);
        }

        query += ' ORDER BY created_at DESC';

        const [webhooks] = await pool.execute(query, params);

        // Parse JSON events field
        const webhooksWithParsedEvents = webhooks.map(webhook => ({
            ...webhook,
            events: webhook.events ? (typeof webhook.events === 'string' ? JSON.parse(webhook.events) : webhook.events) : ['message']
        }));

        res.json({ success: true, webhooks: webhooksWithParsedEvents });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Create webhook
app.post('/api/webhooks', authenticate, async (req, res) => {
    try {
        const { sessionId, webhookUrl, events } = req.body;

        if (!webhookUrl) {
            return res.status(400).json({ error: 'webhookUrl is required' });
        }

        // Validate URL format
        try {
            new URL(webhookUrl);
        } catch (urlError) {
            return res.status(400).json({ error: 'Invalid webhook URL format' });
        }

        // Non-admin users can only create webhooks for their own session
        const targetSessionId = req.user.role === 'admin' ? (sessionId || null) : req.user.session_id;
        const directionFilter = req.body.directionFilter || 'both'; // incoming, outgoing, or both

        const [result] = await pool.execute(
            `INSERT INTO webhooks (session_id, webhook_url, events, direction_filter, is_active)
             VALUES (?, ?, ?, ?, TRUE)`,
            [targetSessionId, webhookUrl, JSON.stringify(events || ['message']), directionFilter]
        );

        res.json({
            success: true,
            webhookId: result.insertId,
            message: 'Webhook created successfully'
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update webhook
app.put('/api/webhooks/:id', authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        const { webhookUrl, events, isActive, directionFilter } = req.body;

        // Get webhook first to check permissions
        const [webhooks] = await pool.execute('SELECT * FROM webhooks WHERE id = ?', [id]);
        if (webhooks.length === 0) {
            return res.status(404).json({ error: 'Webhook not found' });
        }

        const webhook = webhooks[0];

        // Non-admin users can only update webhooks for their own session
        if (req.user.role !== 'admin' && webhook.session_id !== req.user.session_id) {
            return res.status(403).json({ error: 'You can only update webhooks for your own session' });
        }

        // Validate URL format if provided
        if (webhookUrl) {
            try {
                new URL(webhookUrl);
            } catch (urlError) {
                return res.status(400).json({ error: 'Invalid webhook URL format' });
            }
        }

        await pool.execute(
            `UPDATE webhooks 
             SET webhook_url = COALESCE(?, webhook_url),
                 events = COALESCE(?, events),
                 direction_filter = COALESCE(?, direction_filter),
                 is_active = COALESCE(?, is_active),
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [
                webhookUrl,
                events ? JSON.stringify(events) : null,
                directionFilter,
                isActive,
                id
            ]
        );

        res.json({ success: true, message: 'Webhook updated successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete webhook
app.delete('/api/webhooks/:id', authenticate, async (req, res) => {
    try {
        const { id } = req.params;

        // Get webhook first to check permissions
        const [webhooks] = await pool.execute('SELECT * FROM webhooks WHERE id = ?', [id]);
        if (webhooks.length === 0) {
            return res.status(404).json({ error: 'Webhook not found' });
        }

        const webhook = webhooks[0];

        // Non-admin users can only delete webhooks for their own session
        if (req.user.role !== 'admin' && webhook.session_id !== req.user.session_id) {
            return res.status(403).json({ error: 'You can only delete webhooks for your own session' });
        }

        await pool.execute('DELETE FROM webhooks WHERE id = ?', [id]);

        res.json({ success: true, message: 'Webhook deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// STATISTICS API ENDPOINTS
// ============================================

// Get statistics for a date
app.get('/api/statistics', authenticate, async (req, res) => {
    try {
        const { sessionId, date } = req.query;
        console.log(`📊 [API STATISTICS] Request received: sessionId=${sessionId}, date=${date}`);
        
        if (!sessionId) {
            return res.status(400).json({ error: 'sessionId is required' });
        }

        // Check permission
        if (req.user.role !== 'admin' && req.user.session_id !== sessionId) {
            return res.status(403).json({ error: 'You can only view statistics for your own session' });
        }

        // Default to yesterday if date not provided
        let targetDate = date;
        if (!targetDate) {
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            targetDate = yesterday.toISOString().split('T')[0];
        }

        // Get settings to get periods
        const [settings] = await pool.execute(
            `SELECT periods FROM statistics_settings WHERE session_id = ?`,
            [sessionId]
        );

        let periods = statisticsService.getDefaultPeriods();
        if (settings.length > 0 && settings[0].periods) {
            periods = typeof settings[0].periods === 'string' 
                ? JSON.parse(settings[0].periods) 
                : settings[0].periods;
        }

        // Calculate statistics
        const statistics = await statisticsService.getAllPeriodsStatistics(sessionId, targetDate, periods);

        console.log(`📊 [API STATISTICS] Response: ${statistics.length} periods, T1 new_customer=${statistics[0]?.new_customer?.count || 0}`);
        
        res.json({ 
            success: true, 
            statistics,
            date: targetDate,
            periods
        });
    } catch (error) {
        console.error('Error getting statistics:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get statistics settings
app.get('/api/statistics/settings', authenticate, async (req, res) => {
    try {
        const { sessionId } = req.query;
        
        if (!sessionId) {
            return res.status(400).json({ error: 'sessionId is required' });
        }

        // Check permission
        if (req.user.role !== 'admin' && req.user.session_id !== sessionId) {
            return res.status(403).json({ error: 'You can only view settings for your own session' });
        }

        const [settings] = await pool.execute(
            `SELECT * FROM statistics_settings WHERE session_id = ?`,
            [sessionId]
        );

        if (settings.length === 0) {
            // Return default settings
            return res.json({
                success: true,
                settings: {
                    session_id: sessionId,
                    is_enabled: false,
                    recipient_phone: '',
                    send_time: '08:00:00',
                    periods: statisticsService.getDefaultPeriods()
                }
            });
        }

        const setting = settings[0];
        const periods = typeof setting.periods === 'string' 
            ? JSON.parse(setting.periods) 
            : setting.periods;

        res.json({
            success: true,
            settings: {
                ...setting,
                periods
            }
        });
    } catch (error) {
        console.error('Error getting statistics settings:', error);
        res.status(500).json({ error: error.message });
    }
});

// Update statistics settings
app.put('/api/statistics/settings', authenticate, requireAdmin, async (req, res) => {
    try {
        const { sessionId, is_enabled, recipient_phone, send_time, periods } = req.body;
        
        if (!sessionId) {
            return res.status(400).json({ error: 'sessionId is required' });
        }

        // Validate periods
        const periodsArray = periods || statisticsService.getDefaultPeriods();
        const validation = statisticsService.validatePeriods(periodsArray);
        if (!validation.valid) {
            return res.status(400).json({ error: validation.error });
        }

        // Validate recipient phone if enabled
        if (is_enabled && !recipient_phone) {
            return res.status(400).json({ error: 'recipient_phone is required when enabled' });
        }

        // Check if settings exist
        const [existing] = await pool.execute(
            `SELECT id FROM statistics_settings WHERE session_id = ?`,
            [sessionId]
        );

        const periodsJson = JSON.stringify(periodsArray);

        if (existing.length > 0) {
            // Update existing
            await pool.execute(
                `UPDATE statistics_settings 
                SET is_enabled = ?, recipient_phone = ?, send_time = ?, periods = ?, updated_at = NOW()
                WHERE session_id = ?`,
                [is_enabled || false, recipient_phone || '', send_time || '08:00:00', periodsJson, sessionId]
            );
        } else {
            // Insert new
            await pool.execute(
                `INSERT INTO statistics_settings (session_id, is_enabled, recipient_phone, send_time, periods)
                VALUES (?, ?, ?, ?, ?)`,
                [sessionId, is_enabled || false, recipient_phone || '', send_time || '08:00:00', periodsJson]
            );
        }

        res.json({ success: true, message: 'Statistics settings updated successfully' });
    } catch (error) {
        console.error('Error updating statistics settings:', error);
        res.status(500).json({ error: error.message });
    }
});

// Manual trigger to send statistics
app.post('/api/statistics/send', authenticate, requireAdmin, async (req, res) => {
    try {
        const { sessionId, date } = req.body;
        
        if (!sessionId) {
            return res.status(400).json({ error: 'sessionId is required' });
        }

        // Default to yesterday if date not provided
        let targetDate = date;
        if (!targetDate) {
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            targetDate = yesterday.toISOString().split('T')[0];
        }

        // Get settings
        const [settings] = await pool.execute(
            `SELECT * FROM statistics_settings WHERE session_id = ? AND is_enabled = TRUE`,
            [sessionId]
        );

        if (settings.length === 0) {
            return res.status(400).json({ error: 'Statistics is not enabled for this session' });
        }

        const setting = settings[0];
        const periods = typeof setting.periods === 'string' 
            ? JSON.parse(setting.periods) 
            : setting.periods;

        // Calculate statistics
        const statistics = await statisticsService.getAllPeriodsStatistics(sessionId, targetDate, periods);

        // Send via WhatsApp
        const sent = await statisticsService.sendStatisticsViaWhatsApp(
            sessionId,
            statistics,
            setting.recipient_phone,
            periods,
            targetDate,
            clients
        );

        if (sent) {
            res.json({ success: true, message: 'Statistics sent successfully' });
        } else {
            res.status(500).json({ error: 'Failed to send statistics' });
        }
    } catch (error) {
        console.error('Error sending statistics:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// WHATSAPP CLIENT SETUP
// ============================================

function createClient(sessionId) {
    console.log(`🔧 [CREATE CLIENT] Creating WhatsApp client for session: ${sessionId}`);
    const client = new Client({
        authStrategy: new LocalAuth({
            clientId: sessionId
        }),
        puppeteer: {
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--single-process',
                '--disable-gpu',
                '--disable-background-timer-throttling',
                '--disable-backgrounding-occluded-windows',
                '--disable-renderer-backgrounding',
                '--disable-features=TranslateUI',
                '--disable-ipc-flooding-protection',
                '--memory-pressure-off', // Reduce memory pressure
                '--max_old_space_size=512' // Limit Node.js memory to 512MB
            ]
        }
    });
    console.log(`🔧 [CREATE CLIENT] Client object created for session: ${sessionId}`);

    // Loading screen event (before QR)
    client.on('loading_screen', (percent, message) => {
        console.log(`⏳ [LOADING] Session ${sessionId}: ${percent}% - ${message}`);
        sessionStatuses.set(sessionId, `loading_${percent}`);
        socketHandler.emitSessionStatus(sessionId, 'loading', { percent, message });
        
        // Fallback: If loading reaches 99% and we have client info, auto-set to ready after 10 seconds
        if (percent >= 99 && client.info) {
            console.log(`⏳ [LOADING] Session ${sessionId} at 99% with info available, setting timeout for auto-ready...`);
            setTimeout(async () => {
                const currentStatus = sessionStatuses.get(sessionId);
                // Only auto-set if still loading and info is available
                if (currentStatus && currentStatus.startsWith('loading_') && client.info) {
                    console.log(`✅ [LOADING FALLBACK] Auto-setting session ${sessionId} to ready (loading stuck at ${percent}%)`);
                    sessionStatuses.set(sessionId, 'ready');
                    
                    await pool.execute(
                        `UPDATE sessions 
                         SET status = 'ready', 
                             phone_number = ?,
                             display_name = ?,
                             last_activity = CURRENT_TIMESTAMP
                         WHERE session_id = ?`,
                        [
                            client.info.wid?.user || null,
                            client.info.pushname || null,
                            sessionId
                        ]
                    );
                    
                    socketHandler.emitSessionStatus(sessionId, 'ready', { info: client.info });
                }
            }, 10000); // Wait 10 seconds before auto-setting to ready
        }
    });

    // QR Code event
    client.on('qr', async (qr) => {
        console.log(`📱 [QR CODE] QR Code received for session: ${sessionId}`);
        console.log(`📱 [QR CODE] QR Code length: ${qr.length} characters`);
        qrCodes.set(sessionId, qr);
        sessionStatuses.set(sessionId, 'qr_generated');

        // Update database
        await pool.execute(
            `UPDATE sessions SET status = 'qr_generated', qr_code = ?, qr_expires_at = DATE_ADD(NOW(), INTERVAL 20 SECOND)
             WHERE session_id = ?`,
            [qr, sessionId]
        );

        // Emit via WebSocket
        socketHandler.emitQRCode(sessionId, qr);
        socketHandler.emitSessionStatus(sessionId, 'qr_generated', { qrCode: qr });
    });

    // Authenticated event
    client.on('authenticated', async () => {
        console.log(`[${sessionId}] Authenticated`);
        sessionStatuses.set(sessionId, 'authenticated');

        await pool.execute(
            `UPDATE sessions SET status = 'authenticated' WHERE session_id = ?`,
            [sessionId]
        );

        socketHandler.emitSessionStatus(sessionId, 'authenticated');

        // Fallback: Check periodically if client.info is available and auto-set to ready
        // Check every 5 seconds for up to 30 seconds
        let checkCount = 0;
        const maxChecks = 6; // 6 checks x 5 seconds = 30 seconds max
        const checkInterval = setInterval(async () => {
            checkCount++;
            const currentStatus = sessionStatuses.get(sessionId);
            
            // If already ready, stop checking
            if (currentStatus === 'ready') {
                clearInterval(checkInterval);
                return;
            }
            
            // Check if client.info is available
            if (client.info && client.info.wid) {
                console.log(`✅ [AUTHENTICATED FALLBACK] Auto-setting session ${sessionId} to ready (client.info available after ${checkCount * 5} seconds)`);
                clearInterval(checkInterval);
                sessionStatuses.set(sessionId, 'ready');
                qrCodes.delete(sessionId);
                
                await pool.execute(
                    `UPDATE sessions 
                     SET status = 'ready', 
                         phone_number = ?,
                         display_name = ?,
                         connected_at = COALESCE(connected_at, CURRENT_TIMESTAMP),
                         last_activity = CURRENT_TIMESTAMP
                     WHERE session_id = ?`,
                    [
                        client.info.wid?.user || null,
                        client.info.pushname || null,
                        sessionId
                    ]
                );
                
                socketHandler.emitSessionStatus(sessionId, 'ready', { info: client.info });
            } else if (checkCount >= maxChecks) {
                // After 30 seconds, if still no info, stop checking
                console.log(`⚠️  [AUTHENTICATED FALLBACK] Session ${sessionId} still authenticated after 30 seconds, but client.info not available`);
                clearInterval(checkInterval);
            }
        }, 5000); // Check every 5 seconds
    });

    // Ready event
    client.on('ready', async () => {
        console.log(`✅ [READY] Client is ready for session: ${sessionId}`);
        sessionStatuses.set(sessionId, 'ready');
        qrCodes.delete(sessionId);

        const info = client.info;
        await pool.execute(
            `UPDATE sessions 
             SET status = 'ready', 
                 phone_number = ?,
                 display_name = ?,
                 connected_at = CURRENT_TIMESTAMP,
                 last_activity = CURRENT_TIMESTAMP
             WHERE session_id = ?`,
            [
                info.wid?.user || null,
                info.pushname || null,
                sessionId
            ]
        );

        socketHandler.emitSessionStatus(sessionId, 'ready', { info });
    });

    // Message event (incoming and outgoing from mobile device)
    // SECURITY: sessionId is bound to this closure when createClient() is called
    // This ensures messages from this client are always saved with the correct sessionId
    client.on('message', async (message) => {
        try {
            // Debug: Log all message properties to understand structure
            console.log(`🔍 [MESSAGE EVENT] Session: ${sessionId}, Message ID: ${message.id._serialized}`);
            console.log(`🔍 [MESSAGE EVENT] Properties:`, {
                fromMe: message.fromMe,
                from: message.from,
                to: message.to,
                hasMedia: message.hasMedia,
                body: message.body ? message.body.substring(0, 50) : null,
                timestamp: message.timestamp
            });
            
            // Check if message is from me (outgoing from mobile device)
            if (message.fromMe === true || message.fromMe === 1) {
                // Outgoing message from mobile device
                console.log(`📤 [OUTGOING MESSAGE] Session: ${sessionId}, Message ID: ${message.id._serialized}, To: ${message.to || 'unknown'}`);
                
                // Auto-save outgoing message from mobile device (will skip if destination in skip list)
                const result = await messageHandler.saveOutgoingMessage(sessionId, message);
                
                // Check result
                if (!result) {
                    console.error(`❌ [OUTGOING MESSAGE] saveOutgoingMessage returned null/undefined for message: ${message.id._serialized}`);
                } else if (result.skipped) {
                    console.log(`⏭️ [OUTGOING MESSAGE] Message skipped (destination in skip list), not saving: ${message.id._serialized}`);
                } else if (result.success === false) {
                    console.error(`❌ [OUTGOING MESSAGE] Message save failed: ${result.error || 'Unknown error'}`);
                } else if (result.success === true || result.insertId) {
                    console.log(`✅ [OUTGOING MESSAGE] Message saved successfully, insertId: ${result.insertId}`);
                }
                
                // Update last activity
                await pool.execute(
                    `UPDATE sessions SET last_activity = CURRENT_TIMESTAMP WHERE session_id = ?`,
                    [sessionId]
                );
                return; // Exit early for outgoing messages
            }
            
            // Incoming message
            // Log for security audit - verify sessionId is correct
            console.log(`📨 [INCOMING MESSAGE] Session: ${sessionId}, Message ID: ${message.id._serialized}, From: ${message.from}`);
            
            // Auto-save message dengan @lid conversion (will skip if in skip list)
            // sessionId is from closure - guaranteed to be correct for this client
            const result = await messageHandler.saveIncomingMessage(sessionId, message);

            // Check result
            if (!result) {
                console.error(`❌ [INCOMING MESSAGE] saveIncomingMessage returned null/undefined for message: ${message.id._serialized}`);
            } else if (result.skipped) {
                console.log(`⏭️ [INCOMING MESSAGE] Message skipped, not emitting: ${message.id._serialized}`);
            } else if (result.success === false) {
                console.error(`❌ [INCOMING MESSAGE] Message save failed: ${result.error || 'Unknown error'}`);
            } else if (result.success === true || result.insertId) {
                console.log(`✅ [INCOMING MESSAGE] Message saved successfully, insertId: ${result.insertId}`);
            }

            // Only emit via WebSocket if message was saved successfully (not skipped, not failed)
            // (Skipped messages are not saved but can still be emitted if needed)
            if (result && !result.skipped && (result.success !== false)) {
            socketHandler.emitNewMessage(sessionId, {
                id: message.id._serialized,
                body: message.body,
                from: message.from,
                timestamp: message.timestamp
            });
            }

            // Update last activity
            await pool.execute(
                `UPDATE sessions SET last_activity = CURRENT_TIMESTAMP WHERE session_id = ?`,
                [sessionId]
            );
        } catch (error) {
            console.error(`❌ [MESSAGE HANDLER] Error handling message for ${sessionId}:`, error);
            console.error(`❌ [MESSAGE HANDLER] Error stack:`, error.stack);
        }
    });

    // Message acknowledgment (status updates)
    client.on('message_ack', async (msg, ack) => {
        try {
            let status = 'sent';
            if (ack === 2) status = 'delivered';
            else if (ack === 3) status = 'read';
            else if (ack === 4) status = 'played';

            await messageHandler.updateMessageStatus(msg.id._serialized, status);

            // Emit via WebSocket
            socketHandler.emitMessageStatus(msg.id._serialized, status, sessionId);
        } catch (error) {
            console.error('Error updating message status:', error);
        }
    });

    // Message reaction event
    client.on('message_reaction', async (reaction) => {
        try {
            await messageHandler.saveReaction(sessionId, reaction);
            
            // Emit via WebSocket
            socketHandler.emitReaction(sessionId, {
                messageId: reaction.msgId._serialized,
                reaction: reaction.reaction,
                from: reaction.senderId
            });
        } catch (error) {
            console.error('Error handling message reaction:', error);
        }
    });

    // Message revoked (deleted for everyone)
    client.on('message_revoke_everyone', async (after, before) => {
        try {
            await messageHandler.handleMessageRevoked(sessionId, after, before, 'retracted');
            
            // Emit via WebSocket
            socketHandler.emitMessageRevoked(sessionId, {
                messageId: after.id._serialized,
                type: 'retracted'
            });
        } catch (error) {
            console.error('Error handling message revoke:', error);
        }
    });

    // Message revoked (deleted for me)
    client.on('message_revoke_me', async (msg) => {
        try {
            await messageHandler.handleMessageRevoked(sessionId, msg, null, 'deleted');
            
            // Emit via WebSocket
            socketHandler.emitMessageRevoked(sessionId, {
                messageId: msg.id._serialized,
                type: 'deleted'
            });
        } catch (error) {
            console.error('Error handling message revoke:', error);
        }
    });

    // Message create event - catches ALL messages including outgoing from mobile
    // This is a more reliable way to catch outgoing messages from mobile device
    client.on('message_create', async (message) => {
        try {
            console.log(`🔍 [MESSAGE_CREATE] Session: ${sessionId}, Message ID: ${message.id._serialized}`);
            console.log(`🔍 [MESSAGE_CREATE] Properties:`, {
                fromMe: message.fromMe,
                from: message.from,
                to: message.to,
                hasMedia: message.hasMedia,
                body: message.body ? message.body.substring(0, 50) : null
            });
            
            // Only process if fromMe (outgoing) and not already processed by 'message' event
            if (message.fromMe === true || message.fromMe === 1) {
                console.log(`📤 [MESSAGE_CREATE OUTGOING] Session: ${sessionId}, Message ID: ${message.id._serialized}, To: ${message.to || 'unknown'}`);
                
                // Check if message already exists in database (to avoid duplicate)
                try {
                    const [existing] = await pool.execute(
                        `SELECT id FROM messages WHERE message_id = ? LIMIT 1`,
                        [message.id._serialized]
                    );
                    
                    if (existing.length > 0) {
                        console.log(`ℹ️ [MESSAGE_CREATE] Message ${message.id._serialized} already exists in database, skipping`);
                        return;
                    }
                } catch (checkError) {
                    console.error(`❌ [MESSAGE_CREATE] Error checking existing message:`, checkError.message);
                }
                
                // Auto-save outgoing message from mobile device
                const result = await messageHandler.saveOutgoingMessage(sessionId, message);
                
                if (!result) {
                    console.error(`❌ [MESSAGE_CREATE] saveOutgoingMessage returned null/undefined`);
                } else if (result.skipped) {
                    console.log(`⏭️ [MESSAGE_CREATE] Message skipped (destination in skip list)`);
                } else if (result.success === false) {
                    console.error(`❌ [MESSAGE_CREATE] Message save failed: ${result.error || 'Unknown error'}`);
                } else if (result.success === true || result.insertId) {
                    console.log(`✅ [MESSAGE_CREATE] Message saved successfully, insertId: ${result.insertId}`);
                }
            }
        } catch (error) {
            console.error(`❌ [MESSAGE_CREATE] Error handling message_create for ${sessionId}:`, error);
            console.error(`❌ [MESSAGE_CREATE] Error stack:`, error.stack);
        }
    });

    // Auth failure
    client.on('auth_failure', async (msg) => {
        console.error(`[${sessionId}] Authentication failure:`, msg);
        sessionStatuses.set(sessionId, 'auth_failure');

        await pool.execute(
            `UPDATE sessions SET status = 'disconnected' WHERE session_id = ?`,
            [sessionId]
        );

        socketHandler.emitSessionStatus(sessionId, 'auth_failure', { error: msg });
    });

    // Disconnected
    client.on('disconnected', async (reason) => {
        console.log(`🔌 [DISCONNECTED] Client disconnected for session ${sessionId}:`, reason);
        sessionStatuses.set(sessionId, 'disconnected');
        clients.delete(sessionId);

        await pool.execute(
            `UPDATE sessions SET status = 'disconnected' WHERE session_id = ?`,
            [sessionId]
        );

        socketHandler.emitSessionStatus(sessionId, 'disconnected', { reason });
    });

    return client;
}

// SPA fallback - serve index.html for all non-API routes (must be last, before server.listen!)
app.get('*', (req, res, next) => {
    // Skip API routes
    if (req.path.startsWith('/api/')) {
        return next();
    }
    // Serve index.html for all other routes (SPA routing)
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============================================
// START SERVER
// ============================================

// Auto-initialize existing sessions on server start
async function initializeExistingSessions() {
    try {
        console.log('🔄 [AUTO-INIT] Checking for existing sessions to initialize...');
        // Initialize sessions that have been authenticated before (not stopped/disconnected)
        // Also check updated_at to see if authenticated session is stuck
        const [sessions] = await pool.execute(
            `SELECT session_id, status, updated_at, TIMESTAMPDIFF(SECOND, updated_at, NOW()) as seconds_since_update
             FROM sessions 
             WHERE status IN ('ready', 'authenticated', 'initializing', 'qr_generated')
             AND status != 'stopped'
             ORDER BY updated_at DESC`
        );

        if (sessions.length === 0) {
            console.log('✅ [AUTO-INIT] No existing sessions found');
            return;
        }

        console.log(`📋 [AUTO-INIT] Found ${sessions.length} session(s) to initialize`);

        for (const session of sessions) {
            const { session_id, status, seconds_since_update } = session;
            
            // If session has been authenticated for more than 30 seconds, mark it as ready in DB
            // This handles cases where ready event never fired but session is actually ready
            if (status === 'authenticated' && seconds_since_update > 30) {
                console.log(`⚠️  [AUTO-INIT] Session ${session_id} has been authenticated for ${seconds_since_update} seconds, marking as ready`);
                await pool.execute(
                    `UPDATE sessions 
                     SET status = 'ready', 
                         last_activity = CURRENT_TIMESTAMP
                     WHERE session_id = ?`,
                    [session_id]
                );
                // Skip reinitialize - session will be handled by next AUTO-INIT cycle with ready status
                console.log(`⏭️  [AUTO-INIT] Skipping reinitialize for ${session_id} - marked as ready, will initialize in next cycle`);
                continue;
            }
            
            // Check if client already exists and is ready
            if (clients.has(session_id)) {
                const existingClient = clients.get(session_id);
                const existingStatus = sessionStatuses.get(session_id);
                if (existingStatus === 'ready' || (existingStatus === 'authenticated' && existingClient.info)) {
                    console.log(`⏭️  [AUTO-INIT] Session ${session_id} already initialized (status: ${existingStatus}), skipping...`);
                    // If authenticated with info, auto-set to ready
                    if (existingStatus === 'authenticated' && existingClient.info) {
                        console.log(`✅ [AUTO-INIT] Auto-setting authenticated session ${session_id} to ready`);
                        sessionStatuses.set(session_id, 'ready');
                        await pool.execute(
                            `UPDATE sessions 
                             SET status = 'ready', 
                                 phone_number = ?,
                                 display_name = ?,
                                 connected_at = COALESCE(connected_at, CURRENT_TIMESTAMP),
                                 last_activity = CURRENT_TIMESTAMP
                             WHERE session_id = ?`,
                            [
                                existingClient.info.wid?.user || null,
                                existingClient.info.pushname || null,
                                session_id
                            ]
                        );
                        socketHandler.emitSessionStatus(session_id, 'ready', { info: existingClient.info });
                    }
                    continue;
                }
            }
            
            // Check if session file exists
            const sessionPath = path.join(__dirname, '.wwebjs_auth', `session-${session_id}`);
            try {
                await fs.access(sessionPath);
                console.log(`🔄 [AUTO-INIT] Initializing session: ${session_id} (status: ${status})`);
                
                // Create client instance
                const client = createClient(session_id);
                clients.set(session_id, client);
                sessionStatuses.set(session_id, 'initializing');

                // Initialize client (will auto-login if session file exists)
                // Add delay to avoid multiple simultaneous initializations
                await new Promise(resolve => setTimeout(resolve, 2000));
                
                client.initialize().then(() => {
                    console.log(`✅ [AUTO-INIT] Client initialization started for: ${session_id}`);
                }).catch(err => {
                    console.error(`❌ [AUTO-INIT] Error initializing session ${session_id}:`, err.message);
                    // Clean up failed client
                    clients.delete(session_id);
                    sessionStatuses.delete(session_id);
                });
            } catch (err) {
                console.log(`⚠️  [AUTO-INIT] Session file not found for ${session_id}, skipping...`);
            }
        }
    } catch (error) {
        console.error('❌ [AUTO-INIT] Error initializing existing sessions:', error.message);
    }
}

server.listen(PORT, async () => {
    console.log(`🚀 WhatsApp Multi-Instance API Server running on port ${PORT}`);
    console.log(`📡 WebSocket server ready`);
    console.log(`📚 API Documentation:`);
    console.log(`   POST /api/auth/login - Login`);
    console.log(`   GET  /api/sessions - List sessions`);
    console.log(`   POST /api/sessions - Create session`);
    console.log(`   GET  /api/sessions/:id/qr - Get QR code`);
    console.log(`   POST /api/messages/send - Send message`);
    console.log(`   GET  /api/messages - Get sent messages`);
    console.log(`   POST /api/messages/typing - Send typing signal`);
    
    // Auto-initialize existing sessions
    await initializeExistingSessions();
    
    // Start scheduler service for daily statistics
    schedulerService.start();
    
    console.log(`   POST /api/status/set - Set status`);
    console.log(`   POST /api/stories/set - Set story`);
    console.log(`   POST /api/broadcast/send - Send broadcast`);
    console.log(`   GET  /api/webhooks - List webhooks`);
    console.log(`   GET  /api/statistics - Get statistics`);
    console.log(`   GET  /api/statistics/settings - Get statistics settings`);
    console.log(`   PUT  /api/statistics/settings - Update statistics settings`);
    console.log(`   POST /api/statistics/send - Send statistics manually`);
});

// Global error handlers to prevent crashes
process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ [UNHANDLED REJECTION] Unhandled Promise Rejection:', reason);
    console.error('❌ [UNHANDLED REJECTION] Promise:', promise);
    console.error('❌ [UNHANDLED REJECTION] Stack:', reason?.stack || 'No stack trace');
    // Don't exit - log and continue
});

process.on('uncaughtException', (error) => {
    console.error('❌ [UNCAUGHT EXCEPTION] Uncaught Exception:', error);
    console.error('❌ [UNCAUGHT EXCEPTION] Stack:', error.stack);
    // Don't exit immediately - log and try to continue
    // In production, you might want to exit here, but for now we'll log and continue
});

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down gracefully...');
    
    // Stop scheduler
    if (schedulerService) {
        schedulerService.stop();
    }
    
    for (const [sessionId, client] of clients) {
        console.log(`Closing session: ${sessionId}`);
        try {
            await client.destroy();
        } catch (err) {
            console.error(`Error closing ${sessionId}:`, err);
        }
    }
    await pool.end();
    process.exit(0);
});


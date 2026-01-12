require('dotenv').config();
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

// Import services and middleware
const pool = require('./src/config/database');
const messageHandler = require('./src/services/messageHandler');
const { authenticate, requireAdmin, requireUser, requireSessionOwner, generateToken } = require('./src/middleware/auth');
const SocketHandler = require('./src/services/socketHandler');
const otpService = require('./src/services/otpService');

const app = express();
const server = http.createServer(app);
const socketHandler = new SocketHandler(server);
socketHandler.initialize();

const PORT = process.env.PORT || 3000;

// Store multiple WhatsApp clients
const clients = new Map();
const qrCodes = new Map(); // sessionId -> qrCode
const sessionStatuses = new Map(); // sessionId -> status

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

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // limit each IP to 100 requests per windowMs
});
app.use('/api/', limiter);

// Serve static files (frontend)
app.use(express.static('public'));

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

        // Check if session exists
        const [sessions] = await pool.execute(
            'SELECT * FROM sessions WHERE session_id = ?',
            [sessionName]
        );

        if (sessions.length === 0) {
            return res.status(404).json({ error: 'Session not found' });
        }

        const ipAddress = req.ip || req.connection.remoteAddress;
        const userAgent = req.headers['user-agent'];

        const result = await otpService.requestOTP(sessionName, sessionName, ipAddress, userAgent);

        if (!result.success) {
            return res.status(400).json({ error: result.error });
        }

        // Send OTP via WhatsApp if client is ready
        const client = clients.get(sessionName);
        if (client && client.info) {
            try {
                // Get OTP code from database
                const [users] = await pool.execute(
                    'SELECT otp_code FROM users WHERE session_id = ?',
                    [sessionName]
                );

                if (users.length > 0 && users[0].otp_code) {
                    const otpMessage = `Your login OTP code is: ${users[0].otp_code}\n\nThis code will expire in 10 minutes.`;
                    await client.sendMessage(`${sessionName}@c.us`, otpMessage);
                }
            } catch (error) {
                console.error('Error sending OTP via WhatsApp:', error);
                // Continue anyway, OTP is still generated
            }
        }

        res.json({
            success: true,
            message: 'OTP sent successfully',
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

// Get QR code (with auto-refresh support)
app.get('/api/sessions/:sessionId/qr', authenticate, async (req, res) => {
    try {
        const { sessionId } = req.params;
        const qrCode = qrCodes.get(sessionId);

        if (!qrCode) {
            return res.status(404).json({ error: 'QR code not available. Session may be authenticated or not initialized.' });
        }

        // Generate QR code image
        const qrImage = await qrcode.toDataURL(qrCode);

        res.json({
            success: true,
            qrCode: qrCode,
            qrImage: qrImage,
            expiresAt: new Date(Date.now() + 20000).toISOString() // 20 seconds
        });
    } catch (error) {
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
// MESSAGE ENDPOINTS
// ============================================

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: async (req, file, cb) => {
        const sessionId = req.body.sessionId || 'default';
        const today = new Date().toISOString().split('T')[0];
        const uploadDir = path.join(process.env.ATTACHMENTS_DIR || './attachments', today, sessionId);
        await fs.mkdir(uploadDir, { recursive: true });
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueName = `${Date.now()}_${file.originalname}`;
        cb(null, uniqueName);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
    // Ensure multer parses fields even without files
    preservePath: true
});

// Send message (text or attachment)
// Handle both JSON (no attachment) and FormData (with attachment)
app.post('/api/messages/send', authenticate, (req, res, next) => {
    const contentType = req.headers['content-type'] || '';
    console.log(`🔍 [MIDDLEWARE] Content-Type: ${contentType}`);
    
    if (contentType.includes('multipart/form-data')) {
        // Use multer for FormData (with or without attachment)
        // Use fields() to explicitly define fields to parse (ensures fields are parsed even without files)
        upload.fields([
            { name: 'sessionId', maxCount: 1 },
            { name: 'phone', maxCount: 1 },
            { name: 'message', maxCount: 1 },
            { name: 'caption', maxCount: 1 },
            { name: 'attachment', maxCount: 1 }
        ])(req, res, (err) => {
            if (err) {
                console.error('❌ [MULTER ERROR]:', err);
                return res.status(400).json({ error: 'File upload error: ' + err.message });
            }
            console.log(`✅ [MULTER] Parsed FormData:`, {
                bodyKeys: Object.keys(req.body || {}),
                bodyValues: req.body,
                files: req.files,
                filesCount: req.files ? Object.keys(req.files).length : 0
            });
            next();
        });
    } else {
        // Skip multer for JSON (no attachment) - express.json() will handle it
        console.log(`✅ [MIDDLEWARE] Using JSON parser`);
        next();
    }
}, async (req, res) => {
    try {
        // For FormData: multer populates req.body and req.files
        // For JSON: express.json() populates req.body
        // Handle FormData fields (can be string or array when using fields())
        const sessionId = Array.isArray(req.body?.sessionId) ? req.body.sessionId[0] : req.body?.sessionId;
        const phone = Array.isArray(req.body?.phone) ? req.body.phone[0] : req.body?.phone;
        const message = Array.isArray(req.body?.message) ? req.body.message[0] : req.body?.message;
        const caption = Array.isArray(req.body?.caption) ? req.body.caption[0] : req.body?.caption;
        
        // Handle files from multer fields() - structure is { attachment: [file] }
        let file = null;
        if (req.files && req.files.attachment) {
            file = Array.isArray(req.files.attachment) ? req.files.attachment[0] : req.files.attachment;
        } else if (req.files && Array.isArray(req.files) && req.files.length > 0) {
            // Fallback for upload.any() format
            file = req.files[0];
        }

        console.log(`📤 [SEND MESSAGE] Request received:`, {
            sessionId,
            phone,
            message: message ? message.substring(0, 50) + '...' : null,
            hasCaption: !!caption,
            hasFile: !!file,
            filesCount: req.files ? req.files.length : 0,
            bodyKeys: Object.keys(req.body || {}),
            contentType: req.headers['content-type'],
            bodyRaw: JSON.stringify(req.body),
            bodyValues: req.body ? Object.entries(req.body).map(([k, v]) => `${k}=${typeof v === 'string' ? v.substring(0, 20) : v}`).join(', ') : 'empty',
            bodyType: typeof req.body,
            bodyConstructor: req.body?.constructor?.name
        });

        // Debug: Check if body is populated correctly
        if (Object.keys(req.body || {}).length === 0 && !file) {
            console.error(`❌ [SEND MESSAGE] Empty body detected:`, {
                contentType: req.headers['content-type'],
                hasFiles: !!req.files,
                filesCount: req.files?.length || 0,
                body: req.body,
                method: req.method,
                url: req.url
            });
        }

        if (!sessionId || !phone) {
            console.error(`❌ [SEND MESSAGE] Missing required fields:`, {
                sessionId: !!sessionId,
                phone: !!phone,
                body: req.body,
                bodyKeys: Object.keys(req.body || {}),
                contentType: req.headers['content-type'],
                hasFiles: !!req.files,
                filesCount: req.files?.length || 0
            });
            return res.status(400).json({ error: 'sessionId and phone are required' });
        }

        const client = clients.get(sessionId);
        if (!client) {
            return res.status(404).json({ error: 'Session not found' });
        }

        const chatId = phone.includes('@') ? phone : `${phone}@c.us`;
        let sentMessage;

        // Send with attachment
        if (file) {
            const media = MessageMedia.fromFilePath(file.path);
            if (caption) media.caption = caption;

            sentMessage = await client.sendMessage(chatId, media);

            // Save attachment to database
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
        } else {
            // Send text message
            if (!message) {
                return res.status(400).json({ error: 'message is required when no attachment' });
            }
            sentMessage = await client.sendMessage(chatId, message);
        }

        // Save message to database
        const [result] = await pool.execute(
            `INSERT INTO messages 
             (session_id, message_id, from_number, to_number, contact_id, direction, message_type, body, caption, status, timestamp, attachment_path)
             VALUES (?, ?, ?, ?, ?, 'outgoing', ?, ?, ?, 'sent', ?, ?)`,
            [
                sessionId,
                sentMessage.id._serialized,
                null, // from_number for outgoing
                phone,
                chatId,
                file ? file.mimetype.split('/')[0] : 'text',
                message || caption || '',
                caption || null,
                Math.floor(Date.now() / 1000),
                file ? file.path : null
            ]
        );

        // Save status history
        await pool.execute(
            `INSERT INTO message_status_history (message_id, status) VALUES (?, 'sent')`,
            [sentMessage.id._serialized]
        );

        // Emit via WebSocket
        socketHandler.emitMessageStatus(sentMessage.id._serialized, 'sent', sessionId);

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
        const { sessionId, limit = 50, offset = 0, includeDeleted = false } = req.query;
        const limitNum = parseInt(limit) || 50;
        const offsetNum = parseInt(offset) || 0;

        let query = `
            SELECT m.*, a.file_name, a.file_path, a.file_type
            FROM messages m
            LEFT JOIN attachments a ON a.message_id = m.message_id
            WHERE m.direction = 'outgoing'
        `;
        const params = [];

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
                const [reactions] = await pool.execute(
                    `SELECT reaction_emoji, reaction_text, from_number, timestamp, created_at
                    FROM message_reactions WHERE message_id = ? ORDER BY created_at DESC`,
                    [msg.message_id]
                );

                // Get reply info if exists
                let replyToMessage = null;
                if (msg.reply_to_message_id) {
                    const [replies] = await pool.execute(
                        `SELECT message_id, body, caption, message_type, from_number, timestamp
                        FROM messages WHERE message_id = ?`,
                        [msg.reply_to_message_id]
                    );
                    replyToMessage = replies[0] || null;
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
        const [reactions] = await pool.execute(
            `SELECT reaction_emoji, reaction_text, from_number, timestamp, created_at
            FROM message_reactions WHERE message_id = ? ORDER BY created_at DESC`,
            [messageId]
        );

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

        const [reactions] = await pool.execute(
            `SELECT reaction_emoji, reaction_text, from_number, timestamp, created_at
            FROM message_reactions WHERE message_id = ? ORDER BY created_at DESC`,
            [messageId]
        );

        res.json({ success: true, reactions });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get message replies
app.get('/api/messages/:messageId/replies', authenticate, async (req, res) => {
    try {
        const { messageId } = req.params;

        const [replies] = await pool.execute(
            `SELECT m.*, a.file_name, a.file_path, a.file_type
            FROM message_replies mr
            JOIN messages m ON m.message_id = mr.message_id
            LEFT JOIN attachments a ON a.message_id = m.message_id
            WHERE mr.reply_to_message_id = ?
            ORDER BY m.timestamp DESC`,
            [messageId]
        );

        res.json({ success: true, replies });
    } catch (error) {
        res.status(500).json({ error: error.message });
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
        const { sessionId, broadcastListId, message } = req.body;
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
                    const media = MessageMedia.fromFilePath(file.path);
                    if (message) media.caption = message;
                    sentMessage = await client.sendMessage(chatId, media);
                } else {
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
            } catch (error) {
                console.error(`Error sending to ${recipient.phone_number}:`, error);
                await pool.execute(
                    `UPDATE broadcast_recipients 
                     SET status = 'failed' 
                     WHERE id = ?`,
                    [recipient.id]
                );
                failedCount++;
            }
        }

        // Update broadcast message status
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

        const [webhooks] = await pool.execute(query, params);

        res.json({ success: true, webhooks });
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

        const [result] = await pool.execute(
            `INSERT INTO webhooks (session_id, webhook_url, events, is_active)
             VALUES (?, ?, ?, TRUE)`,
            [sessionId || null, webhookUrl, JSON.stringify(events || ['message'])]
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
        const { webhookUrl, events, isActive } = req.body;

        await pool.execute(
            `UPDATE webhooks 
             SET webhook_url = COALESCE(?, webhook_url),
                 events = COALESCE(?, events),
                 is_active = COALESCE(?, is_active),
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [
                webhookUrl,
                events ? JSON.stringify(events) : null,
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

        await pool.execute('DELETE FROM webhooks WHERE id = ?', [id]);

        res.json({ success: true, message: 'Webhook deleted successfully' });
    } catch (error) {
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

    // Message event (incoming)
    client.on('message', async (message) => {
        try {
            // Auto-save message dengan @lid conversion
            await messageHandler.saveIncomingMessage(sessionId, message);

            // Emit via WebSocket
            socketHandler.emitNewMessage(sessionId, {
                id: message.id._serialized,
                body: message.body,
                from: message.from,
                timestamp: message.timestamp
            });

            // Update last activity
            await pool.execute(
                `UPDATE sessions SET last_activity = CURRENT_TIMESTAMP WHERE session_id = ?`,
                [sessionId]
            );
        } catch (error) {
            console.error(`Error handling message for ${sessionId}:`, error);
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
        const [sessions] = await pool.execute(
            `SELECT session_id, status FROM sessions 
             WHERE status IN ('ready', 'authenticated') 
             ORDER BY updated_at DESC`
        );

        if (sessions.length === 0) {
            console.log('✅ [AUTO-INIT] No existing sessions found');
            return;
        }

        console.log(`📋 [AUTO-INIT] Found ${sessions.length} session(s) to initialize`);

        for (const session of sessions) {
            const { session_id, status } = session;
            
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
                client.initialize().then(() => {
                    console.log(`✅ [AUTO-INIT] Client initialization started for: ${session_id}`);
                }).catch(err => {
                    console.error(`❌ [AUTO-INIT] Error initializing session ${session_id}:`, err.message);
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
    console.log(`   POST /api/status/set - Set status`);
    console.log(`   POST /api/stories/set - Set story`);
    console.log(`   POST /api/broadcast/send - Send broadcast`);
    console.log(`   GET  /api/webhooks - List webhooks`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down gracefully...');
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


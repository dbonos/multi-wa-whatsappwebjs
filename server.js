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
const { authenticate, requireAdmin, generateToken } = require('./src/middleware/auth');
const SocketHandler = require('./src/services/socketHandler');

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
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

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

// Login
app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password required' });
        }

        const [users] = await pool.execute(
            'SELECT * FROM users WHERE username = ?',
            [username]
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

        res.json({
            success: true,
            token,
            user: {
                id: user.id,
                username: user.username,
                role: user.role
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed' });
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

// Get all sessions
app.get('/api/sessions', authenticate, async (req, res) => {
    try {
        const [sessions] = await pool.execute(
            `SELECT s.*, 
             COUNT(DISTINCT m.id) as message_count,
             COUNT(DISTINCT c.id) as contact_count
             FROM sessions s
             LEFT JOIN messages m ON m.session_id = s.session_id
             LEFT JOIN contacts c ON c.session_id = s.session_id
             GROUP BY s.id
             ORDER BY s.created_at DESC`
        );

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

// Create new session
app.post('/api/sessions', authenticate, async (req, res) => {
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
        client.initialize().catch(err => {
            console.error(`Error initializing session ${sessionId}:`, err);
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

// Get session details
app.get('/api/sessions/:sessionId', authenticate, async (req, res) => {
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

// Delete session
app.delete('/api/sessions/:sessionId', authenticate, async (req, res) => {
    try {
        const { sessionId } = req.params;
        const client = clients.get(sessionId);

        if (client) {
            await client.destroy();
            clients.delete(sessionId);
        }

        qrCodes.delete(sessionId);
        sessionStatuses.delete(sessionId);

        // Delete from database (cascade will delete related records)
        await pool.execute('DELETE FROM sessions WHERE session_id = ?', [sessionId]);

        // Delete session folder
        const sessionAuthDir = path.join(process.cwd(), '.wwebjs_auth', `session-${sessionId}`);
        try {
            await fs.rm(sessionAuthDir, { recursive: true, force: true });
        } catch (err) {
            console.log('Error deleting session folder:', err.message);
        }

        res.json({ success: true, message: `Session ${sessionId} deleted successfully` });
    } catch (error) {
        console.error('Error deleting session:', error);
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
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB
});

// Send message (text or attachment)
app.post('/api/messages/send', authenticate, upload.single('attachment'), async (req, res) => {
    try {
        const { sessionId, phone, message, caption } = req.body;
        const file = req.file;

        if (!sessionId || !phone) {
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
        const { sessionId, limit = 50, offset = 0 } = req.query;

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

        query += ' ORDER BY m.timestamp DESC LIMIT ? OFFSET ?';
        params.push(parseInt(limit) || 50, parseInt(offset) || 0);

        const [messages] = await pool.execute(query, params);

        // Get status history for each message
        const messagesWithStatus = await Promise.all(
            messages.map(async (msg) => {
                const [history] = await pool.execute(
                    'SELECT status, changed_at FROM message_status_history WHERE message_id = ? ORDER BY changed_at DESC',
                    [msg.message_id]
                );
                return {
                    ...msg,
                    statusHistory: history
                };
            })
        );

        res.json({ success: true, messages: messagesWithStatus });
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

        res.json({
            success: true,
            message: messages[0],
            statusHistory: history
        });
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
                '--disable-gpu'
            ]
        }
    });

    // QR Code event
    client.on('qr', async (qr) => {
        console.log(`[${sessionId}] QR Code received`);
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
        console.log(`[${sessionId}] Client is ready!`);
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
        console.log(`[${sessionId}] Client disconnected:`, reason);
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

// ============================================
// START SERVER
// ============================================

server.listen(PORT, () => {
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


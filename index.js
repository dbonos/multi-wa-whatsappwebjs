const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// Store multiple WhatsApp clients
const clients = new Map();

// Middleware
app.use(express.json());

// Initialize WhatsApp client
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

    client.on('qr', (qr) => {
        console.log(`[${sessionId}] QR Code received, scan please!`);
        qrcode.generate(qr, { small: true });
    });

    client.on('ready', () => {
        console.log(`[${sessionId}] Client is ready!`);
    });

    client.on('authenticated', () => {
        console.log(`[${sessionId}] Authenticated`);
    });

    client.on('auth_failure', (msg) => {
        console.error(`[${sessionId}] Authentication failure:`, msg);
    });

    client.on('disconnected', (reason) => {
        console.log(`[${sessionId}] Client disconnected:`, reason);
        clients.delete(sessionId);
    });

    return client;
}

// API Routes
app.get('/', (req, res) => {
    res.json({
        status: 'running',
        message: 'Multi WhatsApp Web API',
        activeSessions: Array.from(clients.keys())
    });
});

// Initialize a new session
app.post('/session/start', async (req, res) => {
    const { sessionId } = req.body;
    
    if (!sessionId) {
        return res.status(400).json({ error: 'sessionId is required' });
    }

    if (clients.has(sessionId)) {
        return res.status(400).json({ error: 'Session already exists' });
    }

    try {
        const client = createClient(sessionId);
        clients.set(sessionId, client);
        await client.initialize();
        
        res.json({ 
            success: true, 
            message: `Session ${sessionId} initialized. Check logs for QR code.` 
        });
    } catch (error) {
        console.error(`Error initializing session ${sessionId}:`, error);
        res.status(500).json({ error: error.message });
    }
});

// Stop a session
app.post('/session/stop', async (req, res) => {
    const { sessionId } = req.body;
    
    if (!sessionId) {
        return res.status(400).json({ error: 'sessionId is required' });
    }

    const client = clients.get(sessionId);
    if (!client) {
        return res.status(404).json({ error: 'Session not found' });
    }

    try {
        await client.destroy();
        clients.delete(sessionId);
        res.json({ success: true, message: `Session ${sessionId} stopped` });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get session status
app.get('/session/status/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    const client = clients.get(sessionId);
    
    if (!client) {
        return res.status(404).json({ error: 'Session not found' });
    }

    res.json({ 
        sessionId, 
        status: 'active',
        info: client.info 
    });
});

// Send message
app.post('/message/send', async (req, res) => {
    const { sessionId, phone, message } = req.body;
    
    if (!sessionId || !phone || !message) {
        return res.status(400).json({ 
            error: 'sessionId, phone, and message are required' 
        });
    }

    const client = clients.get(sessionId);
    if (!client) {
        return res.status(404).json({ error: 'Session not found' });
    }

    try {
        const chatId = phone.includes('@c.us') ? phone : `${phone}@c.us`;
        await client.sendMessage(chatId, message);
        res.json({ success: true, message: 'Message sent' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// List all sessions
app.get('/sessions', (req, res) => {
    const sessions = Array.from(clients.keys()).map(sessionId => ({
        sessionId,
        status: 'active'
    }));
    
    res.json({ sessions });
});

// Start server
app.listen(PORT, () => {
    console.log(`Multi WhatsApp Web API running on port ${PORT}`);
    console.log(`API Endpoints:`);
    console.log(`  GET  /                    - API status`);
    console.log(`  POST /session/start       - Start new session`);
    console.log(`  POST /session/stop        - Stop session`);
    console.log(`  GET  /session/status/:id  - Get session status`);
    console.log(`  GET  /sessions            - List all sessions`);
    console.log(`  POST /message/send        - Send message`);
});

// Handle graceful shutdown
process.on('SIGINT', async () => {
    console.log('\nShutting down gracefully...');
    for (const [sessionId, client] of clients) {
        console.log(`Closing session: ${sessionId}`);
        await client.destroy();
    }
    process.exit(0);
});


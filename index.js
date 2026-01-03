const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// Store multiple WhatsApp clients
const clients = new Map();

// Middleware
app.use(express.json());

// Helper function to extract phone number from contact
async function getPhoneNumber(contact) {
    try {
        // Method 1: Direct number property
        if (contact.number) {
            return contact.number;
        }
        
        // Method 2: From ID if it's @c.us format
        if (contact.id && contact.id._serialized) {
            const serialized = contact.id._serialized;
            if (serialized.includes('@c.us')) {
                return serialized.replace('@c.us', '');
            }
        }
        
        // Method 3: From pushname/name with verification
        if (contact.id && contact.id.user) {
            return contact.id.user;
        }
        
        // Method 4: Try to get contact info with getNumberId
        // This will be used when we have a client instance
        
        return null;
    } catch (error) {
        console.error('Error extracting phone number:', error);
        return null;
    }
}

// Helper function to format contact info including @lid handling
function formatContactInfo(contact) {
    const info = {
        id: contact.id._serialized,
        name: contact.name || contact.pushname || 'Unknown',
        isMyContact: contact.isMyContact,
        isGroup: contact.isGroup,
        isUser: contact.isUser,
        isBusiness: contact.isBusiness,
        type: contact.id._serialized.includes('@lid') ? 'lid' : 'c.us'
    };
    
    // Try to extract phone number
    if (contact.number) {
        info.phone = contact.number;
    } else if (contact.id.user) {
        info.phone = contact.id.user;
    } else if (contact.id._serialized.includes('@c.us')) {
        info.phone = contact.id._serialized.replace('@c.us', '');
    } else {
        info.phone = null;
        info.note = 'Phone number not available (using @lid)';
    }
    
    return info;
}

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

// Get all contacts for a session (with @lid handling)
app.get('/contacts/:sessionId', async (req, res) => {
    const { sessionId } = req.params;
    const client = clients.get(sessionId);
    
    if (!client) {
        return res.status(404).json({ error: 'Session not found' });
    }

    try {
        const contacts = await client.getContacts();
        const formattedContacts = contacts
            .filter(contact => !contact.isGroup) // Only individual contacts
            .map(contact => formatContactInfo(contact));
        
        const stats = {
            total: formattedContacts.length,
            withPhone: formattedContacts.filter(c => c.phone).length,
            withoutPhone: formattedContacts.filter(c => !c.phone).length,
            lidContacts: formattedContacts.filter(c => c.type === 'lid').length,
            cusContacts: formattedContacts.filter(c => c.type === 'c.us').length
        };
        
        res.json({ 
            success: true,
            stats,
            contacts: formattedContacts 
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get contact by ID (handle both @c.us and @lid)
app.post('/contact/info', async (req, res) => {
    const { sessionId, contactId } = req.body;
    
    if (!sessionId || !contactId) {
        return res.status(400).json({ error: 'sessionId and contactId are required' });
    }

    const client = clients.get(sessionId);
    if (!client) {
        return res.status(404).json({ error: 'Session not found' });
    }

    try {
        const contact = await client.getContactById(contactId);
        const info = formatContactInfo(contact);
        
        // Try to get number from chat if available
        if (!info.phone) {
            try {
                const chats = await client.getChats();
                const chat = chats.find(c => c.id._serialized === contactId);
                if (chat && chat.contact) {
                    const chatContact = await chat.contact.getContact();
                    if (chatContact.number) {
                        info.phone = chatContact.number;
                        info.note = 'Retrieved from chat';
                    }
                }
            } catch (err) {
                console.log('Could not retrieve from chat:', err.message);
            }
        }
        
        res.json({ success: true, contact: info });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get chats with participant info (better for getting phone numbers)
app.get('/chats/:sessionId', async (req, res) => {
    const { sessionId } = req.params;
    const client = clients.get(sessionId);
    
    if (!client) {
        return res.status(404).json({ error: 'Session not found' });
    }

    try {
        const chats = await client.getChats();
        const chatList = await Promise.all(
            chats
                .filter(chat => !chat.isGroup)
                .map(async (chat) => {
                    const contact = await chat.getContact();
                    return {
                        chatId: chat.id._serialized,
                        name: chat.name,
                        contact: formatContactInfo(contact),
                        unreadCount: chat.unreadCount,
                        lastMessage: chat.lastMessage ? {
                            body: chat.lastMessage.body,
                            timestamp: chat.lastMessage.timestamp
                        } : null
                    };
                })
        );
        
        const stats = {
            total: chatList.length,
            withPhone: chatList.filter(c => c.contact.phone).length,
            withoutPhone: chatList.filter(c => !c.contact.phone).length
        };
        
        res.json({ 
            success: true,
            stats,
            chats: chatList 
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Verify phone number exists on WhatsApp
app.post('/phone/verify', async (req, res) => {
    const { sessionId, phone } = req.body;
    
    if (!sessionId || !phone) {
        return res.status(400).json({ error: 'sessionId and phone are required' });
    }

    const client = clients.get(sessionId);
    if (!client) {
        return res.status(404).json({ error: 'Session not found' });
    }

    try {
        // Clean phone number
        const cleanPhone = phone.replace(/[^0-9]/g, '');
        
        // Check if number is registered on WhatsApp
        const numberId = await client.getNumberId(cleanPhone);
        
        if (numberId) {
            res.json({ 
                success: true,
                exists: true,
                numberId: numberId._serialized,
                phone: cleanPhone,
                type: numberId._serialized.includes('@lid') ? 'lid' : 'c.us'
            });
        } else {
            res.json({ 
                success: true,
                exists: false,
                phone: cleanPhone
            });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`Multi WhatsApp Web API running on port ${PORT}`);
    console.log(`API Endpoints:`);
    console.log(`  GET  /                      - API status`);
    console.log(`  POST /session/start         - Start new session`);
    console.log(`  POST /session/stop          - Stop session`);
    console.log(`  GET  /session/status/:id    - Get session status`);
    console.log(`  GET  /sessions              - List all sessions`);
    console.log(`  POST /message/send          - Send message`);
    console.log(`  GET  /contacts/:sessionId   - Get all contacts (with @lid info)`);
    console.log(`  POST /contact/info          - Get specific contact info`);
    console.log(`  GET  /chats/:sessionId      - Get all chats with contact info`);
    console.log(`  POST /phone/verify          - Verify if phone exists on WhatsApp`);
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


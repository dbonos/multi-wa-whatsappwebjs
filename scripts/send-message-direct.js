require('dotenv').config();
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const path = require('path');

const SESSION_ID = process.argv[2] || '628112298898';
const PHONE = process.argv[3] || '628119906990';
const MESSAGE = process.argv[4] || 'Test message from direct script';

async function sendMessageDirect() {
    try {
        console.log(`📱 Initializing WhatsApp client for session: ${SESSION_ID}`);
        
        const client = new Client({
            authStrategy: new LocalAuth({ 
                clientId: SESSION_ID,
                dataPath: path.join(__dirname, '..', '.wwebjs_auth')
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
                    '--disable-gpu'
                ]
            }
        });

        client.on('qr', (qr) => {
            console.log('❌ QR code required - session not authenticated');
            process.exit(1);
        });

        client.on('ready', async () => {
            console.log('✅ Client is ready!');
            
            try {
                const chatId = PHONE.includes('@') ? PHONE : `${PHONE}@c.us`;
                console.log(`📤 Sending message to ${chatId}...`);
                
                const sentMessage = await client.sendMessage(chatId, MESSAGE);
                console.log('✅ Message sent successfully!');
                console.log(`   Message ID: ${sentMessage.id._serialized}`);
                console.log(`   Timestamp: ${sentMessage.timestamp}`);
                
                await client.destroy();
                process.exit(0);
            } catch (error) {
                console.error('❌ Error sending message:', error.message);
                await client.destroy();
                process.exit(1);
            }
        });

        client.on('auth_failure', (msg) => {
            console.error('❌ Authentication failed:', msg);
            process.exit(1);
        });

        client.on('disconnected', (reason) => {
            console.log('⚠️  Client disconnected:', reason);
            process.exit(1);
        });

        await client.initialize();
        
        // Wait for ready event (max 30 seconds)
        setTimeout(() => {
            console.error('❌ Timeout waiting for client to be ready');
            process.exit(1);
        }, 30000);
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

sendMessageDirect();


const pool = require('../config/database');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

class MessageHandler {
    constructor() {
        this.attachmentsDir = process.env.ATTACHMENTS_DIR || './attachments';
        this.webhookBaseUrl = process.env.WEBHOOK_BASE_URL || '';
        this.initAttachmentsDir();
    }

    async initAttachmentsDir() {
        try {
            await fs.mkdir(this.attachmentsDir, { recursive: true });
            // Create subdirectories by date
            const today = new Date().toISOString().split('T')[0];
            await fs.mkdir(path.join(this.attachmentsDir, today), { recursive: true });
        } catch (error) {
            console.error('Error creating attachments directory:', error);
        }
    }

    // Convert @lid to phone number and save contact
    async saveContact(sessionId, contact) {
        try {
            const contactId = contact.id._serialized;
            let phoneNumber = null;
            let lidOriginal = null;

            // Extract phone number
            if (contact.number) {
                phoneNumber = contact.number;
            } else if (contact.id.user) {
                phoneNumber = contact.id.user;
            } else if (contactId.includes('@c.us')) {
                phoneNumber = contactId.replace('@c.us', '');
            } else if (contactId.includes('@lid')) {
                lidOriginal = contactId;
                // Try to get phone from chat context
                // This will be handled by the calling function
            }

            // Save or update contact
            const [result] = await pool.execute(
                `INSERT INTO contacts 
                (session_id, contact_id, phone_number, name, pushname, is_business, is_my_contact, is_group, lid_original)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                phone_number = COALESCE(?, phone_number),
                name = COALESCE(?, name),
                pushname = COALESCE(?, pushname),
                updated_at = CURRENT_TIMESTAMP`,
                [
                    sessionId, contactId, phoneNumber,
                    contact.name || null,
                    contact.pushname || null,
                    contact.isBusiness || false,
                    contact.isMyContact || false,
                    contact.isGroup || false,
                    lidOriginal,
                    phoneNumber, // For ON DUPLICATE KEY UPDATE
                    contact.name || null,
                    contact.pushname || null
                ]
            );

            return { contactId, phoneNumber, lidOriginal };
        } catch (error) {
            console.error('Error saving contact:', error);
            return null;
        }
    }

    // Save incoming message to database
    async saveIncomingMessage(sessionId, message) {
        try {
            const chat = await message.getChat();
            const contact = await message.getContact();
            
            // Save contact first (with @lid conversion)
            const contactInfo = await this.saveContact(sessionId, contact);
            
            // Determine message type
            let messageType = 'text';
            let attachmentPath = null;
            let caption = null;

            if (message.hasMedia) {
                const media = await message.downloadMedia();
                const mediaType = media.mimetype || '';
                
                if (mediaType.startsWith('image/')) messageType = 'image';
                else if (mediaType.startsWith('video/')) messageType = 'video';
                else if (mediaType.startsWith('audio/')) messageType = audio;
                else if (mediaType.includes('pdf') || mediaType.includes('document')) messageType = 'document';
                else messageType = 'other';

                // Save attachment
                attachmentPath = await this.saveAttachment(sessionId, message.id._serialized, media, messageType);
                caption = message.body || null;
            }

            // Extract phone numbers
            const fromNumber = contactInfo?.phoneNumber || contact.number || null;
            const contactId = contact.id._serialized;

            // Save message
            const [result] = await pool.execute(
                `INSERT INTO messages 
                (session_id, message_id, from_number, to_number, contact_id, direction, message_type, body, caption, status, timestamp, is_forwarded, has_quoted_msg, attachment_path)
                VALUES (?, ?, ?, ?, ?, 'incoming', ?, ?, ?, 'delivered', ?, ?, ?, ?)`,
                [
                    sessionId,
                    message.id._serialized,
                    fromNumber,
                    null, // to_number for incoming
                    contactId,
                    messageType,
                    message.body || caption || '',
                    caption,
                    message.timestamp,
                    message.isForwarded || false,
                    message.hasQuotedMsg || false,
                    attachmentPath
                ]
            );

            // Save status history
            await pool.execute(
                `INSERT INTO message_status_history (message_id, status) VALUES (?, 'delivered')`,
                [message.id._serialized]
            );

            // Forward to webhook
            await this.forwardToWebhook(sessionId, {
                event: 'message',
                message: {
                    id: message.id._serialized,
                    from: fromNumber,
                    contactId: contactId,
                    type: messageType,
                    body: message.body || caption,
                    timestamp: message.timestamp,
                    attachment: attachmentPath ? {
                        path: attachmentPath,
                        type: messageType
                    } : null
                }
            });

            return result.insertId;
        } catch (error) {
            console.error('Error saving incoming message:', error);
            return null;
        }
    }

    // Save attachment to organized folder structure
    async saveAttachment(sessionId, messageId, media, messageType) {
        try {
            const today = new Date().toISOString().split('T')[0];
            const sessionDir = path.join(this.attachmentsDir, today, sessionId);
            await fs.mkdir(sessionDir, { recursive: true });

            // Determine file extension
            const ext = this.getFileExtension(media.mimetype, messageType);
            const fileName = `${messageId}_${Date.now()}${ext}`;
            const filePath = path.join(sessionDir, fileName);

            // Convert base64 to buffer and save
            const buffer = Buffer.from(media.data, 'base64');
            await fs.writeFile(filePath, buffer);

            // Save to database
            await pool.execute(
                `INSERT INTO attachments (message_id, session_id, file_name, file_path, file_type, mime_type, file_size)
                VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                    messageId,
                    sessionId,
                    fileName,
                    filePath,
                    messageType,
                    media.mimetype,
                    buffer.length
                ]
            );

            return filePath;
        } catch (error) {
            console.error('Error saving attachment:', error);
            return null;
        }
    }

    getFileExtension(mimetype, messageType) {
        const extensions = {
            'image/jpeg': '.jpg',
            'image/png': '.png',
            'image/gif': '.gif',
            'image/webp': '.webp',
            'video/mp4': '.mp4',
            'video/avi': '.avi',
            'audio/mpeg': '.mp3',
            'audio/ogg': '.ogg',
            'application/pdf': '.pdf',
            'application/msword': '.doc',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx'
        };
        return extensions[mimetype] || '.bin';
    }

    // Forward message to webhook
    async forwardToWebhook(sessionId, data) {
        try {
            // Get active webhooks for this session
            const [webhooks] = await pool.execute(
                `SELECT webhook_url FROM webhooks 
                WHERE (session_id = ? OR session_id IS NULL) AND is_active = TRUE`,
                [sessionId]
            );

            // Forward to all webhooks
            const promises = webhooks.map(webhook => 
                axios.post(webhook.webhook_url, data, {
                    timeout: parseInt(process.env.WEBHOOK_TIMEOUT) || 5000,
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Session-Id': sessionId
                    }
                }).catch(err => {
                    console.error(`Webhook error for ${webhook.webhook_url}:`, err.message);
                })
            );

            await Promise.allSettled(promises);

            // Mark webhook as sent
            if (data.message) {
                await pool.execute(
                    `UPDATE messages SET webhook_sent = TRUE, webhook_sent_at = CURRENT_TIMESTAMP 
                    WHERE message_id = ?`,
                    [data.message.id]
                );
            }
        } catch (error) {
            console.error('Error forwarding to webhook:', error);
        }
    }

    // Update message status
    async updateMessageStatus(messageId, status) {
        try {
            await pool.execute(
                `UPDATE messages SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE message_id = ?`,
                [status, messageId]
            );

            await pool.execute(
                `INSERT INTO message_status_history (message_id, status) VALUES (?, ?)`,
                [messageId, status]
            );
        } catch (error) {
            console.error('Error updating message status:', error);
        }
    }
}

module.exports = new MessageHandler();


const pool = require('../config/database');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const { getWIBTime, getWIBTimestamp, getWIBToday, formatWIBDisplay, convertUTCToWIBTimestamp } = require('../utils/timezone');

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

            // Get profile picture URL if available
            let profilePictureUrl = null;
            try {
                if (contact.getProfilePicUrl) {
                    profilePictureUrl = await contact.getProfilePicUrl();
                }
            } catch (err) {
                // Profile picture not available or error - ignore
            }
            
            // Save or update contact
            const [result] = await pool.execute(
                `INSERT INTO contacts 
                (session_id, contact_id, phone_number, name, pushname, is_business, is_my_contact, is_group, lid_original, profile_pic_url)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                phone_number = COALESCE(?, phone_number),
                name = COALESCE(?, name),
                pushname = COALESCE(?, pushname),
                profile_pic_url = COALESCE(?, profile_pic_url),
                updated_at = CURRENT_TIMESTAMP`,
                [
                    sessionId, contactId, phoneNumber,
                    contact.name || null,
                    contact.pushname || null,
                    contact.isBusiness || false,
                    contact.isMyContact || false,
                    contact.isGroup || false,
                    lidOriginal,
                    profilePictureUrl,
                    phoneNumber, // For ON DUPLICATE KEY UPDATE
                    contact.name || null,
                    contact.pushname || null,
                    profilePictureUrl
                ]
            );

            return { contactId, phoneNumber, lidOriginal };
        } catch (error) {
            console.error('Error saving contact:', error);
            return null;
        }
    }

    // Check if message should be skipped (not saved to database)
    async shouldSkipMessage(sessionId, contactId, fromNumber, isGroup) {
        try {
            console.log(`🔍 [SKIP CHECK] Checking skip list for:`, {
                sessionId: sessionId,
                contactId: contactId,
                fromNumber: fromNumber,
                isGroup: isGroup
            });
            
            if (isGroup) {
                // Check if group is in skip list
                const [skipGroups] = await pool.execute(
                    `SELECT id FROM skip_messages 
                    WHERE session_id = ? 
                    AND type = 'group' 
                    AND group_id = ? 
                    AND is_active = TRUE`,
                    [sessionId, contactId]
                );
                
                console.log(`🔍 [SKIP CHECK] Group skip query result:`, {
                    contactId: contactId,
                    found: skipGroups.length,
                    skipIds: skipGroups.map(s => s.id)
                });
                
                if (skipGroups.length > 0) {
                    console.log(`⏭️  [SKIP] Skipping message from group: ${contactId}`);
                    return true;
                }
            } else {
                // Check if contact/phone is in skip list
                const [skipContacts] = await pool.execute(
                    `SELECT id FROM skip_messages 
                    WHERE session_id = ? 
                    AND type = 'contact' 
                    AND is_active = TRUE
                    AND (
                        contact_id = ? 
                        OR phone_number = ?
                        OR (? IS NOT NULL AND phone_number = ?)
                    )`,
                    [sessionId, contactId, contactId, fromNumber, fromNumber]
                );
                
                console.log(`🔍 [SKIP CHECK] Contact skip query result:`, {
                    contactId: contactId,
                    fromNumber: fromNumber,
                    found: skipContacts.length,
                    skipIds: skipContacts.map(s => s.id)
                });
                
                if (skipContacts.length > 0) {
                    console.log(`⏭️  [SKIP] Skipping message from contact: ${contactId} (${fromNumber})`);
                    return true;
                }
            }
            
            console.log(`✅ [SKIP CHECK] Message should NOT be skipped - will save to database`);
            return false;
        } catch (error) {
            console.error(`❌ [SKIP CHECK] Error checking skip list:`, error);
            console.error(`❌ [SKIP CHECK] Error stack:`, error.stack);
            // If error, don't skip (save message to be safe)
            console.log(`⚠️ [SKIP CHECK] Error occurred, defaulting to NOT skip (save message)`);
            return false;
        }
    }

    // Save outgoing message from mobile device to database
    async saveOutgoingMessage(sessionId, message) {
        try {
            console.log(`📤 [MESSAGE HANDLER] Processing outgoing message from mobile: ${message.id._serialized} for session: ${sessionId}`);
            
            const chat = await message.getChat();
            const contact = await chat.getContact ? await chat.getContact() : null;
            
            // For outgoing messages, to_number is the destination
            const isGroup = chat.isGroup || false;
            const contactId = chat.id._serialized; // This is the destination (to_number)
            const toNumber = isGroup ? null : (contact?.number || (contactId.includes('@c.us') ? contactId.replace('@c.us', '') : null));
            
            console.log(`📤 [MESSAGE HANDLER] Outgoing message details:`, {
                messageId: message.id._serialized,
                contactId: contactId,
                toNumber: toNumber,
                isGroup: isGroup,
                hasBody: !!message.body
            });
            
            // Save contact first (with @lid conversion) - needed to get correct contact_id
            let contactInfo = null;
            if (contact) {
                contactInfo = await this.saveContact(sessionId, contact);
            }
            
            // Update contactId with contactInfo if available
            const finalContactId = contactInfo?.contactId || contactId;
            const finalToNumber = contactInfo?.phoneNumber || toNumber;
            
            // Check if destination should be skipped
            // For outgoing: check if TO (destination) is in skip list
            const shouldSkip = await this.shouldSkipMessage(sessionId, finalContactId, finalToNumber, isGroup);
            console.log(`📤 [MESSAGE HANDLER] Should skip: ${shouldSkip}`, {
                originalContactId: contactId,
                finalContactId: finalContactId,
                isGroup: isGroup
            });
            
            if (shouldSkip) {
                console.log(`⏭️  [SKIP] Outgoing message skipped (destination in skip list): ${message.id._serialized} to ${isGroup ? 'group' : 'contact'} ${finalContactId}`);
                return { skipped: true, messageId: message.id._serialized };
            }
            
            console.log(`💾 [MESSAGE HANDLER] Outgoing message will be saved to database: ${message.id._serialized}`);
            
            // Determine message type
            let messageType = 'text';
            let attachmentPath = null;
            let caption = null;

            if (message.hasMedia) {
                const media = await message.downloadMedia();
                const mediaType = media.mimetype || '';
                
                if (mediaType.startsWith('image/')) messageType = 'image';
                else if (mediaType.startsWith('video/')) messageType = 'video';
                else if (mediaType.startsWith('audio/')) messageType = 'audio';
                else if (mediaType.includes('pdf') || mediaType.includes('document')) messageType = 'document';
                else messageType = 'other';

                // Save attachment
                attachmentPath = await this.saveAttachment(sessionId, message.id._serialized, media, messageType);
                caption = message.body || null;
            }

            // Check if message is a reply
            let replyToMessageId = null;
            if (message.hasQuotedMsg) {
                try {
                    const quotedMsg = await message.getQuotedMessage();
                    if (quotedMsg) {
                        replyToMessageId = quotedMsg.id._serialized;
                    }
                } catch (err) {
                    console.log('Error getting quoted message:', err.message);
                }
            }

            // Save message
            // Outgoing messages from mobile device are fromAI = 0 (not from API)
            let [result] = await pool.execute(
                `INSERT INTO messages 
                (session_id, message_id, from_number, to_number, contact_id, direction, fromAI, message_type, body, caption, status, timestamp, is_forwarded, has_quoted_msg, quoted_msg_id, reply_to_message_id, attachment_path)
                VALUES (?, ?, ?, ?, ?, 'outgoing', 0, ?, ?, ?, 'sent', ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                updated_at = CURRENT_TIMESTAMP`,
                [
                    sessionId,
                    message.id._serialized,
                    null, // from_number for outgoing
                    finalToNumber,
                    finalContactId,
                    messageType,
                    message.body || caption || '',
                    caption,
                    message.timestamp ? convertUTCToWIBTimestamp(message.timestamp) : getWIBTimestamp(),
                    message.isForwarded || false,
                    message.hasQuotedMsg || false,
                    replyToMessageId,
                    replyToMessageId,
                    attachmentPath
                ]
            );
            
            // If ON DUPLICATE KEY UPDATE was used, result.insertId will be 0
            if (result.insertId === 0) {
                console.log(`ℹ️ [MESSAGE HANDLER] Outgoing message already exists in database: ${message.id._serialized}`);
                const [existing] = await pool.execute(
                    `SELECT id FROM messages WHERE message_id = ? LIMIT 1`,
                    [message.id._serialized]
                );
                if (existing.length > 0) {
                    result.insertId = existing[0].id;
                }
            }

            // Save reply relationship if exists
            if (replyToMessageId) {
                await this.saveReply(sessionId, message.id._serialized, replyToMessageId);
            }

            // Forward to webhook if configured
            if (this.webhookBaseUrl) {
                try {
                    await axios.post(`${this.webhookBaseUrl}/webhook/message`, {
                        event: 'message',
                        sessionId: sessionId,
                        message: {
                            id: message.id._serialized,
                            from: null, // Outgoing message
                            to: finalToNumber,
                            contactId: finalContactId,
                            type: messageType,
                            body: message.body || caption,
                            timestamp: message.timestamp ? convertUTCToWIBTimestamp(message.timestamp) : getWIBTimestamp(),
                            attachment: attachmentPath ? {
                                path: attachmentPath,
                                type: messageType
                            } : null,
                            direction: 'outgoing',
                            fromAI: 0
                        }
                    });
                } catch (webhookError) {
                    console.error('Error forwarding to webhook:', webhookError.message);
                }
            }

            return { success: true, insertId: result.insertId, messageId: message.id._serialized };
        } catch (error) {
            console.error(`❌ [MESSAGE HANDLER] Error saving outgoing message for session ${sessionId}:`, error);
            return { success: false, error: error.message, messageId: message.id._serialized };
        }
    }

    // Save incoming message to database
    async saveIncomingMessage(sessionId, message) {
        try {
            console.log(`📨 [MESSAGE HANDLER] Processing incoming message: ${message.id._serialized} for session: ${sessionId}`);
            
            const chat = await message.getChat();
            const contact = await message.getContact();
            
            // Check if this is a group
            const isGroup = chat.isGroup || false;
            const contactId = contact.id._serialized;
            const fromNumber = contact.number || null;
            
            console.log(`📨 [MESSAGE HANDLER] Message details:`, {
                messageId: message.id._serialized,
                contactId: contactId,
                fromNumber: fromNumber,
                isGroup: isGroup,
                hasBody: !!message.body
            });
            
            // Save contact first (with @lid conversion) - needed to get correct contact_id
            const contactInfo = await this.saveContact(sessionId, contact);
            
            // Update fromNumber and contactId with contactInfo if available
            // CRITICAL: Use the contact_id from saveContact (after @lid conversion) for skip check
            const finalContactId = contactInfo?.contactId || contactId;
            const finalFromNumber = contactInfo?.phoneNumber || fromNumber;
            
            // Check if message should be skipped AFTER getting correct contact_id
            // This ensures we check with the correct contact_id (after @lid conversion)
            const shouldSkip = await this.shouldSkipMessage(sessionId, finalContactId, finalFromNumber, isGroup);
            console.log(`📨 [MESSAGE HANDLER] Should skip: ${shouldSkip}`, {
                originalContactId: contactId,
                finalContactId: finalContactId,
                isGroup: isGroup
            });
            
            if (shouldSkip) {
                console.log(`⏭️  [SKIP] Message skipped (not saved to database): ${message.id._serialized} from ${isGroup ? 'group' : 'contact'} ${finalContactId}`);
                // Still emit via WebSocket for real-time, but don't save to DB
                return { skipped: true, messageId: message.id._serialized };
            }
            
            console.log(`💾 [MESSAGE HANDLER] Message will be saved to database: ${message.id._serialized}`);
            
            // Determine message type
            let messageType = 'text';
            let attachmentPath = null;
            let caption = null;

            if (message.hasMedia) {
                const media = await message.downloadMedia();
                const mediaType = media.mimetype || '';
                
                if (mediaType.startsWith('image/')) messageType = 'image';
                else if (mediaType.startsWith('video/')) messageType = 'video';
                else if (mediaType.startsWith('audio/')) messageType = 'audio';
                else if (mediaType.includes('pdf') || mediaType.includes('document')) messageType = 'document';
                else messageType = 'other';

                // Save attachment
                attachmentPath = await this.saveAttachment(sessionId, message.id._serialized, media, messageType);
                caption = message.body || null;
            }

            // Check if message is a reply
            let replyToMessageId = null;
            if (message.hasQuotedMsg) {
                try {
                    const quotedMsg = await message.getQuotedMessage();
                    if (quotedMsg) {
                        replyToMessageId = quotedMsg.id._serialized;
                    }
                } catch (err) {
                    console.log('Error getting quoted message:', err.message);
                }
            }

            // Save message
            // Use INSERT IGNORE or ON DUPLICATE KEY UPDATE to handle duplicate message_id
            // Incoming messages are always fromAI = 0 (not from API)
            let [result] = await pool.execute(
                `INSERT INTO messages 
                (session_id, message_id, from_number, to_number, contact_id, direction, fromAI, message_type, body, caption, status, timestamp, is_forwarded, has_quoted_msg, quoted_msg_id, reply_to_message_id, attachment_path)
                VALUES (?, ?, ?, ?, ?, 'incoming', 0, ?, ?, ?, 'delivered', ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                updated_at = CURRENT_TIMESTAMP`,
                [
                    sessionId,
                    message.id._serialized,
                    finalFromNumber,
                    null, // to_number for incoming
                    contactId,
                    messageType,
                    message.body || caption || '',
                    caption,
                    // Convert WhatsApp timestamp (UTC) to WIB timestamp
                    // WhatsApp server sends timestamp in UTC, we convert it to WIB for consistency
                    // This ensures all timestamps in our database are in WIB timezone
                    message.timestamp ? convertUTCToWIBTimestamp(message.timestamp) : getWIBTimestamp(),
                    message.isForwarded || false,
                    message.hasQuotedMsg || false,
                    replyToMessageId,
                    replyToMessageId,
                    attachmentPath
                ]
            );
            
            // If ON DUPLICATE KEY UPDATE was used, result.insertId will be 0
            // We need to get the existing message ID
            if (result.insertId === 0) {
                console.log(`ℹ️ [MESSAGE HANDLER] Message already exists in database: ${message.id._serialized}`);
                const [existing] = await pool.execute(
                    `SELECT id FROM messages WHERE message_id = ? LIMIT 1`,
                    [message.id._serialized]
                );
                if (existing.length > 0) {
                    result.insertId = existing[0].id;
                }
            }

            // Save reply relationship if exists
            if (replyToMessageId) {
                await this.saveReply(sessionId, message.id._serialized, replyToMessageId);
            }

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
                    timestamp: message.timestamp ? convertUTCToWIBTimestamp(message.timestamp) : getWIBTimestamp(),
                    attachment: attachmentPath ? {
                        path: attachmentPath,
                        type: messageType
                    } : null
                }
            });

            console.log(`✅ [MESSAGE HANDLER] Message saved successfully: ${message.id._serialized}, insertId: ${result.insertId}`);
            return { success: true, insertId: result.insertId, messageId: message.id._serialized };
        } catch (error) {
            console.error(`❌ [MESSAGE HANDLER] Error saving incoming message:`, error);
            console.error(`❌ [MESSAGE HANDLER] Error stack:`, error.stack);
            console.error(`❌ [MESSAGE HANDLER] Message details:`, {
                sessionId: sessionId,
                messageId: message.id._serialized,
                contactId: contactId,
                fromNumber: fromNumber
            });
            return { success: false, error: error.message };
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
            const fileName = `${messageId}_${getWIBTimestamp()}${ext}`;
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

    // Save message reaction
    async saveReaction(sessionId, reaction) {
        try {
            const messageId = reaction.msgId._serialized;
            const fromNumber = reaction.senderId?.user || null;
            const fromContactId = reaction.senderId?._serialized || null;
            const reactionEmoji = reaction.reaction?.emoji || '';
            const reactionText = reaction.reaction?.text || '';

            // Check if reaction already exists (for update)
            const [existing] = await pool.execute(
                `SELECT id FROM message_reactions 
                WHERE message_id = ? AND from_number = ? AND reaction_emoji = ?`,
                [messageId, fromNumber, reactionEmoji]
            );

            if (existing.length > 0) {
                // Update existing reaction
                await pool.execute(
                    `UPDATE message_reactions 
                    SET reaction_text = ?, timestamp = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE message_id = ? AND from_number = ? AND reaction_emoji = ?`,
                    [reactionText, getWIBTimestamp(), messageId, fromNumber, reactionEmoji]
                );
            } else {
                // Insert new reaction
                await pool.execute(
                    `INSERT INTO message_reactions 
                    (message_id, session_id, from_number, from_contact_id, reaction_emoji, reaction_text, timestamp)
                    VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [
                        messageId,
                        sessionId,
                        fromNumber,
                        fromContactId,
                        reactionEmoji,
                        reactionText,
                        getWIBTimestamp()
                    ]
                );
            }

            // Forward to webhook
            await this.forwardToWebhook(sessionId, {
                event: 'message_reaction',
                reaction: {
                    messageId,
                    from: fromNumber,
                    emoji: reactionEmoji,
                    text: reactionText,
                    timestamp: getWIBTimestamp()
                }
            });

            return true;
        } catch (error) {
            console.error('Error saving reaction:', error);
            return false;
        }
    }

    // Handle message revoked (deleted/retracted)
    async handleMessageRevoked(sessionId, after, before, type) {
        try {
            const messageId = after.id._serialized;
            const timestamp = getWIBTimestamp();

            // Get message info before deletion
            let messageInfo = null;
            if (before) {
                const [messages] = await pool.execute(
                    `SELECT from_number, to_number, message_type, body, caption 
                    FROM messages WHERE message_id = ?`,
                    [before.id._serialized]
                );
                messageInfo = messages[0] || null;
            } else {
                // Try to get from after message
                const [messages] = await pool.execute(
                    `SELECT from_number, to_number, message_type, body, caption 
                    FROM messages WHERE message_id = ?`,
                    [messageId]
                );
                messageInfo = messages[0] || null;
            }

            // Update message status
            if (type === 'retracted') {
                await pool.execute(
                    `UPDATE messages 
                    SET is_retracted = TRUE, retracted_at = FROM_UNIXTIME(?), updated_at = CURRENT_TIMESTAMP
                    WHERE message_id = ?`,
                    [timestamp, messageId]
                );
            } else {
                await pool.execute(
                    `UPDATE messages 
                    SET is_deleted = TRUE, deleted_at = FROM_UNIXTIME(?), updated_at = CURRENT_TIMESTAMP
                    WHERE message_id = ?`,
                    [timestamp, messageId]
                );
            }

            // Save to deleted messages log
            await pool.execute(
                `INSERT INTO deleted_messages_log 
                (message_id, session_id, from_number, to_number, message_type, body_preview, deletion_type)
                VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                    messageId,
                    sessionId,
                    messageInfo?.from_number || null,
                    messageInfo?.to_number || null,
                    messageInfo?.message_type || 'text',
                    (messageInfo?.body || messageInfo?.caption || '').substring(0, 255),
                    type
                ]
            );

            // Forward to webhook
            await this.forwardToWebhook(sessionId, {
                event: 'message_revoked',
                message: {
                    messageId,
                    type,
                    deletedAt: timestamp,
                    preview: messageInfo ? {
                        from: messageInfo.from_number,
                        to: messageInfo.to_number,
                        type: messageInfo.message_type,
                        body: messageInfo.body || messageInfo.caption
                    } : null
                }
            });

            return true;
        } catch (error) {
            console.error('Error handling message revoked:', error);
            return false;
        }
    }

    // Save reply relationship
    async saveReply(sessionId, messageId, replyToMessageId) {
        try {
            // Update message with reply_to_message_id
            await pool.execute(
                `UPDATE messages SET reply_to_message_id = ?, has_quoted_msg = TRUE 
                WHERE message_id = ?`,
                [replyToMessageId, messageId]
            );

            // Save to message_replies table
            await pool.execute(
                `INSERT INTO message_replies (message_id, reply_to_message_id, session_id)
                VALUES (?, ?, ?)
                ON DUPLICATE KEY UPDATE reply_to_message_id = VALUES(reply_to_message_id)`,
                [messageId, replyToMessageId, sessionId]
            );

            return true;
        } catch (error) {
            console.error('Error saving reply:', error);
            return false;
        }
    }
}

module.exports = new MessageHandler();


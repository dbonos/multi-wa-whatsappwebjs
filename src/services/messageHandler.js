const pool = require('../config/database');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const { getWIBTime, getWIBTimestamp, getWIBToday, formatWIBDisplay, convertUTCToWIBTimestamp } = require('../utils/timezone');
const { buildAttachmentUrl } = require('../utils/attachments');

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
            if (!contact || !contact.id || !contact.id._serialized) {
                return null;
            }
            const contactId = contact.id._serialized;
            if (!contactId) {
                return null;
            }
            let phoneNumber = null;
            let lidOriginal = null;

            // Extract phone number
            if (contact.number) {
                phoneNumber = contact.number;
            } else if (contact.id && contact.id.user) {
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

            const safeParam = (value) => (value === undefined ? null : value);
            const params = [
                safeParam(sessionId),
                safeParam(contactId),
                safeParam(phoneNumber),
                safeParam(contact.name || null),
                safeParam(contact.pushname || null),
                !!contact.isBusiness,
                !!contact.isMyContact,
                !!contact.isGroup,
                safeParam(lidOriginal),
                safeParam(profilePictureUrl),
                safeParam(phoneNumber), // For ON DUPLICATE KEY UPDATE
                safeParam(contact.name || null),
                safeParam(contact.pushname || null),
                safeParam(profilePictureUrl)
            ];
            const paramNames = [
                'sessionId',
                'contactId',
                'phoneNumber',
                'name',
                'pushname',
                'isBusiness',
                'isMyContact',
                'isGroup',
                'lidOriginal',
                'profilePictureUrl',
                'dupPhoneNumber',
                'dupName',
                'dupPushname',
                'dupProfilePictureUrl'
            ];
            if (params.some((value) => value === undefined)) {
                const undefinedParams = paramNames
                    .map((name, index) => ({ name, value: params[index] }))
                    .filter((entry) => entry.value === undefined);
                console.warn('⚠️ [DB] Undefined contact params detected:', undefinedParams);
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
                params
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
                // Need to check multiple formats because group_id might be stored differently
                // Also check contact_id field in skip_messages (some entries might use contact_id instead of group_id)
                const [skipGroups] = await pool.execute(
                    `SELECT id, group_id, contact_id FROM skip_messages 
                    WHERE session_id = ? 
                    AND type = 'group' 
                    AND is_active = TRUE
                    AND (
                        group_id = ? 
                        OR contact_id = ?
                        OR group_id LIKE CONCAT('%', ?, '%')
                        OR contact_id LIKE CONCAT('%', ?, '%')
                    )`,
                    [
                        sessionId, 
                        contactId, 
                        contactId,
                        contactId.replace('@g.us', '').replace('@c.us', '').replace('@lid', ''), // Extract ID part
                        contactId.replace('@g.us', '').replace('@c.us', '').replace('@lid', '')
                    ]
                );
                
                console.log(`🔍 [SKIP CHECK] Group skip query result:`, {
                    contactId: contactId,
                    found: skipGroups.length,
                    skipIds: skipGroups.map(s => s.id),
                    skipGroupIds: skipGroups.map(s => s.group_id),
                    skipContactIds: skipGroups.map(s => s.contact_id)
                });
                
                if (skipGroups.length > 0) {
                    console.log(`⏭️  [SKIP] Skipping message from group: ${contactId} (matched: ${skipGroups[0].group_id || skipGroups[0].contact_id})`);
                    return true;
                }
                
                // Additional check: Look up contact in contacts table to get lid_original
                // and check if that matches any skip_messages
                try {
                    const [contactCheck] = await pool.execute(
                        `SELECT contact_id, lid_original 
                        FROM contacts 
                        WHERE session_id = ? 
                        AND (contact_id = ? OR lid_original = ?)
                        AND is_group = TRUE
                        LIMIT 1`,
                        [sessionId, contactId, contactId]
                    );
                    
                    if (contactCheck.length > 0) {
                        const contact = contactCheck[0];
                        const checkContactId = contact.contact_id;
                        const checkLidOriginal = contact.lid_original;
                        
                        console.log(`🔍 [SKIP CHECK] Found contact in DB:`, {
                            contactId: checkContactId,
                            lidOriginal: checkLidOriginal
                        });
                        
                        // Check skip_messages with both contact_id and lid_original
                        if (checkContactId || checkLidOriginal) {
                            const [skipByContact] = await pool.execute(
                                `SELECT id FROM skip_messages 
                                WHERE session_id = ? 
                                AND type = 'group' 
                                AND is_active = TRUE
                                AND (
                                    group_id = ? 
                                    OR group_id = ?
                                    OR contact_id = ?
                                    OR contact_id = ?
                                )`,
                                [
                                    sessionId, 
                                    checkContactId || '', 
                                    checkLidOriginal || '',
                                    checkContactId || '',
                                    checkLidOriginal || ''
                                ]
                            );
                            
                            if (skipByContact.length > 0) {
                                console.log(`⏭️  [SKIP] Skipping message from group (found via contact lookup): ${contactId} -> ${checkContactId || checkLidOriginal}`);
                                return true;
                            }
                        }
                    }
                } catch (contactError) {
                    console.error(`⚠️ [SKIP CHECK] Error checking contact for group skip:`, contactError.message);
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
            const chat = await message.getChat();
            const contactId = chat.id._serialized; // This is the destination (to_number)
            
            // Skip status messages
            if (contactId === 'status@broadcast' || message.to === 'status@broadcast') {
                console.log('⏭️ Skipping status message, not saving to database');
                return { skipped: true, messageId: message.id?._serialized || 'status_message' };
            }
            
            console.log(`📤 [MESSAGE HANDLER] Processing outgoing message from mobile: ${message.id._serialized} for session: ${sessionId}`);
            
            // For outgoing messages, to_number is the destination
            const isGroup = chat.isGroup || false;
            
            // Get contact (works for both group and individual)
            let contact = null;
            let toNumber = null;
            try {
                if (!isGroup && typeof chat.getContact === 'function') {
                    contact = await chat.getContact();
                    toNumber = contact?.number || (contactId.includes('@c.us') ? contactId.replace('@c.us', '') : null);
                } else if (!isGroup) {
                    // Fallback: extract number from contactId
                    toNumber = contactId.includes('@c.us') ? contactId.replace('@c.us', '') : null;
                }
            } catch (err) {
                console.log(`⚠️ [MESSAGE HANDLER] Error getting contact for outgoing message:`, err.message);
                if (!isGroup) {
                    toNumber = contactId.includes('@c.us') ? contactId.replace('@c.us', '') : null;
                }
            }
            
            console.log(`📤 [MESSAGE HANDLER] Outgoing message details:`, {
                messageId: message.id._serialized,
                contactId: contactId,
                toNumber: toNumber,
                isGroup: isGroup,
                hasBody: !!message.body,
                hasContact: !!contact
            });
            
            // Save contact first (with @lid conversion) - needed to get correct contact_id
            // For groups, we still need to save the group contact info
            let contactInfo = null;
            if (contact) {
                contactInfo = await this.saveContact(sessionId, contact);
            } else if (isGroup) {
                // For groups, create a minimal contact object to save group info
                try {
                    const groupContact = {
                        id: { _serialized: contactId },
                        name: chat.name || null,
                        pushname: chat.name || null,
                        number: null,
                        isBusiness: false,
                        isMyContact: false,
                        isGroup: true
                    };
                    contactInfo = await this.saveContact(sessionId, groupContact);
                } catch (groupErr) {
                    console.log(`⚠️ [MESSAGE HANDLER] Error saving group contact:`, groupErr.message);
                }
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
            let attachmentUrl = null;
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
                attachmentUrl = buildAttachmentUrl(attachmentPath);
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
            // We store created_at/updated_at as WIB wall-clock time (DATETIME after migration).
            let [result] = await pool.execute(
                `INSERT INTO messages 
                (session_id, message_id, from_number, to_number, contact_id, direction, fromAI, message_type, body, caption, status, timestamp, is_forwarded, has_quoted_msg, quoted_msg_id, reply_to_message_id, attachment_path, attachment_url, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, 'outgoing', 0, ?, ?, ?, 'sent', ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
                ON DUPLICATE KEY UPDATE
                updated_at = NOW()`,
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
                    attachmentPath,
                    attachmentUrl
                ]
            );
            
            console.log(`💾 [MESSAGE HANDLER] Database insert result:`, {
                insertId: result.insertId,
                affectedRows: result.affectedRows
            });
            
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

            // Forward to webhook
            await this.forwardToWebhook(sessionId, {
                event: 'message',
                message: {
                    id: message.id._serialized,
                    from: null, // Outgoing message from mobile device
                    to: finalToNumber,
                    contactId: finalContactId,
                    type: messageType,
                    body: message.body || caption,
                    timestamp: message.timestamp ? convertUTCToWIBTimestamp(message.timestamp) : getWIBTimestamp(),
                    attachment: attachmentPath ? {
                        path: attachmentPath,
                        url: attachmentUrl,
                        type: messageType
                    } : null,
                    direction: 'outgoing',
                    fromAI: 0
                }
            });

            return { success: true, insertId: result.insertId, messageId: message.id._serialized };
        } catch (error) {
            console.error(`❌ [MESSAGE HANDLER] Error saving outgoing message for session ${sessionId}:`, error);
            return { success: false, error: error.message, messageId: message.id._serialized };
        }
    }

    // Save incoming message to database
    async saveIncomingMessage(sessionId, message) {
        let contactId = null;
        let fromNumber = null;
        let finalContactId = null;
        let finalFromNumber = null;
        try {
            // Skip status messages
            if (message.from === 'status@broadcast' || message.to === 'status@broadcast') {
                console.log('⏭️ Skipping status message, not saving to database');
                return { skipped: true, messageId: message.id?._serialized || 'status_message' };
            }
            
            console.log(`📨 [MESSAGE HANDLER] Processing incoming message: ${message.id._serialized} for session: ${sessionId}`);
            
            const chat = await message.getChat();
            const contact = await message.getContact();
            
            // Check if this is a group
            const isGroup = chat.isGroup || false;
            contactId = contact.id._serialized;
            fromNumber = contact.number || null;
            
            // For groups, also get chat.id which might be different from contact.id
            const chatId = chat.id ? chat.id._serialized : contactId;
            
            console.log(`📨 [MESSAGE HANDLER] Message details:`, {
                messageId: message.id._serialized,
                contactId: contactId,
                chatId: chatId,
                fromNumber: fromNumber,
                isGroup: isGroup,
                hasBody: !!message.body,
                chatIsGroup: chat.isGroup
            });
            
            // Save contact first (with @lid conversion) - needed to get correct contact_id
            const contactInfo = await this.saveContact(sessionId, contact);
            
            // Update fromNumber and contactId with contactInfo if available
            // CRITICAL: Use the contact_id from saveContact (after @lid conversion) for skip check
            // For groups, also check with chatId as it might be the actual group ID
            finalContactId = contactInfo?.contactId || contactId;
            finalFromNumber = contactInfo?.phoneNumber || fromNumber;
            
            // For groups, check skip with both contactId and chatId
            // Sometimes chat.id is different from contact.id for groups
            let shouldSkip = false;
            if (isGroup) {
                // Check with finalContactId first
                shouldSkip = await this.shouldSkipMessage(sessionId, finalContactId, finalFromNumber, isGroup);
                
                // If not skipped, also check with chatId (might be different format)
                if (!shouldSkip && chatId !== finalContactId) {
                    console.log(`🔍 [SKIP CHECK] Also checking with chatId: ${chatId} (different from contactId: ${finalContactId})`);
                    shouldSkip = await this.shouldSkipMessage(sessionId, chatId, finalFromNumber, isGroup);
                }
            } else {
                // For non-groups, use the standard check
                shouldSkip = await this.shouldSkipMessage(sessionId, finalContactId, finalFromNumber, isGroup);
            }
            
            console.log(`📨 [MESSAGE HANDLER] Should skip: ${shouldSkip}`, {
                originalContactId: contactId,
                chatId: chatId,
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
            let attachmentUrl = null;
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
                attachmentUrl = buildAttachmentUrl(attachmentPath);
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
            // We store created_at/updated_at as WIB wall-clock time (DATETIME after migration).
            let [result] = await pool.execute(
                `INSERT INTO messages 
                (session_id, message_id, from_number, to_number, contact_id, direction, fromAI, message_type, body, caption, status, timestamp, is_forwarded, has_quoted_msg, quoted_msg_id, reply_to_message_id, attachment_path, attachment_url, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, 'incoming', 0, ?, ?, ?, 'delivered', ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
                ON DUPLICATE KEY UPDATE
                updated_at = NOW()`,
                [
                    sessionId,
                    message.id._serialized,
                    finalFromNumber,
                    null, // to_number for incoming
                    finalContactId, // Use finalContactId (after @lid conversion)
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
                    attachmentPath,
                    attachmentUrl
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
                    from: finalFromNumber,
                    contactId: finalContactId, // Use finalContactId (after @lid conversion)
                    type: messageType,
                    body: message.body || caption,
                    timestamp: message.timestamp ? convertUTCToWIBTimestamp(message.timestamp) : getWIBTimestamp(),
                    attachment: attachmentPath ? {
                        path: attachmentPath,
                        url: attachmentUrl,
                        type: messageType
                    } : null,
                    direction: 'incoming',
                    fromAI: 0
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
                contactId: finalContactId || contactId,
                fromNumber: finalFromNumber || fromNumber
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
            console.log(`🔗 [WEBHOOK] Attempting to forward webhook for session ${sessionId}, event: ${data.event || 'message'}`);
            
            // Get active webhooks for this session
            const [webhooks] = await pool.execute(
                `SELECT webhook_url, events, direction_filter FROM webhooks 
                WHERE (session_id = ? OR session_id IS NULL) AND is_active = TRUE`,
                [sessionId]
            );

            console.log(`🔗 [WEBHOOK] Found ${webhooks.length} active webhook(s) for session ${sessionId}`);

            // Fallback: If no webhooks configured, don't send anything
            if (!webhooks || webhooks.length === 0) {
                console.log(`ℹ️ [WEBHOOK] No webhooks configured for session ${sessionId}, skipping webhook send`);
                return;
            }

            // Filter webhooks by event type and direction
            const eventType = data.event || 'message';
            const messageDirection = data.message?.direction || 'incoming'; // incoming or outgoing
            
            const filteredWebhooks = webhooks.filter(webhook => {
                // Filter by event type
                let matchesEvent = true;
                if (webhook.events) {
                    const events = typeof webhook.events === 'string' 
                        ? JSON.parse(webhook.events) 
                        : webhook.events;
                    matchesEvent = Array.isArray(events) && events.includes(eventType);
                }
                
                // Filter by direction
                const directionFilter = webhook.direction_filter || 'both';
                let matchesDirection = true;
                if (directionFilter !== 'both') {
                    matchesDirection = directionFilter === messageDirection;
                }
                
                const shouldSend = matchesEvent && matchesDirection;
                console.log(`🔗 [WEBHOOK] Webhook ${webhook.webhook_url}: event=${matchesEvent}, direction=${matchesDirection} (filter: ${directionFilter}, message: ${messageDirection}), send=${shouldSend}`);
                
                return shouldSend;
            });

            console.log(`🔗 [WEBHOOK] After filtering, ${filteredWebhooks.length} webhook(s) will receive event '${eventType}'`);

            if (filteredWebhooks.length === 0) {
                console.log(`ℹ️ [WEBHOOK] No webhooks configured for event '${eventType}' in session ${sessionId}`);
                return;
            }

            // Forward to all matching webhooks
            const promises = filteredWebhooks.map(webhook => {
                console.log(`📤 [WEBHOOK] Sending to ${webhook.webhook_url}...`);
                return axios.post(webhook.webhook_url, data, {
                    timeout: parseInt(process.env.WEBHOOK_TIMEOUT) || 5000,
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Session-Id': sessionId
                    }
                }).then(response => {
                    console.log(`✅ [WEBHOOK] Successfully sent to ${webhook.webhook_url}, status: ${response.status}`);
                }).catch(err => {
                    console.error(`❌ [WEBHOOK] Error sending to ${webhook.webhook_url}:`, err.message);
                    if (err.response) {
                        console.error(`❌ [WEBHOOK] Response status: ${err.response.status}, data:`, err.response.data);
                    }
                });
            });

            await Promise.allSettled(promises);
            console.log(`✅ [WEBHOOK] Completed sending ${eventType} event to ${filteredWebhooks.length} webhook(s)`);

            // Mark webhook as sent
            if (data.message && data.message.id) {
                try {
                await pool.execute(
                    `UPDATE messages SET webhook_sent = TRUE, webhook_sent_at = CURRENT_TIMESTAMP 
                    WHERE message_id = ?`,
                    [data.message.id]
                );
                    console.log(`✅ [WEBHOOK] Marked message ${data.message.id} as webhook_sent`);
                } catch (updateError) {
                    console.error(`❌ [WEBHOOK] Error updating webhook_sent flag:`, updateError.message);
                }
            }
        } catch (error) {
            console.error('❌ [WEBHOOK] Error forwarding to webhook:', error);
            console.error('❌ [WEBHOOK] Error stack:', error.stack);
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
            // FROM_UNIXTIME() returns UTC, so we need to add 7 hours (25200 seconds) for WIB
            // CURRENT_TIMESTAMP should already be WIB due to timezone setting in database.js wrapper
            if (type === 'retracted') {
                await pool.execute(
                    `UPDATE messages 
                    SET is_retracted = TRUE, retracted_at = FROM_UNIXTIME(? + 25200), updated_at = CURRENT_TIMESTAMP
                    WHERE message_id = ?`,
                    [timestamp, messageId]
                );
            } else {
                await pool.execute(
                    `UPDATE messages 
                    SET is_deleted = TRUE, deleted_at = FROM_UNIXTIME(? + 25200), updated_at = CURRENT_TIMESTAMP
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


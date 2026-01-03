# WhatsApp-Web.js Capabilities Guide

## 📚 Apa Saja yang Bisa Dilakukan dengan whatsapp-web.js?

whatsapp-web.js adalah library Node.js yang menggunakan Chrome DevTools Protocol untuk berinteraksi dengan WhatsApp Web. Berikut **SEMUA** fitur yang tersedia:

---

## 1️⃣ **Messaging (Kirim Pesan)**

### Text Messages
```javascript
// Simple text
await client.sendMessage('6281234567890@c.us', 'Hello World!');

// With mentions
await client.sendMessage('GROUP_ID@g.us', 'Hello @6281234567890', {
    mentions: ['6281234567890@c.us']
});

// With link preview
await client.sendMessage('6281234567890@c.us', 'Check this: https://google.com', {
    linkPreview: true
});

// Reply to message
await message.reply('This is a reply');
```

### Media Messages
```javascript
// Send image
const media = MessageMedia.fromFilePath('./image.jpg');
await client.sendMessage('6281234567890@c.us', media, {
    caption: 'Photo caption'
});

// Send video
const video = MessageMedia.fromFilePath('./video.mp4');
await client.sendMessage('6281234567890@c.us', video);

// Send audio/voice note
const audio = MessageMedia.fromFilePath('./audio.mp3');
await client.sendMessage('6281234567890@c.us', audio, {
    sendAudioAsVoice: true  // Send as voice note
});

// Send document/file
const doc = MessageMedia.fromFilePath('./document.pdf');
await client.sendMessage('6281234567890@c.us', doc);

// Send sticker
const sticker = MessageMedia.fromFilePath('./sticker.webp');
await client.sendMessage('6281234567890@c.us', sticker, {
    sendMediaAsSticker: true
});

// Send location
await client.sendMessage('6281234567890@c.us', new Location(-6.2088, 106.8456, 'Jakarta'));

// Send contact card (vCard)
const contact = await client.getContactById('6281234567890@c.us');
await client.sendMessage('6289876543210@c.us', contact);
```

### Advanced Messaging
```javascript
// Send to multiple recipients
await client.sendMessage(['6281234567890@c.us', '6289876543210@c.us'], 'Broadcast message');

// Schedule message (with delay)
setTimeout(() => {
    client.sendMessage('6281234567890@c.us', 'Scheduled message');
}, 5000);

// Send buttons (business accounts)
const buttons = new Buttons('Button message', [
    {id: '1', body: 'Option 1'},
    {id: '2', body: 'Option 2'}
], 'Title', 'Footer');
await client.sendMessage('6281234567890@c.us', buttons);

// Send list (business accounts)
const list = new List('List message', 'Button text', [
    {title: 'Section 1', rows: [
        {id: '1', title: 'Row 1', description: 'Description 1'}
    ]}
], 'Title', 'Footer');
await client.sendMessage('6281234567890@c.us', list);
```

---

## 2️⃣ **Receiving Messages (Terima Pesan)**

### Listen to Messages
```javascript
// All messages
client.on('message', async (msg) => {
    console.log('Message received:', msg.body);
    
    // Get message info
    const chat = await msg.getChat();
    const contact = await msg.getContact();
    
    // Message properties
    console.log('From:', msg.from);
    console.log('Timestamp:', msg.timestamp);
    console.log('Is forwarded:', msg.isForwarded);
    console.log('Has media:', msg.hasMedia);
});

// Only direct messages (not groups)
client.on('message', async (msg) => {
    const chat = await msg.getChat();
    if (!chat.isGroup) {
        console.log('Direct message:', msg.body);
    }
});

// Only group messages
client.on('message', async (msg) => {
    const chat = await msg.getChat();
    if (chat.isGroup) {
        console.log('Group message:', msg.body, 'in', chat.name);
    }
});

// Message with media
client.on('message', async (msg) => {
    if (msg.hasMedia) {
        const media = await msg.downloadMedia();
        console.log('Media type:', media.mimetype);
        console.log('Media data:', media.data); // base64
    }
});

// Quoted/Replied messages
client.on('message', async (msg) => {
    if (msg.hasQuotedMsg) {
        const quotedMsg = await msg.getQuotedMessage();
        console.log('Replying to:', quotedMsg.body);
    }
});
```

### Auto Reply Bot Example
```javascript
client.on('message', async (msg) => {
    // Command bot
    if (msg.body === '!ping') {
        msg.reply('pong');
    }
    
    if (msg.body === '!info') {
        const contact = await msg.getContact();
        msg.reply(`Name: ${contact.pushname}\nNumber: ${contact.number}`);
    }
    
    if (msg.body.startsWith('!echo ')) {
        const text = msg.body.slice(6);
        msg.reply(text);
    }
});
```

---

## 3️⃣ **Contacts Management**

### Get Contacts
```javascript
// All contacts
const contacts = await client.getContacts();

// Filter contacts
const myContacts = contacts.filter(c => c.isMyContact);
const blocked = contacts.filter(c => c.isBlocked);
const business = contacts.filter(c => c.isBusiness);

// Get specific contact
const contact = await client.getContactById('6281234567890@c.us');

// Contact properties
console.log('Name:', contact.name);
console.log('Push name:', contact.pushname);
console.log('Number:', contact.number);
console.log('Profile pic:', await contact.getProfilePicUrl());
console.log('About:', await contact.getAbout());
console.log('Is WABusiness:', contact.isBusiness);
console.log('Is enterprise:', contact.isEnterprise);
```

### Contact Operations
```javascript
// Block/Unblock contact
await contact.block();
await contact.unblock();

// Get common groups
const commonGroups = await contact.getCommonGroups();

// Check if contact exists
const numberId = await client.getNumberId('6281234567890');
if (numberId) {
    console.log('Contact exists:', numberId._serialized);
}
```

---

## 4️⃣ **Chats Management**

### Get Chats
```javascript
// All chats
const chats = await client.getChats();

// Filter chats
const unreadChats = chats.filter(c => c.unreadCount > 0);
const groupChats = chats.filter(c => c.isGroup);
const directChats = chats.filter(c => !c.isGroup);
const archivedChats = chats.filter(c => c.archived);

// Get specific chat
const chat = await client.getChatById('6281234567890@c.us');

// Chat properties
console.log('Name:', chat.name);
console.log('Unread count:', chat.unreadCount);
console.log('Last message:', chat.lastMessage.body);
console.log('Timestamp:', chat.timestamp);
console.log('Is muted:', chat.isMuted);
console.log('Is archived:', chat.archived);
console.log('Is pinned:', chat.pinned);
```

### Chat Operations
```javascript
// Mark as read/unread
await chat.markUnread();
await chat.sendSeen();

// Archive/Unarchive
await chat.archive();
await chat.unarchive();

// Pin/Unpin
await chat.pin();
await chat.unpin();

// Mute/Unmute
await chat.mute(); // Mute forever
await chat.unmute();

// Delete chat
await chat.delete();
await chat.clearMessages(); // Clear messages but keep chat

// Get chat messages
const messages = await chat.fetchMessages({ limit: 50 });

// Search in chat
const searchResults = await chat.fetchMessages({ 
    limit: 100,
    searchString: 'keyword'
});

// Send typing indicator
await chat.sendStateTyping();
await chat.clearState(); // Stop typing

// Send recording indicator
await chat.sendStateRecording();
```

---

## 5️⃣ **Groups Management**

### Create & Manage Groups
```javascript
// Create group
const group = await client.createGroup('Group Name', [
    '6281234567890@c.us',
    '6289876543210@c.us'
]);

// Get group info
const chat = await client.getChatById('GROUP_ID@g.us');
console.log('Name:', chat.name);
console.log('Description:', await chat.getDescription());
console.log('Participants:', chat.participants);
console.log('Owner:', chat.owner);

// Update group
await chat.setSubject('New Group Name');
await chat.setDescription('New description');
await chat.setMessagesAdminsOnly(true); // Only admins can send
```

### Group Picture
```javascript
// Set group picture
const media = MessageMedia.fromFilePath('./group-pic.jpg');
await chat.setPicture(media);

// Get group picture
const picUrl = await chat.getProfilePicUrl();
```

### Group Participants
```javascript
// Add participants
await chat.addParticipants(['6281234567890@c.us']);

// Remove participants
await chat.removeParticipants(['6281234567890@c.us']);

// Promote to admin
await chat.promoteParticipants(['6281234567890@c.us']);

// Demote from admin
await chat.demoteParticipants(['6281234567890@c.us']);

// Leave group
await chat.leave();

// Get invite code
const inviteCode = await chat.getInviteCode();
console.log('Invite link:', `https://chat.whatsapp.com/${inviteCode}`);

// Revoke invite code
await chat.revokeInvite();

// Accept invite
await client.acceptInvite('INVITE_CODE');
```

### Group Settings
```javascript
// Settings permissions
await chat.setInfoAdminsOnly(true); // Only admins can edit info
await chat.setMessagesAdminsOnly(true); // Only admins can send messages

// Announce mode (admins only)
await chat.setMessagesAdminsOnly(true);
```

---

## 6️⃣ **Status/Stories**

```javascript
// Get status/stories
const status = await client.getStatus();

// Post text status
await client.sendMessage('status@broadcast', 'My status text');

// Post media status
const media = MessageMedia.fromFilePath('./status-image.jpg');
await client.sendMessage('status@broadcast', media, {
    caption: 'Status caption'
});
```

---

## 7️⃣ **Profile Management**

### Own Profile
```javascript
// Get own info
const me = await client.info;
console.log('My number:', me.wid.user);
console.log('My name:', me.pushname);

// Set profile picture
const media = MessageMedia.fromFilePath('./profile-pic.jpg');
await client.setProfilePicture(media);

// Set display name
await client.setDisplayName('New Name');

// Set status/about
await client.setStatus('New status message');

// Get profile picture
const myPicUrl = await client.getProfilePicUrl(me.wid._serialized);
```

---

## 8️⃣ **Business Features**

### Business Profile
```javascript
// Get business profile
const contact = await client.getContactById('BUSINESS_NUMBER@c.us');
if (contact.isBusiness) {
    const profile = await contact.getBusinessProfile();
    console.log('Business name:', profile.description);
    console.log('Category:', profile.category);
    console.log('Address:', profile.address);
    console.log('Website:', profile.website);
}
```

### Product Catalog
```javascript
// Get products
const products = await contact.getProducts();
products.forEach(product => {
    console.log('Product:', product.name);
    console.log('Price:', product.price);
    console.log('Description:', product.description);
});
```

---

## 9️⃣ **Labels (Business)**

```javascript
// Get labels
const labels = await client.getLabels();

// Get chats by label
const labeledChats = await client.getChatsByLabelId('LABEL_ID');

// Add label to chat
await chat.addLabel('LABEL_ID');

// Remove label from chat
await chat.removeLabel('LABEL_ID');
```

---

## 🔟 **Message Reactions & Read Receipts**

### Reactions
```javascript
// React to message
await message.react('👍');
await message.react('❤️');

// Remove reaction
await message.react('');

// Get reactions
const reactions = await message.getReactions();
reactions.forEach(r => {
    console.log('User:', r.senderId, 'reacted with:', r.emoji);
});
```

### Read Receipts
```javascript
// Get message info (read receipts, delivery)
const info = await message.getInfo();
console.log('Delivery:', info.delivery);
console.log('Read:', info.read);
console.log('Played:', info.played); // For audio/video
```

---

## 1️⃣1️⃣ **Events & Webhooks**

### Available Events
```javascript
// QR Code
client.on('qr', (qr) => {
    console.log('QR Code:', qr);
});

// Ready
client.on('ready', () => {
    console.log('Client is ready!');
});

// Authenticated
client.on('authenticated', () => {
    console.log('Authenticated!');
});

// Auth failure
client.on('auth_failure', (msg) => {
    console.log('Auth failed:', msg);
});

// Disconnected
client.on('disconnected', (reason) => {
    console.log('Disconnected:', reason);
});

// Message received
client.on('message', async (msg) => {
    console.log('Message:', msg.body);
});

// Message created (sent by you)
client.on('message_create', async (msg) => {
    console.log('You sent:', msg.body);
});

// Message revoked (deleted)
client.on('message_revoke_everyone', async (after, before) => {
    console.log('Message deleted:', before.body);
});

// Message revoked by me
client.on('message_revoke_me', async (msg) => {
    console.log('I deleted:', msg.body);
});

// Message acknowledged (delivered, read)
client.on('message_ack', (msg, ack) => {
    console.log('Message ack:', ack);
    // ack values:
    // 1 = sent
    // 2 = delivered
    // 3 = read
    // 4 = played (audio/video)
});

// Message reaction
client.on('message_reaction', (reaction) => {
    console.log('Reaction:', reaction.reaction, 'on message:', reaction.msgId);
});

// Group join
client.on('group_join', (notification) => {
    console.log('User joined group:', notification);
});

// Group leave
client.on('group_leave', (notification) => {
    console.log('User left group:', notification);
});

// Group update
client.on('group_update', (notification) => {
    console.log('Group updated:', notification);
});

// Contact changed
client.on('contact_changed', (message, oldId, newId, isContact) => {
    console.log('Contact changed:', oldId, '->', newId);
});

// Call received
client.on('call', (call) => {
    console.log('Call from:', call.from);
    call.reject(); // Reject call
});

// Change state (typing, recording, etc)
client.on('change_state', (state) => {
    console.log('State changed:', state);
});

// Battery status
client.on('change_battery', (batteryInfo) => {
    console.log('Battery:', batteryInfo.battery, '%');
    console.log('Plugged:', batteryInfo.plugged);
});

// Loading screen
client.on('loading_screen', (percent, message) => {
    console.log('Loading:', percent, '%', message);
});
```

---

## 1️⃣2️⃣ **Advanced Features**

### Download Media
```javascript
const msg = await message; // from event
if (msg.hasMedia) {
    const media = await msg.downloadMedia();
    
    // Save to file
    const fs = require('fs');
    const buffer = Buffer.from(media.data, 'base64');
    fs.writeFileSync(`./download.${media.mimetype.split('/')[1]}`, buffer);
}
```

### Forward Messages
```javascript
// Forward message
await client.forwardMessage('6281234567890@c.us', message);

// Forward to multiple
await client.forwardMessage([
    '6281234567890@c.us',
    '6289876543210@c.us'
], message);
```

### Star/Unstar Messages
```javascript
await message.star();
await message.unstar();

// Get starred messages
const starredMsgs = await chat.fetchMessages({ 
    starred: true 
});
```

### Broadcast Lists
```javascript
// Create broadcast
const broadcast = await client.createBroadcast([
    '6281234567890@c.us',
    '6289876543210@c.us'
]);

// Send to broadcast
await broadcast.send('Broadcast message');
```

### Get Profile Pictures
```javascript
// Get contact profile picture
const contact = await client.getContactById('6281234567890@c.us');
const picUrl = await contact.getProfilePicUrl();

// Get high quality
const picUrlHQ = await contact.getProfilePicUrl(true);

// Download profile picture
const response = await fetch(picUrl);
const buffer = await response.buffer();
fs.writeFileSync('./profile.jpg', buffer);
```

---

## 1️⃣3️⃣ **Multi-Device Support**

```javascript
// whatsapp-web.js supports WhatsApp Multi-Device!
// Just initialize normally:
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { headless: true }
});

// It will automatically use multi-device protocol
```

---

## 1️⃣4️⃣ **Pagination & Performance**

```javascript
// Get messages with pagination
const messages = await chat.fetchMessages({ 
    limit: 50,  // Messages per page
    fromMe: false  // Only received messages
});

// Load more messages
const olderMessages = await chat.fetchMessages({
    limit: 50,
    before: messages[0] // Load before first message
});

// Search with filters
const filteredMsgs = await chat.fetchMessages({
    limit: 100,
    searchString: 'keyword',
    fromMe: true,
    date: new Date('2024-01-01')
});
```

---

## 📊 **Summary: Capabilities Matrix**

| Feature | Supported | Notes |
|---------|-----------|-------|
| Send text messages | ✅ | Including mentions, links |
| Send media (image, video, audio) | ✅ | All formats |
| Send documents | ✅ | PDF, DOCX, etc |
| Send stickers | ✅ | Custom stickers |
| Send location | ✅ | GPS coordinates |
| Send contact cards | ✅ | vCard format |
| Receive messages | ✅ | All types |
| Download media | ✅ | Images, videos, documents |
| Reply to messages | ✅ | Quoted replies |
| Forward messages | ✅ | Single/multiple |
| Delete messages | ✅ | For everyone |
| React to messages | ✅ | Emojis |
| Read receipts | ✅ | See who read |
| Typing indicator | ✅ | Send typing state |
| Recording indicator | ✅ | Send recording state |
| Contact management | ✅ | Get, block, unblock |
| Profile pictures | ✅ | Get, set, download |
| Status/Stories | ✅ | View, post |
| Groups create | ✅ | Full management |
| Groups admin | ✅ | Promote, demote |
| Groups settings | ✅ | All permissions |
| Business features | ✅ | Products, catalog |
| Labels | ✅ | Business labels |
| Broadcast lists | ✅ | Create, send |
| Multi-device | ✅ | Native support |
| Webhooks/Events | ✅ | 20+ events |
| Auto-reply bots | ✅ | Full support |
| @lid handling | ⚠️ | 80-90% success |
| Voice calls | ❌ | Not supported |
| Video calls | ❌ | Not supported |
| Stories upload | ✅ | Text & media |

---

## 💡 **Performance Tips**

1. **Use LocalAuth** - Better session persistence
2. **Headless mode** - Lower resource usage
3. **Limit message fetching** - Use pagination
4. **Cache contacts** - Don't fetch repeatedly
5. **Handle events efficiently** - Don't block event loop
6. **Multiple instances** - Scale horizontally

---

## 🚀 **What Can You Build?**

### ✅ Possible Use Cases:
- Customer service chatbot
- Notification system
- Group management bot
- Broadcasting service
- Auto-reply system
- Message backup/archiving
- Analytics dashboard
- CRM integration
- E-commerce order notifications
- Appointment reminders
- Survey/polling bot
- File sharing service
- Multi-agent support system
- Marketing campaigns
- Status monitoring
- Integration with other platforms

### ❌ Not Possible:
- Voice/Video calling
- Creating new WhatsApp accounts
- Bypassing phone number verification
- Mass messaging without limits (will get banned)
- Breaking WhatsApp ToS

---

**Read More:**
- Official Docs: https://docs.wwebjs.dev/
- GitHub: https://github.com/pedroslopez/whatsapp-web.js
- Examples: https://github.com/pedroslopez/whatsapp-web.js/tree/main/example


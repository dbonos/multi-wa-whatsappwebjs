# 🎉 Reactions, Replies & Deleted Messages Feature

## ✅ **What's New**

### **1. Message Reactions** ⭐
- **Backend**: Automatically saves all message reactions to database
- **Frontend**: Displays reactions with emoji and sender info
- **Real-time**: Live updates via WebSocket when reactions are added/removed

### **2. Message Replies** 💬
- **Backend**: Tracks reply relationships between messages
- **Frontend**: Shows reply context with quoted message preview
- **Database**: Stores reply relationships in `message_replies` table

### **3. Deleted/Retracted Messages** 🗑️
- **Backend**: Detects and logs deleted/retracted messages
- **Frontend**: Shows deleted status with visual indicators
- **Database**: Maintains audit trail in `deleted_messages_log` table

---

## 📊 **Database Schema**

### **New Tables**

#### **1. message_reactions**
```sql
CREATE TABLE message_reactions (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    message_id VARCHAR(255) NOT NULL,
    session_id VARCHAR(100) NOT NULL,
    from_number VARCHAR(20) NOT NULL,
    from_contact_id VARCHAR(255),
    reaction_emoji VARCHAR(10) NOT NULL,
    reaction_text VARCHAR(50),
    timestamp BIGINT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_message_reaction (message_id, from_number, reaction_emoji)
);
```

#### **2. message_replies**
```sql
CREATE TABLE message_replies (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    message_id VARCHAR(255) NOT NULL UNIQUE,
    reply_to_message_id VARCHAR(255) NOT NULL,
    session_id VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### **3. deleted_messages_log**
```sql
CREATE TABLE deleted_messages_log (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    message_id VARCHAR(255) NOT NULL,
    session_id VARCHAR(100) NOT NULL,
    from_number VARCHAR(20),
    to_number VARCHAR(20),
    message_type VARCHAR(50),
    body_preview TEXT,
    deleted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deletion_type ENUM('deleted', 'retracted') NOT NULL
);
```

### **Updated Tables**

#### **messages table** - New columns:
- `is_deleted BOOLEAN DEFAULT FALSE`
- `is_retracted BOOLEAN DEFAULT FALSE`
- `deleted_at TIMESTAMP NULL`
- `retracted_at TIMESTAMP NULL`
- `reply_to_message_id VARCHAR(255) NULL`

---

## 🔧 **Backend Implementation**

### **Event Handlers**

#### **1. Message Reaction**
```javascript
client.on('message_reaction', async (reaction) => {
    await messageHandler.saveReaction(sessionId, reaction);
    socketHandler.emitReaction(sessionId, {
        messageId: reaction.msgId._serialized,
        reaction: reaction.reaction,
        from: reaction.senderId
    });
});
```

#### **2. Message Revoked (Everyone)**
```javascript
client.on('message_revoke_everyone', async (after, before) => {
    await messageHandler.handleMessageRevoked(sessionId, after, before, 'retracted');
    socketHandler.emitMessageRevoked(sessionId, {
        messageId: after.id._serialized,
        type: 'retracted'
    });
});
```

#### **3. Message Revoked (Me)**
```javascript
client.on('message_revoke_me', async (msg) => {
    await messageHandler.handleMessageRevoked(sessionId, msg, null, 'deleted');
    socketHandler.emitMessageRevoked(sessionId, {
        messageId: msg.id._serialized,
        type: 'deleted'
    });
});
```

### **API Endpoints**

#### **Get Message Reactions**
```http
GET /api/messages/:messageId/reactions
```

**Response:**
```json
{
  "success": true,
  "reactions": [
    {
      "reaction_emoji": "❤️",
      "reaction_text": "heart",
      "from_number": "6281234567890",
      "timestamp": 1234567890,
      "created_at": "2024-01-01T00:00:00Z"
    }
  ]
}
```

#### **Get Message Replies**
```http
GET /api/messages/:messageId/replies
```

**Response:**
```json
{
  "success": true,
  "replies": [
    {
      "message_id": "3EB0...",
      "body": "This is a reply",
      "timestamp": 1234567890
    }
  ]
}
```

#### **Get Deleted Messages**
```http
GET /api/messages/deleted?sessionId=xxx&type=deleted&limit=50&offset=0
```

**Query Parameters:**
- `sessionId` (optional): Filter by session
- `type` (optional): `deleted` or `retracted`
- `limit` (optional): Default 50
- `offset` (optional): Default 0

**Response:**
```json
{
  "success": true,
  "messages": [
    {
      "message_id": "3EB0...",
      "is_deleted": true,
      "is_retracted": false,
      "deleted_at": "2024-01-01T00:00:00Z",
      "body_preview": "Message preview...",
      "deletion_type": "deleted"
    }
  ]
}
```

---

## 🎨 **Frontend Implementation**

### **shadcn/ui Components**

#### **Installed Components:**
- ✅ `Button` - Modern button component
- ✅ `Card` - Card container component
- ✅ `Badge` - Status badge component

#### **Usage Example:**
```jsx
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader } from '../components/ui/card';
import { Badge } from '../components/ui/badge';

<Card>
  <CardHeader>
    <CardTitle>Message</CardTitle>
  </CardHeader>
  <CardContent>
    <Badge variant="success">Delivered</Badge>
    <Button variant="default">Send</Button>
  </CardContent>
</Card>
```

### **Messages Page Features**

#### **1. Reactions Display**
- Shows all reactions with emoji
- Displays sender info (last 4 digits of phone)
- Real-time updates via WebSocket

#### **2. Reply Indicator**
- Shows quoted message preview
- Visual border and icon
- Click to view original message

#### **3. Deleted/Retracted Status**
- Visual indicators (badge + strikethrough)
- Opacity reduction for deleted messages
- Toggle to show/hide deleted messages

---

## 🚀 **Migration Guide**

### **Step 1: Run Database Migration**
```bash
mysql -u root -p wa_manager < database/migrations/add_reactions_replies_deleted.sql
```

### **Step 2: Update Backend**
Backend sudah otomatis handle events baru. Pastikan:
- ✅ `server.js` sudah updated dengan event handlers
- ✅ `messageHandler.js` sudah ada methods baru
- ✅ `socketHandler.js` sudah ada emit methods

### **Step 3: Update Frontend**
Frontend sudah updated dengan:
- ✅ shadcn/ui components installed
- ✅ Messages page updated
- ✅ API methods added
- ✅ WebSocket listeners added

### **Step 4: Restart Services**
```bash
# Backend
sudo systemctl restart wa-web.service

# Frontend (if running separately)
npm run dev
```

---

## 📱 **Usage**

### **Viewing Reactions**
1. Go to Messages page
2. Reactions appear below each message
3. Shows emoji + sender info

### **Viewing Replies**
1. Messages with replies show a preview box
2. Shows quoted message content
3. Click to view full conversation

### **Viewing Deleted Messages**
1. Click "Show Deleted" button
2. Deleted messages appear with:
   - Strikethrough text
   - Red "Deleted" or "Retracted" badge
   - Reduced opacity

---

## 🔍 **Testing**

### **Test Reactions**
1. Send a message from WhatsApp
2. React to the message (emoji)
3. Check Messages page - reaction should appear

### **Test Replies**
1. Reply to a message in WhatsApp
2. Check Messages page - reply indicator should show

### **Test Deleted**
1. Delete a message in WhatsApp
2. Check Messages page - should show deleted status
3. Click "Show Deleted" to see all deleted messages

---

## 📊 **WebSocket Events**

### **New Events:**

#### **message_reaction**
```javascript
socket.on('message_reaction', (data) => {
  // data.messageId
  // data.from
  // data.reaction.emoji
  // data.reaction.text
});
```

#### **message_revoked**
```javascript
socket.on('message_revoked', (data) => {
  // data.messageId
  // data.type ('deleted' or 'retracted')
});
```

---

## ✅ **Features Summary**

| Feature | Backend | Frontend | Database | WebSocket |
|---------|---------|----------|----------|-----------|
| Reactions | ✅ | ✅ | ✅ | ✅ |
| Replies | ✅ | ✅ | ✅ | ✅ |
| Deleted | ✅ | ✅ | ✅ | ✅ |
| Retracted | ✅ | ✅ | ✅ | ✅ |

---

## 🎉 **What's Next?**

- [ ] Add reaction emoji picker in frontend
- [ ] Add reply functionality in frontend
- [ ] Add delete message functionality
- [ ] Add reaction statistics
- [ ] Add reply thread view

---

**Repository**: https://github.com/dbonos/multi-wa-whatsappwebjs


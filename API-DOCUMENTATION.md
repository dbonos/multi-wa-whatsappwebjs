# API Documentation

## Base URL
```
http://your-server:3000/api
```

## Authentication

Most endpoints require authentication. Include JWT token in header:
```
Authorization: Bearer <your_jwt_token>
```

---

## 🔐 Authentication Endpoints

### Login
```http
POST /api/auth/login
Content-Type: application/json

{
  "username": "admin",
  "password": "admin123"
}
```

**Response:**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "username": "admin",
    "role": "admin"
  }
}
```

### Get Current User
```http
GET /api/auth/me
Authorization: Bearer <token>
```

---

## 📱 Session Management

### List All Sessions
```http
GET /api/sessions
Authorization: Bearer <token>
```

### Create New Session
```http
POST /api/sessions
Authorization: Bearer <token>
Content-Type: application/json

{
  "sessionId": "my_session_1"
}
```

### Get Session Details
```http
GET /api/sessions/:sessionId
Authorization: Bearer <token>
```

### Get QR Code (Auto-refresh)
```http
GET /api/sessions/:sessionId/qr
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "qrCode": "2@...",
  "qrImage": "data:image/png;base64,...",
  "expiresAt": "2024-01-12T14:30:00.000Z"
}
```

### Get Session Status (Real-time)
```http
GET /api/sessions/:sessionId/status
Authorization: Bearer <token>
```

### Delete Session
```http
DELETE /api/sessions/:sessionId
Authorization: Bearer <token>
```

---

## 💬 Message Endpoints

### Send Message (Text)
```http
POST /api/messages/send
Authorization: Bearer <token>
Content-Type: application/json

{
  "sessionId": "my_session_1",
  "phone": "6281234567890",
  "message": "Hello from API!"
}
```

### Send Message (With Attachment)
```http
POST /api/messages/send
Authorization: Bearer <token>
Content-Type: multipart/form-data

sessionId: my_session_1
phone: 6281234567890
message: Check this out!
attachment: <file>
caption: Optional caption
```

### Get Sent Messages List
```http
GET /api/messages?sessionId=my_session_1&limit=50&offset=0
Authorization: Bearer <token>
```

### Get Message Status
```http
GET /api/messages/:messageId/status
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "message": {
    "id": 1,
    "message_id": "3EB0...",
    "status": "read",
    "from_number": null,
    "to_number": "6281234567890",
    ...
  },
  "statusHistory": [
    {
      "status": "sent",
      "changed_at": "2024-01-12T14:00:00.000Z"
    },
    {
      "status": "delivered",
      "changed_at": "2024-01-12T14:00:05.000Z"
    },
    {
      "status": "read",
      "changed_at": "2024-01-12T14:00:10.000Z"
    }
  ]
}
```

### Send Typing Signal
```http
POST /api/messages/typing
Authorization: Bearer <token>
Content-Type: application/json

{
  "sessionId": "my_session_1",
  "phone": "6281234567890"
}
```

---

## 📊 Status & Stories

### Set Status Message
```http
POST /api/status/set
Authorization: Bearer <token>
Content-Type: multipart/form-data

sessionId: my_session_1
message: My status message
attachment: <optional file>
```

### Set Story
```http
POST /api/stories/set
Authorization: Bearer <token>
Content-Type: multipart/form-data

sessionId: my_session_1
message: Story caption
attachment: <file>
```

---

## 📢 Broadcast Endpoints

### Get Broadcast Lists
```http
GET /api/broadcast/lists?sessionId=my_session_1
Authorization: Bearer <token>
```

### Create Broadcast List
```http
POST /api/broadcast/lists
Authorization: Bearer <token>
Content-Type: application/json

{
  "sessionId": "my_session_1",
  "listName": "Customer List",
  "description": "All customers",
  "recipients": [
    {
      "phone": "6281234567890",
      "name": "John Doe"
    },
    {
      "phone": "6289876543210",
      "name": "Jane Smith"
    }
  ]
}
```

### Send Broadcast
```http
POST /api/broadcast/send
Authorization: Bearer <token>
Content-Type: multipart/form-data

sessionId: my_session_1
broadcastListId: 1
message: Broadcast message
attachment: <optional file>
```

### Get Broadcast Status
```http
GET /api/broadcast/:broadcastMessageId/status
Authorization: Bearer <token>
```

---

## 🔗 Webhook Endpoints

### List Webhooks
```http
GET /api/webhooks?sessionId=my_session_1
Authorization: Bearer <token>
```

### Create Webhook
```http
POST /api/webhooks
Authorization: Bearer <token>
Content-Type: application/json

{
  "sessionId": "my_session_1",
  "webhookUrl": "https://your-webhook-url.com/webhook",
  "events": ["message", "status"]
}
```

### Update Webhook
```http
PUT /api/webhooks/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "webhookUrl": "https://new-url.com/webhook",
  "isActive": true
}
```

### Delete Webhook
```http
DELETE /api/webhooks/:id
Authorization: Bearer <token>
```

---

## 🔌 WebSocket Events

Connect to WebSocket server:
```javascript
const socket = io('http://your-server:3000');

// Join session room
socket.emit('join_session', 'my_session_1');

// Listen for events
socket.on('qr_code', (data) => {
  console.log('QR Code:', data.qrCode);
});

socket.on('session_status', (data) => {
  console.log('Status:', data.status);
});

socket.on('message_status', (data) => {
  console.log('Message status:', data.messageId, data.status);
});

socket.on('new_message', (data) => {
  console.log('New message:', data.message);
});
```

### Events:
- `qr_code` - QR code updates
- `session_status` - Session status changes
- `message_status` - Message status updates (sent, delivered, read, played)
- `new_message` - New incoming messages

---

## 📝 Message Status Values

- `pending` - Message queued
- `sent` - Message sent to server
- `delivered` - Message delivered to recipient
- `read` - Message read by recipient
- `played` - Audio/video played (for media)
- `failed` - Message failed to send

---

## 🎯 Session Status Values

- `initializing` - Session being created
- `qr_generated` - QR code available
- `authenticated` - QR scanned, authenticating
- `ready` - Session ready to use
- `disconnected` - Session disconnected
- `stopped` - Session manually stopped

---

## ⚠️ Error Responses

All errors follow this format:
```json
{
  "error": "Error message here"
}
```

Common HTTP status codes:
- `400` - Bad Request (missing/invalid parameters)
- `401` - Unauthorized (invalid/missing token)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found (resource doesn't exist)
- `500` - Internal Server Error

---

## 📦 Webhook Payload Format

When messages are forwarded to webhook:

```json
{
  "event": "message",
  "message": {
    "id": "3EB0...",
    "from": "6281234567890",
    "contactId": "6281234567890@c.us",
    "type": "text",
    "body": "Hello!",
    "timestamp": 1705060800,
    "attachment": {
      "path": "/path/to/file.jpg",
      "type": "image"
    }
  }
}
```


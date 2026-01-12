# Multi WhatsApp Web Instance Manager

Multi-instance WhatsApp Web API menggunakan whatsapp-web.js dengan **advanced @lid handling**

## 🚀 **QUICK START**

**Baru pertama kali setup?** Baca **[START-HERE.md](docs/setup/START-HERE.md)** untuk panduan lengkap!

**Sudah setup?** Langsung ke [Installation](#installation) atau [Usage](#usage)

## 🌟 Key Features
- ✅ Multiple WhatsApp sessions/instances
- ✅ REST API untuk management
- ✅ **Advanced @lid handling** (extract phone numbers dari berbagai sumber)
- ✅ Contact & chat management
- ✅ Phone number verification
- ✅ Send messages to @c.us and @lid
- ✅ Statistics & analytics

## 📊 @lid Problem Solved

WhatsApp menggunakan 2 tipe identifier:
- **@c.us**: `6281234567890@c.us` (nomor terlihat) ✅
- **@lid**: `ABDXYZ123@lid` (nomor tersembunyi) ⚠️

**Solution**: API ini menyediakan multiple methods untuk extract phone numbers dan stats lengkap tentang contact @lid vs @c.us.

📖 **[Read full @lid documentation →](docs/features/LID-HANDLING.md)**

## 📚 Documentation

**📖 [Complete Documentation Index →](docs/README.md)**

### **Quick Start**
- **[🚀 START HERE](docs/setup/START-HERE.md)** - Complete setup guide
- **[⚡ Quick Start](docs/setup/QUICK-START.md)** - Quick start guide

### **Setup**
- **[💻 Localhost Setup](docs/setup/SETUP-LOCALHOST.md)** - Development setup
- **[🖥️ Server Setup](docs/setup/SETUP-SERVER.md)** - Production setup
- **[🗄️ MySQL Setup](docs/setup/MYSQL-SETUP.md)** - Database configuration

### **Features**
- **[✨ Features List](docs/features/FEATURES.md)** - Complete feature list
- **[📱 Connect New Number](docs/features/CONNECT-NEW-NUMBER.md)** - How to connect WhatsApp numbers
- **[📊 @lid Handling](docs/features/LID-HANDLING.md)** - Advanced @lid handling

### **Deployment**
- **[🚀 Deployment Guide](docs/deployment/DEPLOYMENT.md)** - Deployment workflow
- **[🔄 Development Workflow](docs/deployment/WORKFLOW.md)** - Local → Server workflow

### **API**
- **[📡 API Documentation](docs/api/API-DOCUMENTATION.md)** - Complete API reference

## Installation

```bash
npm install
```

## Usage

### Development
```bash
npm run dev
```

### Production
```bash
npm start
```

## API Endpoints

### Session Management

#### Get API Status
```bash
GET /
```

#### Start New Session
```bash
POST /session/start
Body: { "sessionId": "session1" }
```

#### Stop Session
```bash
POST /session/stop
Body: { "sessionId": "session1" }
```

#### Get Session Status
```bash
GET /session/status/:sessionId
```

#### List All Sessions
```bash
GET /sessions
```

### Contact & Chat Management (@lid Handling)

#### Get All Contacts (with @lid stats)
```bash
GET /contacts/:sessionId
```

Returns stats:
- Total contacts
- Contacts with phone numbers
- Contacts without phone numbers (using @lid)
- @lid vs @c.us breakdown

#### Get All Chats (Better for phone extraction)
```bash
GET /chats/:sessionId
```

⭐ **Recommended**: This endpoint has better success rate for getting phone numbers!

#### Get Specific Contact Info
```bash
POST /contact/info
Body: {
  "sessionId": "session1",
  "contactId": "6281234567890@c.us"
}
```

Tries multiple methods to extract phone number from @lid.

#### Verify Phone Number
```bash
POST /phone/verify
Body: {
  "sessionId": "session1",
  "phone": "6281234567890"
}
```

Checks if number exists on WhatsApp and returns proper ID format (@c.us or @lid).

### Messaging

#### Send Message
```bash
POST /message/send
Body: {
  "sessionId": "session1",
  "phone": "6281234567890",
  "message": "Hello from WhatsApp API"
}
```

**Note**: Accepts both phone numbers and full IDs (@c.us or @lid).

## 🧪 Testing

### Quick Test Script
```bash
./test-lid.sh
```

This will guide you through testing:
1. API status check
2. Session creation & QR scanning
3. Contact retrieval with @lid stats
4. Chat retrieval (better phone extraction)
5. Phone number verification
6. Contact info extraction
7. Message sending

### Manual Testing

```bash
# 1. Start session
curl -X POST http://localhost:3000/session/start \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "test1"}'

# 2. Check QR code in logs and scan
tail -f ~/wa-web/logs/app.log

# 3. Get contacts with @lid statistics
curl http://localhost:3000/contacts/test1

# 4. Get chats (better for phone numbers)
curl http://localhost:3000/chats/test1

# 5. Verify a phone number
curl -X POST http://localhost:3000/phone/verify \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "test1", "phone": "6281234567890"}'

# 6. Send message (works with @lid too!)
curl -X POST http://localhost:3000/message/send \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "test1",
    "phone": "6281234567890",
    "message": "Hello from WhatsApp Web.js!"
  }'
```

## 📚 Documentation

- **[Deployment Guide](docs/deployment/DEPLOYMENT.md)** - Full deployment workflow
- **[@lid Handling Guide](docs/features/LID-HANDLING.md)** - Complete guide for @lid problem
- **[Test Script](scripts/test-lid.sh)** - Interactive testing tool

## 🔥 Why This Implementation?

### vs Baileys
- ✅ More stable for production
- ✅ Better @lid handling
- ✅ Can send to @lid directly
- ✅ Chrome DevTools Protocol = more reliable
- ⚠️ Higher memory usage (needs Chromium)

### vs Multi_WA (existing PM2 version)
- ✅ Systemd service = better auto-restart
- ✅ Advanced @lid extraction methods
- ✅ Multiple endpoints for phone number retrieval
- ✅ Statistics & analytics included
- ✅ Better documentation

## 💡 Tips for @lid Contacts

1. **Use `/chats` endpoint** instead of `/contacts` for better phone extraction
2. **Save contacts to phone** - WhatsApp will convert @lid → @c.us
3. **Use contact ID directly** - You can send messages to @lid without phone number
4. **Verify first** - Use `/phone/verify` to get proper WhatsApp ID format
5. **Store separately** - Keep phone numbers in your database when users first register

## Deployment

Service akan berjalan sebagai systemd service di server untuk auto-restart.

### **Setelah Commit ke GitHub**

**Quick Deploy (1 command):**
```bash
ssh -i ~/.ssh/LightsailDefaultKey-ap-southeast-3.pem ubuntu@108.137.37.171 "cd ~/multi-wa-whatsappwebjs && ./scripts/deploy.sh"
```

**📖 [Lihat panduan lengkap →](docs/deployment/AFTER-COMMIT.md)**


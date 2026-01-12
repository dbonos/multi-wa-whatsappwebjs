# Connect Nomor WhatsApp Baru - Complete Guide

## 🎯 Overview

Setiap kali connect nomor WhatsApp baru, system menggunakan **multi-instance architecture** dimana setiap nomor adalah **client instance terpisah** dengan **session data tersendiri**.

---

## 🔄 Step-by-Step Flow

### **Step 1: Start New Session**

```bash
curl -X POST http://108.137.37.171:3000/session/start \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "nama_session_unik"}'
```

**Response:**
```json
{
  "success": true,
  "message": "Session nama_session_unik initialized. Check logs for QR code."
}
```

**What Happens:**
- System creates new `Client` instance with unique `sessionId`
- Puppeteer launches Chromium browser (headless)
- Browser navigates to `web.whatsapp.com`
- Waits for QR code generation

---

### **Step 2: QR Code Generation**

**Server automatically generates QR code in logs:**

```bash
# View logs
ssh -i "LightsailDefaultKey-ap-southeast-3.pem" ubuntu@108.137.37.171
tail -f ~/wa-web/logs/app.log
```

**Output:**
```
[nama_session_unik] QR Code received, scan please!
█████████████████████████████████
█████████████████████████████████
████ ▄▄▄▄▄ █▀█ █▄▄▀▄█ ▄▄▄▄▄ ████
████ █   █ █▀▀▀█ ▀ ▄█ █   █ ████
████ █▄▄▄█ █▀ █▀▀█▀▄█ █▄▄▄█ ████
█████████████████████████████████
```

**QR Code Details:**
- ⏱️ Valid for ~20 seconds
- 🔄 Auto-refreshes if not scanned
- 🔐 Contains encrypted authentication data
- 📱 One-time use only

---

### **Step 3: Scan QR Code**

**On Your Phone:**
1. Open WhatsApp app
2. Tap menu (⋮) → **Linked Devices**
3. Tap **"Link a Device"**
4. Scan the QR code from server logs
5. Wait for confirmation

**What Happens:**
- WhatsApp app sends authentication request
- WhatsApp servers verify your account
- Sends encrypted credentials to web client
- Establishes secure connection

---

### **Step 4: Authentication**

**Server Logs:**
```
[nama_session_unik] QR scanned!
[nama_session_unik] Authenticating...
[nama_session_unik] Authenticated ✅
[nama_session_unik] Saving session data...
[nama_session_unik] Client is ready!
```

**What's Saved:**
```
/home/ubuntu/wa-web/.wwebjs_auth/
└── session-nama_session_unik/
    ├── Default/
    │   ├── IndexedDB/           # Message data
    │   ├── Local Storage/       # Settings
    │   ├── Session Storage/     # Temp data
    │   └── Cookies              # Auth cookies
    └── SingletonCookie          # Main auth token
```

**Saved Data Includes:**
- 🔑 Authentication tokens
- 🔐 Encryption keys
- 📱 Device info
- 💬 Message keys
- 👤 Account info

---

### **Step 5: Ready to Use!**

**Check Session Status:**
```bash
curl http://108.137.37.171:3000/session/status/nama_session_unik | jq
```

**Response:**
```json
{
  "sessionId": "nama_session_unik",
  "status": "active",
  "info": {
    "wid": {
      "_serialized": "6281234567890@c.us",
      "user": "6281234567890"
    },
    "pushname": "John Doe",
    "me": {
      "user": "6281234567890"
    }
  }
}
```

**Now You Can:**
- ✅ Send messages
- ✅ Receive messages (via webhooks)
- ✅ Get contacts
- ✅ Get chats
- ✅ Manage groups
- ✅ All WhatsApp features

---

## 🔢 Multiple Sessions Example

### **Connect 3 Different Numbers:**

```bash
# Session 1: Customer Service (nomor 081234567890)
curl -X POST http://108.137.37.171:3000/session/start \
  -d '{"sessionId": "cs_team"}'
# → Scan QR with phone 1

# Session 2: Sales (nomor 089876543210)
curl -X POST http://108.137.37.171:3000/session/start \
  -d '{"sessionId": "sales_team"}'
# → Scan QR with phone 2

# Session 3: Marketing (nomor 087654321098)
curl -X POST http://108.137.37.171:3000/session/start \
  -d '{"sessionId": "marketing"}'
# → Scan QR with phone 3
```

### **Architecture:**

```
Node.js Server
│
├── Memory: clients Map
│   ├── "cs_team" → Client(+6281234567890)
│   ├── "sales_team" → Client(+6289876543210)
│   └── "marketing" → Client(+6287654321098)
│
├── Disk: .wwebjs_auth/
│   ├── session-cs_team/
│   ├── session-sales_team/
│   └── session-marketing/
│
└── Processes:
    ├── Node.js main (60 MB)
    ├── Chrome 1 (200 MB) - cs_team
    ├── Chrome 2 (200 MB) - sales_team
    └── Chrome 3 (200 MB) - marketing
    
Total: ~660 MB for 3 sessions
```

---

## 💾 Session Persistence

### **First Time (Requires QR Scan):**
```
POST /session/start
    ↓
Generate QR Code
    ↓
Scan QR Code
    ↓
Save Session → .wwebjs_auth/session-XXX/
    ↓
Ready ✅
```

### **Next Time (Auto-Login, No QR!):**
```
POST /session/start
    ↓
Load Session ← .wwebjs_auth/session-XXX/
    ↓
Auto-Login (no QR needed!)
    ↓
Ready ✅
```

**Example - Restart Server:**
```bash
# Stop all sessions
sudo systemctl restart wa-web.service

# Start session again (no QR needed!)
curl -X POST http://108.137.37.171:3000/session/start \
  -d '{"sessionId": "cs_team"}'

# Logs show:
[cs_team] Loading saved session...
[cs_team] Auto-login successful!
[cs_team] Client is ready! ✅
```

---

## 🔄 Session Lifecycle

### **States:**

1. **Initializing** - Creating client instance
2. **QR Generated** - Waiting for scan
3. **Authenticating** - Processing scan
4. **Authenticated** - Saving session
5. **Ready** - Active and usable ✅
6. **Disconnected** - Lost connection (will auto-reconnect)
7. **Stopped** - Manually stopped

### **Auto-Reconnect:**
```javascript
client.on('disconnected', (reason) => {
    console.log('Disconnected:', reason);
    // System will auto-reconnect using saved session
    // No need to scan QR again!
});
```

---

## 📊 Resource Usage Per Session

### **Memory:**
- Node.js base: ~60 MB
- Per Chrome instance: ~200 MB
- Per session total: ~260 MB

### **Formula:**
```
Total Memory = 60 MB + (Number of Sessions × 260 MB)

Examples:
1 session  = 60 + 260    = 320 MB
2 sessions = 60 + 520    = 580 MB
3 sessions = 60 + 780    = 840 MB
4 sessions = 60 + 1040   = 1.1 GB
```

### **Server Recommendations:**
```
1 GB RAM  → Max 2 sessions
2 GB RAM  → Max 4 sessions
4 GB RAM  → Max 10 sessions
8 GB RAM  → Max 20 sessions
```

---

## 🎯 Best Practices

### **1. SessionId Naming:**
```javascript
// ✅ Good - Descriptive
"cs_main"
"sales_jakarta"
"marketing_campaign_jan2024"
"wa_6281234567890"

// ❌ Bad - Confusing
"test"
"session1"
"a"
```

### **2. Session Limits:**
```javascript
// Implement in code
const MAX_SESSIONS = 3;  // Based on server RAM

if (clients.size >= MAX_SESSIONS) {
    return res.status(429).json({
        error: 'Maximum sessions reached',
        max: MAX_SESSIONS,
        current: clients.size
    });
}
```

### **3. Session Monitoring:**
```bash
# Check active sessions
curl http://108.137.37.171:3000/sessions | jq

# Check specific session
curl http://108.137.37.171:3000/session/status/cs_team | jq

# Monitor logs
tail -f ~/wa-web/logs/app.log
```

### **4. Clean Unused Sessions:**
```bash
# Stop session (keeps data)
curl -X POST http://108.137.37.171:3000/session/stop \
  -d '{"sessionId": "old_session"}'

# Delete session data manually (if needed)
rm -rf ~/wa-web/.wwebjs_auth/session-old_session/
```

---

## 🧪 Testing Script

**Run this to test connecting a new number:**

```bash
./test-connect-new-number.sh
```

**Or manual steps:**

```bash
# 1. Start session
curl -X POST http://108.137.37.171:3000/session/start \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "test_'$(date +%s)'"}'

# 2. Watch logs for QR
ssh -i "LightsailDefaultKey-ap-southeast-3.pem" ubuntu@108.137.37.171 \
  "tail -f ~/wa-web/logs/app.log"

# 3. Scan QR code with WhatsApp app

# 4. Wait for "Client is ready!"

# 5. Test send message
curl -X POST http://108.137.37.171:3000/message/send \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "test_'$(date +%s)'",
    "phone": "6281234567890",
    "message": "Hello from API!"
  }'
```

---

## 🐛 Troubleshooting

### **QR Code Not Appearing:**
```bash
# Check logs
tail -f ~/wa-web/logs/error.log

# Common issues:
# 1. Chrome dependencies missing
sudo apt-get install -y chromium-browser

# 2. Port already in use
sudo lsof -i :3000
sudo systemctl restart wa-web.service
```

### **QR Code Expired:**
```
# Just wait, it will refresh automatically
# New QR code appears every 20 seconds
```

### **Authentication Failed:**
```
# Delete session and try again
rm -rf ~/wa-web/.wwebjs_auth/session-XXX/
curl -X POST http://108.137.37.171:3000/session/start \
  -d '{"sessionId": "XXX"}'
```

### **Session Not Persisting:**
```
# Check if .wwebjs_auth folder exists
ls -la ~/wa-web/.wwebjs_auth/

# Check permissions
sudo chown -R ubuntu:ubuntu ~/wa-web/.wwebjs_auth/
```

---

## 📚 Related Documentation

- [CAPABILITIES.md](CAPABILITIES.md) - All features (same folder)
- [PUPPETEER.md](PUPPETEER.md) - Browser automation details
- [SERVER-CONFIG.md](SERVER-CONFIG.md) - Server setup
- [DEPLOYMENT.md](../deployment/DEPLOYMENT.md) - Deployment guide

---

## ✅ Summary

**Setiap nomor baru:**
1. Create unique session dengan `sessionId`
2. Generate QR code otomatis
3. Scan QR code dengan HP
4. Session disimpan otomatis
5. Next time auto-login (no QR needed!)

**Multiple nomor:**
- Setiap nomor = separate client instance
- Memory: ~260 MB per nomor
- Session data tersimpan terpisah
- Bisa restart tanpa scan QR lagi

**Key Points:**
- ✅ Session persistent (no QR after first time)
- ✅ Auto-reconnect on disconnect
- ✅ Multiple numbers supported
- ✅ Each number independent
- ✅ Resource usage predictable

**Repository:** https://github.com/dbonos/multi-wa-whatsappwebjs


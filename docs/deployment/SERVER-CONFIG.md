# Server Configuration

## 🌐 Server Information

### **New Server (Active)**
- **IP**: `108.137.37.171`
- **Internal IP**: `172.26.14.30`
- **Region**: AWS ap-southeast-3 (Jakarta)
- **SSH Key**: `LightsailDefaultKey-ap-southeast-3.pem`
- **OS**: Ubuntu 24.04 LTS
- **Node.js**: v20.19.6
- **npm**: v10.8.2

### **SSH Connection**
```bash
ssh -i "/Users/danielbudiono/cursor_projects/multi wa whatwappwebjs/LightsailDefaultKey-ap-southeast-3.pem" ubuntu@108.137.37.171
```

**Note**: SSH key ada di folder project yang sama

---

## 📁 Project Structure on Server

```
/home/ubuntu/wa-web/
├── .git/
├── .wwebjs_auth/          # WhatsApp session data (auto-generated)
├── .wwebjs_cache/         # Cache data
├── logs/
│   ├── app.log            # Application logs
│   └── error.log          # Error logs
├── node_modules/
├── index.js               # Main application
├── package.json
├── deploy.sh              # Deployment script
└── documentation files
```

---

## 🚀 Service Management

### Service Name: `wa-web.service`

### Commands:
```bash
# Check status
sudo systemctl status wa-web.service

# Start service
sudo systemctl start wa-web.service

# Stop service
sudo systemctl stop wa-web.service

# Restart service
sudo systemctl restart wa-web.service

# View logs
tail -f ~/wa-web/logs/app.log
tail -f ~/wa-web/logs/error.log
journalctl -u wa-web.service -f
```

---

## 🔄 Deployment Workflow

### From Local Machine:

#### 1. Make changes locally
```bash
cd "/Users/danielbudiono/cursor_projects/multi wa whatwappwebjs"
# Edit files...
```

#### 2. Commit and push
```bash
git add .
git commit -m "Your changes"
git push origin main
```

#### 3. Deploy to server
```bash
# SSH to server
ssh -i "/Users/danielbudiono/cursor_projects/multi wa whatwappwebjs/LightsailDefaultKey-ap-southeast-3.pem" ubuntu@108.137.37.171

# Navigate to project
cd wa-web

# Run deployment script
./scripts/deploy.sh
```

### Or one-liner from local:
```bash
ssh -i "/Users/danielbudiono/cursor_projects/multi wa whatwappwebjs/LightsailDefaultKey-ap-southeast-3.pem" ubuntu@108.137.37.171 "cd wa-web && ./scripts/deploy.sh"
```

---

## 🧪 Testing

### Quick Test:
```bash
# SSH to server first
ssh -i "/Users/danielbudiono/cursor_projects/multi wa whatwappwebjs/LightsailDefaultKey-ap-southeast-3.pem" ubuntu@108.137.37.171

# Test API
curl http://localhost:3000/

# Run test script
cd wa-web
./test-lid.sh
```

---

## 📊 API Endpoints

Base URL: `http://108.137.37.171:3000` or `http://localhost:3000` (from server)

### Session Management
- `GET /` - API status
- `POST /session/start` - Start new session
- `POST /session/stop` - Stop session
- `GET /session/status/:sessionId` - Get session status
- `GET /sessions` - List all sessions

### Contact & Chat Management
- `GET /contacts/:sessionId` - Get all contacts + @lid stats
- `GET /chats/:sessionId` - Get all chats
- `POST /contact/info` - Get specific contact info
- `POST /phone/verify` - Verify phone number

### Messaging
- `POST /message/send` - Send message

---

## 🔧 Troubleshooting

### Service not starting:
```bash
# Check logs
sudo journalctl -u wa-web.service -n 50

# Check if port is in use
sudo lsof -i :3000

# Restart service
sudo systemctl restart wa-web.service
```

### Out of memory:
```bash
# Check memory
free -h

# Check processes
ps aux | grep node

# Restart service to clear memory
sudo systemctl restart wa-web.service
```

### Can't connect via SSH:
```bash
# Check key permissions (should be 400)
ls -la "/Users/danielbudiono/cursor_projects/multi wa whatwappwebjs/LightsailDefaultKey-ap-southeast-3.pem"

# Fix if needed
chmod 400 "/Users/danielbudiono/cursor_projects/multi wa whatwappwebjs/LightsailDefaultKey-ap-southeast-3.pem"

# Test connection
ssh -v -i "/Users/danielbudiono/cursor_projects/multi wa whatwappwebjs/LightsailDefaultKey-ap-southeast-3.pem" ubuntu@108.137.37.171
```

---

## 📝 Quick Reference

### SSH Alias (Optional)
Add to `~/.ssh/config`:
```
Host wa-server
    HostName 108.137.37.171
    User ubuntu
    IdentityFile /Users/danielbudiono/cursor_projects/multi wa whatwappwebjs/LightsailDefaultKey-ap-southeast-3.pem
```

Then connect with:
```bash
ssh wa-server
```

### Environment Variables
Current setup:
- `NODE_ENV=production`
- `PORT=3000`

To change, edit `/etc/systemd/system/wa-web.service` and reload:
```bash
sudo systemctl daemon-reload
sudo systemctl restart wa-web.service
```

---

## 📚 Documentation Links

- [README.md](README.md) - Overview & quick start
- [CAPABILITIES.md](../features/CAPABILITIES.md) - All features
- [PUPPETEER.md](PUPPETEER.md) - Puppeteer details
- [LID-HANDLING.md](../features/LID-HANDLING.md) - @lid solutions
- [DEPLOYMENT.md](DEPLOYMENT.md) - Full deployment guide (same folder)
- [SUMMARY.md](SUMMARY.md) - Executive summary

---

**Repository**: https://github.com/dbonos/multi-wa-whatsappwebjs


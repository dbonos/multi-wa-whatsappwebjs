# Deployment Workflow Guide

## 🚀 Quick Start - Development to Production

### 1. **Development di Local**
```bash
cd "/Users/danielbudiono/cursor_projects/multi wa whatwappwebjs"

# Install dependencies (first time only)
npm install

# Run development server
npm run dev
```

### 2. **Commit & Push ke GitHub**
```bash
git add .
git commit -m "Your commit message"
git push origin main
```

### 3. **Deploy ke Server**
```bash
# SSH ke server
ssh -i ~/.ssh/LightsailDefaultKey-ap-southeast-1.pem ubuntu@yamaha-bandung.id

# Masuk ke project folder
cd wa-web

# Run deployment script
./deploy.sh
```

## 📋 Deployment Script

Script `deploy.sh` akan otomatis:
1. Pull latest code dari GitHub
2. Install/update dependencies
3. Restart service
4. Check service status

## 🔧 Service Management

### Check Service Status
```bash
sudo systemctl status wa-web.service
```

### Start Service
```bash
sudo systemctl start wa-web.service
```

### Stop Service
```bash
sudo systemctl stop wa-web.service
```

### Restart Service
```bash
sudo systemctl restart wa-web.service
```

### View Logs
```bash
# Application logs
tail -f ~/wa-web/logs/app.log

# Error logs
tail -f ~/wa-web/logs/error.log

# System logs
sudo journalctl -u wa-web.service -f
```

## 🌐 API Testing

### Test API di Server
```bash
# Check API status
curl http://localhost:3000/

# Start WhatsApp session
curl -X POST http://localhost:3000/session/start \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "session1"}'

# List sessions
curl http://localhost:3000/sessions

# Send message
curl -X POST http://localhost:3000/message/send \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "session1",
    "phone": "6281234567890",
    "message": "Hello from API"
  }'
```

## 📁 Server Structure

```
/home/ubuntu/wa-web/
├── .git/
├── .wwebjs_auth/      # WhatsApp session data (auto-generated)
├── logs/
│   ├── app.log        # Application logs
│   └── error.log      # Error logs
├── node_modules/
├── index.js           # Main application
├── package.json
├── deploy.sh          # Deployment script
└── README.md
```

## 🔐 Service Configuration

Service file location: `/etc/systemd/system/wa-web.service`

- **Auto-start**: Enabled (starts on boot)
- **Auto-restart**: Enabled (restarts on crash)
- **Restart delay**: 10 seconds
- **Port**: 3000
- **User**: ubuntu

## 🔄 Complete Workflow Example

```bash
# 1. Di Local - Edit code
vim index.js

# 2. Commit changes
git add .
git commit -m "Add new feature"
git push origin main

# 3. Di Server - Deploy
ssh -i ~/.ssh/LightsailDefaultKey-ap-southeast-1.pem ubuntu@yamaha-bandung.id
cd wa-web
./deploy.sh

# 4. Verify deployment
curl http://localhost:3000/
tail -f logs/app.log
```

## 🌟 Server Information

- **Host**: yamaha-bandung.id
- **Internal IP**: 172.26.2.46
- **OS**: Ubuntu 24.04.1 LTS
- **Project Path**: /home/ubuntu/wa-web
- **Service Name**: wa-web.service
- **Port**: 3000

## 📝 GitHub Repository

**URL**: https://github.com/dbonos/multi-wa-whatsappwebjs

## 💡 Tips

1. **Always pull before editing** di server untuk menghindari conflict
2. **Use deployment script** untuk consistency
3. **Check logs** setelah deployment untuk memastikan tidak ada error
4. **Monitor service** dengan `systemctl status wa-web.service`
5. **Backup session data** (.wwebjs_auth folder) secara berkala

## ⚠️ Troubleshooting

### Service tidak start
```bash
sudo journalctl -u wa-web.service -n 50
```

### Port sudah digunakan
```bash
sudo lsof -i :3000
sudo kill -9 <PID>
sudo systemctl restart wa-web.service
```

### Permission errors
```bash
sudo chown -R ubuntu:ubuntu /home/ubuntu/wa-web
chmod +x deploy.sh
```

### Git pull errors
```bash
git reset --hard origin/main
git pull origin main
```


# 🚀 Deployment Instructions

## Quick Deploy ke Server

### 1. SSH ke Server
```bash
ssh user@108.137.37.171
# atau sesuai dengan konfigurasi SSH Anda
```

### 2. Navigate ke Project Directory
```bash
cd /path/to/multi-wa-whatwappwebjs
# Ganti dengan path project Anda di server
```

### 3. Pull Latest Code
```bash
git pull origin main
```

### 4. Install Dependencies (jika ada perubahan)
```bash
# Backend dependencies
npm install --production

# Frontend dependencies dan build
cd frontend
npm install
npm run build
cd ..
```

### 5. Restart Server

#### Option A: Menggunakan PM2 (Recommended)
```bash
pm2 restart multi-wa-server
# atau jika belum ada:
pm2 start server.js --name multi-wa-server
pm2 save
```

#### Option B: Manual Restart
```bash
# Stop existing server
pkill -f "node.*server.js"

# Start server
nohup node server.js > server.log 2>&1 &
```

#### Option C: Menggunakan Script
```bash
chmod +x scripts/deploy-server.sh
./scripts/deploy-server.sh
```

### 6. Verify Server Running
```bash
# Check dengan PM2
pm2 status

# Check dengan ps
ps aux | grep node

# Check logs
tail -f server.log
# atau dengan PM2
pm2 logs multi-wa-server
```

## 🔍 Troubleshooting

### Jika server tidak start:
1. Check port 3000 sudah digunakan: `lsof -i :3000`
2. Check error logs: `tail -f server.log`
3. Check database connection
4. Check environment variables

### Jika frontend tidak update:
1. Pastikan build berhasil: `cd frontend && npm run build`
2. Check file di `public/` atau `dist/` sudah ter-update
3. Clear browser cache di client

### Rollback jika ada masalah:
```bash
git log  # Lihat commit history
git reset --hard <previous-commit-hash>
pm2 restart multi-wa-server
```

## 📝 Notes

- Pastikan `.env` file sudah ada dan benar di server
- Pastikan database MySQL running dan accessible
- Pastikan semua dependencies terinstall
- Check disk space: `df -h`
- Check memory: `free -h`


# 🔄 Development Workflow - Local → Server via GitHub

## 🎯 **Workflow Overview**

```
LOCAL (Development)  →  GitHub  →  SERVER (Testing/Production)
```

**Prinsip:**
- 💻 **Develop di Localhost** - Coding, testing, development
- 📤 **Push ke GitHub** - Version control & backup
- 🖥️ **Pull di Server** - Testing & production

---

## 📋 **Setup Awal**

### **1. Setup Localhost (Development)**

```bash
# Pastikan di folder project
cd "/Users/danielbudiono/cursor_projects/multi wa whatwappwebjs"

# Setup frontend untuk localhost
cp frontend/.env.localhost frontend/.env
# atau edit manual:
nano frontend/.env
```

**Isi `frontend/.env` untuk localhost:**
```env
VITE_API_URL=http://localhost:3000/api
VITE_SOCKET_URL=http://localhost:3000
```

**Setup database (pakai database server):**
```bash
# Tidak perlu setup MySQL lokal!
# Pakai database di server via SSH tunnel

# 1. Start SSH tunnel (Terminal baru, biarkan running)
./scripts/start-tunnel.sh

# 2. Edit .env untuk connect ke database server
nano .env
```

**Isi `.env` untuk localhost dengan database server:**
```env
DB_HOST=localhost  # Via SSH tunnel
DB_USER=root
DB_PASSWORD=your_server_mysql_password  # Password MySQL di server
DB_NAME=wa_manager
```

**📖 Lihat [SETUP-DATABASE-SERVER.md](SETUP-DATABASE-SERVER.md) untuk detail lengkap!**

**Start development:**
```bash
# Terminal 1: Backend
npm run dev

# Terminal 2: Frontend (dev server dengan hot reload)
cd frontend
npm run dev
```

**Akses:** `http://localhost:5173`

---

### **2. Setup Server (Testing/Production)**

**SSH ke server:**
```bash
ssh -i ~/.ssh/LightsailDefaultKey-ap-southeast-3.pem ubuntu@108.137.37.171
```

**Clone repository (jika belum):**
```bash
cd ~
git clone https://github.com/dbonos/multi-wa-whatsappwebjs.git
cd multi-wa-whatsappwebjs
```

**Setup database di server:**
```bash
mysql -u root -p < database/schema.sql
mysql -u root -p wa_manager < database/migrations/add_reactions_replies_deleted.sql
```

**Edit `.env` untuk server:**
```bash
nano .env
```

**Isi dengan:**
```env
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_server_mysql_password
DB_NAME=wa_manager
```

**Setup systemd service:**
```bash
sudo nano /etc/systemd/system/wa-web.service
```

**Paste ini (edit path):**
```ini
[Unit]
Description=WhatsApp Multi-Instance Manager
After=network.target mysql.service

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/multi-wa-whatsappwebjs
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

**Enable service:**
```bash
sudo systemctl daemon-reload
sudo systemctl enable wa-web.service
```

**First deployment:**
```bash
./scripts/deploy.sh
```

---

## 🔄 **Daily Workflow**

### **Step 1: Develop di Localhost**

```bash
# Di localhost
cd "/Users/danielbudiono/cursor_projects/multi wa whatwappwebjs"

# Pastikan frontend/.env untuk localhost
cat frontend/.env
# Harus: VITE_API_URL=http://localhost:3000/api

# Start development servers
npm run dev  # Terminal 1: Backend
cd frontend && npm run dev  # Terminal 2: Frontend
```

**Develop & test di:** `http://localhost:5173`

---

### **Step 2: Commit & Push ke GitHub**

```bash
# Di localhost
cd "/Users/danielbudiono/cursor_projects/multi wa whatwappwebjs"

# Check changes
git status

# Add changes
git add .

# Commit
git commit -m "Your commit message"

# Push ke GitHub
git push origin main
```

---

### **Step 3: Deploy ke Server**

**Option A: Menggunakan deploy.sh (Recommended)**

```bash
# SSH ke server
ssh -i ~/.ssh/LightsailDefaultKey-ap-southeast-3.pem ubuntu@108.137.37.171

# Masuk ke project folder
cd ~/multi-wa-whatsappwebjs

# Run deployment script
./scripts/deploy.sh
```

**Script akan otomatis:**
1. ✅ Pull latest code dari GitHub
2. ✅ Install backend dependencies
3. ✅ Install frontend dependencies
4. ✅ Update frontend/.env untuk server
5. ✅ Build frontend
6. ✅ Copy build ke public folder
7. ✅ Restart service

**Option B: Manual Deploy**

```bash
# SSH ke server
ssh -i ~/.ssh/LightsailDefaultKey-ap-southeast-3.pem ubuntu@108.137.37.171

# Pull latest code
cd ~/multi-wa-whatsappwebjs
git pull origin main

# Install dependencies
npm install
cd frontend && npm install && cd ..

# Update frontend .env untuk server
cat > frontend/.env << EOF
VITE_API_URL=http://108.137.37.171:3000/api
VITE_SOCKET_URL=http://108.137.37.171:3000
EOF

# Build frontend
cd frontend
npm run build
cd ..

# Copy to public
cp -r frontend/dist/* public/

# Restart service
sudo systemctl restart wa-web.service
```

---

### **Step 4: Test di Server**

**Akses aplikasi:**
- Frontend: `http://108.137.37.171:3000`
- Backend API: `http://108.137.37.171:3000/api`

**Check logs:**
```bash
# Di server
sudo journalctl -u wa-web.service -f
```

**Check service status:**
```bash
sudo systemctl status wa-web.service
```

---

## 📝 **Best Practices**

### **1. Environment Files**

**Localhost:**
- `frontend/.env` → `http://localhost:3000`
- `.env` → Database lokal

**Server:**
- `frontend/.env` → `http://108.137.37.171:3000` (auto-update oleh deploy.sh)
- `.env` → Database server

**Tip:** Jangan commit `.env` ke GitHub (sudah di .gitignore)

---

### **2. Git Workflow**

```bash
# Always pull sebelum edit di server (jika perlu edit langsung)
git pull origin main

# Commit dengan message yang jelas
git commit -m "feat: add new feature"
git commit -m "fix: fix bug in message handler"
git commit -m "docs: update documentation"

# Push setelah testing lokal
git push origin main
```

---

### **3. Testing Strategy**

**Localhost:**
- ✅ Unit testing
- ✅ Feature development
- ✅ UI/UX testing
- ✅ Hot reload untuk rapid development

**Server:**
- ✅ Integration testing
- ✅ Production-like environment
- ✅ Real WhatsApp testing
- ✅ Performance testing

---

## 🔧 **Useful Commands**

### **Localhost**

```bash
# Start development
npm run dev  # Backend
cd frontend && npm run dev  # Frontend

# Build frontend (untuk test production build lokal)
cd frontend && npm run build && cd .. && cp -r frontend/dist/* public/
npm start  # Start dengan production build

# Check git status
git status

# Commit & push
git add . && git commit -m "message" && git push origin main
```

### **Server**

```bash
# Deploy
./scripts/deploy.sh

# Check service
sudo systemctl status wa-web.service

# View logs
sudo journalctl -u wa-web.service -f

# Restart service
sudo systemctl restart wa-web.service

# Check port
sudo netstat -tulpn | grep 3000
```

---

## 🐛 **Troubleshooting**

### **Frontend tidak update di server**

```bash
# Pastikan frontend di-build
cd frontend
npm run build
cd ..
cp -r frontend/dist/* public/

# Restart service
sudo systemctl restart wa-web.service
```

### **Git pull conflict**

```bash
# Di server
git stash
git pull origin main
git stash pop
```

### **Service tidak start**

```bash
# Check logs
sudo journalctl -u wa-web.service -n 50

# Check .env file
cat .env

# Test manual
node server.js
```

### **Frontend .env salah**

```bash
# Di server, update manual
cat > frontend/.env << EOF
VITE_API_URL=http://108.137.37.171:3000/api
VITE_SOCKET_URL=http://108.137.37.171:3000
EOF

# Rebuild
cd frontend && npm run build && cd ..
cp -r frontend/dist/* public/
sudo systemctl restart wa-web.service
```

---

## ✅ **Quick Reference**

### **Localhost → Server Workflow**

```bash
# 1. Develop di local
npm run dev  # Backend
cd frontend && npm run dev  # Frontend

# 2. Commit & push
git add . && git commit -m "changes" && git push origin main

# 3. Deploy ke server
ssh -i ~/.ssh/LightsailDefaultKey-ap-southeast-3.pem ubuntu@108.137.37.171 "cd ~/multi-wa-whatsappwebjs && ./scripts/deploy.sh"

# 4. Test di server
# Buka: http://108.137.37.171:3000
```

---

## 📚 **Related Documentation**

- **[SETUP-LOCALHOST.md](SETUP-LOCALHOST.md)** - Setup untuk localhost
- **[SETUP-SERVER.md](SETUP-SERVER.md)** - Setup untuk server
- **[DEPLOYMENT.md](DEPLOYMENT.md)** - Deployment guide (same folder)
- **[deploy.sh](../scripts/deploy.sh)** - Deployment script

---

## 🎉 **Summary**

**Workflow yang sudah disiapkan:**

1. ✅ **Localhost setup** - Development environment
2. ✅ **GitHub integration** - Version control
3. ✅ **deploy.sh script** - Automated deployment
4. ✅ **Environment management** - Auto-switch localhost/server
5. ✅ **Service management** - Systemd untuk auto-restart

**Siap digunakan!** 🚀


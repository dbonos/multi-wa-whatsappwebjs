# 🖥️ Setup untuk SERVER (Production)

## 🎯 **Kapan Pakai Server?**

- ✅ Production deployment
- ✅ Aplikasi diakses dari internet
- ✅ Multi-user access
- ✅ 24/7 uptime dengan systemd

---

## 📋 **Setup Server**

### **1. SSH ke Server**

```bash
ssh -i ~/.ssh/LightsailDefaultKey-ap-southeast-3.pem ubuntu@108.137.37.171
```

### **2. Clone Repository**

```bash
cd ~
git clone https://github.com/dbonos/multi-wa-whatsappwebjs.git
cd multi-wa-whatsappwebjs
```

### **3. Install Dependencies**

```bash
# Backend dependencies
npm install

# Frontend dependencies
cd frontend
npm install
cd ..
```

### **4. Setup Database (MySQL di Server)**

```bash
# Import schema
mysql -u root -p < database/schema.sql

# Import migrations
mysql -u root -p wa_manager < database/migrations/add_reactions_replies_deleted.sql
```

### **5. Edit .env (Backend)**

```bash
nano .env
```

**Isi dengan:**
```env
PORT=3000
NODE_ENV=production
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_server_mysql_password
DB_NAME=wa_manager
JWT_SECRET=bf5bf2393bd10ba9bfeca8329f143c69303a3953f4cb6667e100f8f1fa7c1fdf
ATTACHMENTS_DIR=./attachments
```

### **6. Edit frontend/.env**

```bash
nano frontend/.env
```

**Isi dengan (IP server):**
```env
VITE_API_URL=http://108.137.37.171:3000/api
VITE_SOCKET_URL=http://108.137.37.171:3000
```

### **7. Build Frontend**

```bash
cd frontend
npm run build
cd ..

# Copy ke public folder
cp -r frontend/dist/* public/
```

### **8. Setup Admin User**

```bash
node setup-admin.js
```

### **9. Setup Systemd Service**

```bash
# Create service file
sudo nano /etc/systemd/system/wa-web.service
```

**Paste ini (edit path & user):**
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

**Enable & Start:**
```bash
sudo systemctl daemon-reload
sudo systemctl enable wa-web.service
sudo systemctl start wa-web.service

# Check status
sudo systemctl status wa-web.service

# View logs
sudo journalctl -u wa-web.service -f
```

### **10. Setup Firewall (Jika Perlu)**

```bash
# Allow port 3000
sudo ufw allow 3000/tcp

# Enable firewall
sudo ufw enable
```

---

## ✅ **Checklist Server**

- [ ] SSH ke server berhasil
- [ ] Repository di-clone
- [ ] Dependencies terinstall
- [ ] MySQL running di server
- [ ] Database `wa_manager` dibuat
- [ ] Schema & migrations di-import
- [ ] `.env` dengan `DB_HOST=localhost` dan password server
- [ ] `frontend/.env` dengan IP server `108.137.37.171`
- [ ] Frontend di-build dan di-copy ke `public/`
- [ ] Admin user dibuat
- [ ] Systemd service dibuat dan enabled
- [ ] Service running (`systemctl status wa-web.service`)
- [ ] Port 3000 accessible dari internet

---

## 🎯 **Akses Aplikasi**

- **Frontend:** `http://108.137.37.171:3000`
- **Backend API:** `http://108.137.37.171:3000/api`

---

## 🔄 **Update dari Local ke Server**

### **Workflow yang Disarankan:**

1. **Develop di Localhost**
   - Code di local
   - Test di `http://localhost:5173`

2. **Commit & Push ke GitHub**
   ```bash
   git add .
   git commit -m "Your changes"
   git push origin main
   ```

3. **Pull di Server**
   ```bash
   # SSH ke server
   ssh -i ~/.ssh/LightsailDefaultKey-ap-southeast-3.pem ubuntu@108.137.37.171
   
   # Pull latest code
   cd ~/multi-wa-whatsappwebjs
   git pull origin main
   
   # Install dependencies (jika ada perubahan)
   npm install
   cd frontend && npm install && cd ..
   
   # Rebuild frontend
   cd frontend
   npm run build
   cd ..
   cp -r frontend/dist/* public/
   
   # Restart service
   sudo systemctl restart wa-web.service
   ```

**Atau gunakan `deploy.sh`:**
```bash
./deploy.sh
```

---

## 💡 **Tips Production**

1. **Gunakan systemd** untuk auto-restart
2. **Monitor logs** dengan `journalctl -u wa-web.service -f`
3. **Setup Nginx** untuk HTTPS (optional)
4. **Backup database** secara berkala
5. **Monitor disk space** untuk attachments folder

---

## 🐛 **Troubleshooting**

### **Service tidak start**
```bash
# Check logs
sudo journalctl -u wa-web.service -n 50

# Check status
sudo systemctl status wa-web.service

# Check port
sudo netstat -tulpn | grep 3000
```

### **Tidak bisa akses dari internet**
```bash
# Check firewall
sudo ufw status

# Check service running
sudo systemctl status wa-web.service

# Test dari server sendiri
curl http://localhost:3000
```

### **Database connection error**
```bash
# Test MySQL
mysql -u root -p wa_manager -e "SHOW TABLES;"

# Check .env
cat .env | grep DB_
```

---

## 🔐 **Security Checklist**

- [ ] Password database kuat
- [ ] JWT_SECRET random dan aman
- [ ] Firewall configured
- [ ] Admin password diganti setelah setup
- [ ] HTTPS setup (jika pakai domain)


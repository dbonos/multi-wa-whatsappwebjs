# 📋 Setup Checklist - Langkah demi Langkah

## ✅ **Yang Sudah Disiapkan**

- ✅ Backend dependencies terinstall
- ✅ Frontend dependencies terinstall
- ✅ `.env` file dibuat (perlu edit password database)
- ✅ `frontend/.env` dibuat (perlu edit IP server jika berbeda)
- ✅ Attachments folder dibuat
- ✅ Frontend sudah di-build dan di-copy ke `public/` folder
- ✅ Setup scripts dibuat (`setup.sh`, `setup-admin.js`)

---

## 📝 **Yang Perlu Anda Lakukan**

### **1. Setup Database (WAJIB)**

```bash
# Login ke MySQL
mysql -u root -p

# Create database (jika belum ada)
CREATE DATABASE IF NOT EXISTS wa_manager;

# Import schema
mysql -u root -p wa_manager < database/schema.sql

# Import migrations
mysql -u root -p wa_manager < database/migrations/add_reactions_replies_deleted.sql
```

### **2. Edit .env File**

```bash
nano .env
```

**Edit password database:**
```env
DB_PASSWORD=your_mysql_password_here
```

### **3. Edit frontend/.env (Jika IP Berbeda)**

```bash
nano frontend/.env
```

**Edit IP server jika berbeda dari 108.137.37.171:**
```env
VITE_API_URL=http://YOUR_SERVER_IP:3000/api
VITE_SOCKET_URL=http://YOUR_SERVER_IP:3000
```

### **4. Setup Admin User**

```bash
node scripts/setup-admin.js
```

**Output yang diharapkan:**
```
✅ Admin user created/updated successfully!
   Username: admin
   Password: admin123
   ⚠️  Please change password after first login!
```

### **5. Start Server**

```bash
# Development mode
npm start

# Atau dengan auto-restart
npm run dev
```

**Server akan running di:** `http://localhost:3000`

---

## 🌐 **Akses Aplikasi**

1. Buka browser: `http://localhost:3000` (atau IP server Anda)
2. Login dengan:
   - Username: `admin`
   - Password: `admin123`
3. Buat session baru
4. Scan QR code dengan WhatsApp mobile
5. Mulai kirim pesan!

---

## 🔧 **Untuk Production Server**

### **Setup Systemd Service**

```bash
# Create service file
sudo nano /etc/systemd/system/wa-web.service
```

**Paste ini (edit path & user sesuai server Anda):**
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

---

## ✅ **Verification Checklist**

Sebelum mulai menggunakan, pastikan:

- [ ] Database `wa_manager` sudah dibuat
- [ ] Schema sudah di-import (`database/schema.sql`)
- [ ] Migrations sudah di-import (`database/migrations/add_reactions_replies_deleted.sql`)
- [ ] `.env` file sudah di-edit dengan password database
- [ ] `frontend/.env` sudah di-edit dengan IP server (jika berbeda)
- [ ] Admin user sudah dibuat (`node scripts/setup-admin.js`)
- [ ] Server sudah running (`npm start` atau systemd service)
- [ ] Bisa akses `http://localhost:3000` atau IP server
- [ ] Login berhasil dengan admin/admin123
- [ ] QR code muncul saat create session
- [ ] Bisa scan QR dan connect WhatsApp

---

## 🐛 **Troubleshooting**

### **Database Connection Error**
```bash
# Test MySQL connection
mysql -u root -p wa_manager -e "SHOW TABLES;"

# Check .env file
cat .env | grep DB_
```

### **Port Already in Use**
```bash
# Check port 3000
sudo netstat -tulpn | grep 3000

# Kill process jika perlu
sudo kill -9 <PID>
```

### **Frontend Tidak Connect ke Backend**
```bash
# Check frontend/.env
cat frontend/.env

# Test API
curl http://localhost:3000/api/sessions
```

### **Admin User Tidak Bisa Login**
```bash
# Re-run setup admin
node scripts/setup-admin.js

# Check database
mysql -u root -p wa_manager -e "SELECT * FROM users;"
```

---

## 📚 **Dokumentasi Lengkap**

- **[START-HERE.md](START-HERE.md)** - Panduan lengkap untuk pertama kali setup
- **[SETUP-GUIDE.md](SETUP-GUIDE.md)** - Panduan setup detail (same folder)
- **[QUICK-START.md](QUICK-START.md)** - Quick start guide (same folder)
- **[API-DOCUMENTATION.md](../api/API-DOCUMENTATION.md)** - Dokumentasi API lengkap
- **[FEATURES.md](../features/FEATURES.md)** - Daftar fitur lengkap

---

## 🎉 **Selesai!**

Setelah semua checklist di atas selesai, aplikasi Anda siap digunakan!

**Next Steps:**
1. Login ke aplikasi
2. Buat session baru
3. Scan QR code
4. Mulai kirim pesan!

---

**Need Help?** Lihat dokumentasi lengkap di `docs/` folder atau check `docs/setup/START-HERE.md`


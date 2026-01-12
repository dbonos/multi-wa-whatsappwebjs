# 🚀 START HERE - Panduan Lengkap Setup

## ⚠️ **PENTING: Pilih Setup Anda**

**Setup ini bisa untuk LOCALHOST atau SERVER, tapi konfigurasinya berbeda!**

- 💻 **LOCALHOST** → Development di komputer lokal → Baca **[SETUP-LOCALHOST.md](SETUP-LOCALHOST.md)**
- 🖥️ **SERVER** → Production di server → Baca **[SETUP-SERVER.md](SETUP-SERVER.md)**

**Saat ini file `.env` sudah dibuat untuk SERVER (IP: 108.137.37.171)**

---

## ✅ **Status Setup Saat Ini**

Semua file konfigurasi sudah dibuat! Anda tinggal:

1. ✅ **Backend dependencies** - Sudah terinstall
2. ✅ **Frontend dependencies** - Sudah terinstall  
3. ✅ **.env file** - Sudah dibuat (perlu edit password database)
4. ✅ **frontend/.env** - Sudah dibuat (perlu edit IP server jika berbeda)
5. ✅ **Attachments folder** - Sudah dibuat
6. ✅ **Frontend build** - Sudah di-build dan di-copy ke public folder

---

## 📋 **Langkah Selanjutnya**

### **1. Setup Database (WAJIB)**

```bash
# Login ke MySQL
mysql -u root -p

# Import schema
mysql -u root -p < database/schema.sql

# Import migrations (reactions, replies, deleted messages)
mysql -u root -p wa_manager < database/migrations/add_reactions_replies_deleted.sql
```

**Atau jika database belum ada:**
```bash
# Create database
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS wa_manager;"

# Import schema
mysql -u root -p wa_manager < database/schema.sql

# Import migrations
mysql -u root -p wa_manager < database/migrations/add_reactions_replies_deleted.sql
```

### **2. Edit .env File**

```bash
nano .env
```

**Pastikan konfigurasi database benar:**
```env
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_mysql_password  # ⚠️ EDIT INI!
DB_NAME=wa_manager
```

### **3. Edit frontend/.env (Jika IP Server Berbeda)**

```bash
nano frontend/.env
```

**Edit IP server jika berbeda:**
```env
VITE_API_URL=http://YOUR_SERVER_IP:3000/api
VITE_SOCKET_URL=http://YOUR_SERVER_IP:3000
```

### **4. Setup Admin User**

```bash
node setup-admin.js
```

Ini akan membuat user admin dengan:
- Username: `admin`
- Password: `admin123`

**⚠️ PENTING:** Ganti password setelah pertama kali login!

### **5. Start Server**

```bash
# Development mode
npm start

# Atau dengan nodemon (auto-restart)
npm run dev
```

Server akan running di: `http://localhost:3000`

---

## 🌐 **Akses Aplikasi**

1. **Buka browser:** `http://localhost:3000` (atau IP server Anda)
2. **Login dengan:**
   - Username: `admin`
   - Password: `admin123`
3. **Buat Session baru:**
   - Masukkan nama session (contoh: `my_whatsapp_1`)
   - Klik "Create"
   - Scan QR code dengan WhatsApp mobile
4. **Mulai kirim pesan!** 📱

---

## 🔧 **Untuk Production (Server)**

### **Setup Systemd Service**

```bash
# Edit service file
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

---

## 📚 **Dokumentasi Lengkap**

- **`SETUP-GUIDE.md`** - Panduan setup lengkap
- **`QUICK-START.md`** - Quick start guide
- **`API-DOCUMENTATION.md`** - Dokumentasi API lengkap
- **`FEATURES.md`** - Daftar fitur lengkap
- **`DEPLOYMENT.md`** - Panduan deployment

---

## ✅ **Checklist**

Sebelum mulai, pastikan:

- [ ] Database sudah dibuat dan schema di-import
- [ ] Migrations sudah di-import
- [ ] `.env` file sudah di-edit dengan password database
- [ ] `frontend/.env` sudah di-edit dengan IP server (jika berbeda)
- [ ] Admin user sudah dibuat (`node setup-admin.js`)
- [ ] Server sudah running (`npm start`)

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

---

## 🎉 **Selamat!**

Setelah semua langkah di atas, aplikasi Anda siap digunakan!

**Next Steps:**
1. Login ke aplikasi
2. Buat session baru
3. Scan QR code
4. Mulai kirim pesan!

---

**Need Help?** Check dokumentasi lengkap di folder project atau lihat `SETUP-GUIDE.md`


# ⚡ Quick Start Guide

## 🎯 **Langkah Cepat untuk Mulai**

### **1. Backend Setup (5 menit)**

```bash
# 1. Install dependencies
npm install

# 2. Setup database
mysql -u root -p < database/schema.sql
mysql -u root -p wa_manager < database/migrations/add_reactions_replies_deleted.sql

# 3. Buat .env file
cat > .env << EOF
PORT=3000
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=wa_manager
JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
ATTACHMENTS_DIR=./attachments
EOF

# 4. Create admin user
mysql -u root -p wa_manager -e "INSERT INTO users (username, password_hash, role) VALUES ('admin', '\$2a\$10\$rOzJqZqZqZqZqZqZqZqZqOZqZqZqZqZqZqZqZqZqZqZqZqZqZqZ', 'admin') ON DUPLICATE KEY UPDATE username=username;"

# 5. Start server
node server.js
```

### **2. Frontend Setup (2 menit)**

```bash
# 1. Install dependencies
cd frontend
npm install

# 2. Buat .env file
cat > .env << EOF
VITE_API_URL=http://108.137.37.171:3000/api
VITE_SOCKET_URL=http://108.137.37.171:3000
EOF

# 3. Start dev server
npm run dev
```

### **3. Access & Login**

1. Buka browser: `http://localhost:5173`
2. Login dengan:
   - Username: `admin`
   - Password: `admin123`

### **4. Create Session**

1. Dashboard → Enter session name
2. Click "Create"
3. Scan QR code dengan WhatsApp mobile
4. Done! ✅

---

## 🔧 **Production Deployment**

### **Backend sebagai Service**

```bash
# Create systemd service
sudo nano /etc/systemd/system/wa-web.service
```

**Paste ini:**
```ini
[Unit]
Description=WhatsApp Manager
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$(pwd)
ExecStart=$(which node) server.js
Restart=always

[Install]
WantedBy=multi-user.target
```

```bash
# Enable & start
sudo systemctl enable wa-web.service
sudo systemctl start wa-web.service
```

### **Frontend Build**

```bash
cd frontend
npm run build

# Copy ke public folder
cp -r dist/* ../public/
```

**Access**: `http://your-server-ip:3000`

---

## ✅ **Checklist**

- [ ] Backend running di port 3000
- [ ] Database connected
- [ ] Frontend bisa access backend API
- [ ] Login berhasil
- [ ] QR code muncul
- [ ] Bisa scan QR
- [ ] Bisa send message

---

**Selamat menggunakan! 🎉**


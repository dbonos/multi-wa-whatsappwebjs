# 🚀 Setup Guide - Cara Menggunakan Project

## 📋 **Persyaratan**

### **Backend (Server)**
- ✅ Node.js v20.19+ (atau v22.12+)
- ✅ MySQL/MariaDB
- ✅ Git
- ✅ SSH access ke server

### **Frontend (Development)**
- ✅ Node.js v20.19+ (atau v22.12+)
- ✅ npm atau yarn
- ✅ Modern browser (Chrome, Firefox, Safari, Edge)

---

## 🔧 **Setup Backend**

### **1. Clone Repository**
```bash
git clone https://github.com/dbonos/multi-wa-whatsappwebjs.git
cd multi-wa-whatsappwebjs
```

### **2. Install Dependencies**
```bash
npm install
```

### **3. Setup Database**
```bash
# Login ke MySQL
mysql -u root -p

# Import schema
mysql -u root -p < database/schema.sql

# Atau jika sudah ada database
mysql -u root -p wa_manager < database/schema.sql

# Import migrations (untuk reactions, replies, deleted)
mysql -u root -p wa_manager < database/migrations/add_reactions_replies_deleted.sql
```

### **4. Setup Environment Variables**
```bash
# Copy .env.example (jika ada) atau buat .env baru
cp .env.example .env

# Edit .env file
nano .env
```

**Isi `.env` dengan:**
```env
# Server
PORT=3000
NODE_ENV=production

# Database
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=wa_manager

# JWT Secret (generate random string)
JWT_SECRET=your_random_secret_key_here

# Attachments Directory
ATTACHMENTS_DIR=./attachments

# Webhook (optional)
WEBHOOK_BASE_URL=https://your-webhook-url.com
WEBHOOK_TIMEOUT=5000
```

**Generate JWT Secret:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### **5. Create Admin User**
```bash
# Login ke MySQL
mysql -u root -p wa_manager

# Insert admin user (password: admin123)
INSERT INTO users (username, password_hash, role) 
VALUES ('admin', '$2a$10$rOzJqZqZqZqZqZqZqZqZqOZqZqZqZqZqZqZqZqZqZqZqZqZqZqZ', 'admin')
ON DUPLICATE KEY UPDATE username=username;
```

**Atau gunakan script:**
```bash
node -e "
const bcrypt = require('bcryptjs');
bcrypt.hash('admin123', 10).then(hash => {
  console.log('Password hash:', hash);
  console.log('SQL: INSERT INTO users (username, password_hash, role) VALUES (\"admin\", \"' + hash + '\", \"admin\");');
});
"
```

### **6. Setup Systemd Service**
```bash
# Create service file
sudo nano /etc/systemd/system/wa-web.service
```

**Isi dengan:**
```ini
[Unit]
Description=WhatsApp Multi-Instance Manager
After=network.target mysql.service

[Service]
Type=simple
User=your_username
WorkingDirectory=/path/to/multi-wa-whatsappwebjs
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

**Enable & Start Service:**
```bash
# Reload systemd
sudo systemctl daemon-reload

# Enable service (auto-start on boot)
sudo systemctl enable wa-web.service

# Start service
sudo systemctl start wa-web.service

# Check status
sudo systemctl status wa-web.service

# View logs
sudo journalctl -u wa-web.service -f
```

### **7. Test Backend**
```bash
# Check if server is running
curl http://localhost:3000/

# Test API (harus return 401 karena belum login)
curl http://localhost:3000/api/sessions
```

---

## 🎨 **Setup Frontend**

### **1. Install Dependencies**
```bash
cd frontend
npm install
```

### **2. Setup Environment Variables**
```bash
# Buat .env file
nano .env
```

**Isi dengan:**
```env
VITE_API_URL=http://108.137.37.171:3000/api
VITE_SOCKET_URL=http://108.137.37.171:3000
```

**Note**: Ganti IP dengan IP server Anda atau gunakan domain jika ada.

### **3. Development Mode**
```bash
npm run dev
```

Frontend akan running di: `http://localhost:5173`

### **4. Production Build**
```bash
npm run build
```

Output akan ada di folder `dist/`

---

## 🌐 **Deployment Options**

### **Option 1: Serve Frontend dari Backend (Recommended)**

#### **Setup Static Files**
```bash
# Copy build output ke public folder
cp -r frontend/dist/* public/

# Atau symlink
ln -s ../frontend/dist public
```

#### **Update server.js**
Pastikan sudah ada:
```javascript
app.use(express.static('public'));
```

#### **Access**
- Frontend: `http://108.137.37.171:3000`
- API: `http://108.137.37.171:3000/api`

---

### **Option 2: Separate Frontend Server (Nginx)**

#### **Install Nginx**
```bash
sudo apt update
sudo apt install nginx
```

#### **Configure Nginx**
```bash
sudo nano /etc/nginx/sites-available/wa-manager
```

**Isi dengan:**
```nginx
server {
    listen 80;
    server_name your-domain.com;  # atau IP address

    # Frontend
    location / {
        root /path/to/multi-wa-whatsappwebjs/frontend/dist;
        try_files $uri $uri/ /index.html;
    }

    # Backend API
    location /api {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # WebSocket
    location /socket.io {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
```

#### **Enable Site**
```bash
sudo ln -s /etc/nginx/sites-available/wa-manager /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

---

## 🔐 **Security Setup**

### **1. Firewall**
```bash
# Allow HTTP/HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Allow SSH
sudo ufw allow 22/tcp

# Enable firewall
sudo ufw enable
```

### **2. Change Default Password**
```bash
# Login ke MySQL
mysql -u root -p wa_manager

# Update password
UPDATE users SET password_hash = '$2a$10$NEW_HASH_HERE' WHERE username = 'admin';
```

### **3. SSL/HTTPS (Optional tapi Recommended)**
```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx

# Get SSL certificate
sudo certbot --nginx -d your-domain.com

# Auto-renewal
sudo certbot renew --dry-run
```

---

## ✅ **Verification Checklist**

### **Backend**
- [ ] Node.js installed (v20+)
- [ ] MySQL database created
- [ ] Schema imported
- [ ] Migrations imported
- [ ] .env file configured
- [ ] Admin user created
- [ ] Systemd service running
- [ ] API accessible di `http://server-ip:3000/api`

### **Frontend**
- [ ] Dependencies installed
- [ ] .env file configured
- [ ] Build successful (`npm run build`)
- [ ] Dev server working (`npm run dev`)
- [ ] Can access frontend

### **Integration**
- [ ] Frontend bisa connect ke backend API
- [ ] WebSocket connection working
- [ ] Login berhasil
- [ ] QR code bisa di-scan
- [ ] Messages bisa dikirim

---

## 🚀 **Quick Start Commands**

### **Backend**
```bash
# Start service
sudo systemctl start wa-web.service

# Stop service
sudo systemctl stop wa-web.service

# Restart service
sudo systemctl restart wa-web.service

# View logs
sudo journalctl -u wa-web.service -f

# Manual start (for testing)
node server.js
```

### **Frontend**
```bash
# Development
cd frontend
npm run dev

# Production build
cd frontend
npm run build

# Preview production build
cd frontend
npm run preview
```

---

## 📱 **First Time Usage**

### **1. Access Frontend**
```
http://your-server-ip:3000
# atau
http://your-domain.com
```

### **2. Login**
- Username: `admin`
- Password: `admin123`
- **⚠️ IMPORTANT**: Ganti password setelah pertama kali login!

### **3. Create Session**
1. Go to Dashboard
2. Enter session name (e.g., `my_whatsapp_1`)
3. Click "Create"
4. Scan QR code dengan WhatsApp mobile

### **4. Send Message**
1. Go to Messages page
2. Select session
3. Enter phone number
4. Type message
5. Click "Send"

---

## 🔄 **Update/Deploy New Version**

### **Using deploy.sh Script**
```bash
# Make executable
chmod +x deploy.sh

# Run deployment
./deploy.sh
```

**Script akan:**
1. Pull latest code dari GitHub
2. Install dependencies
3. Restart service

### **Manual Update**
```bash
# Pull latest code
git pull origin main

# Install dependencies
npm install

# Restart service
sudo systemctl restart wa-web.service

# Frontend (jika separate)
cd frontend
npm install
npm run build
# Copy dist/ ke web server
```

---

## 🐛 **Troubleshooting**

### **Backend tidak start**
```bash
# Check logs
sudo journalctl -u wa-web.service -n 50

# Check port
sudo netstat -tulpn | grep 3000

# Check Node.js version
node --version
```

### **Database connection error**
```bash
# Test MySQL connection
mysql -u root -p -e "USE wa_manager; SHOW TABLES;"

# Check .env file
cat .env | grep DB_
```

### **Frontend tidak connect ke backend**
```bash
# Check .env file
cat frontend/.env

# Test API
curl http://your-server-ip:3000/api/sessions

# Check CORS settings di server.js
```

### **QR code tidak muncul**
```bash
# Check session status
curl http://localhost:3000/api/sessions

# Check logs
sudo journalctl -u wa-web.service -f

# Check Puppeteer/Chromium
```

---

## 📞 **Support**

Jika ada masalah:
1. Check logs: `sudo journalctl -u wa-web.service -f`
2. Check database: `mysql -u root -p wa_manager`
3. Check API: `curl http://localhost:3000/api/sessions`
4. Check frontend console di browser (F12)

---

## ✅ **Summary**

**Untuk mulai menggunakan:**

1. ✅ Setup backend (database, .env, service)
2. ✅ Setup frontend (dependencies, .env, build)
3. ✅ Deploy (copy files atau setup Nginx)
4. ✅ Access frontend di browser
5. ✅ Login dengan admin/admin123
6. ✅ Create session & scan QR
7. ✅ Start sending messages!

---

**Repository**: https://github.com/dbonos/multi-wa-whatsappwebjs


# 🗄️ Setup Database di Server (Untuk Development Lokal)

## 🎯 **Konsep**

**Develop di localhost, tapi pakai database di server** - Lebih simple, tidak perlu setup MySQL lokal!

---

## ✅ **Keuntungan**

- ✅ Tidak perlu install MySQL di local
- ✅ Data konsisten antara development & testing
- ✅ Tidak perlu sync database
- ✅ Setup lebih cepat

---

## 🔧 **Setup**

### **Option 1: SSH Tunnel (Recommended - Lebih Aman)**

**Cara ini lebih aman karena database tidak exposed ke internet.**

#### **1. Setup SSH Tunnel**

**Di terminal lokal, buat SSH tunnel:**
```bash
ssh -i ~/.ssh/LightsailDefaultKey-ap-southeast-3.pem \
    -L 5508:localhost:5508 \
    ubuntu@108.137.37.171 -N
```

**Penjelasan:**
- `-L 5508:localhost:5508` → Forward port 5508 dari server ke local
- `-N` → No command execution, hanya tunnel

**Biarkan terminal ini terbuka!** Tunnel akan aktif selama terminal terbuka.

#### **2. Edit .env di Localhost**

```bash
nano .env
```

**Isi dengan:**
```env
PORT=3000
NODE_ENV=development
DB_HOST=localhost  # Via SSH tunnel
DB_USER=root
DB_PASSWORD=your_server_mysql_password
DB_NAME=wa_manager
JWT_SECRET=bf5bf2393bd10ba9bfeca8329f143c69303a3953f4cb6667e100f8f1fa7c1fdf
ATTACHMENTS_DIR=./attachments
```

**Note:** `DB_HOST=localhost` karena SSH tunnel forward ke localhost:5508

#### **3. Test Connection**

```bash
# Test MySQL connection via tunnel
mysql -h 127.0.0.1 -P 5508 -u root -p wa_manager -e "SHOW TABLES;"
```

**Atau test dari Node.js:**
```bash
node -e "
const mysql = require('mysql2/promise');
require('dotenv').config();
mysql.createConnection({
  host: 'localhost',
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
}).then(() => console.log('✅ Connected!')).catch(e => console.error('❌', e.message));
"
```

---

### **Option 2: Direct Connection (Perlu Setup MySQL Remote Access)**

**⚠️ Warning:** Database akan exposed ke internet. Gunakan hanya jika SSH tunnel tidak memungkinkan.

#### **1. Setup MySQL Remote Access di Server**

**SSH ke server:**
```bash
ssh -i ~/.ssh/LightsailDefaultKey-ap-southeast-3.pem ubuntu@108.137.37.171
```

**Edit MySQL config:**
```bash
sudo nano /etc/mysql/mysql.conf.d/mysqld.cnf
```

**Cari dan edit:**
```ini
bind-address = 0.0.0.0  # Ubah dari 127.0.0.1
```

**Restart MySQL:**
```bash
sudo systemctl restart mysql
```

**Buat user untuk remote access:**
```bash
mysql -u root -p
```

**Di MySQL:**
```sql
-- Buat user untuk remote access (ganti YOUR_PASSWORD)
CREATE USER 'remote_dev'@'%' IDENTIFIED BY 'YOUR_PASSWORD';
GRANT ALL PRIVILEGES ON wa_manager.* TO 'remote_dev'@'%';
FLUSH PRIVILEGES;
EXIT;
```

**Setup firewall (allow MySQL port):**
```bash
sudo ufw allow 5508/tcp
```

#### **2. Edit .env di Localhost**

```bash
nano .env
```

**Isi dengan:**
```env
PORT=3000
NODE_ENV=development
DB_HOST=108.137.37.171  # IP server langsung
DB_USER=remote_dev      # User yang dibuat untuk remote
DB_PASSWORD=YOUR_PASSWORD
DB_NAME=wa_manager
JWT_SECRET=bf5bf2393bd10ba9bfeca8329f143c69303a3953f4cb6667e100f8f1fa7c1fdf
ATTACHMENTS_DIR=./attachments
```

#### **3. Test Connection**

```bash
mysql -h 108.137.37.171 -u remote_dev -p wa_manager -e "SHOW TABLES;"
```

---

## 🚀 **Workflow dengan Database Server**

### **Daily Development**

#### **1. Start SSH Tunnel (Jika pakai Option 1)**

```bash
# Terminal 1: SSH Tunnel (biarkan running)
ssh -i ~/.ssh/LightsailDefaultKey-ap-southeast-3.pem \
    -L 5508:localhost:5508 \
    ubuntu@108.137.37.171 -N
```

#### **2. Start Development**

```bash
# Terminal 2: Backend
npm run dev

# Terminal 3: Frontend
cd frontend
npm run dev
```

**Akses:** `http://localhost:5173`

---

## 📝 **Script Helper**

### **SSH Tunnel Script**

**Buat file `start-tunnel.sh`:**
```bash
#!/bin/bash
# Start SSH tunnel untuk database

echo "🔗 Starting SSH tunnel for database..."
ssh -i ~/.ssh/LightsailDefaultKey-ap-southeast-3.pem \
    -L 5508:localhost:5508 \
    ubuntu@108.137.37.171 -N

# Jika tunnel terputus, akan otomatis reconnect
```

**Make executable:**
```bash
chmod +x start-tunnel.sh
```

**Usage:**
```bash
./scripts/start-tunnel.sh
```

---

## ⚠️ **Security Considerations**

### **SSH Tunnel (Option 1) - Recommended**
- ✅ Database tidak exposed ke internet
- ✅ Menggunakan SSH encryption
- ✅ Lebih aman
- ⚠️ Perlu SSH tunnel running

### **Direct Connection (Option 2)**
- ⚠️ Database exposed ke internet
- ⚠️ Perlu firewall rules
- ⚠️ Perlu strong password
- ✅ Tidak perlu SSH tunnel

**Recommendation:** Gunakan SSH Tunnel untuk development!

---

## 🔄 **Update Workflow**

### **Development dengan Database Server**

```bash
# 1. Start SSH tunnel (Terminal 1)
./scripts/start-tunnel.sh

# 2. Start backend (Terminal 2)
npm run dev

# 3. Start frontend (Terminal 3)
cd frontend && npm run dev

# 4. Develop & test di localhost:5173
# Database akan connect ke server via tunnel

# 5. Commit & push
git add . && git commit -m "changes" && git push origin main

# 6. Deploy ke server
ssh -i ~/.ssh/LightsailDefaultKey-ap-southeast-3.pem ubuntu@108.137.37.171 "cd ~/multi-wa-whatsappwebjs && ./scripts/deploy.sh"
```

---

## ✅ **Checklist**

- [ ] Database setup di server (sudah ada)
- [ ] SSH tunnel script dibuat (jika pakai Option 1)
- [ ] `.env` di localhost di-update dengan DB_HOST server
- [ ] Test connection berhasil
- [ ] Development server bisa connect ke database

---

## 🐛 **Troubleshooting**

### **SSH Tunnel tidak connect**

```bash
# Check SSH key permissions
chmod 600 ~/.ssh/LightsailDefaultKey-ap-southeast-3.pem

# Test SSH connection
ssh -i ~/.ssh/LightsailDefaultKey-ap-southeast-3.pem ubuntu@108.137.37.171
```

### **Database connection error**

```bash
# Test via tunnel
mysql -h 127.0.0.1 -P 5508 -u root -p wa_manager -e "SHOW TABLES;"

# Check .env
cat .env | grep DB_

# Check tunnel running
lsof -i :5508
```

### **Port 5508 sudah digunakan**

```bash
# Check process
lsof -i :5508

# Kill process jika perlu
kill -9 <PID>

# Atau gunakan port lain
ssh -i ~/.ssh/LightsailDefaultKey-ap-southeast-3.pem \
    -L 5509:localhost:5508 \
    ubuntu@108.137.37.171 -N

# Update .env: DB_HOST=localhost, DB_PORT=5509
```

---

## 📚 **Related Documentation**

- **[WORKFLOW.md](WORKFLOW.md)** - Development workflow
- **[SETUP-SERVER.md](SETUP-SERVER.md)** - Server setup
- **[SETUP-LOCALHOST.md](SETUP-LOCALHOST.md)** - Localhost setup

---

## 🎉 **Summary**

**Dengan setup ini:**
- ✅ Tidak perlu MySQL di local
- ✅ Develop di localhost dengan database server
- ✅ Data konsisten
- ✅ Setup lebih cepat

**Recommended:** Gunakan SSH Tunnel (Option 1) untuk keamanan!


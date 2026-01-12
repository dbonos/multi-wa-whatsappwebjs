# 🗄️ MySQL Setup Guide

## 📋 **Setting MySQL User & Password**

### **1. Login ke MySQL**

```bash
mysql -u root -p
```

### **2. Buat Database**

```sql
CREATE DATABASE IF NOT EXISTS wa_manager CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
USE wa_manager;
```

### **3. Buat User untuk Aplikasi (Recommended)**

**Option A: User dengan Password (Recommended)**
```sql
-- Buat user baru
CREATE USER 'wa_manager'@'localhost' IDENTIFIED BY 'your_strong_password_here';

-- Berikan privileges
GRANT ALL PRIVILEGES ON wa_manager.* TO 'wa_manager'@'localhost';

-- Apply changes
FLUSH PRIVILEGES;
```

**Option B: Pakai Root (Tidak Recommended untuk Production)**
```sql
-- Update root password jika perlu
ALTER USER 'root'@'localhost' IDENTIFIED BY 'your_strong_password_here';
FLUSH PRIVILEGES;
```

### **4. Import Schema**

```bash
mysql -u wa_manager -p wa_manager < database/schema.sql
mysql -u wa_manager -p wa_manager < database/migrations/add_reactions_replies_deleted.sql
mysql -u wa_manager -p wa_manager < database/migrations/add_user_otp_and_session_login.sql
```

---

## ⚙️ **Update .env File**

### **Backend .env**

```env
# Database Configuration
DB_HOST=localhost
DB_PORT=5508
DB_USER=wa_manager
DB_PASSWORD=your_strong_password_here
DB_NAME=wa_manager
```

**Atau jika pakai root:**
```env
DB_HOST=localhost
DB_PORT=5508
DB_USER=root
DB_PASSWORD=your_root_password_here
DB_NAME=wa_manager
```

---

## 🔧 **Setup MySQL Port 5508**

### **Edit MySQL Configuration**

```bash
sudo nano /etc/mysql/mysql.conf.d/mysqld.cnf
```

**Cari dan edit:**
```ini
[mysqld]
port = 5508
bind-address = 127.0.0.1
```

**Restart MySQL:**
```bash
sudo systemctl restart mysql
```

**Verify port:**
```bash
sudo netstat -tulpn | grep 5508
```

---

## 🔐 **Setup Admin User untuk Frontend**

### **Create Admin User**

```bash
node setup-admin.js
```

**Atau manual:**
```sql
USE wa_manager;

-- Insert admin user (password: admin123)
INSERT INTO users (username, password_hash, role) 
VALUES ('admin', '$2a$10$rOzJqZqZqZqZqZqZqZqZqOZqZqZqZqZqZqZqZqZqZqZqZqZqZqZ', 'admin')
ON DUPLICATE KEY UPDATE username=username;
```

**⚠️ PENTING:** Ganti password setelah pertama kali login!

---

## 📝 **Login Credentials**

### **Admin Login**
- **Username:** `admin`
- **Password:** `admin123` (ganti setelah login pertama!)
- **Access:** Full access - manage sessions, settings, etc.

### **User Login**
- **Session Name:** Phone number (contoh: `628112298898`)
- **Password:** Set saat pertama kali atau pakai OTP
- **Access:** Hanya bisa akses session mereka sendiri

---

## 🔄 **SSH Tunnel untuk Development**

**Jika develop di localhost tapi pakai database server:**

```bash
./start-tunnel.sh
```

**Script akan forward port 5508 dari server ke localhost:5508**

**Update `.env` untuk localhost:**
```env
DB_HOST=localhost
DB_PORT=5508
DB_USER=wa_manager
DB_PASSWORD=your_server_mysql_password
DB_NAME=wa_manager
```

---

## ✅ **Verification**

### **Test MySQL Connection**

```bash
# Test connection
mysql -h localhost -P 5508 -u wa_manager -p wa_manager -e "SHOW TABLES;"

# Test dari Node.js
node -e "
const mysql = require('mysql2/promise');
require('dotenv').config();
mysql.createConnection({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
}).then(() => console.log('✅ Connected!')).catch(e => console.error('❌', e.message));
"
```

---

## 🐛 **Troubleshooting**

### **MySQL tidak start**

```bash
# Check status
sudo systemctl status mysql

# Check logs
sudo tail -f /var/log/mysql/error.log
```

### **Port 5508 tidak accessible**

```bash
# Check MySQL listening port
sudo netstat -tulpn | grep 5508

# Check firewall
sudo ufw status
```

### **Connection refused**

```bash
# Check MySQL config
cat /etc/mysql/mysql.conf.d/mysqld.cnf | grep port

# Restart MySQL
sudo systemctl restart mysql
```

---

## 📚 **Related Documentation**

- **[SETUP-DATABASE-SERVER.md](SETUP-DATABASE-SERVER.md)** - Setup database untuk development
- **[WORKFLOW.md](WORKFLOW.md)** - Development workflow
- **[SETUP-SERVER.md](SETUP-SERVER.md)** - Server setup

---

## 🎉 **Summary**

**Setup MySQL:**
1. ✅ Create database `wa_manager`
2. ✅ Create user `wa_manager` dengan password
3. ✅ Set port MySQL ke 5508
4. ✅ Import schema & migrations
5. ✅ Update `.env` dengan credentials
6. ✅ Create admin user
7. ✅ Test connection

**Login:**
- **Admin:** username `admin` + password
- **User:** session name (phone) + password atau OTP


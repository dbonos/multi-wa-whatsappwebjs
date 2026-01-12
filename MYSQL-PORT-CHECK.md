# ✅ MySQL Port 5508 - Verification Checklist

## 📋 **Files Updated**

### **✅ Code Files**
- ✅ `src/config/database.js` - Default port: **5508**
- ✅ `start-tunnel.sh` - SSH tunnel port: **5508**

### **✅ Documentation Files**
- ✅ `MYSQL-SETUP.md` - Port **5508**
- ✅ `SETUP-DATABASE-SERVER.md` - Port **5508**
- ✅ `database/README.md` - Port **5508**
- ✅ `CHANGES-SUMMARY.md` - Documented change from 3306 → 5508

### **✅ Configuration Files**
- ✅ `.env.example` - Port **5508** (jika dibuat)
- ⚠️ `.env` - **Perlu ditambahkan** `DB_PORT=5508` jika belum ada

---

## ⚙️ **Action Required**

### **1. Update .env File**

**Pastikan `.env` file memiliki:**
```env
DB_HOST=localhost
DB_PORT=5508
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=wa_manager
```

**Check current .env:**
```bash
cat .env | grep DB_
```

**Jika belum ada `DB_PORT`, tambahkan:**
```bash
echo "DB_PORT=5508" >> .env
```

---

### **2. Update MySQL Configuration di Server**

**Edit MySQL config:**
```bash
sudo nano /etc/mysql/mysql.conf.d/mysqld.cnf
```

**Add/edit:**
```ini
[mysqld]
port = 5508
bind-address = 127.0.0.1
```

**Restart MySQL:**
```bash
sudo systemctl restart mysql
```

**Verify:**
```bash
sudo netstat -tulpn | grep 5508
```

---

### **3. Update SSH Tunnel Script**

**File `start-tunnel.sh` sudah diupdate ke port 5508:**
```bash
ssh -i ~/.ssh/LightsailDefaultKey-ap-southeast-3.pem \
    -L 5508:localhost:5508 \
    ubuntu@108.137.37.171 -N
```

---

## ✅ **Verification**

### **Test Database Connection**

```bash
# Test dengan port 5508
mysql -h localhost -P 5508 -u root -p wa_manager -e "SHOW TABLES;"

# Test dari Node.js
node -e "
const mysql = require('mysql2/promise');
require('dotenv').config();
mysql.createConnection({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5508,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'wa_manager'
}).then(() => console.log('✅ Connected to port', process.env.DB_PORT || 5508))
  .catch(e => console.error('❌', e.message));
"
```

---

## 📝 **Summary**

**Status:**
- ✅ Code files: **Updated ke 5508**
- ✅ Documentation: **Updated ke 5508**
- ✅ SSH tunnel: **Updated ke 5508**
- ⚠️ `.env` file: **Perlu check & update**
- ⚠️ MySQL config di server: **Perlu update ke 5508**

**Next Steps:**
1. Update `.env` dengan `DB_PORT=5508`
2. Update MySQL config di server ke port 5508
3. Restart MySQL
4. Test connection

---

## 🔍 **Files Still Reference 3306?**

**Hanya di `CHANGES-SUMMARY.md`** - Ini OK karena itu dokumentasi perubahan dari 3306 → 5508.

**Semua file lain sudah diupdate ke 5508!** ✅


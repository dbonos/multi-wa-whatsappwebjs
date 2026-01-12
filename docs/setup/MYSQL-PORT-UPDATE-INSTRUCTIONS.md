# 🔧 MySQL Port 5508 - Update Instructions

## ✅ **Lokal (Sudah Done)**

✅ `.env` file sudah diupdate dengan `DB_PORT=5508`

---

## 🖥️ **Server - Yang Perlu Dilakukan**

### **Option 1: Menggunakan Script (Recommended)**

```bash
# Run update script
./update-mysql-port.sh
```

Script akan otomatis:
1. ✅ Update MySQL config ke port 5508
2. ✅ Restart MySQL
3. ✅ Verify port 5508
4. ✅ Update .env file di server

---

### **Option 2: Manual Update**

#### **1. SSH ke Server**

```bash
ssh -i ~/.ssh/LightsailDefaultKey-ap-southeast-3.pem ubuntu@108.137.37.171
```

**Atau jika SSH key ada di folder project:**
```bash
ssh -i ./LightsailDefaultKey-ap-southeast-3.pem ubuntu@108.137.37.171
```

#### **2. Update MySQL Config**

```bash
# Backup config
sudo cp /etc/mysql/mysql.conf.d/mysqld.cnf /etc/mysql/mysql.conf.d/mysqld.cnf.backup

# Edit config
sudo nano /etc/mysql/mysql.conf.d/mysqld.cnf
```

**Cari section `[mysqld]` dan tambahkan/edit:**
```ini
[mysqld]
port = 5508
bind-address = 127.0.0.1
```

**Atau gunakan sed:**
```bash
# Update existing port atau add new
sudo sed -i '/^\[mysqld\]/a port = 5508' /etc/mysql/mysql.conf.d/mysqld.cnf

# Atau jika port sudah ada, update:
sudo sed -i 's/^port.*=.*/port = 5508/' /etc/mysql/mysql.conf.d/mysqld.cnf
```

#### **3. Restart MySQL**

```bash
sudo systemctl restart mysql
```

#### **4. Verify Port**

```bash
# Check MySQL is listening on 5508
sudo netstat -tulpn | grep 5508

# Atau
sudo ss -tulpn | grep 5508
```

#### **5. Update .env di Server**

```bash
cd ~/multi-wa-whatsappwebjs
# atau
cd ~/wa-web

# Update .env
if grep -q "DB_PORT" .env; then
    sed -i 's/DB_PORT=.*/DB_PORT=5508/' .env
else
    echo "DB_PORT=5508" >> .env
fi

# Verify
cat .env | grep DB_
```

#### **6. Restart Application Service**

```bash
sudo systemctl restart wa-web.service
# atau
sudo systemctl restart multi-wa-whatsappwebjs.service
```

---

## ✅ **Verification**

### **Test MySQL Connection**

```bash
# From server
mysql -h localhost -P 5508 -u root -p wa_manager -e "SHOW TABLES;"

# From local (via SSH tunnel)
./scripts/start-tunnel.sh  # Terminal 1
mysql -h 127.0.0.1 -P 5508 -u root -p wa_manager -e "SHOW TABLES;"  # Terminal 2
```

### **Test Application Connection**

```bash
# Check application logs
sudo journalctl -u wa-web.service -f

# Test API
curl http://localhost:3000/api/sessions
```

---

## 🐛 **Troubleshooting**

### **MySQL tidak start**

```bash
# Check MySQL logs
sudo tail -f /var/log/mysql/error.log

# Check config syntax
sudo mysqld --validate-config
```

### **Port masih 3306**

```bash
# Check current port
sudo grep "^port" /etc/mysql/mysql.conf.d/mysqld.cnf

# Check MySQL process
ps aux | grep mysql
```

### **Connection refused**

```bash
# Check MySQL is running
sudo systemctl status mysql

# Check port
sudo netstat -tulpn | grep 5508
```

---

## 📝 **Summary**

**Lokal:**
- ✅ `.env` updated dengan `DB_PORT=5508`

**Server:**
- ⏳ MySQL config perlu diupdate ke port 5508
- ⏳ MySQL perlu di-restart
- ⏳ `.env` di server perlu diupdate
- ⏳ Application service perlu di-restart

**Run script:** `./update-mysql-port.sh` untuk otomatis update semua!


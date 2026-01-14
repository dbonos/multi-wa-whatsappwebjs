# 📋 Summary Perubahan - MySQL Port 5508 & Role-Based Auth

## ✅ **Yang Sudah Diupdate**

### **1. MySQL Port: 3306 → 5508**

**Files Updated:**
- ✅ `src/config/database.js` - Default port changed to 5508
- ✅ `start-tunnel.sh` - SSH tunnel port updated to 5508
- ✅ `MYSQL-SETUP.md` - Documentation untuk setup MySQL port 5508

**Action Required:**
- Update MySQL config di server: `/etc/mysql/mysql.conf.d/mysqld.cnf` → `port = 5508`
- Restart MySQL: `sudo systemctl restart mysql`
- Update `.env`: `DB_PORT=5508`

---

### **2. Role-Based Authentication System**

#### **Admin Role:**
- ✅ Login dengan `username` + `password`
- ✅ Bisa create/delete WhatsApp sessions
- ✅ Bisa akses semua sessions
- ✅ Bisa manage settings
- ✅ Bisa ganti password sendiri

#### **User Role:**
- ✅ Login dengan `session name` (phone number, contoh: `628112298898`)
- ✅ Bisa login dengan **password** atau **OTP**
- ✅ Hanya bisa akses session mereka sendiri
- ✅ Bisa ganti password sendiri
- ✅ Tidak bisa create/delete sessions

---

### **3. OTP Login System**

**New Features:**
- ✅ Request OTP via `/api/auth/request-otp`
- ✅ OTP dikirim via WhatsApp ke nomor session
- ✅ OTP valid 10 menit
- ✅ Rate limiting: max 3 requests per 15 menit
- ✅ OTP verification via `/api/auth/login` dengan `loginMethod: 'otp'`

**Database:**
- ✅ Table `otp_requests` untuk tracking OTP
- ✅ Columns di `users` table: `otp_code`, `otp_expires_at`, `otp_attempts`

---

### **4. Permission System**

**New Middleware:**
- ✅ `requireAdmin` - Hanya admin bisa akses
- ✅ `requireUser` - Hanya user bisa akses (bukan admin)
- ✅ `requireSessionOwner` - User hanya bisa akses session mereka sendiri

**Updated Endpoints:**
- ✅ `POST /api/sessions` - Admin only (create session)
- ✅ `DELETE /api/sessions/:sessionId` - Admin only (delete session)
- ✅ `GET /api/sessions` - Admin: all sessions, User: only their session
- ✅ `GET /api/sessions/:sessionId` - Admin: any session, User: only their session

---

### **5. New API Endpoints**

**Authentication:**
- ✅ `POST /api/auth/login` - Support admin (username/password) dan user (session name + password/OTP)
- ✅ `POST /api/auth/request-otp` - Request OTP untuk user login
- ✅ `POST /api/auth/change-password` - Change password (admin & user)

---

### **6. Database Schema Updates**

**Migration File:**
- ✅ `database/migrations/add_user_otp_and_session_login.sql`

**New Columns:**
- `users.session_id` - Link user ke WhatsApp session
- `users.phone_number` - Phone number untuk user
- `users.otp_code` - Current OTP code
- `users.otp_expires_at` - OTP expiration time
- `users.otp_attempts` - OTP attempt counter
- `sessions.user_id` - Link session ke user

**New Table:**
- `otp_requests` - Log semua OTP requests

---

## 📝 **Action Required**

### **1. Update MySQL Port di Server**

```bash
# Edit MySQL config
sudo nano /etc/mysql/mysql.conf.d/mysqld.cnf

# Add/edit:
[mysqld]
port = 5508

# Restart MySQL
sudo systemctl restart mysql

# Verify
sudo netstat -tulpn | grep 5508
```

### **2. Import Migration**

```bash
mysql -u root -p wa_manager < database/migrations/add_user_otp_and_session_login.sql
```

### **3. Update .env**

```env
DB_PORT=5508
DB_USER=wa_manager  # atau root
DB_PASSWORD=your_password
```

### **4. Setup MySQL User (Optional tapi Recommended)**

```sql
CREATE USER 'wa_manager'@'localhost' IDENTIFIED BY 'your_strong_password';
GRANT ALL PRIVILEGES ON wa_manager.* TO 'wa_manager'@'localhost';
FLUSH PRIVILEGES;
```

---

## 🔐 **Login Credentials**

### **Admin:**
```
Username: admin
Password: admin123
```
**⚠️ Ganti password setelah login pertama!**

### **User:**
```
Session Name: 628112298898 (contoh)
Password: Set saat pertama kali atau pakai OTP
```

**Login Flow untuk User:**
1. Request OTP: `POST /api/auth/request-otp` dengan `{ sessionName: "628112298898" }`
2. OTP dikirim via WhatsApp
3. Login dengan OTP: `POST /api/auth/login` dengan `{ sessionName: "628112298898", otp: "123456", loginMethod: "otp" }`
4. Atau login dengan password: `POST /api/auth/login` dengan `{ sessionName: "628112298898", password: "your_password" }`

---

## 🎯 **Permission Matrix**

| Action | Admin | User |
|--------|-------|------|
| Create Session | ✅ | ❌ |
| Delete Session | ✅ | ❌ |
| View All Sessions | ✅ | ❌ |
| View Own Session | ✅ | ✅ |
| Send Messages | ✅ | ✅ (own session only) |
| View Messages | ✅ | ✅ (own session only) |
| Change Password | ✅ | ✅ |
| Manage Settings | ✅ | ❌ |

---

## 📚 **Documentation Updated**

- ✅ `MYSQL-SETUP.md` - Setup MySQL user, password, port 5508
- ✅ `SETUP-DATABASE-SERVER.md` - Update untuk port 5508
- ✅ `src/middleware/auth.js` - Permission middleware
- ✅ `src/services/otpService.js` - OTP service baru

---

## ⚠️ **Breaking Changes**

1. **MySQL Port:** Harus update MySQL config ke port 5508
2. **Login API:** Format berubah untuk support admin/user
3. **Session Access:** User hanya bisa akses session mereka sendiri
4. **Create Session:** Hanya admin yang bisa create session

---

## 📎 **Attachment URL**

**Update baru:**
- ✅ `messages.attachment_url` ditambahkan (link publik ke file attachment)
- ✅ Webhook payload sekarang membawa `message.attachment.url`
- ✅ Attachment bisa diakses via `/attachments/...`

---

## 🚀 **Next Steps**

1. ✅ Update MySQL port di server
2. ✅ Import migration
3. ✅ Update .env dengan port 5508
4. ⏳ Update frontend untuk support login baru (OTP/password, session name)
5. ⏳ Test semua endpoints

---

## 📖 **Related Files**

- `MYSQL-SETUP.md` - Setup MySQL
- `database/migrations/add_user_otp_and_session_login.sql` - Migration
- `src/services/otpService.js` - OTP service
- `src/middleware/auth.js` - Permission middleware
- `server.js` - Updated endpoints


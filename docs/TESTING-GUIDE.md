# 🧪 Testing Guide - Complete System Test

## 📋 **Pre-Testing Checklist**

### **Backend**
- [ ] MySQL running on port 5508
- [ ] Database `wa_manager` created
- [ ] Schema imported (`database/schema.sql`)
- [ ] Migrations imported (`database/migrations/add_reactions_replies_deleted.sql`)
- [ ] Migration imported (`database/migrations/add_user_otp_and_session_login.sql`)
- [ ] Admin user created
- [ ] `.env` configured with correct database credentials

### **Frontend**
- [ ] Dependencies installed (`npm install` in frontend/)
- [ ] `.env` configured with API URL
- [ ] Build successful (`npm run build`)

---

## 🧪 **Test Scenarios**

### **1. Database Connection Test**

```bash
# Test MySQL connection
mysql -h localhost -P 5508 -u root -p wa_manager -e "SHOW TABLES;"

# Should show tables:
# - users
# - sessions
# - contacts
# - messages
# - attachments
# - broadcast_lists
# - broadcast_recipients
# - broadcast_messages
# - webhooks
# - message_status_history
# - message_reactions
# - message_replies
# - deleted_messages_log
# - otp_requests
```

### **2. Backend API Test**

#### **Start Backend**
```bash
npm start
# atau
npm run dev
```

#### **Test API Endpoints**

**2.1. Health Check**
```bash
curl http://localhost:3000/
```

**2.2. Admin Login**
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "admin123"}'
```

**Expected Response:**
```json
{
  "success": true,
  "token": "eyJhbGci...",
  "user": {
    "id": 1,
    "username": "admin",
    "role": "admin"
  }
}
```

**2.3. User Login (Password)**
```bash
# First, create a session (admin only)
curl -X POST http://localhost:3000/api/sessions \
  -H "Authorization: Bearer <admin_token>" \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "628112298898"}'

# Then login as user
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"sessionName": "628112298898", "password": "changeme"}'
```

**2.4. Request OTP**
```bash
curl -X POST http://localhost:3000/api/auth/request-otp \
  -H "Content-Type: application/json" \
  -d '{"sessionName": "628112298898"}'
```

**Expected Response:**
```json
{
  "success": true,
  "message": "OTP sent successfully",
  "expiresIn": 600
}
```

**2.5. User Login (OTP)**
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"sessionName": "628112298898", "otp": "123456", "loginMethod": "otp"}'
```

**2.6. Get Sessions (Admin)**
```bash
curl http://localhost:3000/api/sessions \
  -H "Authorization: Bearer <admin_token>"
```

**2.7. Get Sessions (User)**
```bash
curl http://localhost:3000/api/sessions \
  -H "Authorization: Bearer <user_token>"
```

**Expected:** User should only see their own session

**2.8. Create Session (Admin Only)**
```bash
curl -X POST http://localhost:3000/api/sessions \
  -H "Authorization: Bearer <admin_token>" \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "test_session_1"}'
```

**2.9. Create Session (User - Should Fail)**
```bash
curl -X POST http://localhost:3000/api/sessions \
  -H "Authorization: Bearer <user_token>" \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "test_session_2"}'
```

**Expected:** 403 Forbidden

**2.10. Change Password**
```bash
curl -X POST http://localhost:3000/api/auth/change-password \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"currentPassword": "admin123", "newPassword": "newpassword123"}'
```

---

### **3. Frontend Test**

#### **Start Frontend**
```bash
cd frontend
npm run dev
```

**Access:** `http://localhost:5173`

#### **Test Scenarios**

**3.1. Admin Login**
1. Open `http://localhost:5173/login`
2. Select "Admin" tab
3. Enter username: `admin`
4. Enter password: `admin123`
5. Click "Login"
6. Should redirect to `/dashboard`
7. Should see all sessions (if any)
8. Should see "Create Session" form

**3.2. User Login (Password)**
1. Open `http://localhost:5173/login`
2. Select "User" tab
3. Enter session name: `628112298898` (or existing session)
4. Select "Password" method
5. Enter password: `changeme` (default) or set password
6. Click "Login"
7. Should redirect to `/dashboard`
8. Should only see their own session
9. Should NOT see "Create Session" form
10. Should NOT see "Broadcast" and "Status & Stories" in navigation

**3.3. User Login (OTP)**
1. Open `http://localhost:5173/login`
2. Select "User" tab
3. Enter session name: `628112298898`
4. Select "OTP" method
5. Click "Request OTP"
6. Check WhatsApp for OTP code
7. Enter 6-digit OTP
8. Click "Login"
9. Should redirect to `/dashboard`

**3.4. Change Password**
1. Login as admin or user
2. Click "Change Password" in sidebar
3. Enter current password
4. Enter new password (min 6 characters)
5. Confirm new password
6. Click "Change Password"
7. Should show success message
8. Should redirect to dashboard

**3.5. Permission Checks**
1. Login as user
2. Verify:
   - Cannot see "Broadcast" menu
   - Cannot see "Status & Stories" menu
   - Cannot see "Create Session" form
   - Can only see their own session
3. Login as admin
4. Verify:
   - Can see all menus
   - Can create sessions
   - Can see all sessions

---

### **4. Integration Test**

#### **4.1. Full Flow: Admin Create Session → User Login**

```bash
# 1. Admin login
ADMIN_TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "admin123"}' | jq -r '.token')

# 2. Admin create session
curl -X POST http://localhost:3000/api/sessions \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "628112298898"}'

# 3. Wait for QR code (check logs or API)
curl http://localhost:3000/api/sessions/628112298898/qr \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# 4. Scan QR code with WhatsApp mobile

# 5. User login with password
USER_TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"sessionName": "628112298898", "password": "changeme"}' | jq -r '.token')

# 6. User get their session
curl http://localhost:3000/api/sessions \
  -H "Authorization: Bearer $USER_TOKEN"

# Should only return session 628112298898
```

---

## 🐛 **Troubleshooting**

### **Database Connection Error**
```bash
# Check MySQL is running
sudo systemctl status mysql

# Check port
sudo netstat -tulpn | grep 5508

# Test connection
mysql -h localhost -P 5508 -u root -p wa_manager
```

### **OTP Not Received**
```bash
# Check if session is connected
curl http://localhost:3000/api/sessions/628112298898/status \
  -H "Authorization: Bearer <token>"

# Check OTP in database
mysql -h localhost -P 5508 -u root -p wa_manager -e "SELECT * FROM otp_requests ORDER BY created_at DESC LIMIT 5;"
```

### **Permission Denied**
```bash
# Check user role
curl http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer <token>"

# Should show role: "admin" or "user"
```

### **Frontend Build Error**
```bash
# Check for syntax errors
cd frontend
npm run build

# Check linter
npm run lint
```

---

## ✅ **Test Checklist**

- [ ] Database connection works
- [ ] Admin login works
- [ ] User login with password works
- [ ] User login with OTP works
- [ ] OTP request works
- [ ] OTP sent via WhatsApp
- [ ] Change password works
- [ ] Admin can create sessions
- [ ] User cannot create sessions
- [ ] Admin sees all sessions
- [ ] User sees only own session
- [ ] Permission checks work in frontend
- [ ] Navigation filtered by role
- [ ] Frontend build successful
- [ ] All API endpoints respond correctly

---

## 📝 **Test Results Template**

```
Date: ___________
Tester: ___________

Backend:
- Database Connection: [ ] Pass [ ] Fail
- Admin Login: [ ] Pass [ ] Fail
- User Login (Password): [ ] Pass [ ] Fail
- User Login (OTP): [ ] Pass [ ] Fail
- OTP Request: [ ] Pass [ ] Fail
- Change Password: [ ] Pass [ ] Fail
- Permission Checks: [ ] Pass [ ] Fail

Frontend:
- Admin Login: [ ] Pass [ ] Fail
- User Login (Password): [ ] Pass [ ] Fail
- User Login (OTP): [ ] Pass [ ] Fail
- Change Password: [ ] Pass [ ] Fail
- Permission UI: [ ] Pass [ ] Fail
- Navigation Filtering: [ ] Pass [ ] Fail

Issues Found:
1. ___________
2. ___________
3. ___________
```

---

## 🚀 **Ready for Production?**

After all tests pass:
1. ✅ Deploy to server
2. ✅ Run migration on server
3. ✅ Create admin user on server
4. ✅ Test on production
5. ✅ Monitor logs

---

**Happy Testing!** 🎉


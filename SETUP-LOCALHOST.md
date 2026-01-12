# 💻 Setup untuk LOCALHOST (Development)

## 🎯 **Kapan Pakai Localhost?**

- ✅ Development & testing di komputer lokal
- ✅ Testing sebelum deploy ke server
- ✅ Development frontend dengan hot reload

---

## 📋 **Setup Localhost**

### **1. Install Dependencies**

```bash
# Backend dependencies
npm install

# Frontend dependencies
cd frontend
npm install
cd ..
```

### **2. Setup Database (MySQL di Local)**

```bash
# Import schema
mysql -u root -p < database/schema.sql

# Import migrations
mysql -u root -p wa_manager < database/migrations/add_reactions_replies_deleted.sql
```

### **3. Edit .env (Backend)**

```bash
nano .env
```

**Isi dengan:**
```env
PORT=3000
NODE_ENV=development
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_local_mysql_password
DB_NAME=wa_manager
JWT_SECRET=bf5bf2393bd10ba9bfeca8329f143c69303a3953f4cb6667e100f8f1fa7c1fdf
ATTACHMENTS_DIR=./attachments
```

### **4. Edit frontend/.env**

```bash
nano frontend/.env
```

**Isi dengan (localhost):**
```env
VITE_API_URL=http://localhost:3000/api
VITE_SOCKET_URL=http://localhost:3000
```

### **5. Setup Admin User**

```bash
node setup-admin.js
```

### **6. Start Development**

**Option A: Backend + Frontend Separate (Recommended untuk Development)**

```bash
# Terminal 1: Start Backend
npm start
# atau
npm run dev  # dengan auto-restart

# Terminal 2: Start Frontend Dev Server
cd frontend
npm run dev
```

**Frontend akan running di:** `http://localhost:5173`  
**Backend API di:** `http://localhost:3000/api`

**Option B: Serve Frontend dari Backend (Production-like)**

```bash
# Build frontend
cd frontend
npm run build
cd ..

# Copy ke public folder
cp -r frontend/dist/* public/

# Start backend (akan serve frontend juga)
npm start
```

**Akses:** `http://localhost:3000`

---

## ✅ **Checklist Localhost**

- [ ] MySQL running di local
- [ ] Database `wa_manager` dibuat
- [ ] Schema & migrations di-import
- [ ] `.env` dengan `DB_HOST=localhost`
- [ ] `frontend/.env` dengan `http://localhost:3000`
- [ ] Admin user dibuat
- [ ] Backend running di port 3000
- [ ] Frontend running (dev server atau dari backend)

---

## 🎯 **Akses Aplikasi**

- **Frontend (Dev Server):** `http://localhost:5173`
- **Frontend (dari Backend):** `http://localhost:3000`
- **Backend API:** `http://localhost:3000/api`

---

## 💡 **Tips Development**

1. **Gunakan Dev Server** (`npm run dev` di frontend) untuk hot reload
2. **Backend auto-restart** dengan `npm run dev` (nodemon)
3. **Check logs** di terminal untuk debugging
4. **Database** bisa pakai MySQL lokal atau Docker

---

## 🐛 **Troubleshooting**

### **Port 3000 sudah dipakai**
```bash
# Check process
lsof -i :3000

# Kill process
kill -9 <PID>
```

### **Frontend tidak connect ke backend**
- Pastikan backend running di port 3000
- Check `frontend/.env` menggunakan `http://localhost:3000`
- Check CORS di `server.js`

### **Database connection error**
- Pastikan MySQL running: `mysql -u root -p`
- Check `.env` dengan credentials yang benar


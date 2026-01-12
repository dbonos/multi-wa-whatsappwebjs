# 🤔 Setup Mana yang Harus Saya Pakai?

## 💻 **LOCALHOST (Development)**

**Pakai ini jika:**
- ✅ Anda ingin develop/test di komputer lokal
- ✅ Tidak perlu akses dari internet
- ✅ Ingin hot reload untuk development frontend
- ✅ Testing sebelum deploy ke server

**Setup:** Lihat **[SETUP-LOCALHOST.md](SETUP-LOCALHOST.md)**

**Akses:** `http://localhost:3000` atau `http://localhost:5173`

---

## 🖥️ **SERVER (Production)**

**Pakai ini jika:**
- ✅ Aplikasi akan diakses dari internet
- ✅ Ingin aplikasi running 24/7
- ✅ Multi-user access
- ✅ Production deployment

**Setup:** Lihat **[SETUP-SERVER.md](SETUP-SERVER.md)**

**Akses:** `http://108.137.37.171:3000` (atau domain Anda)

---

## 🔄 **Keduanya?**

**Bisa!** Workflow yang disarankan:

1. **Develop di Localhost**
   - Code & test di local
   - Frontend dev server dengan hot reload
   - Backend dengan auto-restart

2. **Deploy ke Server**
   - Commit & push ke GitHub
   - Pull di server
   - Rebuild & restart service

**Lihat workflow lengkap di [SETUP-SERVER.md](SETUP-SERVER.md#update-dari-local-ke-server)**

---

## ⚙️ **Perbedaan Konfigurasi**

### **Backend .env**

**Localhost:**
```env
DB_HOST=localhost
DB_PASSWORD=your_local_password
```

**Server:**
```env
DB_HOST=localhost  # MySQL di server
DB_PASSWORD=your_server_password
```

### **Frontend .env**

**Localhost:**
```env
VITE_API_URL=http://localhost:3000/api
VITE_SOCKET_URL=http://localhost:3000
```

**Server:**
```env
VITE_API_URL=http://108.137.37.171:3000/api
VITE_SOCKET_URL=http://108.137.37.171:3000
```

---

## ✅ **Quick Decision**

**Saya ingin:**
- [ ] Test/develop di komputer saya → **LOCALHOST**
- [ ] Deploy ke server untuk production → **SERVER**
- [ ] Keduanya (develop local, deploy server) → **Keduanya**

---

## 📚 **Dokumentasi**

- **[SETUP-LOCALHOST.md](SETUP-LOCALHOST.md)** - Setup untuk development lokal
- **[SETUP-SERVER.md](SETUP-SERVER.md)** - Setup untuk production server
- **[SETUP-GUIDE.md](SETUP-GUIDE.md)** - Panduan setup umum (same folder)
- **[QUICK-START.md](QUICK-START.md)** - Quick start guide


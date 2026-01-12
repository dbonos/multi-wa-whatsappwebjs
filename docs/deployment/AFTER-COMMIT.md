# 🚀 Setelah Commit ke GitHub - Update di Server

## 📋 **Workflow Lengkap**

```
LOCAL → Commit & Push → GitHub → Pull di Server → Deploy
```

---

## 🔄 **Langkah-Langkah di Server**

### **Option 1: Menggunakan Script Deploy (Recommended) ⭐**

**Ini cara TERMUDAH dan TERAMAN:**

```bash
# 1. SSH ke server
ssh -i ~/.ssh/LightsailDefaultKey-ap-southeast-3.pem ubuntu@108.137.37.171

# 2. Masuk ke folder project
cd ~/multi-wa-whatsappwebjs

# 3. Run deploy script (akan otomatis pull, install, build, restart)
./scripts/deploy.sh
```

**Script `deploy.sh` akan otomatis:**
1. ✅ Pull latest code dari GitHub
2. ✅ Install/update backend dependencies
3. ✅ Install/update frontend dependencies
4. ✅ Update frontend `.env` untuk server
5. ✅ Build frontend
6. ✅ Copy build ke `public/` folder
7. ✅ Restart `wa-web.service`
8. ✅ Check service status

**Selesai!** Aplikasi sudah update dan running.

---

### **Option 2: Manual Deploy**

Jika ingin lebih kontrol manual:

```bash
# 1. SSH ke server
ssh -i ~/.ssh/LightsailDefaultKey-ap-southeast-3.pem ubuntu@108.137.37.171

# 2. Masuk ke folder project
cd ~/multi-wa-whatsappwebjs

# 3. Pull latest code
git pull origin main

# 4. Install backend dependencies (jika ada perubahan)
npm install

# 5. Install frontend dependencies (jika ada perubahan)
cd frontend
npm install
cd ..

# 6. Update frontend .env untuk server
cat > frontend/.env << EOF
VITE_API_URL=http://108.137.37.171:3000/api
VITE_SOCKET_URL=http://108.137.37.171:3000
EOF

# 7. Build frontend
cd frontend
npm run build
cd ..

# 8. Copy build ke public folder
mkdir -p public
cp -r frontend/dist/* public/

# 9. Restart service
sudo systemctl restart wa-web.service

# 10. Check status
sudo systemctl status wa-web.service
```

---

## ⚠️ **Troubleshooting**

### **Git Pull Error: Conflict**

Jika ada conflict saat `git pull`:

```bash
# Option 1: Stash local changes
git stash
git pull origin main
git stash pop

# Option 2: Reset hard (HATI-HATI: akan hilangkan perubahan lokal)
git reset --hard origin/main
git pull origin main
```

### **Service Tidak Start**

```bash
# Check logs
sudo journalctl -u wa-web.service -n 50

# Check error
sudo systemctl status wa-web.service

# Restart manual
sudo systemctl restart wa-web.service
```

### **Frontend Tidak Update**

```bash
# Pastikan build berhasil
cd frontend
npm run build

# Pastikan copy ke public
cd ..
rm -rf public/*
cp -r frontend/dist/* public/

# Restart service
sudo systemctl restart wa-web.service
```

### **Database Migration Error**

Jika ada perubahan database schema:

```bash
# Import migration baru
mysql -u root -p wa_manager < database/migrations/[nama-file-migration].sql

# Restart service
sudo systemctl restart wa-web.service
```

---

## 🔍 **Verifikasi Update**

### **1. Check Git Status**

```bash
cd ~/multi-wa-whatsappwebjs
git log -1  # Lihat commit terakhir
git status  # Pastikan clean
```

### **2. Check Service Status**

```bash
sudo systemctl status wa-web.service
```

Harus menunjukkan: `active (running)`

### **3. Check Application**

```bash
# Test API
curl http://localhost:3000/api/health

# Test frontend
curl http://localhost:3000
```

### **4. Check Logs**

```bash
# Application logs
sudo journalctl -u wa-web.service -f

# Real-time logs
tail -f ~/multi-wa-whatsappwebjs/logs/app.log
```

---

## 📝 **Quick Reference**

### **Deploy Cepat (1 Command)**

```bash
ssh -i ~/.ssh/LightsailDefaultKey-ap-southeast-3.pem ubuntu@108.137.37.171 "cd ~/multi-wa-whatsappwebjs && ./scripts/deploy.sh"
```

### **Check Status Cepat**

```bash
ssh -i ~/.ssh/LightsailDefaultKey-ap-southeast-3.pem ubuntu@108.137.37.171 "sudo systemctl status wa-web.service"
```

### **View Logs Cepat**

```bash
ssh -i ~/.ssh/LightsailDefaultKey-ap-southeast-3.pem ubuntu@108.137.37.171 "sudo journalctl -u wa-web.service -n 50"
```

---

## ✅ **Checklist Setelah Deploy**

- [ ] Git pull berhasil
- [ ] Dependencies terinstall
- [ ] Frontend build berhasil
- [ ] Service restart berhasil
- [ ] Service status: `active (running)`
- [ ] API accessible: `http://108.137.37.171:3000/api`
- [ ] Frontend accessible: `http://108.137.37.171:3000`
- [ ] Tidak ada error di logs

---

## 🎯 **Best Practices**

1. **Selalu gunakan `deploy.sh`** - Lebih aman dan konsisten
2. **Check logs setelah deploy** - Pastikan tidak ada error
3. **Test aplikasi** - Pastikan semua fitur bekerja
4. **Backup sebelum deploy** - Jika ada perubahan besar
5. **Deploy di waktu maintenance** - Jika memungkinkan

---

## 📚 **Related Documentation**

- **[WORKFLOW.md](WORKFLOW.md)** - Complete development workflow
- **[DEPLOYMENT.md](DEPLOYMENT.md)** - Full deployment guide
- **[SERVER-CONFIG.md](SERVER-CONFIG.md)** - Server configuration

---

**Last Updated:** Setelah reorganisasi struktur project


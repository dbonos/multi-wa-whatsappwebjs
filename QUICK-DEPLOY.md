# ⚡ Quick Deploy - Setelah Commit ke GitHub

## 🚀 **Cara Tercepat (1 Command)**

```bash
ssh -i ~/.ssh/LightsailDefaultKey-ap-southeast-3.pem ubuntu@108.137.37.171 "cd ~/multi-wa-whatsappwebjs && ./scripts/deploy.sh"
```

---

## 📋 **Cara Manual (Step by Step)**

```bash
# 1. SSH ke server
ssh -i ~/.ssh/LightsailDefaultKey-ap-southeast-3.pem ubuntu@108.137.37.171

# 2. Deploy
cd ~/multi-wa-whatsappwebjs
./scripts/deploy.sh
```

**Selesai!** Script akan otomatis:
- Pull dari GitHub
- Install dependencies
- Build frontend
- Restart service

---

## ✅ **Verifikasi**

```bash
# Check status
sudo systemctl status wa-web.service

# Check logs
sudo journalctl -u wa-web.service -n 20
```

---

**📖 Detail lengkap:** [docs/deployment/AFTER-COMMIT.md](docs/deployment/AFTER-COMMIT.md)

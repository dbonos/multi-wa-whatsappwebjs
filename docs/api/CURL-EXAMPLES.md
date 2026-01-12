# Curl Command Examples untuk Testing API

## 📋 Daftar Isi
1. [Login](#login)
2. [Kirim Pesan Text](#kirim-pesan-text)
3. [Kirim Pesan dengan Attachment](#kirim-pesan-dengan-attachment)
4. [Cek Status Pesan](#cek-status-pesan)
5. [List Sessions](#list-sessions)

---

## 🔐 Login

**Endpoint:** `POST /api/auth/login`

```bash
# Login sebagai admin
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "admin123"
  }'
```

**Response:**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "username": "admin",
    "role": "admin"
  }
}
```

**Simpan token untuk digunakan di request berikutnya:**
```bash
TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

---

## 💬 Kirim Pesan Text

**Endpoint:** `POST /api/messages/send`

### Contoh 1: Basic (menggunakan variable)

```bash
# Set variables
API_URL="http://localhost:3000/api"
TOKEN="your_token_here"
SESSION_ID="your_session_id"
PHONE="6281234567890"
MESSAGE="Hello from curl!"

# Kirim pesan
curl -X POST "$API_URL/messages/send" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"sessionId\": \"$SESSION_ID\",
    \"phone\": \"$PHONE\",
    \"message\": \"$MESSAGE\"
  }"
```

### Contoh 2: One-liner (ganti nilai sesuai kebutuhan)

```bash
curl -X POST http://localhost:3000/api/messages/send \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"my_session_1","phone":"6281234567890","message":"Hello from curl!"}'
```

### Contoh 3: Dengan format JSON yang lebih readable

```bash
curl -X POST http://localhost:3000/api/messages/send \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d @- << EOF
{
  "sessionId": "my_session_1",
  "phone": "6281234567890",
  "message": "Hello from curl!"
}
EOF
```

**Response:**
```json
{
  "success": true,
  "messageId": "3EB0C767F26AFEC0D123",
  "status": "sent",
  "timestamp": 1705060800
}
```

---

## 📎 Kirim Pesan dengan Attachment

**Endpoint:** `POST /api/messages/send` (multipart/form-data)

```bash
curl -X POST http://localhost:3000/api/messages/send \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -F "sessionId=my_session_1" \
  -F "phone=6281234567890" \
  -F "message=Check this out!" \
  -F "caption=Optional caption" \
  -F "attachment=@/path/to/your/file.jpg"
```

**Contoh dengan file:**
```bash
# Kirim gambar
curl -X POST http://localhost:3000/api/messages/send \
  -H "Authorization: Bearer $TOKEN" \
  -F "sessionId=$SESSION_ID" \
  -F "phone=6281234567890" \
  -F "message=Lihat gambar ini!" \
  -F "attachment=@./image.jpg"

# Kirim PDF
curl -X POST http://localhost:3000/api/messages/send \
  -H "Authorization: Bearer $TOKEN" \
  -F "sessionId=$SESSION_ID" \
  -F "phone=6281234567890" \
  -F "caption=Document PDF" \
  -F "attachment=@./document.pdf"
```

---

## 📊 Cek Status Pesan

**Endpoint:** `GET /api/messages/:messageId/status`

```bash
MESSAGE_ID="3EB0C767F26AFEC0D123"

curl -X GET "http://localhost:3000/api/messages/$MESSAGE_ID/status" \
  -H "Authorization: Bearer $TOKEN"
```

**Response:**
```json
{
  "success": true,
  "message": {
    "id": 1,
    "message_id": "3EB0C767F26AFEC0D123",
    "status": "read",
    "from_number": null,
    "to_number": "6281234567890"
  },
  "statusHistory": [
    {
      "status": "sent",
      "changed_at": "2024-01-12T14:00:00.000Z"
    },
    {
      "status": "delivered",
      "changed_at": "2024-01-12T14:00:05.000Z"
    },
    {
      "status": "read",
      "changed_at": "2024-01-12T14:00:10.000Z"
    }
  ]
}
```

---

## 📱 List Sessions

**Endpoint:** `GET /api/sessions`

```bash
curl -X GET http://localhost:3000/api/sessions \
  -H "Authorization: Bearer $TOKEN"
```

**Response:**
```json
{
  "success": true,
  "sessions": [
    {
      "id": 1,
      "session_id": "my_session_1",
      "status": "ready",
      "phone_number": "6281234567890",
      "realtime_status": "ready",
      "is_active": true
    }
  ]
}
```

---

## 🚀 Quick Test Script

Gunakan script yang sudah disediakan:

```bash
# Basic usage
./scripts/test-send-message-curl.sh

# Dengan parameter custom
./scripts/test-send-message-curl.sh http://localhost:3000/api 6281234567890 "Pesan test" my_session_1
```

---

## 📝 Tips

1. **Format Nomor Telepon:**
   - Gunakan format internasional tanpa tanda `+` atau `-`
   - Contoh: `6281234567890` (bukan `+62 812-3456-7890`)

2. **Session ID:**
   - Pastikan session sudah dalam status `ready` atau `authenticated`
   - Cek status session dengan: `GET /api/sessions/:sessionId/status`

3. **Token Expiry:**
   - Token JWT biasanya valid untuk beberapa jam
   - Jika mendapat error 401, login ulang untuk mendapatkan token baru

4. **Pretty Print JSON Response:**
   ```bash
   curl ... | jq .
   ```
   Atau install `jq` jika belum ada:
   ```bash
   # macOS
   brew install jq
   
   # Ubuntu/Debian
   sudo apt-get install jq
   ```

5. **Save Response ke File:**
   ```bash
   curl ... -o response.json
   ```

---

## 🔍 Troubleshooting

### Error: "Session not found"
- Pastikan session ID benar
- Pastikan session sudah dibuat dan dalam status `ready`

### Error: "Unauthorized" (401)
- Token sudah expired, login ulang
- Pastikan header `Authorization: Bearer $TOKEN` benar

### Error: "message is required when no attachment"
- Pastikan field `message` ada di request body
- Atau gunakan `caption` jika mengirim attachment

### Error: Connection refused
- Pastikan server berjalan di port yang benar
- Cek dengan: `curl http://localhost:3000/api/auth/login`


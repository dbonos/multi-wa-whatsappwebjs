# Rate Limiting Configuration

## Overview

Sistem ini menggunakan `express-rate-limit` untuk melindungi API dari abuse dan overload. Rate limiting diterapkan pada berbagai level dengan batasan yang berbeda untuk endpoint yang berbeda.

## Current Settings

### 1. General API Rate Limit
- **Endpoint**: Semua `/api/*` endpoints
- **Limit**: 100 requests per 15 menit (default)
- **Config**: `API_RATE_LIMIT_MAX` di `.env`
- **Window**: 15 menit
- **Message**: "Too many requests from this IP, please try again later."

### 2. Authentication Rate Limit
- **Endpoints**: 
  - `/api/auth/login`
  - `/api/auth/request-otp`
- **Limit**: 10 requests per 15 menit (default)
- **Config**: `AUTH_RATE_LIMIT_MAX` di `.env`
- **Window**: 15 menit
- **Special**: Tidak menghitung request yang berhasil (`skipSuccessfulRequests: true`)
- **Message**: "Too many authentication attempts, please try again later."

### 3. Message Sending Rate Limit
- **Endpoint**: `/api/messages/send`
- **Limit**: 30 messages per 1 menit (default)
- **Config**: `MESSAGE_RATE_LIMIT_MAX` di `.env`
- **Window**: 1 menit
- **Message**: "Too many messages sent, please slow down."

### 4. OTP Request Rate Limit (Custom Logic)
- **Endpoint**: `/api/auth/request-otp`
- **Limit**: 3 requests per 15 menit per session
- **Window**: 15 menit dari request pertama
- **Logic**: Custom di `src/services/otpService.js`
- **Message**: Menampilkan waktu tunggu yang tepat

## Environment Variables

Tambahkan ke `.env` untuk customize rate limits:

```env
# General API rate limit (requests per 15 minutes)
API_RATE_LIMIT_MAX=100

# Authentication rate limit (attempts per 15 minutes)
AUTH_RATE_LIMIT_MAX=10

# Message sending rate limit (messages per minute)
MESSAGE_RATE_LIMIT_MAX=30
```

## Rate Limit Headers

Response headers yang dikembalikan saat rate limit tercapai:

- `RateLimit-Limit`: Maximum number of requests allowed
- `RateLimit-Remaining`: Number of requests remaining in current window
- `RateLimit-Reset`: Timestamp when the rate limit resets
- `Retry-After`: Seconds to wait before retrying (jika rate limited)

## Error Response Format

Ketika rate limit tercapai, response akan berupa:

```json
{
  "error": "Too many requests from this IP, please try again later."
}
```

Status code: `429 Too Many Requests`

## Custom Rate Limits

Untuk menambahkan rate limit khusus untuk endpoint tertentu:

```javascript
const customLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 10, // 10 requests per minute
    message: 'Custom rate limit message'
});

app.use('/api/specific-endpoint', customLimiter);
```

## Bypassing Rate Limits

Rate limiting di-skip untuk:
- WebSocket upgrade requests (untuk Socket.IO)
- Request yang sudah berhasil (untuk auth endpoints dengan `skipSuccessfulRequests: true`)

## Monitoring

Untuk monitoring rate limit hits, cek server logs atau tambahkan logging:

```javascript
limiter.on('limit', (req, res, options) => {
    console.log(`Rate limit hit: ${req.ip} - ${req.path}`);
});
```

## Recommendations

1. **Production**: Set `API_RATE_LIMIT_MAX` lebih rendah (50-100)
2. **Development**: Bisa set lebih tinggi atau disable untuk testing
3. **Message Sending**: Sesuaikan dengan kebutuhan bisnis (30/min cukup untuk kebanyakan use case)
4. **Authentication**: Tetap ketat (10/15min) untuk keamanan

## Troubleshooting

Jika terkena rate limit:
1. Cek response headers untuk info `RateLimit-*`
2. Tunggu sampai `RateLimit-Reset` timestamp
3. Atau tunggu sesuai `Retry-After` seconds
4. Untuk OTP: tunggu sesuai waktu yang ditampilkan di error message


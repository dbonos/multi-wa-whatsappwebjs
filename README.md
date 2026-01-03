# Multi WhatsApp Web Instance Manager

Multi-instance WhatsApp Web API menggunakan whatsapp-web.js

## Features
- Multiple WhatsApp sessions/instances
- REST API untuk management
- Send messages
- Session management (start/stop)

## Installation

```bash
npm install
```

## Usage

### Development
```bash
npm run dev
```

### Production
```bash
npm start
```

## API Endpoints

### Get API Status
```
GET /
```

### Start New Session
```
POST /session/start
Body: { "sessionId": "session1" }
```

### Stop Session
```
POST /session/stop
Body: { "sessionId": "session1" }
```

### Get Session Status
```
GET /session/status/:sessionId
```

### List All Sessions
```
GET /sessions
```

### Send Message
```
POST /message/send
Body: {
  "sessionId": "session1",
  "phone": "6281234567890",
  "message": "Hello from WhatsApp API"
}
```

## Deployment

Service akan berjalan sebagai systemd service di server untuk auto-restart.


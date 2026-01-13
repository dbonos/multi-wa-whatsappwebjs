# fromAI Column Feature

## Overview

The `fromAI` column in the `messages` table indicates whether a message was sent from the API/AI system (1) or is a regular incoming message (0). This is useful for preventing endless loops in automation systems like n8n.

## Database Schema

```sql
ALTER TABLE messages 
ADD COLUMN fromAI TINYINT(1) DEFAULT 0 
COMMENT '1 if sent from AI/API, 0 if regular message' 
AFTER direction;

CREATE INDEX idx_from_ai ON messages(fromAI);
```

## Values

- `0` - Regular incoming message (from WhatsApp users)
- `1` - Message sent from API/AI system (via `/api/messages/send` endpoint)

## Usage in Code

### Outgoing Messages (from API)

When sending messages via the API endpoint (`POST /api/messages/send`), the message is automatically marked with `fromAI = 1`:

```javascript
INSERT INTO messages 
(session_id, message_id, ..., direction, fromAI, ...)
VALUES (?, ?, ..., 'outgoing', 1, ...)
```

### Incoming Messages

All incoming messages are automatically marked with `fromAI = 0`:

```javascript
INSERT INTO messages 
(session_id, message_id, ..., direction, fromAI, ...)
VALUES (?, ?, ..., 'incoming', 0, ...)
```

## Use Case: Preventing Endless Loops in n8n

When using n8n or similar automation tools:

1. **Webhook receives incoming message** → `fromAI = 0`
2. **n8n processes message** → Decides to send reply
3. **n8n calls API to send message** → Message saved with `fromAI = 1`
4. **Webhook receives the sent message** → `fromAI = 1` → **Skip processing** to prevent loop

### Example n8n Workflow Logic

```javascript
// In n8n webhook handler
if (message.fromAI === 1) {
  // Skip - this is a message we sent, don't process it
  return;
}

// Process incoming message (fromAI === 0)
// ... your logic here ...
```

## Query Examples

### Get only incoming messages (not from API)
```sql
SELECT * FROM messages 
WHERE direction = 'incoming' 
AND fromAI = 0
ORDER BY created_at DESC;
```

### Get all messages sent from API
```sql
SELECT * FROM messages 
WHERE fromAI = 1
ORDER BY created_at DESC;
```

### Get messages for n8n processing (exclude API-sent messages)
```sql
SELECT * FROM messages 
WHERE direction = 'incoming' 
AND fromAI = 0
AND webhook_sent = FALSE
ORDER BY created_at DESC;
```

## Migration

Run the migration script to add the column:

```bash
mysql -u wa_manager -p wa_manager < database/migrations/add_from_ai_column.sql
```

Existing messages will be set to `fromAI = 0` by default.

## Notes

- Messages sent before this column was added will have `fromAI = 0`
- All new outgoing messages from API will have `fromAI = 1`
- All incoming messages will have `fromAI = 0`
- This column is indexed for fast filtering


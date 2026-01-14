# Database Timezone WIB Configuration

## Overview

All date/time values in the database should represent **WIB (Waktu Indonesia Barat, UTC+7)**.

To prevent UTC/WIB shifting bugs (especially in statistics), we store wall-clock times as **DATETIME** (not TIMESTAMP) for all `*_at` columns.

## Implementation

### Database Connection Configuration

The database connection pool (`src/config/database.js`) sets the MySQL session timezone to `+07:00` (WIB) per pooled connection. This ensures that:

- `NOW()` / `CURRENT_TIMESTAMP` used by INSERT/UPDATE are WIB
- New rows written with defaults are WIB

### Why DATETIME (not TIMESTAMP)

- **TIMESTAMP**: MySQL converts values based on `@@session.time_zone` on read/write → can shift 7 hours if misconfigured.
- **DATETIME**: Stored and returned as-is → perfect for “DB sudah WIB”.

## Affected Columns

All columns ending with `_at` across all tables (examples below).

### `messages` table
- `created_at` - Message creation time
- `updated_at` - Last update time (auto-updated)
- `deleted_at` - Deletion timestamp
- `retracted_at` - Retraction timestamp
- `webhook_sent_at` - Webhook delivery time

### `sessions` table
- `created_at` - Session creation time
- `updated_at` - Last update time (auto-updated)
- `qr_expires_at` - QR code expiration time
- `connected_at` - Connection time
- `last_activity` - Last activity timestamp

### `contacts` table
- `created_at` - Contact creation time
- `updated_at` - Last update time (auto-updated)

### `attachments` table
- `created_at` - Attachment creation time

### `broadcast_lists` table
- `created_at` - List creation time
- `updated_at` - Last update time (auto-updated)

### `broadcast_messages` table
- `created_at` - Broadcast creation time
- `completed_at` - Completion time

### `broadcast_recipients` table
- `created_at` - Recipient creation time
- `sent_at` - Message sent time
- `delivered_at` - Delivery confirmation time
- `read_at` - Read receipt time

### `message_reactions` table
- `created_at` - Reaction creation time

### `message_replies` table
- `created_at` - Reply creation time

### `message_status_history` table
- `changed_at` - Status change time

### `deleted_messages_log` table
- `deleted_at` - Deletion timestamp

### `otp_requests` table
- `created_at` - OTP request time
- `expires_at` - OTP expiration time
- `used_at` - OTP usage time

### `skip_messages` table
- `created_at` - Skip rule creation time
- `updated_at` - Last update time (auto-updated)

### `users` table
- `created_at` - User creation time
- `updated_at` - Last update time (auto-updated)
- `last_otp_sent_at` - Last OTP sent time
- `otp_expires_at` - OTP expiration time

## How It Works

1. **Connection Pool**: When a connection is retrieved from the pool, timezone is set to `+07:00`
2. **Query Execution**: Before every `pool.execute()` or `pool.query()` call, timezone is set again to ensure consistency
3. **CURRENT_TIMESTAMP**: All uses of `CURRENT_TIMESTAMP` in SQL queries will use WIB timezone
4. **Default Values**: Columns with `DEFAULT CURRENT_TIMESTAMP` will use WIB when inserting new rows
5. **Auto Updates**: Columns with `ON UPDATE CURRENT_TIMESTAMP` will use WIB when updating rows

## Verification

To verify timezone is working correctly:

```sql
-- Set timezone and check
SET time_zone = '+07:00';
SELECT NOW(), @@session.time_zone;

-- Insert test record
INSERT INTO messages (session_id, message_id, direction, fromAI, message_type, body, status, timestamp)
VALUES ('test', 'test_123', 'incoming', 0, 'text', 'test', 'delivered', UNIX_TIMESTAMP());

-- Check created_at (should be WIB)
SELECT created_at, NOW() as current_time FROM messages WHERE message_id = 'test_123';
```

The `created_at` should match `NOW()` (both in WIB), and both should be approximately 7 hours ahead of UTC.

## Statistics Calculation Timezone Handling

Statistics uses `messages.created_at` (WIB wall-clock DATETIME) for:
- period assignment
- same-day boundaries (`DATE(created_at)=?`)
- reply window rules (same day)

### Common Mistakes to Avoid

❌ **Wrong**: Adding 25200 seconds in SQL queries
```sql
-- DON'T DO THIS (double conversion)
DATE(FROM_UNIXTIME(timestamp + 25200)) = ?
```

✅ **Correct**: Use timestamp range directly
```sql
-- DO THIS (timestamp already in WIB)
timestamp >= ? AND timestamp <= ?
```

❌ **Wrong**: Using system timezone for period calculation
```javascript
// DON'T DO THIS
const date = new Date(timestamp * 1000);
const hours = date.getHours(); // Uses system timezone
```

✅ **Correct**: Use WIB timezone conversion
```javascript
// DO THIS
const wibDate = timestampToWIB(timestamp * 1000);
const hours = wibDate.getHours(); // Uses WIB timezone
```

## Messages Table Timestamp Fix

### Migration Script (recommended)

Use `database/migrations/convert_timestamp_to_datetime_wib.sql` to convert all TIMESTAMP `*_at` columns to DATETIME while preserving WIB wall-clock display.

## Notes

- **Server OS timezone** should be `Asia/Jakarta` (WIB)
- **MySQL session timezone** for the app is set to `+07:00` so `NOW()` is WIB
- **DATETIME columns** are not shifted by MySQL, which prevents UTC/WIB “geser 7 jam” bugs

## Troubleshooting

If timestamps are still showing UTC:

1. Check if wrapper is being called:
   ```bash
   sudo journalctl -u wa-web.service -f | grep "Setting timezone"
   ```

2. Verify timezone in database:
   ```sql
   SELECT @@session.time_zone, NOW();
   ```

3. Test with manual insert:
   ```sql
   SET time_zone = '+07:00';
   INSERT INTO messages ...;
   SELECT created_at FROM messages ...;
   ```

4. Check server logs for timezone-related errors


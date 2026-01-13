# Database Timezone WIB Configuration

## Overview

All timestamp columns ending with `_at` in the database are configured to use **WIB (Waktu Indonesia Barat, UTC+7)** timezone. This ensures consistent time representation across the entire application.

## Implementation

### Database Connection Configuration

The database connection pool (`src/config/database.js`) automatically sets the MySQL session timezone to `+07:00` (WIB) before every query execution. This ensures that:

- `CURRENT_TIMESTAMP` uses WIB timezone
- All `DEFAULT CURRENT_TIMESTAMP` columns use WIB
- All `ON UPDATE CURRENT_TIMESTAMP` columns use WIB
- All manual timestamp inserts/updates use WIB

### Wrapper Functions

Both `pool.execute()` and `pool.query()` are wrapped to ensure timezone is set before every query:

```javascript
pool.execute = async function(sql, params) {
    const connection = await originalGetConnection();
    try {
        // CRITICAL: Set timezone BEFORE executing query
        await connection.query("SET time_zone = '+07:00'");
        const result = await connection.execute(sql, params);
        return result;
    } finally {
        connection.release();
    }
};
```

## Affected Columns

All columns ending with `_at` across all tables:

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
- `updated_at` - Last update time (auto-updated)

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

## Notes

- **Existing Data**: Old records created before this configuration may still show UTC time
- **New Data**: All new records will use WIB timezone
- **Connection Pooling**: Timezone is set before every query to handle connection reuse
- **Performance**: Setting timezone adds minimal overhead (~1ms per query)

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


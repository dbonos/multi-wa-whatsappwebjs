# Test Results - WhatsApp API Testing

## Test Date: 2026-01-13

## Issues Found:

### 1. ❌ `fromAI` Column Issue
- **Problem**: All outgoing messages have `fromAI = 0` instead of `fromAI = 1`
- **Expected**: Messages sent via API should have `fromAI = 1`
- **Current Status**: 
  - Code in `server.js` line 999 shows `fromAI = 1` ✅
  - But database shows all outgoing messages have `fromAI = 0` ❌
- **Possible Cause**: 
  - Old data from before code update
  - Server not restarted after code update
  - Code not deployed correctly

### 2. ⚠️ Timezone Issue
- **Problem**: `created_at` and `updated_at` still showing UTC time
- **Expected**: Should show WIB time (UTC+7)
- **Current Status**:
  - When `SET time_zone = '+07:00'` is set manually, timestamps show WIB ✅
  - But without manual setting, timestamps show UTC ❌
- **Possible Cause**:
  - Wrapper `pool.execute()` not being called correctly
  - Timezone not set before INSERT queries

### 3. ✅ Database Structure
- All columns exist: `created_at`, `updated_at`, `deleted_at`, `retracted_at`, `webhook_sent_at`
- Foreign keys working correctly
- Data isolation per session working

### 4. ⚠️ Incoming Messages
- **Status**: No incoming messages found in database
- **Possible Cause**: 
  - No messages received yet
  - Skip message feature filtering them out
  - Message handler not saving correctly

## Test Commands:

```bash
# Check messages
mysql -e "SELECT id, message_id, direction, fromAI, body, created_at FROM messages WHERE to_number = '628112298898' ORDER BY id DESC LIMIT 5;"

# Check timezone
mysql -e "SET time_zone = '+07:00'; SELECT NOW(), created_at FROM messages ORDER BY id DESC LIMIT 1;"

# Check fromAI distribution
mysql -e "SELECT COUNT(*) as total, COUNT(CASE WHEN fromAI = 1 THEN 1 END) as from_api FROM messages WHERE direction = 'outgoing';"
```

## Recommendations:

1. **Restart server** to ensure latest code is running
2. **Send new test message** via API to verify `fromAI = 1`
3. **Check server logs** for timezone setting messages
4. **Test incoming message** by sending from WhatsApp to verify conversion works
5. **Verify wrapper** is being called by checking logs for "Setting timezone" messages

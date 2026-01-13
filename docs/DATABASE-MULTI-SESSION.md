# Database Structure untuk Multiple Sessions

## Overview

**Ya, semua session menggunakan table yang sama.** Data dari setiap session dibedakan menggunakan kolom `session_id` di setiap table. Ini adalah desain **multi-tenant** yang efisien.

## Struktur Database

### 1. Sessions Table (Master)
```sql
sessions
├── id (PK)
├── session_id (UNIQUE) ← Identifier utama untuk setiap session
├── phone_number
├── display_name
├── status
└── ...
```

### 2. Data Tables (Semua Session)
Semua table berikut menggunakan kolom `session_id` untuk membedakan data:

#### Contacts Table
```sql
contacts
├── id (PK)
├── session_id ← Foreign Key ke sessions(session_id)
├── contact_id
├── phone_number
└── ...
UNIQUE KEY: (session_id, contact_id) ← Satu contact bisa berbeda per session
```

#### Messages Table
```sql
messages
├── id (PK)
├── session_id ← Foreign Key ke sessions(session_id)
├── message_id (UNIQUE)
├── from_number
├── to_number
└── ...
```

#### Attachments Table
```sql
attachments
├── id (PK)
├── session_id ← Foreign Key ke sessions(session_id)
├── message_id ← Foreign Key ke messages(message_id)
└── ...
```

#### Broadcast Lists Table
```sql
broadcast_lists
├── id (PK)
├── session_id ← Foreign Key ke sessions(session_id)
├── list_name
└── ...
```

#### Webhooks Table
```sql
webhooks
├── id (PK)
├── session_id ← Foreign Key ke sessions(session_id) (nullable)
├── webhook_url
└── ...
```

#### Skip Messages Table
```sql
skip_messages
├── id (PK)
├── session_id ← Foreign Key ke sessions(session_id)
├── type (group/contact)
└── ...
```

## Cara Kerja Multi-Session

### Contoh Data:

**Session 1: `628112298898`**
```sql
-- contacts
session_id: 628112298898, contact_id: 6281234567890@c.us, name: "John Doe"
session_id: 628112298898, contact_id: 6281234567891@c.us, name: "Jane Smith"

-- messages
session_id: 628112298898, message_id: "msg_001", from_number: "6281234567890"
session_id: 628112298898, message_id: "msg_002", from_number: "6281234567891"
```

**Session 2: `628119906990`**
```sql
-- contacts
session_id: 628119906990, contact_id: 6281234567890@c.us, name: "John Doe" (bisa berbeda)
session_id: 628119906990, contact_id: 6281234567892@c.us, name: "Bob Wilson"

-- messages
session_id: 628119906990, message_id: "msg_003", from_number: "6281234567890"
session_id: 628119906990, message_id: "msg_004", from_number: "6281234567892"
```

### Query dengan Filter Session

Semua query selalu filter berdasarkan `session_id`:

```sql
-- Get contacts for session 1
SELECT * FROM contacts WHERE session_id = '628112298898';

-- Get messages for session 2
SELECT * FROM messages WHERE session_id = '628119906990';

-- Get contacts that exist in both sessions
SELECT DISTINCT contact_id 
FROM contacts 
WHERE session_id IN ('628112298898', '628119906990');
```

## Foreign Key Relationships

Semua table memiliki FOREIGN KEY ke `sessions(session_id)` dengan `ON DELETE CASCADE`:

```sql
FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
```

**Artinya:**
- Jika session dihapus, semua data terkait (contacts, messages, attachments, dll) akan otomatis terhapus
- Data integrity terjaga
- Tidak ada orphaned data

## Keuntungan Desain Ini

### ✅ **Efisien**
- Satu set table untuk semua session
- Tidak perlu membuat table baru per session
- Index `session_id` membuat query cepat

### ✅ **Mudah Maintenance**
- Backup/restore satu database
- Query analytics bisa cross-session
- Reporting lebih mudah

### ✅ **Scalable**
- Bisa handle ratusan session tanpa masalah
- Index `session_id` memastikan performa tetap baik
- Partition bisa dilakukan per `session_id` jika perlu

### ✅ **Data Isolation**
- Setiap session hanya melihat data mereka sendiri (via `session_id` filter)
- Foreign key cascade memastikan cleanup otomatis

## Indexes untuk Performa

Semua table memiliki index pada `session_id`:

```sql
INDEX idx_session_id (session_id)
```

Ini memastikan query dengan filter `session_id` sangat cepat, bahkan dengan jutaan rows.

## Unique Constraints

Beberapa table memiliki unique constraint yang mencakup `session_id`:

```sql
-- Contacts: satu contact_id hanya bisa ada sekali per session
UNIQUE KEY unique_session_contact (session_id, contact_id)

-- Messages: message_id global unique (bisa dari session manapun)
message_id VARCHAR(255) UNIQUE NOT NULL
```

## Contoh Query Multi-Session

### Get all sessions with message count:
```sql
SELECT 
    s.session_id,
    s.phone_number,
    s.status,
    COUNT(m.id) as message_count
FROM sessions s
LEFT JOIN messages m ON m.session_id = s.session_id
GROUP BY s.session_id;
```

### Get contacts that exist in multiple sessions:
```sql
SELECT 
    contact_id,
    COUNT(DISTINCT session_id) as session_count,
    GROUP_CONCAT(DISTINCT session_id) as sessions
FROM contacts
GROUP BY contact_id
HAVING session_count > 1;
```

### Get total messages across all sessions:
```sql
SELECT 
    session_id,
    COUNT(*) as total_messages,
    COUNT(CASE WHEN direction = 'incoming' THEN 1 END) as incoming,
    COUNT(CASE WHEN direction = 'outgoing' THEN 1 END) as outgoing
FROM messages
GROUP BY session_id;
```

## Kesimpulan

**Ya, semua session menggunakan table yang sama**, dengan:
- ✅ Data dibedakan dengan kolom `session_id`
- ✅ Foreign key cascade untuk data integrity
- ✅ Index untuk performa optimal
- ✅ Unique constraints untuk mencegah duplikasi
- ✅ Query selalu filter berdasarkan `session_id`

Desain ini memungkinkan sistem untuk handle banyak session secara efisien dalam satu database.


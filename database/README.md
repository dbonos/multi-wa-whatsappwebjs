# Database Configuration

## MySQL Setup

### 1. Install MySQL (if not installed)
```bash
sudo apt-get update
sudo apt-get install -y mysql-server
sudo mysql_secure_installation
```

### 2. Create Database
```bash
mysql -u root -p < database/schema.sql
```

### 3. Environment Variables
Create `.env` file:
```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=wa_manager
DB_PASSWORD=your_secure_password
DB_NAME=wa_manager

JWT_SECRET=your_super_secret_jwt_key_change_this
JWT_EXPIRES_IN=24h

WEBHOOK_BASE_URL=https://your-webhook-url.com
ATTACHMENTS_DIR=/home/ubuntu/wa-web/attachments
PORT=3000
NODE_ENV=production
```

### 4. Create Database User
```sql
CREATE USER 'wa_manager'@'localhost' IDENTIFIED BY 'your_secure_password';
GRANT ALL PRIVILEGES ON wa_manager.* TO 'wa_manager'@'localhost';
FLUSH PRIVILEGES;
```

### 5. Test Connection
```bash
mysql -u wa_manager -p wa_manager
```

## Database Schema Overview

### Tables:
1. **users** - Frontend login users
2. **sessions** - WhatsApp sessions
3. **contacts** - Contacts with @lid conversion
4. **messages** - All messages (incoming/outgoing)
5. **attachments** - File attachments
6. **broadcast_lists** - Broadcast list definitions
7. **broadcast_recipients** - Broadcast recipients
8. **broadcast_messages** - Broadcast message history
9. **webhooks** - Webhook configurations
10. **message_status_history** - Message status tracking

## Backup & Restore

### Backup:
```bash
mysqldump -u wa_manager -p wa_manager > backup_$(date +%Y%m%d).sql
```

### Restore:
```bash
mysql -u wa_manager -p wa_manager < backup_20240112.sql
```


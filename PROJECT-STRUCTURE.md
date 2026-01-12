# 📁 Project Structure

## 🗂️ **Directory Layout**

```
multi-wa-whatsappwebjs/
├── 📄 README.md                    # Main project README
├── 📄 server.js                     # Main backend server
├── 📄 index.js                     # Legacy entry point
├── 📄 package.json                  # Backend dependencies
├── 📄 .env                         # Environment variables (not in git)
│
├── 📁 src/                         # Backend source code
│   ├── config/
│   │   └── database.js            # Database configuration
│   ├── middleware/
│   │   └── auth.js                # Authentication middleware
│   ├── services/
│   │   ├── messageHandler.js      # Message handling service
│   │   ├── socketHandler.js       # WebSocket handler
│   │   └── otpService.js          # OTP service
│   └── ...
│
├── 📁 frontend/                    # Frontend React application
│   ├── src/
│   │   ├── pages/                 # Page components
│   │   ├── components/            # Reusable components
│   │   ├── contexts/             # React contexts
│   │   ├── services/             # API & Socket services
│   │   └── ...
│   ├── package.json
│   └── ...
│
├── 📁 database/                    # Database files
│   ├── schema.sql                 # Main database schema
│   ├── migrations/                # Database migrations
│   │   ├── add_reactions_replies_deleted.sql
│   │   └── add_user_otp_and_session_login.sql
│   └── README.md
│
├── 📁 docs/                        # 📚 Documentation
│   ├── README.md                  # Documentation index
│   │
│   ├── 📁 setup/                  # Setup guides
│   │   ├── START-HERE.md
│   │   ├── QUICK-START.md
│   │   ├── SETUP-LOCALHOST.md
│   │   ├── SETUP-SERVER.md
│   │   ├── MYSQL-SETUP.md
│   │   └── ...
│   │
│   ├── 📁 features/                # Feature documentation
│   │   ├── FEATURES.md
│   │   ├── CAPABILITIES.md
│   │   ├── CONNECT-NEW-NUMBER.md
│   │   ├── LID-HANDLING.md
│   │   └── ...
│   │
│   ├── 📁 deployment/              # Deployment guides
│   │   ├── DEPLOYMENT.md
│   │   ├── WORKFLOW.md
│   │   ├── SERVER-CONFIG.md
│   │   └── ...
│   │
│   ├── 📁 api/                     # API documentation
│   │   └── API-DOCUMENTATION.md
│   │
│   └── 📄 Other docs...            # Other documentation
│
├── 📁 scripts/                     # 🔧 Utility scripts
│   ├── setup.sh                   # Initial setup script
│   ├── setup-admin.js             # Create admin user
│   ├── deploy.sh                  # Deployment script
│   ├── start-tunnel.sh            # SSH tunnel for database
│   ├── update-mysql-port.sh       # Update MySQL port
│   └── ...
│
├── 📁 public/                      # Frontend build output (served by backend)
├── 📁 attachments/                 # WhatsApp attachments storage
└── 📁 .wwebjs_auth/                # WhatsApp session data (auto-generated)
```

---

## 📋 **Key Files**

### **Root Level**
- `README.md` - Main project documentation
- `server.js` - Main backend server (Express + WhatsApp)
- `package.json` - Backend dependencies
- `.env` - Environment configuration (not in git)

### **Backend (`src/`)**
- `src/config/database.js` - MySQL connection pool
- `src/middleware/auth.js` - JWT authentication & permissions
- `src/services/messageHandler.js` - Message processing
- `src/services/socketHandler.js` - WebSocket real-time updates
- `src/services/otpService.js` - OTP generation & verification

### **Frontend (`frontend/`)**
- `frontend/src/pages/` - Page components (Login, Dashboard, Messages, etc.)
- `frontend/src/components/` - Reusable components
- `frontend/src/services/api.js` - API client
- `frontend/src/services/socket.js` - WebSocket client

### **Database (`database/`)**
- `database/schema.sql` - Main database schema
- `database/migrations/` - Database migration files

### **Documentation (`docs/`)**
- `docs/README.md` - Documentation index
- `docs/setup/` - Setup guides
- `docs/features/` - Feature documentation
- `docs/deployment/` - Deployment guides
- `docs/api/` - API documentation

### **Scripts (`scripts/`)**
- `scripts/setup.sh` - Initial setup
- `scripts/deploy.sh` - Deployment automation
- `scripts/start-tunnel.sh` - Database SSH tunnel

---

## 🎯 **Quick Navigation**

### **Getting Started**
- Start here: `docs/setup/START-HERE.md`
- Quick start: `docs/setup/QUICK-START.md`

### **Setup**
- Localhost: `docs/setup/SETUP-LOCALHOST.md`
- Server: `docs/setup/SETUP-SERVER.md`
- MySQL: `docs/setup/MYSQL-SETUP.md`

### **Features**
- Features list: `docs/features/FEATURES.md`
- API docs: `docs/api/API-DOCUMENTATION.md`

### **Deployment**
- Deployment: `docs/deployment/DEPLOYMENT.md`
- Workflow: `docs/deployment/WORKFLOW.md`

---

## 📝 **File Count**

- **Documentation:** ~40+ markdown files (organized in `docs/`)
- **Scripts:** 7 utility scripts (in `scripts/`)
- **Backend:** Main server + services + middleware
- **Frontend:** React app with pages, components, services

---

## ✅ **Benefits of This Structure**

- ✅ **Organized** - Documentation grouped by category
- ✅ **Clean Root** - Only essential files in root
- ✅ **Easy Navigation** - Clear folder structure
- ✅ **Maintainable** - Easy to find and update files
- ✅ **Professional** - Industry-standard structure

---

**See [docs/README.md](docs/README.md) for complete documentation index.**


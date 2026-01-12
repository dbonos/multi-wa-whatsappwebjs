# WhatsApp Manager Frontend

Modern, beautiful React frontend for WhatsApp Multi-Instance Management System.

## 🚀 Features

- ✅ **Beautiful Modern UI** - Tailwind CSS with WhatsApp-inspired design
- ✅ **Login System** - Secure JWT authentication
- ✅ **Dashboard** - Session management with real-time status
- ✅ **QR Scanner** - Auto-refresh QR code scanner
- ✅ **Send Messages** - Text and attachment support
- ✅ **Message List** - View sent messages with status tracking
- ✅ **Broadcast** - Send to multiple recipients
- ✅ **Status & Stories** - Update WhatsApp status and post stories
- ✅ **Real-time Updates** - WebSocket integration
- ✅ **Responsive Design** - Works on desktop and mobile

## 📦 Tech Stack

- **React 19** - Latest React with hooks
- **Vite** - Fast build tool
- **Tailwind CSS** - Utility-first CSS framework
- **React Router** - Client-side routing
- **Socket.IO Client** - Real-time WebSocket
- **Axios** - HTTP client
- **Lucide React** - Beautiful icons
- **QRCode.react** - QR code generation

## 🛠️ Setup

### 1. Install Dependencies
```bash
cd frontend
npm install
```

### 2. Configure Environment
```bash
cp .env.example .env
# Edit .env with your API URL
```

### 3. Development Server
```bash
npm run dev
```

Frontend will run on `http://localhost:5173`

### 4. Build for Production
```bash
npm run build
```

Output will be in `dist/` folder.

## 📁 Project Structure

```
frontend/
├── src/
│   ├── components/      # Reusable components
│   │   ├── Layout.jsx
│   │   ├── ProtectedRoute.jsx
│   │   ├── QRScanner.jsx
│   │   └── SessionCard.jsx
│   ├── pages/          # Page components
│   │   ├── Login.jsx
│   │   ├── Dashboard.jsx
│   │   ├── Messages.jsx
│   │   ├── Broadcast.jsx
│   │   └── Status.jsx
│   ├── services/       # API & WebSocket services
│   │   ├── api.js
│   │   └── socket.js
│   ├── contexts/       # React contexts
│   │   └── AuthContext.jsx
│   ├── App.jsx         # Main app with routing
│   └── main.jsx        # Entry point
├── public/             # Static files
├── index.html
├── vite.config.js
└── tailwind.config.js
```

## 🎨 Pages

### Login (`/login`)
- Beautiful gradient background
- Secure authentication
- Error handling

### Dashboard (`/dashboard`)
- Session list with real-time status
- Create new sessions
- QR code scanner modal
- Statistics overview
- Search functionality

### Messages (`/messages`)
- Send text messages
- Send attachments
- View sent messages list
- Status tracking (sent, delivered, read, played)
- Filter by status

### Broadcast (`/broadcast`)
- Create broadcast lists
- Manage recipients
- Send broadcast messages
- Track delivery status

### Status & Stories (`/status`)
- Update WhatsApp status
- Post stories with media
- Tab-based interface

## 🔌 API Integration

All API calls are handled through `src/services/api.js`:
- Automatic token injection
- Error handling
- Request/response interceptors

## 🔔 WebSocket Integration

Real-time updates via `src/services/socket.js`:
- Session status changes
- QR code updates
- Message status updates
- New incoming messages

## 🎯 Key Features

### Real-time Updates
- Session status changes appear instantly
- QR codes auto-refresh
- Message status updates in real-time

### Beautiful UI
- WhatsApp-inspired color scheme
- Smooth animations
- Responsive design
- Modern card-based layout

### Security
- JWT token storage
- Protected routes
- Auto-logout on token expiry
- Secure API calls

## 🚀 Deployment

### Build
```bash
npm run build
```

### Serve Static Files
Copy `dist/` folder to your web server or use:
```bash
npm run preview
```

### Nginx Configuration
```nginx
server {
    listen 80;
    server_name your-domain.com;
    root /path/to/frontend/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api {
        proxy_pass http://108.137.37.171:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## 📱 Responsive Design

- **Desktop**: Full sidebar navigation
- **Tablet**: Collapsible sidebar
- **Mobile**: Hamburger menu, optimized layout

## 🎨 Color Scheme

- **Primary**: WhatsApp Green (`#25D366`)
- **Dark**: WhatsApp Dark (`#128C7E`)
- **Success**: Green
- **Warning**: Yellow
- **Danger**: Red
- **Info**: Blue

## 🔧 Environment Variables

```env
VITE_API_URL=http://108.137.37.171:3000/api
VITE_SOCKET_URL=http://108.137.37.171:3000
```

## 📝 Notes

- Frontend connects to backend API
- WebSocket for real-time updates
- All API calls require authentication
- Token stored in localStorage
- Auto-redirect to login if unauthorized

## 🐛 Troubleshooting

### CORS Issues
- Make sure backend CORS is configured
- Check API URL in `.env`

### WebSocket Not Connecting
- Verify Socket.IO server is running
- Check `VITE_SOCKET_URL` in `.env`
- Check browser console for errors

### Build Errors
- Clear `node_modules` and reinstall
- Check Node.js version (requires 18+)

---

**Built with ❤️ using React + Tailwind CSS**

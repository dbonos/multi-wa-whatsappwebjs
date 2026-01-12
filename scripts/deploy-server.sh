#!/bin/bash

# Script untuk pull latest code dan restart server di production server
# Usage: ./scripts/deploy-server.sh

echo "🚀 Starting deployment..."

# Navigate to project directory
cd /path/to/multi-wa-whatsappwebjs || {
    echo "❌ Error: Project directory not found!"
    exit 1
}

echo "📥 Pulling latest code from git..."
git pull origin main

if [ $? -ne 0 ]; then
    echo "❌ Error: Git pull failed!"
    exit 1
fi

echo "✅ Code pulled successfully"

# Install/update dependencies if needed
echo "📦 Checking dependencies..."
if [ -f "package.json" ]; then
    npm install --production
fi

if [ -d "frontend" ]; then
    echo "🏗️  Building frontend..."
    cd frontend
    npm install
    npm run build
    cd ..
fi

echo "🔄 Restarting server..."

# Find and kill existing node process
if pgrep -f "node.*server.js" > /dev/null; then
    echo "🛑 Stopping existing server..."
    pkill -f "node.*server.js"
    sleep 2
fi

# Start server (adjust based on your setup - pm2, systemd, etc.)
# Option 1: Direct node
# nohup node server.js > server.log 2>&1 &

# Option 2: Using PM2 (recommended)
if command -v pm2 &> /dev/null; then
    echo "🚀 Starting server with PM2..."
    pm2 restart multi-wa-server || pm2 start server.js --name multi-wa-server
    pm2 save
else
    echo "⚠️  PM2 not found, starting with nohup..."
    nohup node server.js > server.log 2>&1 &
    echo "✅ Server started in background"
    echo "📋 Logs: tail -f server.log"
fi

echo "✅ Deployment completed!"
echo "📋 Check server status with: pm2 status (if using PM2)"
echo "📋 Or check logs: tail -f server.log"


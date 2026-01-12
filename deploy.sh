#!/bin/bash
# Deployment script for wa-web

echo "🚀 Starting deployment..."

# Pull latest code
echo "📥 Pulling latest code from GitHub..."
git pull origin main

# Install/update dependencies
echo "📦 Installing dependencies..."
npm install --production

# Restart service
echo "🔄 Restarting wa-web service..."
sudo systemctl restart wa-web.service

# Wait a bit for service to start
sleep 2

# Check service status
echo "✅ Checking service status..."
sudo systemctl status wa-web.service --no-pager

echo "🎉 Deployment completed!"



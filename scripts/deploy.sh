#!/bin/bash
# Deployment script for wa-web
# This script pulls latest code, installs dependencies, rebuilds frontend, and restarts service

set -e

echo "🚀 Starting deployment..."

# Pull latest code
echo "📥 Pulling latest code from GitHub..."
git pull origin main

# Run database migrations (best-effort)
echo "🗄️  Running database migration..."
for MIG in database/migrations/create_statistics_tables.sql database/migrations/convert_timestamp_to_datetime_wib.sql database/migrations/add_attachment_url_to_messages.sql database/migrations/add_public_domain_to_sessions.sql; do
  if [ -f \"$MIG\" ]; then
      mysql -u root -p${MYSQL_PASSWORD:-} wa_manager < \"$MIG\" 2>/dev/null || {
          echo \"⚠️  Migration $MIG might have failed or already applied. Continuing...\"
      }
  else
      echo \"⚠️  Migration file not found: $MIG (skipping)\"
  fi
done

# Install/update backend dependencies
echo "📦 Installing backend dependencies..."
npm install

# Install/update frontend dependencies
echo "📦 Installing frontend dependencies..."
cd frontend
npm install
cd ..

# Update frontend .env for server
echo "⚙️  Updating frontend .env for server..."
cat > frontend/.env << EOF
VITE_API_URL=http://108.137.37.171:3000/api
VITE_SOCKET_URL=http://108.137.37.171:3000
EOF

# Build frontend
echo "🏗️  Building frontend..."
cd frontend
npm run build
cd ..

# Copy frontend build to public folder
echo "📋 Copying frontend build to public folder..."
mkdir -p public
cp -r frontend/dist/* public/

# Restart service
echo "🔄 Restarting wa-web service..."
sudo systemctl restart wa-web.service

# Wait a bit for service to start
sleep 3

# Check service status
echo "✅ Checking service status..."
sudo systemctl status wa-web.service --no-pager

echo "🎉 Deployment completed!"
echo ""
echo "📱 Access application at: http://108.137.37.171:3000"



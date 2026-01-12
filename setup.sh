#!/bin/bash

# WhatsApp Multi-Instance Manager - Setup Script
# This script will setup everything you need to run the application

set -e

echo "🚀 WhatsApp Manager - Setup Script"
echo "=================================="
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check Node.js version
echo "📦 Checking Node.js version..."
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
    echo -e "${YELLOW}⚠️  Warning: Node.js version should be 20+ for best compatibility${NC}"
    echo "   Current version: $(node -v)"
    echo "   Continuing anyway..."
else
    echo -e "${GREEN}✅ Node.js version OK: $(node -v)${NC}"
fi
echo ""

# Install backend dependencies
echo "📦 Installing backend dependencies..."
npm install
echo -e "${GREEN}✅ Backend dependencies installed${NC}"
echo ""

# Install frontend dependencies
echo "📦 Installing frontend dependencies..."
cd frontend
npm install
cd ..
echo -e "${GREEN}✅ Frontend dependencies installed${NC}"
echo ""

# Check MySQL
echo "🗄️  Checking MySQL..."
if command -v mysql &> /dev/null; then
    echo -e "${GREEN}✅ MySQL found${NC}"
    echo ""
    echo "📝 Database Setup:"
    echo "   Please run these commands to setup database:"
    echo ""
    echo "   mysql -u root -p < database/schema.sql"
    echo "   mysql -u root -p wa_manager < database/migrations/add_reactions_replies_deleted.sql"
    echo ""
    read -p "Have you already setup the database? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "   Please setup database first, then run this script again"
        exit 1
    fi
else
    echo -e "${YELLOW}⚠️  MySQL not found. Please install MySQL first.${NC}"
fi
echo ""

# Check .env file
echo "⚙️  Checking configuration files..."
if [ ! -f .env ]; then
    echo "   Creating .env file from .env.example..."
    cp .env.example .env
    echo -e "${YELLOW}⚠️  Please edit .env file with your database credentials${NC}"
else
    echo -e "${GREEN}✅ .env file exists${NC}"
fi

if [ ! -f frontend/.env ]; then
    echo "   Creating frontend/.env file..."
    cat > frontend/.env << EOF
VITE_API_URL=http://108.137.37.171:3000/api
VITE_SOCKET_URL=http://108.137.37.171:3000
EOF
    echo -e "${YELLOW}⚠️  Please edit frontend/.env with your server IP${NC}"
else
    echo -e "${GREEN}✅ frontend/.env file exists${NC}"
fi
echo ""

# Create attachments directory
echo "📁 Creating attachments directory..."
mkdir -p attachments
echo -e "${GREEN}✅ Attachments directory created${NC}"
echo ""

# Build frontend
echo "🏗️  Building frontend..."
cd frontend
npm run build
cd ..
echo -e "${GREEN}✅ Frontend built successfully${NC}"
echo ""

# Copy frontend build to public
echo "📋 Copying frontend build to public folder..."
mkdir -p public
cp -r frontend/dist/* public/ 2>/dev/null || true
echo -e "${GREEN}✅ Frontend copied to public folder${NC}"
echo ""

# Create admin user script
echo "👤 Creating admin user setup script..."
cat > setup-admin.js << 'EOF'
const bcrypt = require('bcryptjs');
const mysql = require('mysql2/promise');
require('dotenv').config();

async function setupAdmin() {
    try {
        const password = 'admin123';
        const hash = await bcrypt.hash(password, 10);
        
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'wa_manager'
        });
        
        await connection.execute(
            `INSERT INTO users (username, password_hash, role) 
             VALUES (?, ?, 'admin')
             ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash)`,
            ['admin', hash]
        );
        
        console.log('✅ Admin user created/updated successfully!');
        console.log('   Username: admin');
        console.log('   Password: admin123');
        console.log('   ⚠️  Please change password after first login!');
        
        await connection.end();
    } catch (error) {
        console.error('❌ Error:', error.message);
        console.log('');
        console.log('Please make sure:');
        console.log('1. Database is created and schema is imported');
        console.log('2. .env file has correct database credentials');
        process.exit(1);
    }
}

setupAdmin();
EOF
chmod +x setup-admin.js
echo -e "${GREEN}✅ Admin setup script created${NC}"
echo ""

# Run admin setup
echo "👤 Setting up admin user..."
node setup-admin.js
echo ""

# Summary
echo "=================================="
echo -e "${GREEN}✅ Setup Complete!${NC}"
echo "=================================="
echo ""
echo "📋 Next Steps:"
echo ""
echo "1. Start Backend:"
echo "   node server.js"
echo ""
echo "2. Access Frontend:"
echo "   http://localhost:3000"
echo ""
echo "3. Login:"
echo "   Username: admin"
echo "   Password: admin123"
echo ""
echo "4. Create Session & Scan QR Code"
echo ""
echo "📚 For production deployment, see SETUP-GUIDE.md"
echo ""


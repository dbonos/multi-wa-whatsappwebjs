#!/bin/bash
# Script to update MySQL port to 5508 on server

echo "🔧 Updating MySQL port to 5508 on server..."
echo ""

# Check if SSH key exists
SSH_KEY=""
if [ -f "./LightsailDefaultKey-ap-southeast-3.pem" ]; then
    SSH_KEY="./LightsailDefaultKey-ap-southeast-3.pem"
elif [ -f "~/.ssh/LightsailDefaultKey-ap-southeast-3.pem" ]; then
    SSH_KEY="~/.ssh/LightsailDefaultKey-ap-southeast-3.pem"
else
    echo "❌ SSH key not found!"
    echo "Please provide path to SSH key:"
    read -p "SSH key path: " SSH_KEY
fi

if [ ! -f "$SSH_KEY" ]; then
    echo "❌ SSH key file not found: $SSH_KEY"
    exit 1
fi

# Set permissions
chmod 600 "$SSH_KEY"

SERVER="ubuntu@108.137.37.171"

echo "📡 Connecting to server..."
echo ""

# Update MySQL config
echo "1️⃣  Updating MySQL configuration..."
ssh -i "$SSH_KEY" "$SERVER" << 'ENDSSH'
    # Backup config
    sudo cp /etc/mysql/mysql.conf.d/mysqld.cnf /etc/mysql/mysql.conf.d/mysqld.cnf.backup
    
    # Check if port is already set
    if grep -q "^port" /etc/mysql/mysql.conf.d/mysqld.cnf; then
        # Update existing port
        sudo sed -i 's/^port.*=.*/port = 5508/' /etc/mysql/mysql.conf.d/mysqld.cnf
        echo "✅ Updated existing port to 5508"
    else
        # Add port after [mysqld] section
        sudo sed -i '/^\[mysqld\]/a port = 5508' /etc/mysql/mysql.conf.d/mysqld.cnf
        echo "✅ Added port = 5508"
    fi
    
    # Verify
    echo ""
    echo "📋 MySQL Config:"
    sudo grep -E '^\[mysqld\]|^port' /etc/mysql/mysql.conf.d/mysqld.cnf | head -5
ENDSSH

# Restart MySQL
echo ""
echo "2️⃣  Restarting MySQL..."
ssh -i "$SSH_KEY" "$SERVER" "sudo systemctl restart mysql && sleep 2 && sudo systemctl status mysql --no-pager | head -10"

# Verify port
echo ""
echo "3️⃣  Verifying MySQL is listening on port 5508..."
ssh -i "$SSH_KEY" "$SERVER" "sudo netstat -tulpn | grep 5508 || sudo ss -tulpn | grep 5508 || echo '⚠️  Port 5508 not found (may need to check MySQL logs)'"

# Update .env on server
echo ""
echo "4️⃣  Updating .env file on server..."
ssh -i "$SSH_KEY" "$SERVER" << 'ENDSSH'
    cd ~/multi-wa-whatsappwebjs 2>/dev/null || cd ~/wa-web 2>/dev/null || { echo "⚠️  Project folder not found"; exit 1; }
    
    if [ -f .env ]; then
        if grep -q "DB_PORT" .env; then
            sed -i 's/DB_PORT=.*/DB_PORT=5508/' .env
            echo "✅ Updated DB_PORT in .env"
        else
            echo "DB_PORT=5508" >> .env
            echo "✅ Added DB_PORT=5508 to .env"
        fi
        echo ""
        echo "📋 Current DB config in .env:"
        grep "DB_" .env
    else
        echo "⚠️  .env file not found"
    fi
ENDSSH

echo ""
echo "✅ MySQL port update completed!"
echo ""
echo "📝 Next steps:"
echo "   1. Test MySQL connection: mysql -h localhost -P 5508 -u root -p"
echo "   2. Restart your application service if needed"
echo ""


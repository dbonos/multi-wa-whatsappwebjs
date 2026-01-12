#!/bin/bash
# Start SSH tunnel untuk database connection dari localhost ke server

echo "🔗 Starting SSH tunnel for database..."
echo "   Local port: 3306 → Server: localhost:3306"
echo ""
echo "⚠️  Keep this terminal open!"
echo "   Press Ctrl+C to stop tunnel"
echo ""

ssh -i ~/.ssh/LightsailDefaultKey-ap-southeast-3.pem \
    -L 3306:localhost:3306 \
    ubuntu@108.137.37.171 -N

echo ""
echo "❌ Tunnel closed"


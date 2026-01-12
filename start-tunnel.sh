#!/bin/bash
# Start SSH tunnel untuk database connection dari localhost ke server

echo "🔗 Starting SSH tunnel for database..."
echo "   Local port: 5508 → Server: localhost:5508"
echo ""
echo "⚠️  Keep this terminal open!"
echo "   Press Ctrl+C to stop tunnel"
echo ""

ssh -i ~/.ssh/LightsailDefaultKey-ap-southeast-3.pem \
    -L 5508:localhost:5508 \
    ubuntu@108.137.37.171 -N

echo ""
echo "❌ Tunnel closed"


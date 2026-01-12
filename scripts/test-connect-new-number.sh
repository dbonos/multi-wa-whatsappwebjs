#!/bin/bash
# Test script untuk connect nomor WhatsApp baru

SERVER_IP="108.137.37.171"
SSH_KEY="/Users/danielbudiono/cursor_projects/multi wa whatwappwebjs/LightsailDefaultKey-ap-southeast-3.pem"
SESSION_ID="demo_$(date +%s)"

echo "========================================="
echo "Test: Connect Nomor WhatsApp Baru"
echo "========================================="
echo ""
echo "Session ID: $SESSION_ID"
echo ""

# 1. Start session
echo "1. Starting new WhatsApp session..."
curl -X POST http://$SERVER_IP:3000/session/start \
  -H "Content-Type: application/json" \
  -d "{\"sessionId\": \"$SESSION_ID\"}" | jq '.'
echo ""

echo "2. Check server logs for QR code..."
echo "   Run this command in another terminal:"
echo ""
echo "   ssh -i \"$SSH_KEY\" ubuntu@$SERVER_IP \"tail -f ~/wa-web/logs/app.log\""
echo ""

read -p "3. Press Enter after scanning QR code and seeing 'Client is ready!'..."
echo ""

# 4. Check session status
echo "4. Checking session status..."
curl -s http://$SERVER_IP:3000/session/status/$SESSION_ID | jq '.'
echo ""

# 5. List all sessions
echo "5. Listing all active sessions..."
curl -s http://$SERVER_IP:3000/sessions | jq '.'
echo ""

echo "========================================="
echo "✅ Session created successfully!"
echo "========================================="
echo ""
echo "Session ID: $SESSION_ID"
echo ""
echo "You can now:"
echo "- Send messages"
echo "- Get contacts"
echo "- Get chats"
echo "- All WhatsApp features"
echo ""
echo "To stop this session:"
echo "curl -X POST http://$SERVER_IP:3000/session/stop -H 'Content-Type: application/json' -d '{\"sessionId\": \"$SESSION_ID\"}'"


#!/bin/bash
# Test script for @lid handling

API_URL="http://localhost:3000"
SESSION_ID="test_lid_session"

echo "======================================"
echo "Testing @lid Handling in WhatsApp Web.js"
echo "======================================"
echo ""

# 1. Check API Status
echo "1. Checking API status..."
curl -s $API_URL | jq '.'
echo ""

# 2. Start a new session
echo "2. Starting WhatsApp session..."
echo "   Note: You'll need to scan the QR code in the server logs"
curl -s -X POST $API_URL/session/start \
  -H "Content-Type: application/json" \
  -d "{\"sessionId\": \"$SESSION_ID\"}" | jq '.'
echo ""
echo "   ⚠️  Go to server and scan QR code:"
echo "   ssh -i ~/.ssh/LightsailDefaultKey-ap-southeast-1.pem ubuntu@yamaha-bandung.id"
echo "   tail -f ~/wa-web/logs/app.log"
echo ""
read -p "   Press Enter after scanning QR code and seeing 'Client is ready!'..."
echo ""

# 3. Get session status
echo "3. Getting session status..."
curl -s $API_URL/session/status/$SESSION_ID | jq '.'
echo ""

# 4. Get all contacts with @lid stats
echo "4. Getting all contacts (with @lid stats)..."
curl -s $API_URL/contacts/$SESSION_ID | jq '.stats'
echo ""
echo "   Sample contacts:"
curl -s $API_URL/contacts/$SESSION_ID | jq '.contacts[:3]'
echo ""

# 5. Get chats (better for phone numbers)
echo "5. Getting chats (better method for phone extraction)..."
curl -s $API_URL/chats/$SESSION_ID | jq '.stats'
echo ""
echo "   Sample chats:"
curl -s $API_URL/chats/$SESSION_ID | jq '.chats[:3]'
echo ""

# 6. Verify phone number
echo "6. Testing phone verification..."
read -p "   Enter a phone number to verify (e.g., 6281234567890): " PHONE_NUMBER
if [ ! -z "$PHONE_NUMBER" ]; then
    curl -s -X POST $API_URL/phone/verify \
      -H "Content-Type: application/json" \
      -d "{\"sessionId\": \"$SESSION_ID\", \"phone\": \"$PHONE_NUMBER\"}" | jq '.'
    echo ""
fi

# 7. Get specific contact info
echo "7. Testing specific contact info..."
read -p "   Enter a contact ID (e.g., 6281234567890@c.us or XYZ@lid): " CONTACT_ID
if [ ! -z "$CONTACT_ID" ]; then
    curl -s -X POST $API_URL/contact/info \
      -H "Content-Type: application/json" \
      -d "{\"sessionId\": \"$SESSION_ID\", \"contactId\": \"$CONTACT_ID\"}" | jq '.'
    echo ""
fi

# 8. Send test message
echo "8. Testing message sending..."
read -p "   Enter phone/ID to send test message (or skip): " SEND_TO
if [ ! -z "$SEND_TO" ]; then
    curl -s -X POST $API_URL/message/send \
      -H "Content-Type: application/json" \
      -d "{\"sessionId\": \"$SESSION_ID\", \"phone\": \"$SEND_TO\", \"message\": \"Test message from whatsapp-web.js API\"}" | jq '.'
    echo ""
fi

echo "======================================"
echo "Test completed!"
echo "======================================"
echo ""
echo "Key findings:"
echo "- Check the stats from step 4 to see how many @lid vs @c.us contacts"
echo "- Compare contacts (step 4) vs chats (step 5) for phone number availability"
echo "- Use phone/verify (step 6) to convert phone numbers to proper WhatsApp IDs"
echo ""
echo "To stop the session:"
echo "curl -X POST $API_URL/session/stop -H 'Content-Type: application/json' -d '{\"sessionId\": \"$SESSION_ID\"}'"


#!/bin/bash

# Script untuk test kirim pesan menggunakan curl
# Usage: ./test-send-message-curl.sh [API_URL] [PHONE] [MESSAGE] [SESSION_ID]

# Default values
API_URL="${1:-http://localhost:3000/api}"
PHONE="${2:-6281234567890}"
MESSAGE="${3:-Hello from curl!}"
SESSION_ID="${4:-}"

echo "🚀 Testing Send Message API"
echo "================================"
echo "API URL: $API_URL"
echo "Phone: $PHONE"
echo "Message: $MESSAGE"
echo ""

# Step 1: Login
echo "🔐 Step 1: Login..."
LOGIN_RESPONSE=$(curl -s -X POST "$API_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "admin123"
  }')

TOKEN=$(echo $LOGIN_RESPONSE | grep -o '"token":"[^"]*' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo "❌ Login failed!"
  echo "Response: $LOGIN_RESPONSE"
  exit 1
fi

echo "✅ Login successful"
echo "Token: ${TOKEN:0:50}..."
echo ""

# Step 2: Get sessions (if SESSION_ID not provided)
if [ -z "$SESSION_ID" ]; then
  echo "📋 Step 2: Getting available sessions..."
  SESSIONS_RESPONSE=$(curl -s -X GET "$API_URL/sessions" \
    -H "Authorization: Bearer $TOKEN")
  
  echo "Sessions response: $SESSIONS_RESPONSE"
  
  # Try to extract session_id from response
  SESSION_ID=$(echo $SESSIONS_RESPONSE | grep -o '"session_id":"[^"]*' | head -1 | cut -d'"' -f4)
  
  if [ -z "$SESSION_ID" ]; then
    echo "❌ No session found. Please create a session first or provide SESSION_ID as 4th argument."
    exit 1
  fi
  
  echo "✅ Using session: $SESSION_ID"
  echo ""
fi

# Step 3: Send message
echo "📤 Step 3: Sending message..."
SEND_RESPONSE=$(curl -s -X POST "$API_URL/messages/send" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"sessionId\": \"$SESSION_ID\",
    \"phone\": \"$PHONE\",
    \"message\": \"$MESSAGE\"
  }")

echo "Response: $SEND_RESPONSE"
echo ""

# Check if successful
if echo "$SEND_RESPONSE" | grep -q '"success":true'; then
  echo "✅ Message sent successfully!"
  MESSAGE_ID=$(echo $SEND_RESPONSE | grep -o '"messageId":"[^"]*' | cut -d'"' -f4)
  echo "Message ID: $MESSAGE_ID"
else
  echo "❌ Failed to send message"
  exit 1
fi


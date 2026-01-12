require('dotenv').config();
const axios = require('axios');

const API_URL = process.env.API_URL || 'http://localhost:3000/api';
const TEST_PHONE = process.argv[2] || '628119906990';
const TEST_MESSAGE = process.argv[3] || 'Test message from server script';

async function testSendMessage() {
    try {
        // Login as admin
        console.log('🔐 Logging in as admin...');
        const loginResponse = await axios.post(`${API_URL}/auth/login`, {
            username: 'admin',
            password: 'admin123'
        });
        
        if (!loginResponse.data.token) {
            console.error('❌ Login failed:', loginResponse.data);
            process.exit(1);
        }
        
        const token = loginResponse.data.token;
        console.log('✅ Login successful');
        
        // Get available sessions
        console.log('📋 Getting available sessions...');
        const sessionsResponse = await axios.get(`${API_URL}/sessions`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        
        const sessions = Array.isArray(sessionsResponse.data) 
            ? sessionsResponse.data 
            : [];
        
        const readySession = sessions.find(s => 
            s.status === 'ready' || s.status === 'authenticated'
        );
        
        if (!readySession) {
            console.error('❌ No ready session found');
            console.log('Available sessions:', sessions.map(s => ({
                session_id: s.session_id,
                status: s.status
            })));
            process.exit(1);
        }
        
        console.log(`✅ Found ready session: ${readySession.session_id}`);
        
        // Send message
        console.log(`📤 Sending message to ${TEST_PHONE}...`);
        const sendResponse = await axios.post(`${API_URL}/messages/send`, {
            sessionId: readySession.session_id,
            phone: TEST_PHONE,
            message: TEST_MESSAGE
        }, {
            headers: { 
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        console.log('✅ Message sent successfully!');
        console.log('Response:', JSON.stringify(sendResponse.data, null, 2));
        
    } catch (error) {
        console.error('❌ Error:', error.response?.data || error.message);
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Data:', JSON.stringify(error.response.data, null, 2));
        }
        process.exit(1);
    }
}

testSendMessage();


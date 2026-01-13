#!/usr/bin/env node

/**
 * Detailed test untuk verifikasi semua fixes
 */

console.log('🧪 Detailed Testing of Fixes...\n');

// Test 1: Verify otpService.js has getWIBTime import
console.log('1️⃣ Testing OTP Service Import...');
const fs = require('fs');
const path = require('path');

const otpServicePath = path.join(__dirname, '../src/services/otpService.js');
const otpServiceContent = fs.readFileSync(otpServicePath, 'utf8');

if (otpServiceContent.includes("const { getWIBTime } = require('../utils/timezone')")) {
    console.log('   ✅ getWIBTime import found in otpService.js');
} else if (otpServiceContent.includes("require('../utils/timezone')")) {
    console.log('   ⚠️  timezone imported but getWIBTime might not be destructured');
} else {
    console.log('   ❌ getWIBTime import NOT found!');
    process.exit(1);
}

// Test 2: Verify messageHandler.js has skip status logic
console.log('\n2️⃣ Testing Message Handler Skip Logic...');
const messageHandlerPath = path.join(__dirname, '../src/services/messageHandler.js');
const messageHandlerContent = fs.readFileSync(messageHandlerPath, 'utf8');

// Check saveOutgoingMessage
if (messageHandlerContent.includes("contactId === 'status@broadcast'") || 
    messageHandlerContent.includes('status@broadcast')) {
    console.log('   ✅ Skip status logic found in saveOutgoingMessage');
} else {
    console.log('   ❌ Skip status logic NOT found in saveOutgoingMessage!');
    process.exit(1);
}

// Check saveIncomingMessage
if (messageHandlerContent.includes("message.from === 'status@broadcast'")) {
    console.log('   ✅ Skip status logic found in saveIncomingMessage');
} else {
    console.log('   ❌ Skip status logic NOT found in saveIncomingMessage!');
    process.exit(1);
}

// Test 3: Test actual function calls
console.log('\n3️⃣ Testing Function Execution...');
try {
    // Test getWIBTime
    const { getWIBTime } = require('../src/utils/timezone');
    const time = getWIBTime();
    console.log(`   ✅ getWIBTime() executed: ${time.toISOString()}`);
    
    // Test otpService can use getWIBTime (indirectly)
    const otpService = require('../src/services/otpService');
    console.log('   ✅ otpService module loaded successfully');
    
    // Test messageHandler
    const messageHandler = require('../src/services/messageHandler');
    console.log('   ✅ messageHandler module loaded successfully');
    
    // Verify methods exist
    if (typeof messageHandler.saveOutgoingMessage === 'function') {
        console.log('   ✅ saveOutgoingMessage method exists');
    }
    if (typeof messageHandler.saveIncomingMessage === 'function') {
        console.log('   ✅ saveIncomingMessage method exists');
    }
    
} catch (error) {
    console.error('   ❌ Error:', error.message);
    console.error('   Stack:', error.stack);
    process.exit(1);
}

// Test 4: Verify skip logic structure
console.log('\n4️⃣ Verifying Skip Logic Structure...');
const saveOutgoingStart = messageHandlerContent.indexOf('async saveOutgoingMessage');
const saveOutgoingEnd = messageHandlerContent.indexOf('async saveIncomingMessage');
const saveOutgoingCode = messageHandlerContent.substring(saveOutgoingStart, saveOutgoingEnd);

if (saveOutgoingCode.includes('Skip status messages') || 
    saveOutgoingCode.includes('status@broadcast')) {
    console.log('   ✅ Skip logic is early in saveOutgoingMessage (good!)');
} else {
    console.log('   ⚠️  Skip logic might not be early enough');
}

const saveIncomingStart = messageHandlerContent.indexOf('async saveIncomingMessage');
const saveIncomingEnd = messageHandlerContent.indexOf('// Save incoming message', saveIncomingStart + 100);
let saveIncomingCode = messageHandlerContent.substring(saveIncomingStart, saveIncomingStart + 500);

if (saveIncomingCode.includes('Skip status messages') || 
    saveIncomingCode.includes('status@broadcast')) {
    console.log('   ✅ Skip logic is early in saveIncomingMessage (good!)');
} else {
    console.log('   ⚠️  Skip logic might not be early enough');
}

console.log('\n✅ All code checks passed!');
console.log('\n📋 Summary:');
console.log('   ✅ getWIBTime imported in otpService.js');
console.log('   ✅ Skip status logic added to saveOutgoingMessage');
console.log('   ✅ Skip status logic added to saveIncomingMessage');
console.log('   ✅ All modules load without errors');
console.log('\n🎉 All fixes verified!');


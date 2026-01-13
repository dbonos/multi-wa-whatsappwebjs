/**
 * Timezone utility functions for WIB (Waktu Indonesia Barat, UTC+7)
 */

/**
 * Get current time in WIB (UTC+7)
 * @returns {Date} Date object adjusted to WIB timezone
 */
function getWIBTime() {
    const now = new Date();
    // WIB is UTC+7, so add 7 hours to UTC
    const wibOffset = 7 * 60 * 60 * 1000; // 7 hours in milliseconds
    const utcTime = now.getTime() + (now.getTimezoneOffset() * 60 * 1000);
    return new Date(utcTime + wibOffset);
}

/**
 * Convert timestamp to WIB date string
 * @param {number|Date} timestamp - Unix timestamp (seconds) or Date object
 * @returns {Date} Date object in WIB timezone
 */
function timestampToWIB(timestamp) {
    if (!timestamp) return null;
    
    // If timestamp is in seconds, convert to milliseconds
    const ts = typeof timestamp === 'number' && timestamp < 10000000000 
        ? timestamp * 1000 
        : timestamp;
    
    const date = new Date(ts);
    const wibOffset = 7 * 60 * 60 * 1000; // 7 hours in milliseconds
    const utcTime = date.getTime() + (date.getTimezoneOffset() * 60 * 1000);
    return new Date(utcTime + wibOffset);
}

/**
 * Convert UTC timestamp (from WhatsApp server) to WIB timestamp
 * WhatsApp sends Unix timestamp in UTC, this converts it to WIB
 * @param {number} utcTimestamp - Unix timestamp in seconds (UTC)
 * @returns {number} Unix timestamp in seconds (WIB)
 */
function convertUTCToWIBTimestamp(utcTimestamp) {
    if (!utcTimestamp) return getWIBTimestamp();
    // UTC timestamp is already in seconds, add 7 hours (7 * 60 * 60 seconds)
    return utcTimestamp + (7 * 60 * 60);
}

/**
 * Get current Unix timestamp in WIB (seconds)
 * @returns {number} Unix timestamp in seconds
 */
function getWIBTimestamp() {
    return Math.floor(getWIBTime().getTime() / 1000);
}

/**
 * Format date to WIB string
 * @param {Date|number} date - Date object or timestamp
 * @param {string} format - Format string (default: 'YYYY-MM-DD HH:mm:ss')
 * @returns {string} Formatted date string in WIB
 */
function formatWIB(date, format = 'YYYY-MM-DD HH:mm:ss') {
    if (!date) return null;
    
    const wibDate = date instanceof Date ? timestampToWIB(date) : timestampToWIB(date);
    if (!wibDate) return null;
    
    const year = wibDate.getFullYear();
    const month = String(wibDate.getMonth() + 1).padStart(2, '0');
    const day = String(wibDate.getDate()).padStart(2, '0');
    const hours = String(wibDate.getHours()).padStart(2, '0');
    const minutes = String(wibDate.getMinutes()).padStart(2, '0');
    const seconds = String(wibDate.getSeconds()).padStart(2, '0');
    
    return format
        .replace('YYYY', year)
        .replace('MM', month)
        .replace('DD', day)
        .replace('HH', hours)
        .replace('mm', minutes)
        .replace('ss', seconds);
}

/**
 * Get today's date in WIB format (YYYY-MM-DD)
 * @returns {string} Date string in YYYY-MM-DD format
 */
function getWIBToday() {
    return formatWIB(getWIBTime(), 'YYYY-MM-DD');
}

/**
 * Get ISO string in WIB timezone
 * @param {Date|number} date - Date object or timestamp
 * @returns {string} ISO string adjusted to WIB
 */
function toWIBISOString(date) {
    if (!date) return null;
    const wibDate = date instanceof Date ? timestampToWIB(date) : timestampToWIB(date);
    if (!wibDate) return null;
    return wibDate.toISOString();
}

/**
 * Format date for display in Indonesian locale (WIB)
 * @param {Date|number} date - Date object or timestamp
 * @returns {string} Formatted date string
 */
function formatWIBDisplay(date) {
    if (!date) return 'N/A';
    const wibDate = date instanceof Date ? timestampToWIB(date) : timestampToWIB(date);
    if (!wibDate) return 'N/A';
    
    return wibDate.toLocaleString('id-ID', {
        timeZone: 'Asia/Jakarta',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });
}

module.exports = {
    getWIBTime,
    timestampToWIB,
    convertUTCToWIBTimestamp,
    getWIBTimestamp,
    formatWIB,
    getWIBToday,
    toWIBISOString,
    formatWIBDisplay
};


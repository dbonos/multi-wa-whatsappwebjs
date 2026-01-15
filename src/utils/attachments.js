const path = require('path');

function getAttachmentsDir() {
    return process.env.ATTACHMENTS_DIR || './attachments';
}

function getAttachmentsBaseUrl() {
    return (
        process.env.ATTACHMENTS_BASE_URL ||
        process.env.PUBLIC_BASE_URL ||
        process.env.WEBHOOK_BASE_URL ||
        `http://localhost:${process.env.PORT || 3000}`
    );
}

function buildAttachmentUrl(attachmentPath, baseUrlOverride = null) {
    if (!attachmentPath) return null;
    const baseUrlSource = baseUrlOverride || getAttachmentsBaseUrl();
    const baseUrl = baseUrlSource.replace(/\/+$/, '');
    const attachmentsDir = getAttachmentsDir();
    const relativePath = path.relative(attachmentsDir, attachmentPath);
    if (!relativePath || relativePath.startsWith('..')) {
        // Fallback: assume attachmentPath is already relative to attachments dir
        return `${baseUrl}/attachments/${attachmentPath.replace(/^\.?\/*/, '').replace(/\\/g, '/')}`;
    }
    return `${baseUrl}/attachments/${relativePath.replace(/\\/g, '/')}`;
}

module.exports = {
    getAttachmentsDir,
    getAttachmentsBaseUrl,
    buildAttachmentUrl,
};


const jwt = require('jsonwebtoken');
const pool = require('../config/database');

// JWT Secret from environment
const JWT_SECRET = process.env.JWT_SECRET || 'change_this_secret_key_in_production';

// Authentication middleware
const authenticate = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'No token provided' });
        }

        const token = authHeader.substring(7);
        const decoded = jwt.verify(token, JWT_SECRET);

        // Get user from database (include session_id for users)
        const [users] = await pool.execute(
            'SELECT id, username, role, session_id, phone_number FROM users WHERE id = ?',
            [decoded.userId]
        );

        if (users.length === 0) {
            return res.status(401).json({ error: 'User not found' });
        }

        req.user = users[0];
        next();
    } catch (error) {
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({ error: 'Invalid token' });
        }
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Token expired' });
        }
        return res.status(500).json({ error: 'Authentication error' });
    }
};

// Admin only middleware
const requireAdmin = (req, res, next) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
    }
    next();
};

// User only middleware (not admin)
const requireUser = (req, res, next) => {
    if (req.user.role === 'admin') {
        return res.status(403).json({ error: 'User access only' });
    }
    next();
};

// Check if user owns the session
const requireSessionOwner = async (req, res, next) => {
    try {
        const sessionId = req.params.sessionId || req.body.sessionId;
        
        if (!sessionId) {
            return res.status(400).json({ error: 'Session ID required' });
        }

        // Admin can access all sessions
        if (req.user.role === 'admin') {
            return next();
        }

        // Get full user info including session_id
        const [users] = await pool.execute(
            'SELECT session_id FROM users WHERE id = ?',
            [req.user.id]
        );

        if (users.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const userSessionId = users[0].session_id;

        // User can only access their own session
        if (userSessionId !== sessionId) {
            return res.status(403).json({ error: 'Access denied to this session' });
        }

        next();
    } catch (error) {
        console.error('requireSessionOwner error:', error);
        return res.status(500).json({ error: 'Authorization error' });
    }
};

// Generate JWT token
const generateToken = (userId) => {
    return jwt.sign(
        { userId },
        JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );
};

module.exports = {
    authenticate,
    requireAdmin,
    requireUser,
    requireSessionOwner,
    generateToken
};


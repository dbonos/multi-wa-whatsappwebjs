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

        // Get user from database
        const [users] = await pool.execute(
            'SELECT id, username, role FROM users WHERE id = ?',
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
    generateToken
};


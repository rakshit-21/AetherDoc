import jwt from 'jsonwebtoken';
import { db } from '../db.js';

const getJwtSecret = () => process.env.JWT_SECRET || 'super-agentic-secret-key-123';

export const securityAgent = {
  // JWT helpers
  generateToken: (user) => {
    return jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      getJwtSecret(),
      { expiresIn: '24h' }
    );
  },

  verifyToken: (token) => {
    try {
      return jwt.verify(token, getJwtSecret());
    } catch (err) {
      return null;
    }
  },

  // Middleware for simple JWT authentication
  authMiddleware: (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      db.logActivity(null, 'Auth Attempt', 'SecurityAgent', 'Failed', 'No token provided');
      return res.status(401).json({ error: 'Access denied. No token provided.' });
    }
    const token = authHeader.split(' ')[1];
    const decoded = securityAgent.verifyToken(token);
    if (!decoded) {
      db.logActivity(null, 'Auth Attempt', 'SecurityAgent', 'Failed', 'Invalid or expired token');
      return res.status(401).json({ error: 'Access denied. Invalid or expired token.' });
    }
    req.user = decoded;
    next();
  }
};

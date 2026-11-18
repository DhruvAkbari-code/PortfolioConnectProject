import jwt from 'jsonwebtoken';
import { query } from '../../db/pool.js';

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';

// Builds a minimal, safe user object for the client
export function publicUser(u) {
    return {
        id: u.id,
        email: u.email,
        fullName: u.full_name,
        avatarUrl: u.avatar_url,
        isActive: Boolean(u.is_active),
        emailVerified: Boolean(u.email_verified),
        googleId: u.google_id,
        createdAt: u.created_at,
        lastLoginAt: u.last_login_at,
        hasPassword: u.password_hash != null && u.password_hash !== '',
    };
}

export function signToken(user) {
    return jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
}

// Requires a valid Bearer token → req.user (full DB row)
export async function requireAuth(req, res, next) {
    try {
        const header = req.headers.authorization || '';
        const token = header.startsWith('Bearer ') ? header.slice(7) : null;
        if (!token) return res.status(401).json({ error: 'Not logged in.' });

        const payload = jwt.verify(token, JWT_SECRET);
        const rows = await query(
            'SELECT * FROM users WHERE id = ? AND is_active = 1',
            [payload.sub]
        );
        if (rows.length === 0) return res.status(401).json({ error: 'Account not found or inactive.' });
        req.user = rows[0];
        next();
    } catch {
        return res.status(401).json({ error: 'Session expired. Please log in again.' });
    }
}

// Wrap async route handlers so rejections hit the error middleware
export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

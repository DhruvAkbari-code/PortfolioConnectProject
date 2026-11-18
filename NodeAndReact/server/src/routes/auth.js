import { Router } from 'express';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { query, run } from '../../db/pool.js';
import {
    publicUser, signToken, requireAuth, asyncHandler,
} from '../middleware/auth.js';
import { sendMail } from '../utils/mailer.js';

const router = Router();

// ── POST /api/auth/register ──────────────────────────────────
router.post('/register', asyncHandler(async (req, res) => {
    const { fullName, email, password } = req.body ?? {};

    if (!fullName || String(fullName).trim().length < 2) {
        return res.status(400).json({ error: 'Please enter your full name (at least 2 characters).' });
    }
    const emailNorm = String(email ?? '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNorm)) {
        return res.status(400).json({ error: 'Please enter a valid email address.' });
    }
    if (!password || String(password).length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }

    const existing = await query('SELECT * FROM users WHERE lower(email) = ?', [emailNorm]);
    if (existing.length > 0) {
        const u = existing[0];
        if (!u.password_hash) {
            return res.status(409).json({ error: 'This email is already registered via Google. Please sign in with Google.' });
        }
        return res.status(409).json({ error: 'This email is already registered. Try signing in instead.' });
    }

    const passwordHash = await bcrypt.hash(String(password), 10);
    const rows = await query(
        `INSERT INTO users (email, password_hash, full_name)
         VALUES (?, ?, ?) RETURNING *`,
        [emailNorm, passwordHash, String(fullName).trim()]
    );
    const user = rows[0];

    res.status(201).json({ success: true, token: signToken(user), user: publicUser(user) });
}));

// ── POST /api/auth/login ─────────────────────────────────────
router.post('/login', asyncHandler(async (req, res) => {
    const { email, password } = req.body ?? {};
    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required.' });
    }

    const rows = await query(
        'SELECT * FROM users WHERE lower(email) = ? AND is_active = 1',
        [String(email).trim().toLowerCase()]
    );
    if (rows.length === 0) {
        return res.status(401).json({ error: 'No account found with that email.' });
    }
    const user = rows[0];

    if (!user.password_hash) {
        return res.status(401).json({ error: 'This account uses Google Sign-In. Please continue with Google.' });
    }

    const ok = await bcrypt.compare(String(password), user.password_hash);
    if (!ok) {
        return res.status(401).json({ error: 'Incorrect password. Please try again.' });
    }

    await run(
        `UPDATE users
            SET last_login_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'),
                updated_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')
          WHERE id = ?`,
        [user.id]
    );
    res.json({
        success: true,
        token: signToken(user),
        user: publicUser(user),
    });
}));

// ── GET /api/auth/me ─────────────────────────────────────────
router.get('/me', requireAuth, (req, res) => {
    res.json({ user: publicUser(req.user) });
});

// ── Google OAuth 2.0 ─────────────────────────────────────────
const googleConfigured = () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

// The callback must be an exact match for a URI registered in Google Cloud
// Console. Prefer SERVER_PUBLIC_URL so the value stays stable when the app is
// reached through the Vite proxy, a tunnel or a reverse proxy.
export function googleRedirectUri(req) {
    if (process.env.SERVER_PUBLIC_URL) {
        return `${process.env.SERVER_PUBLIC_URL.replace(/\/$/, '')}/api/auth/google/callback`;
    }
    return `${serverBaseUrl(req)}/api/auth/google/callback`;
}

const GOOGLE_STATE_COOKIE = 'kp_google_state';
const googleCookieOptions = (req) => ({
    httpOnly: true,
    sameSite: 'lax',
    secure: req.secure || req.headers['x-forwarded-proto'] === 'https',
    path: '/api/auth/google',
    maxAge: 10 * 60 * 1000,
});

function readCookie(req, name) {
    const header = req.headers.cookie || '';
    for (const part of header.split(';')) {
        const [key, ...value] = part.trim().split('=');
        if (key === name) return decodeURIComponent(value.join('='));
    }
    return null;
}

router.get('/google/status', (req, res) => {
    res.json({
        enabled: googleConfigured(),
        redirectUri: googleConfigured() ? googleRedirectUri(req) : null,
    });
});

// First step: browser redirected here → Google's consent screen
router.get('/google', (req, res) => {
    if (!googleConfigured()) {
        return res.status(501).json({ error: 'Google login is not configured on the server. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.' });
    }
    const state = crypto.randomBytes(16).toString('hex');
    res.cookie(GOOGLE_STATE_COOKIE, state, googleCookieOptions(req));

    const params = new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID,
        redirect_uri: googleRedirectUri(req),
        response_type: 'code',
        scope: 'openid email profile',
        access_type: 'online',
        prompt: 'select_account',
        state,
    });
    res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

router.get('/google/callback', asyncHandler(async (req, res) => {
    const { code, error: oauthError, state } = req.query;
    const base = process.env.CLIENT_URL || 'http://localhost:5173';
    const back = (path) => `${base.replace(/\/$/, '')}/${path}`;

    if (oauthError || !code) {
        return res.redirect(back('google-callback?error=cancelled'));
    }
    if (!googleConfigured()) {
        return res.redirect(back('google-callback?error=not_configured'));
    }

    // Reject forged callbacks (CSRF): the state must match the cookie we set.
    const expectedState = readCookie(req, GOOGLE_STATE_COOKIE);
    const { maxAge, ...clearOptions } = googleCookieOptions(req);
    res.clearCookie(GOOGLE_STATE_COOKIE, clearOptions);
    if (!state || !expectedState || state !== expectedState) {
        return res.redirect(back('google-callback?error=state'));
    }

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            code,
            client_id: process.env.GOOGLE_CLIENT_ID,
            client_secret: process.env.GOOGLE_CLIENT_SECRET,
            redirect_uri: googleRedirectUri(req),
            grant_type: 'authorization_code',
        }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
        console.error('[google] token exchange failed:', tokenData);
        return res.redirect(back('google-callback?error=token_exchange'));
    }

    const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const profile = await profileRes.json();
    if (!profile?.id || !profile?.email) {
        return res.redirect(back('google-callback?error=profile'));
    }

    // find or create the user (Google accounts have no password_hash)
    let user = (await query('SELECT * FROM users WHERE lower(email) = ?', [String(profile.email).toLowerCase()]))[0];
    if (user) {
        await run(
            `UPDATE users
             SET google_id = COALESCE(?, google_id),
                 avatar_url = COALESCE(?, avatar_url),
                 last_login_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'),
                 updated_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'),
                 email_verified = 1
             WHERE id = ?`,
            [profile.id, profile.picture ?? null, user.id]
        );
        user = {
            ...user,
            google_id: user.google_id ?? profile.id,
            avatar_url: user.avatar_url ?? profile.picture ?? null,
        };
    } else {
        const created = await query(
            `INSERT INTO users (email, full_name, google_id, avatar_url, email_verified, is_active)
             VALUES (?, ?, ?, ?, 1, 1) RETURNING *`,
            [String(profile.email).toLowerCase(), profile.name ?? String(profile.email).toLowerCase(), profile.id, profile.picture ?? null]
        );
        user = created[0];
    }

    const token = signToken(user);
    res.redirect(back(`google-callback?token=${encodeURIComponent(token)}`));
}));

export function serverBaseUrl(req) {
    if (process.env.SERVER_PUBLIC_URL) return process.env.SERVER_PUBLIC_URL.replace(/\/$/, '');
    const proto = req.headers['x-forwarded-proto']?.split(',')[0] ?? req.protocol;
    const host = req.headers['x-forwarded-host']?.split(',')[0] ?? req.headers.host;
    return `${proto}://${host}`;
}

// ── Change password ──────────────────────────────────────────
router.post('/change-password', requireAuth, asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body ?? {};
    if (!newPassword || String(newPassword).length < 6) {
        return res.status(400).json({ error: 'New password must be at least 6 characters.' });
    }
    if (req.user.password_hash) {
        if (!currentPassword) return res.status(400).json({ error: 'Current password is required.' });
        const ok = await bcrypt.compare(String(currentPassword), req.user.password_hash);
        if (!ok) return res.status(401).json({ error: 'Current password is incorrect.' });
    }
    const hash = await bcrypt.hash(String(newPassword), 10);
    await run(
        `UPDATE users
            SET password_hash = ?,
                updated_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')
          WHERE id = ?`,
        [hash, req.user.id]
    );
    res.json({ success: true, message: 'Password updated successfully.' });
}));

// ── Forgot / reset password ──────────────────────────────────
// Tokens are stored in memory for simplicity of this project; production
// deployments should move them to the database or Redis.
const resetTokens = new Map(); // token → { userId, expiresAt }

router.post('/forgot-password', asyncHandler(async (req, res) => {
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    if (!email) return res.status(400).json({ error: 'Email is required.' });

    const user = (await query('SELECT * FROM users WHERE lower(email) = ?', [email]))[0];
    // Always respond 200 so we don't leak which emails exist
    if (user) {
        const token = crypto.randomBytes(24).toString('hex');
        resetTokens.set(token, { userId: user.id, expiresAt: Date.now() + 1000 * 60 * 30 });
        const resetUrl = `${process.env.CLIENT_URL || 'http://localhost:5173'}/reset-password?token=${token}`;

        const result = await sendMail({
            to: email,
            subject: 'Reset your password — KitePro',
            html: `<p>Hi ${user.full_name},</p>
                   <p>Click the link below to reset your password (valid for 30 minutes):</p>
                   <p><a href="${resetUrl}">${resetUrl}</a></p>
                   <p>If you didn't request this, you can ignore this email.</p>`,
        });
        if (result.skipped) {
            return res.json({
                success: true,
                message: 'Email service is not configured. Use the development reset link below.',
                devResetUrl: resetUrl,
            });
        }
    }
    return res.json({ success: true, message: 'If an account exists for that email, a reset link has been sent.' });
}));

router.post('/reset-password', asyncHandler(async (req, res) => {
    const { token, password } = req.body ?? {};
    if (!token || !password) return res.status(400).json({ error: 'Token and new password are required.' });
    if (String(password).length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });

    const entry = resetTokens.get(token);
    if (!entry || entry.expiresAt < Date.now()) {
        resetTokens.delete(token);
        return res.status(400).json({ error: 'This reset link is invalid or expired. Request a new one.' });
    }

    const hash = await bcrypt.hash(String(password), 10);
    await run(
        `UPDATE users
            SET password_hash = ?,
                updated_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')
          WHERE id = ?`,
        [hash, entry.userId]
    );
    resetTokens.delete(token);
    res.json({ success: true, message: 'Password updated. You can now sign in.' });
}));

export default router;

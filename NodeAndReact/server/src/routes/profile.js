import { Router } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import fileUpload from 'express-fileupload';
import { query, run, get } from '../../db/pool.js';
import { publicUser, requireAuth, asyncHandler } from '../middleware/auth.js';

const router = Router();
const isVercel = Boolean(process.env.VERCEL);

// Local uploads live in <server>/uploads and are served at /uploads/…
// Vercel has a read-only filesystem, so avatars are stored in PostgreSQL and
// served by GET /api/profile/avatar/:id.
export const UPLOAD_DIR = isVercel
    ? path.join('/tmp', 'kite-pro-uploads')
    : path.resolve(process.cwd(), 'uploads');
if (!isVercel) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// ── Public avatar endpoint (used by <img> tags, so no auth header) ──
router.get('/avatar/:id', asyncHandler(async (req, res) => {
    if (!/^\d+$/.test(req.params.id)) {
        return res.status(404).json({ error: 'Avatar not found.' });
    }

    const row = await get('SELECT avatar_data, avatar_mime FROM users WHERE id = ?', [Number(req.params.id)]);
    if (!row?.avatar_data) {
        return res.status(404).json({ error: 'Avatar not found.' });
    }

    res.setHeader('Content-Type', row.avatar_mime || 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(Buffer.isBuffer(row.avatar_data) ? row.avatar_data : Buffer.from(row.avatar_data));
}));

// ── GET /api/profile — user + profile statistics ──
router.get('/', requireAuth, asyncHandler(async (req, res) => {
    const watchlist = await get('SELECT COUNT(*)::int AS c FROM watchlist WHERE user_id = ?', [req.user.id]);
    const targets = await get('SELECT COUNT(*)::int AS c FROM stock_targets WHERE user_id = ?', [req.user.id]);
    const activeTargets = await get(
        'SELECT COUNT(*)::int AS c FROM stock_targets WHERE user_id = ? AND is_active = 1 AND is_triggered = 0',
        [req.user.id]
    );

    res.json({
        user: publicUser(req.user),
        stats: {
            watchlistCount: watchlist?.c ?? 0,
            targetCount: targets?.c ?? 0,
            activeTargets: activeTargets?.c ?? 0,
        },
    });
}));

// ── PUT /api/profile — update the display name ──
router.put('/', requireAuth, asyncHandler(async (req, res) => {
    const name = String(req.body?.fullName ?? '').trim();
    if (name.length < 2) {
        return res.status(400).json({ error: 'Please enter your full name (at least 2 characters).' });
    }
    const rows = await query(
        `UPDATE users
            SET full_name = ?,
                updated_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')
          WHERE id = ? RETURNING *`,
        [name, req.user.id]
    );
    res.json({ success: true, message: 'Profile updated.', user: publicUser(rows[0]) });
}));

// ── Avatar upload (PNG/JPEG/WebP/GIF, ≤ 2 MB) ──
router.post(
    '/avatar',
    requireAuth,
    fileUpload({
        createParentPath: true,
        limits: { fileSize: 2 * 1024 * 1024 },
        abortOnLimit: true,
    }),
    asyncHandler(async (req, res) => {
        const file = req.files?.avatar;
        if (!file) return res.status(400).json({ error: 'No image uploaded.' });

        if (file.size > 2 * 1024 * 1024) {
            return res.status(413).json({ error: 'File size exceeds limit (2 MB).' });
        }

        const allowed = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
        if (!allowed.includes(file.mimetype)) {
            return res.status(415).json({ error: 'Invalid file type. Please upload a PNG or JPEG image.' });
        }

        const extRaw = (file.name?.split('.').pop() || '').toLowerCase();
        const ext = ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(extRaw) ? extRaw : 'png';

        let avatarUrl;

        if (isVercel) {
            // Serverless: persist the bytes in PostgreSQL and serve them via
            // /api/profile/avatar/:id (version query busts browser caches).
            avatarUrl = `/api/profile/avatar/${req.user.id}?v=${Date.now()}`;
            await run(
                `UPDATE users
                    SET avatar_url = ?,
                        avatar_data = ?,
                        avatar_mime = ?,
                        updated_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')
                  WHERE id = ?`,
                [avatarUrl, file.data, file.mimetype, req.user.id]
            );
        } else {
            const filename = `avatar_${req.user.id}_${Date.now()}.${ext}`;
            await file.mv(path.join(UPLOAD_DIR, filename));

            // remove the previous server-hosted avatar, if any
            const oldUrl = req.user.avatar_url;
            if (oldUrl && oldUrl.startsWith('/uploads/')) {
                fs.promises.unlink(path.join(UPLOAD_DIR, path.basename(oldUrl))).catch(() => {});
            }

            avatarUrl = `/uploads/${filename}`;
            await run(
                `UPDATE users
                    SET avatar_url = ?,
                        updated_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')
                  WHERE id = ?`,
                [avatarUrl, req.user.id]
            );
        }

        res.json({ success: true, avatarUrl });
    })
);

export default router;

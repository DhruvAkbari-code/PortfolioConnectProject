import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import authRoutes from './routes/auth.js';
import profileRoutes, { UPLOAD_DIR } from './routes/profile.js';
import watchlistRoutes from './routes/watchlist.js';
import targetRoutes from './routes/targets.js';
import marketRoutes from './routes/market.js';
import kiteRoutes from './routes/kite.js';
import chatRoutes from './routes/chat.js';
import dashboardRoutes from './routes/dashboard.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isVercel = Boolean(process.env.VERCEL);

// On Vercel the React build is emitted to <root>/public and served by the CDN;
// locally we keep using client/dist so `npm run start` still serves the UI.
const CLIENT_DIST = isVercel
    ? path.resolve(__dirname, '../../public')
    : path.resolve(__dirname, '../../client/dist');
const hasClientBuild = fs.existsSync(path.join(CLIENT_DIST, 'index.html'));

// CLIENT_URL may contain a comma-separated list (e.g. dev + preview origins).
const allowedOrigins = (process.env.CLIENT_URL || 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter(Boolean);

const app = express();
app.set('trust proxy', true);

app.use(cors({
    origin(origin, callback) {
        // Requests without an Origin header (curl, server-to-server) are allowed.
        if (!origin) return callback(null, true);
        // Same-app production traffic on Vercel; auth uses Bearer tokens, not cookies.
        if (isVercel) return callback(null, true);
        return callback(null, allowedOrigins.includes(origin.replace(/\/$/, '')));
    },
    credentials: true,
}));
app.use(express.json());

// Uploaded profile images (local development). On Vercel avatars are stored in
// PostgreSQL and served by /api/profile/avatar/:id instead.
if (!isVercel) {
    app.use('/uploads', express.static(path.resolve(UPLOAD_DIR)));
}

// ── API routes ───────────────────────────────────────────────
app.get('/api/health', (req, res) => res.json({
    ok: true,
    service: 'stock-market-analysis',
    platform: isVercel ? 'vercel' : 'node',
    time: new Date().toISOString(),
}));
app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/watchlist', watchlistRoutes);
app.use('/api/targets', targetRoutes);
app.use('/api/market', marketRoutes);
app.use('/api/kite', kiteRoutes);
app.use('/api/chat', chatRoutes);

// ── Serve the production React build (npm run build) ─────────
// Vercel serves public/** from its CDN, so express.static is a no-op there.
if (hasClientBuild && !isVercel) {
    app.use(express.static(CLIENT_DIST, { index: false }));
}

// 404 + error handling
app.use('/api', (req, res) => res.status(404).json({ error: 'API route not found.' }));

// SPA fallback: let React Router handle deep links such as /login or /dashboard.
if (hasClientBuild) {
    app.get('*', (req, res, next) => {
        if (req.path.startsWith('/uploads/') || req.path.startsWith('/api/')) return next();
        if (req.path.startsWith('/assets/')) return res.status(404).end();
        return res.sendFile(path.join(CLIENT_DIST, 'index.html'));
    });
}

app.use((err, req, res, next) => {
    console.error('[server] unhandled error:', err.status ?? '', err.message);
    if (err.type === 'entity.too.large' || err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'File size exceeds the limit.' });
    }
    const status = err.status ?? err.statusCode ?? 500;
    res.status(status).json({ error: err.expose ? err.message : 'Something went wrong on the server.' });
});

export { CLIENT_DIST, hasClientBuild, isVercel };
export default app;

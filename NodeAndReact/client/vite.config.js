import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Both the dev and preview servers proxy API calls to the Express backend so
// the frontend always talks to the same origin (no CORS headaches).
const proxy = {
    '/api': 'http://localhost:4000',
    '/uploads': 'http://localhost:4000',
};

export default defineConfig({
    plugins: [react()],
    // Vercel serves CDN assets from <root>/public; local builds keep using dist.
    build: {
        outDir: process.env.VERCEL ? '../public' : 'dist',
        emptyOutDir: true,
    },
    server: {
        port: 5173,
        // Fail loudly instead of silently moving to 5174 — CLIENT_URL and the
        // Google OAuth callback both assume port 5173.
        strictPort: true,
        proxy,
    },
    preview: {
        port: 4173,
        proxy,
    },
});

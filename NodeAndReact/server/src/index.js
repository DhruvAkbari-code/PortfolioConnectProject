import 'dotenv/config';
import app, { CLIENT_DIST, hasClientBuild } from './app.js';

const PORT = Number(process.env.PORT) || 4000;

app.listen(PORT, () => {
    console.log(`✔ KitePro API listening on http://localhost:${PORT}`);
    if (hasClientBuild) {
        console.log(`✔ Serving React build from ${CLIENT_DIST}`);
    } else {
        console.log('  (client/dist not found — run "npm run build" to serve the UI from this port)');
    }
    if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
        const base = (process.env.SERVER_PUBLIC_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
        console.log(`  Google OAuth redirect URI: ${base}/api/auth/google/callback`);
        console.log('  Register that exact URI under "Authorized redirect URIs" in Google Cloud Console.');
    }
});

// Start the 60-second price-target alert checker (email notifications).
// Vercel Functions are request-scoped, so a process-local cron is not used
// there; the rest of the app works normally without it.
if (!process.env.VERCEL) {
    const { startAlertChecker } = await import('./services/alertChecker.js');
    startAlertChecker();
}

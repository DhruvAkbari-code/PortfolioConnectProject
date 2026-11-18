/**
 * Vercel entry point.
 *
 * Vercel's zero-config Express preset detects this file, bundles the app as a
 * single Vercel Function, and forwards every non-static request to it with the
 * original URL intact. Local development still runs server/src/index.js.
 *
 * The real app lives in server/src/app.js. It is mounted on a thin Express
 * wrapper here because Vercel requires the entry file itself to import express.
 */
import express from 'express';
import app from './server/src/app.js';

const vercelApp = express();
vercelApp.use(app);

export default vercelApp;

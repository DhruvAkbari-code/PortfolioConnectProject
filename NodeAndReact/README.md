# KitePro — Stock Market Analysis

A full-stack stock market dashboard converted from the original ASP.NET Core MVC
project to **React + Node.js**. The UI keeps the original dark KitePro theme,
sidebar, dashboard, watchlist, targets, AI assistant and Zerodha Kite pages.
Every feature is free.

## Stack

- **Client:** React 18, React Router 6, Vite
- **Server:** Node.js, Express, PostgreSQL (Neon) via `pg`
- **Auth:** JWT + optional Google OAuth 2.0
- **Market data:** Yahoo Finance (quotes, history, fundamentals), NSE (trending with Yahoo fallback)
- **Optional integrations:** OpenAI chat assistant with Tavily news, SMTP target-alert emails

## Quick start

Requirements: **Node.js 18+** (developed on Node 24) and npm.

```bash
# 1. Install dependencies
npm run install:all

# 2. Create the server environment file
cp server/.env.example server/.env
# then edit server/.env and set at least DATABASE_URL (Neon) and JWT_SECRET

# 3. Create/upgrade the PostgreSQL schema
npm run migrate

# 4. Run the API and the client together
npm run dev
```

- Client: <http://localhost:5173>
- API: <http://localhost:4000>
- Health check: <http://localhost:4000/api/health>

The root `npm run dev` starts both processes and stops them together with
Ctrl+C. You can also run `npm run dev` inside `server/` and `client/`
separately.

### Windows note

Use Git Bash/WSL for the `cp` command, or copy `server/.env.example` to
`server/.env` manually.

## Google sign-in setup

Email/password signup works out of the box. Google sign-in additionally needs
an **OAuth 2.0 Client ID of type “Web application”** whose redirect URI matches
this backend exactly:

```
http://localhost:4000/api/auth/google/callback
```

The server prints this URL on startup when `GOOGLE_CLIENT_ID` and
`GOOGLE_CLIENT_SECRET` are set. To configure it:

1. Open <https://console.cloud.google.com/apis/credentials>.
2. Create (or edit) an OAuth client of type **Web application**.
3. Under **Authorized JavaScript origins** add `http://localhost:5173`.
4. Under **Authorized redirect URIs** add
   `http://localhost:4000/api/auth/google/callback`.
5. If the OAuth consent screen is in **Testing** mode, add your Google
   account under **Test users**.
6. Copy the client ID and secret into `server/.env` and restart the server.

If the Google client is not configured for that URI, Google shows
`Error 400: redirect_uri_mismatch` before the app is ever reached — that is a
Google Cloud Console setting, not an application bug. When you deploy, set
`SERVER_PUBLIC_URL` and `CLIENT_URL` to the public URLs and register the
matching callback there too.

## Zerodha Kite setup

Kite Connect uses a redirect URL registered in the Kite developer console,
not one passed in at login time:

1. Open <https://developers.kite.trade/apps> and create (or edit) a Kite
   Connect app.
2. Set **Redirect URL** to the app origin plus `/kite/callback`, for example:
   - production: `https://stock-market-analysis-beige.vercel.app/kite/callback`
   - local dev: `http://localhost:5173/kite/callback`
3. Copy the API key and API secret into the app under **Kite → Accounts**.
4. Click **Connect**. The browser goes to Zerodha, and Kite redirects back to
   `/kite/callback?request_token=…`.

The React callback page posts that one-time token to
`POST /api/kite/accounts/:id/session`, which verifies the signed-in user owns
the account before exchanging it. The account id is carried through the login
with Kite's `redirect_params`, with a `sessionStorage` fallback. Only the
resulting access token is stored; holdings are fetched live and never saved.

Kite allows one redirect URL per app, so use a separate Kite app (or update the
URL) when switching between local development and production. Kite may reject
plain-HTTP redirect URLs; use HTTPS or a tunnel for local testing if needed.

## Environment

`server/.env` supports:

| Variable | Purpose |
| --- | --- |
| `PORT` | API port (default `4000`) |
| `CLIENT_URL` | Frontend origin for OAuth/payment redirects (default `http://localhost:5173`; comma-separated origins are allowed) |
| `SERVER_PUBLIC_URL` | Public URL of the API, used to build the Google OAuth callback (default `http://localhost:<PORT>`) |
| `JWT_SECRET` | Signing key for auth tokens |
| `DATABASE_URL` | **Required.** Neon PostgreSQL connection string (TLS is used automatically) |
| `PG_POOL_MAX` | Optional PostgreSQL pool size (default `5`) |
| `SQLITE_PATH` | Optional legacy SQLite file, used only by `npm run import:sqlite` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Enables Google sign-in |
| `SMTP_*` | Sends target-alert emails (skipped when unset) |
| `OPENAI_API_KEY` / `OPENAI_MODEL` | Enables the AI chat assistant |
| `TAVILY_API_KEY` | Enables live news search for the AI assistant |

Every optional integration fails gracefully when its keys are absent.

## Features

- **Dashboard** — Zerodha account cards, holdings, investment/value/P&L totals
- **Trending** — NSE top movers, 30-second auto-refresh, add to watchlist
- **Watchlist** — live Yahoo quotes, add/remove stocks, auto-refresh
- **Targets** — above/below price targets, progress bars, pause/resume, email alerts
- **Stock details** — live price, interactive 1D–1Y price chart, day range, 52-week range, volume, company overview
- **Profile** — display name, avatar upload, password change, account stats
- **Kite** — add/edit/disconnect Zerodha accounts and connect via Kite Connect OAuth
- **AI Chat** — quick prompts, chat history, and live news answers via Tavily when OpenAI is configured

All features are free for every signed-in user. The AI assistant is included;
it needs `OPENAI_API_KEY` in `server/.env`. Set `TAVILY_API_KEY` as well to
ground news questions in recent articles with source links.

## Database

PostgreSQL on **Neon** is the source of truth. Set `DATABASE_URL` in
`server/.env` — the server connects over TLS and applies `server/db/schema.sql`
automatically on startup. `npm run migrate` is idempotent and can be run
manually at any time.

The repository still contains `server/database.sqlite` from before the
PostgreSQL migration. To copy that legacy data into Neon once:

```bash
npm run import:sqlite
```

The import preserves ids, skips rows that already exist, and refuses to run when
the target database already has users (use `-- --force` to merge anyway).

To start with a fresh database, create a new Neon project/database and point
`DATABASE_URL` at it, then run `npm run migrate`.

## Production build

```bash
npm run build          # outputs client/dist
npm start              # serves the API and the built React app on :4000
```

Open <http://localhost:4000> after `npm start`. The Express server serves
`client/dist` when it exists and falls back to `index.html` for client-side
routes, so login/signup work from the same origin without a separate static
host. The Vite dev server proxies `/api` and `/uploads` to
`http://localhost:4000`.

## Deploying to Vercel

The app is deployed at **<https://stock-market-analysis-beige.vercel.app>**.

It uses Vercel's zero-config **Express** preset:

- `index.js` is the Vercel entry point. It mounts `server/src/app.js` as a
  single Vercel Function, which handles every `/api/*` request and the SPA
  fallback.
- When `VERCEL=1`, Vite builds the client into the repository-root `public/`
  directory (`client/vite.config.js`). Vercel serves `public/**` from its CDN.
- `vercel.json` sets the framework preset, the install/build commands,
  `maxDuration: 60` (needed for streaming chat responses), and an SPA rewrite
  that sends client-side routes to `index.html` while leaving `/api/*` and
  `/assets/*` alone.
- `.vercelignore` keeps `server/.env`, SQLite files, `node_modules` and local
  uploads out of the deployment. The legacy `server/database.sqlite` is never
  uploaded.

### Deploying your own copy

```bash
npx vercel link                 # create/link the project
npx vercel env add DATABASE_URL # repeat for the variables below
VERCEL=1 npm --prefix client run build   # emit public/ for Vercel's CDN
npx vercel deploy --prod
```

The client must be built **before** `vercel deploy`: the Express preset serves
the `public/` directory that is part of the uploaded source, not a directory
created later by the build command. Re-run the `VERCEL=1` build whenever client
code changes. `public/` is gitignored, so Git-based deployments need a build
step that commits or uploads it first.

Set these environment variables for **Production** (and Preview if desired):

| Variable | Notes |
| --- | --- |
| `DATABASE_URL` | Neon PostgreSQL connection string |
| `JWT_SECRET` | Long random string used to sign auth tokens |
| `OPENAI_API_KEY` | Enables the streaming AI assistant |
| `OPENAI_BASE_URL` | Optional OpenAI-compatible endpoint |
| `OPENAI_MODEL` | Model id, e.g. `gpt-4o-mini` |
| `TAVILY_API_KEY` | Enables live news search and source links |
| `PG_POOL_MAX` | Set to `3` on serverless to stay within Neon connection limits |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Optional; enables Google sign-in |
| `SMTP_*` | Optional; target-alert emails are skipped when unset |

`CLIENT_URL`, `SERVER_PUBLIC_URL` and `PORT` do not need to be set on Vercel:
same-origin requests are allowed when `VERCEL` is present, and the platform
provides the port.

### Serverless notes

- **Avatars** are stored in PostgreSQL (`users.avatar_data` / `avatar_mime`)
  and served from `GET /api/profile/avatar/:id`. Local development keeps
  writing to `server/uploads` instead.
- **Target-alert cron** does not run on Vercel because functions are
  request-scoped. The rest of the app works normally. Use
  [Vercel Cron](https://vercel.com/docs/cron-jobs) hitting a dedicated
  endpoint, or an external scheduler, if you need email alerts in production.
- **Chat history** is kept in memory per function instance, so it may reset
  between cold starts.
- **Google sign-in** needs an OAuth client whose authorized redirect URI is
  `https://<your-domain>/api/auth/google/callback`. It stays disabled while
  `GOOGLE_CLIENT_SECRET` is empty.
- **Vercel Authentication** (Project → Settings → Deployment Protection) must
  be off, otherwise the public URL returns `403 Forbidden`.

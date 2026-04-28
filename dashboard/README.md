# Dashboard

React + Vite app that reads digest JSON files from the GitHub repo and presents them as a reading interface.

## Local development

```bash
npm install
cp .env.example .env.local
# Edit .env.local — set VITE_REPO_OWNER and VITE_REPO_NAME
npm run dev
```

Open http://localhost:5173.

## Build

```bash
npm run build
```

Outputs to `dist/`.

## Deploy to Vercel

1. **Add New Project → Import** the GitHub repo
2. **Root Directory**: `dashboard`
3. **Framework Preset**: Vite
4. Add the `VITE_*` environment variables from `.env.example`
5. Deploy

`vercel.json` handles SPA routing so deep links like `/digest/digest_2026-04-28.json` work.

## How it reads data

At runtime, the app fetches `index.json` and individual digest files from `https://raw.githubusercontent.com/{OWNER}/{NAME}/{BRANCH}/{DIGESTS_PATH}`. No build-time bundling of digests — the dashboard never needs to redeploy when the cron commits new digests.

If the repo is private, raw URLs require auth. See the project DEPLOYMENT.md for the server-side fallback.

## Read/star tracking

Stored in `localStorage`. Per-browser, no cross-device sync. If you want sync across devices, that's the cleanest reason to add a backend (e.g. on Railway).

## Customising the design

Aesthetic tokens live in `tailwind.config.js` (colors, fonts, spacing). Components are small and unstyled-by-default; styling is via Tailwind utilities. The base palette is editorial (warm cream paper, deep ink, muted burgundy accent for priority indicators); change `colors.paper`, `colors.ink`, `colors.accent` in the Tailwind config to retheme everywhere.

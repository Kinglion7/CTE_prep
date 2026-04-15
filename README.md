# CTE_prep

DCIPS CAS Report Generator: Vite + React frontend (GitHub Pages) and a Cloudflare Worker proxy for LLM extraction (Gemini primary, Grok fallback).

## Repository layout

- [frontend/](frontend/) — React app; serves static assets including `public/DCIPS_Template.xlsx`.
- [worker/](worker/) — Cloudflare Worker: `POST /api/extract` → JSON (28 fields) via **Gemini first**, then **Grok (xAI)** if Gemini fails; strict CORS.

## Local development

### Worker

1. Copy [worker/.dev.vars.example](worker/.dev.vars.example) to `worker/.dev.vars` and set at least one of **`GEMINI_API_KEY`** (Google AI Studio) and/or **`GROK_API_KEY`** (xAI). If both are set, Gemini is tried first; Grok runs when Gemini errors.
2. Optional: edit `ALLOWED_ORIGINS` in [worker/wrangler.jsonc](worker/wrangler.jsonc) (comma-separated). Defaults include Vite dev URLs. Optional: `GROK_MODEL` (default `grok-3`).
3. From `worker/`: `npm install` then `npm run dev` (Wrangler listens on `http://localhost:8787` by default).

### Frontend

1. From `frontend/`: `npm install`
2. [frontend/.env.development](frontend/.env.development) sets `VITE_API_URL=http://localhost:8787`. Override in `.env.local` if needed.
3. `npm run dev` — open the printed URL (typically `http://localhost:5173`).

## Cloudflare Worker (production)

1. `cd worker && npx wrangler login`
2. `npx wrangler secret put GEMINI_API_KEY` and/or `npx wrangler secret put GROK_API_KEY` — paste keys (never commit them).
3. Set **production** browser origins: add your GitHub Pages origin (e.g. `https://youruser.github.io`) to `ALLOWED_ORIGINS` in `wrangler.jsonc` (or override with `wrangler vars` / dashboard), then `npx wrangler deploy`.
4. Note the deployed Worker HTTPS URL (e.g. `https://dcips-extract.<subdomain>.workers.dev`).

## GitHub Pages

1. Repo **Settings → Pages**: Build and deployment **Source** = **GitHub Actions**.
2. Repo **Settings → Secrets and variables → Actions**: add `VITE_API_URL` = your Worker base URL (no trailing slash), e.g. `https://dcips-extract.xxx.workers.dev`.
3. Push to `main`. The workflow builds the frontend with `VITE_BASE=/<repo>/` for Project Pages.

If the site URL or Worker URL changes, update the secret and redeploy.

## Security notes

- LLM API keys exist only as Wrangler secrets (`GEMINI_API_KEY`, `GROK_API_KEY`) or local `.dev.vars`, not in the repo or client.
- The app scrubs common SSN/DOB-style patterns before calling the Worker; review extracted fields in the dialog before download.

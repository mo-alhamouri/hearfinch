# Hearfinch

Press listen and find out what's playing: a song, movie, TV show, podcast or commercial. If there's no exact match, you get a clearly labelled best guess.

Hearfinch shows information about the title itself (what it is, who's in it, where to watch or listen). It never shows the exact scene, episode or timestamp.

```
hearfinch/
├── web/        The website (Vite + React + TypeScript), hosted on GitHub Pages
├── worker/     The API (Cloudflare Worker + D1 dialogue index). Holds every API key.
└── .github/    Workflows: website → GitHub Pages, worker → Cloudflare, on every push to main
```

## Put it online

1. **Move the workflows into place:** `mkdir -p .github/workflows && mv github-workflows/*.yml .github/workflows/`. They're kept outside `.github` only because of how they were delivered.
2. **Create the GitHub repo** and push this folder to `main`.
3. **Turn on Pages:** Settings → Pages → Source: **GitHub Actions**. The website deploys in demo mode, with sample results, at `https://<username>.github.io/<repo>/`.
4. **Set up the API** once by following `worker/README.md`. That covers a free Cloudflare account, the D1 database and your API keys.
5. **Connect the two:**
   - In GitHub, under **Settings → Secrets and variables → Actions**:
     - add the secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`, so pushes deploy the API
     - add the variable `API_URL`, set to your Worker URL, so the website stops using demo mode
   - In `worker/wrangler.jsonc`, put your Pages address in `ALLOWED_ORIGINS`.
6. **Optional: bot check.** Create a Cloudflare Turnstile widget, then:
   - set the site key as the `TURNSTILE_SITE_KEY` variable in GitHub
   - set the secret key as the Worker secret `TURNSTILE_SECRET`

## Work on it locally

```bash
cd worker && npm install && npm run dev      # API on http://localhost:8787
cd web && npm install && npm run dev         # site on http://localhost:5173
```

Create `web/.env.local` from `web/.env.example` to point the site at your local API. Leave it out to use demo mode. The microphone works on `localhost` and on https pages.

## Checks

```bash
npm --prefix web run typecheck && npm --prefix web run build
npm --prefix worker run typecheck
```

## What's next

1. **Fill the dialogue index and license it:** see `worker/README.md`.
2. **Ad library:** upload commercial audio to an ACRCloud custom bucket with `brand`, `campaign` and `url` fields.
3. **Podcasts:** ingest Podcast Index transcripts into the same index (`worker/src/providers/podcasts.ts`).
4. **Test with real recordings** in different browsers and rooms, then adjust the 55% bar and the default clip length.
5. **Privacy policy:** publish one that matches the promises on the About page.

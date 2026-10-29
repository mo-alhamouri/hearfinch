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

The website is live at https://mo-alhamouri.github.io/hearfinch/ in demo mode. To make it identify real audio, follow **First-time setup** in `worker/README.md`:

1. **Add GitHub secrets:** your Cloudflare token and account ID, plus API keys (TMDB and OpenAI first).
2. **Deploy the API:** run **Actions → API**.
3. **Connect the website:** set the `API_URL` variable and run **Actions → Website**.
4. **Fill the movie and TV index:** run **Actions → Dialogue index**.

Everything happens in GitHub and Cloudflare's dashboards, with nothing to install.

## Releases

Each release has its notes in `releases/<version>.md`. To publish one:

1. Write `releases/vX.Y.Z.md` and commit it.
2. Tag the commit `vX.Y.Z` and push the tag. The **Release** workflow creates the GitHub release from that file. Without a notes file, it writes the notes from the commit messages.

You can also run **Actions → Release → Run workflow** and type the version.

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

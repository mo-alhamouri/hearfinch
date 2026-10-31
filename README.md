# Hearfinch

Press listen and find out what's playing: a song, movie, TV show, podcast or commercial. If there's no exact match, you get a clearly labelled best guess.

Hearfinch shows information about the title itself (what it is, who's in it, where to watch or listen). It never shows the exact scene, episode or timestamp.

```
hearfinch/
├── web/        The website (Vite + React + TypeScript), hosted on GitHub Pages
├── worker/     The API (Cloudflare Worker + D1 dialogue index). Holds every API key.
└── .github/    Workflows: website → GitHub Pages, worker → Cloudflare, on every push to main
```

## Status (October 29, 2026)

| | |
|---|---|
| Website | https://mo-alhamouri.github.io/hearfinch/ (connected to the live API) |
| API | https://hearfinch-api.moh-alhamouri.workers.dev ([health](https://hearfinch-api.moh-alhamouri.workers.dev/health)) |
| Speech-to-text | Cloudflare Workers AI (Whisper large v3 turbo), free |
| Dialogue index | Growing daily: about 20 English-language titles a day, movies and shows in turn, up to 10,000 of each |
| Song and ad fingerprinting | Off (no ACRCloud keys yet) |
| AI best guess | Off (no Anthropic key yet) |
| Podcasts | Not built yet |

Testing tip: turn on **Settings → Show what Hearfinch heard** to see the transcript, the candidate titles and each step's result under every answer.

## Progress log

- **Prototype and brand.** Clickable prototype, then the name Hearfinch (US/Canada trademark, domain and App Store checks came back clear).
- **From app to website.** Dropped the Expo app and Node server. Rebuilt as a Vite + React site on GitHub Pages and a Hono API on Cloudflare Workers, with a D1 dialogue index.
- **v0.1.0 released.** Workflows for the website, the API, the dialogue index and releases.
- **Deploys fixed.** Website build (TypeScript config), and a cleanup step for stray spaces in the Cloudflare secrets.
- **API live.** Deployed to workers.dev. `API_URL` set as a repository variable, so the site left demo mode.
- **Dialogue index started.** OpenSubtitles + TMDB, run from GitHub Actions. 18 movies on the first run, 38 after the second.
- **Testing mode.** "Show what Hearfinch heard" displays the transcript, candidates and pipeline steps.
- **Free speech-to-text.** OpenAI had no credit (429 errors), so transcription moved to Cloudflare Workers AI. OpenAI stays as a fallback only.
- **1,000 shows.** The Dialogue index workflow now runs daily. It adds one episode per English-language show from TMDB's popular and top-rated lists, stops at 1,000 shows, and remembers shows with no English subtitles. New run inputs: list "both", start page and a target count.
- **SEO and analytics.** Canonical, Open Graph and structured-data tags, a sitemap, Google Search Console verification and Cloudflare Web Analytics (repo variables `GOOGLE_SITE_VERIFICATION`, `CF_ANALYTICS_TOKEN`).
- **10,000 movies and shows.** The daily run now alternates movies and shows (one title each in turn) and aims for 10,000 of each, about as deep as TMDB's lists go.

## Put it online

These steps are done for this repo. To set up a fresh copy, follow **First-time setup** in `worker/README.md`:

1. **Add GitHub secrets:** your Cloudflare token and account ID, plus your TMDB key (speech-to-text runs free on Cloudflare).
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

1. **Test identification** with clips from the indexed movies, with testing mode on, and tune the 55% bar and default clip length.
2. **Let the index grow:** about 20 titles a day on the free OpenSubtitles plan, so years to reach 10,000 of each; a paid plan speeds this up a lot. Watch the D1 database size (500 MB on Cloudflare's free plan, 10 GB on paid). If the count stops growing, check that the Dialogue index workflow is still enabled: GitHub pauses scheduled runs after 60 days without commits.
3. **Songs and ads:** add the ACRCloud keys. For ads, upload commercial audio to an ACRCloud custom bucket with `brand`, `campaign` and `url` fields.
4. **AI best guess:** add the Anthropic key.
5. **Podcasts:** ingest Podcast Index transcripts into the same index (`worker/src/providers/podcasts.ts`).
6. **Subtitle licensing and a privacy policy** before any public launch.

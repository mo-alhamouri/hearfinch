# Hearfinch API (Cloudflare Worker)

The website records a short clip and sends it to this Worker at `POST /identify`. The Worker holds every API key, works out what the clip is and replies with the title's info. Clips are held in memory for the request only and never stored.

## First-time setup

You need Node 22.13+ and a free Cloudflare account.

```bash
cd worker
npm install
npx wrangler login

# 1. Create the dialogue database, then paste the database_id it prints into wrangler.jsonc
npx wrangler d1 create hearfinch-dialogue
npx wrangler d1 migrations apply hearfinch-dialogue --remote

# 2. In wrangler.jsonc, replace YOUR-GITHUB-USERNAME in ALLOWED_ORIGINS with yours

# 3. Add the API keys you have (each one is optional; missing steps are skipped)
npx wrangler secret put ACRCLOUD_ACCESS_KEY
npx wrangler secret put ACRCLOUD_ACCESS_SECRET
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put TMDB_API_KEY
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put ANTHROPIC_MODEL
npx wrangler secret put TURNSTILE_SECRET      # optional bot check

# 4. Deploy (after this, pushes to main deploy automatically through GitHub Actions)
npm run deploy
```

`https://hearfinch-api.<your-subdomain>.workers.dev/health` shows which steps are switched on.

## Run it locally

```bash
cp .dev.vars.example .dev.vars    # fill in what you have
npm run dev                       # http://localhost:8787
```

## How identification works

| Step | Finds | Service |
|---|---|---|
| 1. Audio fingerprint | Songs, commercials | ACRCloud (songs from its catalog; ads from your own uploaded ad library) |
| 2. Speech-to-text | Feeds steps 3–5 | OpenAI transcription |
| 3. Dialogue match | Movies, TV series | The D1 dialogue index, then TMDB for details and where-to-watch |
| 4. Transcript match | Podcasts | TODO: Podcast Index transcripts (`src/providers/podcasts.ts`) |
| 5. AI best guess | Anything else | Claude, labelled "Best guess" |

A match below 55% confidence is dropped and the next step runs.

**Abuse protection.** `/identify` calls paid services, so it is protected three ways:

- **Website-only access:** only the origins in `ALLOWED_ORIGINS` can call it from a browser.
- **Rate limiting:** each visitor is limited to 6 clips a minute (see `ratelimits` in `wrangler.jsonc`).
- **Bot check (optional):** Cloudflare Turnstile is used when `TURNSTILE_SECRET` is set.

## The dialogue index (movies and TV)

The index is built **on your computer** with Node's built-in SQLite, then copied to Cloudflare D1. That's because bulk imports run longer than a Worker is allowed to. TV episodes are filed under their series, so a match can only ever say which show it is, never which episode or scene.

```bash
cp .dev.vars.example .dev.vars    # needs TMDB_API_KEY, plus OPENSUBTITLES_* for option A

# Option A: OpenSubtitles.com API (current titles; limited downloads per day)
npm run index:opensubtitles -- --type movie --list popular --pages 5
npm run index:opensubtitles -- --type tv --list top_rated --pages 2 --episodes 4

# Option B: OPUS OpenSubtitles corpus (bulk, older titles; download from https://opus.nlpl.eu/OpenSubtitles)
npm run index:opus -- --dir ~/data/OpenSubtitles/xml/en --limit 5000 --from-year 1990

# Try it, then copy it to Cloudflare
npm run search -- "a line of dialogue you remember"
npm run d1:push
```

**Notes on the indexing scripts:**

- **Re-running is safe.** Both imports skip anything already indexed.
- **OpenSubtitles daily limit.** The OpenSubtitles import stops when it hits your account's daily download limit and continues from there on the next run.
- **Pushing replaces D1.** `d1:push` replaces D1's contents with your local index (`data/dialogue.db`), so keep that file.

**How matching works.** Subtitles are cut into overlapping windows of about 40 words. A match depends mostly on pairs of words heard back-to-back that also appear together in a window, not just on shared words.

I tested it on 200 sample titles with simulated speech-to-text errors:

- the right title came first every time
- random speech never passed the 55% bar

**Before launch:**

- **Rights:** subtitle text is copyrighted dialogue. The OPUS corpus is released for research, and OpenSubtitles has its own API terms. A commercial service needs a licence.
- **Database size:** D1's free plan holds 500 MB per database, about a few thousand titles. Paid plans go up to 10 GB.
- **Credit:** TMDB requires attribution, which is already on the website's About page.

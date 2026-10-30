# Hearfinch API (Cloudflare Worker)

The website records a short clip and sends it to this Worker at `POST /identify`. The Worker holds every API key, works out what the clip is and replies with the title's info. Clips are held in memory for the request only and never stored.

## First-time setup (all in the browser)

Everything runs on GitHub Actions. You only add secrets in GitHub, at **Settings → Secrets and variables → Actions → New repository secret**.

1. **Cloudflare**
   - If you've never used Workers, open **Workers & Pages** in the Cloudflare dashboard once and pick your `workers.dev` subdomain.
   - Copy your **Account ID** (Workers & Pages, right-hand side) into the secret `CLOUDFLARE_ACCOUNT_ID`.
   - Create an API token (**My Profile → API Tokens → Create Token**). Use the **Edit Cloudflare Workers** template and add the permission **Account › D1 › Edit**. Save it as `CLOUDFLARE_API_TOKEN`.
2. **API keys.** Add the ones you have; each step of the pipeline switches on when its key exists.

   | Secret | Where to get it | Turns on |
   |---|---|---|
   | `TMDB_API_KEY` | themoviedb.org → Settings → API (either the API Key or the Read Access Token) | Movie and show details |
   | `OPENAI_API_KEY` | platform.openai.com → API keys (optional, paid) | Backup speech-to-text. Not needed: speech-to-text runs free on Cloudflare Workers AI |
   | `ACRCLOUD_ACCESS_KEY`, `ACRCLOUD_ACCESS_SECRET` | ACRCloud console → Audio & Video Recognition project | Songs and ads |
   | `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | console.anthropic.com; model id from docs.claude.com/en/docs/about-claude/models | Best guess |
   | `TURNSTILE_SECRET` | Cloudflare → Turnstile | Bot check (optional) |

3. **Deploy:** go to **Actions → API → Run workflow**. The first run creates the D1 database, deploys the Worker and copies your keys to it. The run's summary shows the API address.
4. **Connect the website:** add that address as the repository **variable** `API_URL` (the **Variables** tab, not Secrets), then run **Actions → Website → Run workflow**. The demo banner disappears.

After this, every push to `main` that touches `worker/` redeploys the API. To add or change a key later, update the secret and run the API workflow again.

`<API address>/health` shows which steps are switched on.

## Run it locally

```bash
cp .dev.vars.example .dev.vars    # fill in what you have
npm run dev                       # http://localhost:8787
```

## How identification works

| Step | Finds | Service |
|---|---|---|
| 1. Audio fingerprint | Songs, commercials | ACRCloud (songs from its catalog; ads from your own uploaded ad library) |
| 2. Speech-to-text | Feeds steps 3–5 | Cloudflare Workers AI (Whisper, free tier about 200 audio minutes a day); OpenAI as an optional backup |
| 3. Dialogue match | Movies, TV series | The D1 dialogue index, then TMDB for details and where-to-watch |
| 4. Transcript match | Podcasts | TODO: Podcast Index transcripts (`src/providers/podcasts.ts`) |
| 5. AI best guess | Anything else | Claude, labelled "Best guess" |

A match below 55% confidence is dropped and the next step runs.

**Abuse protection.** `/identify` calls paid services, so it is protected three ways:

- **Website-only access:** only the origins in `ALLOWED_ORIGINS` can call it from a browser.
- **Rate limiting:** each visitor is limited to 6 clips a minute (see `ratelimits` in `wrangler.jsonc`).
- **Bot check (optional):** Cloudflare Turnstile is used when `TURNSTILE_SECRET` is set.

## The dialogue index (movies and TV)

### From GitHub (easiest)

1. Create a free account at opensubtitles.com, then register an API consumer under **Profile → API consumers**.
2. Add the secrets `OPENSUBTITLES_API_KEY`, `OPENSUBTITLES_USERNAME` and `OPENSUBTITLES_PASSWORD`.
3. Go to **Actions → Dialogue index → Run workflow**, then pick movies or shows, a TMDB list and how many pages of 20 titles to add.

Each run adds only what's new and stops cleanly at OpenSubtitles' daily download limit, so run it again on another day to keep growing the index. The subtitle text only goes into your Cloudflare database, never into the repository. TV episodes are filed under their series, so a match can only ever say which show it is.

### From your computer (bulk, or the OPUS corpus)

The same index can be built locally with Node's built-in SQLite and copied to D1. Run `npx wrangler login` and `npm run ci:prepare-d1` once.

```bash
cp .dev.vars.example .dev.vars    # needs TMDB_API_KEY, plus OPENSUBTITLES_* for the first option

# OpenSubtitles.com API (current titles; limited downloads per day)
npm run index:opensubtitles -- --type movie --list popular --pages 5

# OPUS OpenSubtitles corpus (bulk, older titles; download from https://opus.nlpl.eu/OpenSubtitles)
npm run index:opus -- --dir ~/data/OpenSubtitles/xml/en --limit 5000 --from-year 1990

npm run search -- "a line of dialogue you remember"
npm run d1:push               # replaces D1 with your local index
```

Don't mix the two ways: a full `d1:push` replaces whatever the GitHub workflow added.

**How matching works.** Subtitles are cut into overlapping windows of about 40 words. A match depends mostly on pairs of words heard back-to-back that also appear together in a window, not just on shared words.

I tested it on 200 sample titles with simulated speech-to-text errors:

- the right title came first every time
- random speech never passed the 55% bar

**Before launch:**

- **Rights:** subtitle text is copyrighted dialogue. The OPUS corpus is released for research, and OpenSubtitles has its own API terms. A commercial service needs a licence.
- **Database size:** D1's free plan holds 500 MB per database, about a few thousand titles. Paid plans go up to 10 GB.
- **Credit:** TMDB requires attribution, which is already on the website's About page.

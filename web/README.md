<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="public/brand/emphasis-logo-lockup.svg">
    <source media="(prefers-color-scheme: light)" srcset="public/brand/emphasis-logo-lockup-on-light.svg">
    <img src="public/brand/emphasis-logo-lockup.svg" alt="Emphasis — Emphasize your music experience" width="440">
  </picture>
</p>

<p align="center">
  <em>Two tools for your TIDAL account, in one small web app.</em>
</p>

---

## What Emphasis does

TIDAL's own recommendations are a black box, and sharing a playlist means giving up
control of it. **Emphasis** offers two focused tools instead — both driven by your own
library, both explainable, both self-hostable.

| Route | Tool |
|---|---|
| `/` | Landing page with both tools |
| `/your-weekly-mix` | Your Weekly Mix |
| `/shared-playlist` | Shared Playlist |

Common ground:

- **Official OAuth (PKCE)** — your password never touches the app; it only asks to read
  your library and write playlists.
- **English and German**, chosen automatically from the browser language.
- **No tracking, no third parties, no paid API tiers.** Nothing is stored server-side
  unless you explicitly enable automation or join a shared playlist.
- Responsive, mobile-first interface with a single-colour [Lucide](https://lucide.dev)
  icon set.

---

## Your Weekly Mix

A personal 20-track playlist, rebuilt whenever you want it. There is exactly **one**
playlist (*Your Weekly Mix* / *Dein Mix der Woche*) that gets overwritten instead of a
new one piling up every week. Enable the optional automation and the server regenerates
it every 7 days, even if you never open the page.

### How the mix is assembled

The generator does not simply take "20 recommendations". It treats playlist building as
an **optimisation problem**: out of several hundred candidates, pick the 20 tracks whose
combined score is highest. The approach is inspired by constraint-based playlist
generation (Aucouturier & Pachet, 2002) and submodular greedy maximisation.

**1. Input set** — the last 50 tracks you saved to a playlist or favourited. The
generated mix playlist itself is excluded (identified by its stored ID, its name, or the
codeword `emphasis` in its description), so the algorithm never feeds on its own output.

**2. Candidate pool**

| Source | Contribution |
|---|---|
| Top songs of your heard artists | ranked by TIDAL's `popularity` attribute |
| Top songs of **similar** artists | via `similarArtists` — these count as "new" artists |
| Similar tracks | via `similarTracks` for each of your 50 input songs |

**3. Hard exclusions** — a track can never enter the mix if it is an audiobook, radio
play or podcast (keyword filter on title + album, German and English), already in one of
your previous Emphasis mixes, already favourited, a duplicate (same title + artist), or
from an artist that already has 2 tracks in the mix.

**4. Per-song score**

| Points | Condition |
|---:|---|
| **+50** | song is in none of your playlists |
| **+30** | the artist already appears in your library (matched by artist ID, not name) |
| **+15** / **+10** | released within the last 3 / 6 months |
| **+15** / **+10** | among the artist's top 10 / top 20 most popular songs |
| **+5** | genre matches one you listen to |

**5. Whole-playlist bonuses**

| Points | Condition |
|---:|---|
| **+500** | the mix contains at least 10 different artists |
| **+100** | exactly 15 tracks by heard artists and 5 by new artists |

These bonuses are what make the problem interesting: a track that scores poorly on its
own may still be worth taking if it unlocks a 500-point bonus.

**6. Maximisation** — three candidate selections ("regimes") are evaluated: a plain
greedy pick, one optimised for artist diversity, and one aiming at the 15+5 composition.
The best one is then refined by **swap local search** — pairwise exchanges accepted
whenever the total score (song points *plus* bonuses) improves.

The result is **deterministic**: identical input produces an identical playlist. It only
changes when your library changes, or after you save — saved tracks then join the
exclusion list.

---

## Shared Playlist

Share one playlist with friends without anyone losing control of their own library.
Every member keeps a **copy in their own account**; once a day all copies are reconciled.

### How sharing works

1. **Create** — pick one of your existing playlists or create a new one. You become the
   owner and get an **invite link**.
2. **Join** — whoever opens the link and signs in gets a copy of the playlist in their
   own TIDAL account.
3. **Edit** — everyone edits their own copy in the normal TIDAL app.
4. **Sync** — once a day (or when the owner presses *Sync now*), all permitted changes
   are merged:

   ```
   new state = last shared state + all permitted additions − all permitted removals
   ```

   Changes made without permission are simply reverted at the next sync.

**Track order is never rearranged.** Syncing only removes what has to go and appends what
is missing, so any manual sorting a member applied to their own copy survives. A copy
that already holds the right set of tracks is not touched at all.

### What the owner controls

- **Members** — see who joined and when, and remove individual people. A removed
  member's copy stays in their account, it is simply no longer synced.
- **Rights per person** — separate *may add* and *may remove* switches for every member
  (both on by default).
- **Invite link** — copy, regenerate or disable it.
- **Sync** — trigger it manually, pause it for the whole group, or dissolve the group.

Every member can pause their own sync or leave via *Leave & delete data*, which removes
all of their server-side data immediately.

Both playlists carry a timestamp at the end of their description —
`Last created DD.MM.YYYY` for the weekly mix, `Last synced HH:MM DD.MM.YYYY` for a shared
playlist (localised).

---

## Try it without installing anything

### 🔗 [emphasize.me](https://emphasize.me)

> **Note.** Emphasis is an independent, open-source community project and is **not
> affiliated with TIDAL**. TIDAL is a trademark of TIDAL Music AS. The public instance
> runs privately on a small server, capacity is limited, and it comes with no uptime
> guarantee. Signing in grants read access to your library and permission to write
> playlists — nothing else. Enabling automation or joining a shared playlist stores an
> OAuth token plus playlist metadata on the server; one click deletes all of it again.
> If you would rather keep everything under your own control, self-host it.

---

## Self-hosting

### Prerequisites

- **Node.js 20 or newer** (22 LTS recommended) and npm
- A **TIDAL account** (the API works with any account; playback needs a subscription)
- **HTTPS** — mandatory. TIDAL's auth SDK uses the Web Crypto API (`crypto.subtle`),
  which browsers only expose in *secure contexts*: `https://` or `localhost`. Plain
  `http://` on a LAN IP will fail.
- Only for automation and shared playlists: a machine that stays online (a small VPS is
  plenty — the service needs well under 100 MB RAM).

### 1. Get your TIDAL client ID

Access to the [TIDAL Open API](https://developer.tidal.com/) is free and self-service —
no application process, no paid tier.

1. Sign in at [developer.tidal.com/dashboard](https://developer.tidal.com/dashboard).
2. Create a new app.
3. Add the **redirect URIs** — they must match *byte for byte*, including the trailing
   slash:

   | Purpose | URI |
   |---|---|
   | Browser login, local development | `https://localhost:5173/` |
   | Browser login, production | `https://your-domain.example/` |
   | Server flows (automation **and** shared playlists) | `https://your-domain.example/api/autogen/callback` |

   > All server-side OAuth flows deliberately share **one** callback path, so adding a
   > new tool never requires another dashboard entry. Change it with
   > `EMPHASIS_OAUTH_CALLBACK` if you prefer a neutral path such as
   > `/api/oauth/callback` (that path is always accepted as well).

4. Copy the **Client ID**. The client secret is not needed — Emphasis uses the PKCE flow.
5. Enable these scopes: `user.read`, `collection.read`, `recommendations.read`,
   `playlists.read`, `playlists.write`.

> **Troubleshooting.** TIDAL error **11102** on the login page means the authorisation
> request does not match your app configuration — almost always a redirect URI that
> differs (missing trailing slash, `http` instead of `https`, wrong port) or a scope that
> is not enabled.

### 2. Install

```bash
git clone https://github.com/Chronologe/emphasis.git
cd emphasis/web
npm install
cp .env.example .env.local
```

Put your client ID into `.env.local`:

```
VITE_TIDAL_CLIENT_ID=your-client-id
```

Optional artwork in `public/`: `logo.png` replaces the header logo, `cover.png`
(or `.jpg`) is used as playlist cover art. Note that TIDAL only permits first-party apps
to upload artwork, so the upload usually fails gracefully — set the cover manually in the
TIDAL app once and it survives every overwrite.

### 3. Run it

**Development** — Vite serves over HTTPS with a self-signed certificate (accept the
browser warning once) and `--host`, so the printed *Network* URL works from your phone on
the same Wi-Fi:

```bash
npm run dev       # app on https://localhost:5173/
npm run server    # optional: automation + shared-playlist backend on 127.0.0.1:8787
```

**Production**

```bash
npm run build     # static files in dist/
```

Serve `dist/` with any web server. nginx with SPA routing (needed for `/your-weekly-mix`
and `/shared-playlist`) and a proxy for the backend:

```nginx
server {
    listen 443 ssl;
    server_name your-domain.example;

    ssl_certificate     /etc/letsencrypt/live/your-domain.example/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.example/privkey.pem;

    root /opt/emphasis/web/dist;
    index index.html;

    gzip on;
    gzip_types text/css application/javascript image/svg+xml;

    location /api/ {
        proxy_pass http://127.0.0.1:8787;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto https;
    }

    location / {
        try_files $uri /index.html;   # SPA routes
    }

    location /assets/ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
```

Get a free certificate with `certbot --nginx -d your-domain.example`.

### 4. The backend (optional)

Without it both tools still work — you just press the buttons yourself. With it, weekly
mixes and shared playlists sync on their own. It listens on `127.0.0.1:8787`, runs its
own PKCE flow to obtain a refresh token per opted-in user, and checks hourly what is due.

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `8787` | port the API listens on |
| `PUBLIC_ORIGIN` | request host | public origin used to build OAuth redirect URIs |
| `EMPHASIS_DATA_DIR` | `/opt/emphasis/data` | where user and group JSON files are stored |
| `EMPHASIS_OAUTH_CALLBACK` | `/api/autogen/callback` | shared callback path of all server flows |
| `EMPHASIS_MAX_USERS` | `1000` | cap on simultaneously enabled automation users |
| `EMPHASIS_MAX_MEMBERS` | `50` | cap on members per shared playlist |
| `EMPHASIS_MIN_FREE_DISK_BYTES` | `1073741824` (1 GiB) | refuse new sign-ups below this free disk space |

> **Put `EMPHASIS_DATA_DIR` outside the repository** (for example `/var/lib/emphasis`).
> A `git clean` during deployment would otherwise delete your users' data. Back it up.

As a systemd unit:

```ini
[Unit]
Description=Emphasis server
After=network.target

[Service]
WorkingDirectory=/opt/emphasis/web
ExecStart=/usr/bin/npm run server
Environment=PUBLIC_ORIGIN=https://your-domain.example
Environment=EMPHASIS_DATA_DIR=/var/lib/emphasis
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

**Stored per user:** TIDAL user ID, OAuth refresh token, playlist ID, language, previous
mix track IDs, last run. **Per shared playlist:** group name, owner, invite token, member
list with rights and last synced state. Files are `0600` in a `0700` directory. Disabling
automation or leaving a group deletes the corresponding data entirely.

---

## Tuning the weights

Everything lives in a few files — change a number, run `npm run build`, done.

### Points and bonuses — [`src/your-weekly-mix/scoring.ts`](src/your-weekly-mix/scoring.ts)

```ts
// Per-song points, in songScore()
const notInPlaylist = context.allPlaylistTrackIds.has(track.id) ? 0 : 50;  // ← +50 rule
const heardArtist   = isHeardArtistTrack(track, context) ? 30 : 0;         // ← +30 rule

if (ageDays <= 92) recency = 15;        // ← "released within 3 months"
else if (ageDays <= 183) recency = 10;  // ← "released within 6 months"

if (rank <= 10) topRank = 15;           // ← top-10 of the artist
else if (rank <= 20) topRank = 10;      // ← top-20 of the artist

const genre = track.genres.some((g) => context.userGenres.has(g)) ? 5 : 0;  // ← genre match
```

```ts
// Whole-playlist bonuses, in playlistBonuses()
const distinctBonus = distinctArtists.size >= 10 ? 500 : 0;
const compositionBonus =
  tracks.length === TARGET_SIZE && heardTrackCount === 15 && newTrackCount === 5 ? 100 : 0;
```

Other knobs in the same file: `TARGET_SIZE` (`20`, tracks per mix) and
`EXCLUDED_CONTENT_PATTERNS` (regexes banning audiobooks/podcasts — add your own).

**Worked examples.** Want more fresh releases? Raise the recency points (`15`/`10` →
`40`/`25`). Want to stay closer to what you know? Raise `heardArtist` and lower
`notInPlaylist`. Want diversity to be a preference rather than a rule? Lower the `500`
bonus to the size of a single song score, e.g. `60`.

### Pool size and constraints — [`src/your-weekly-mix/generator.ts`](src/your-weekly-mix/generator.ts)

| Constant | Default | Effect |
|---|---:|---|
| `MAX_TRACKS_PER_ARTIST` | `2` | hard cap of songs per artist |
| `MAX_HEARD_ARTISTS` | `25` | how many of your artists seed the pool |
| `MAX_NEW_ARTISTS` | `30` | how many similar artists are pulled in |
| `SIMILAR_ARTIST_SOURCES` | `15` | how many of your artists are asked for similar artists |
| `ARTIST_TRACKS_TO_FETCH` | `60` | tracks fetched per artist for the popularity ranking |
| `TOP_TRACKS_PER_ARTIST` | `20` | how many of them enter the candidate pool |
| `MAX_SWAP_PASSES` | `25` | effort spent on the local search |

Larger values mean a broader pool and better mixes, but more API calls and a longer wait.

### Input set — [`src/your-weekly-mix/inputSet.ts`](src/your-weekly-mix/inputSet.ts)

| Constant | Default | Effect |
|---|---:|---|
| `INPUT_TRACK_COUNT` | `50` | how many recent songs define your taste |
| `MAX_PLAYLISTS` | `50` | playlists scanned |
| `MAX_ITEMS_PER_PLAYLIST` | `300` | tracks read per playlist |
| `MAX_FAVORITES` | `1000` | favourites loaded (these are excluded from the mix) |
| `MIX_CODEWORD` | `'emphasis'` | description keyword identifying the generated playlist |

### Shared playlist — [`server/shared.ts`](server/shared.ts)

`SYNC_INTERVAL_MS` (24 h) sets how often a group is reconciled, `MAX_MEMBERS` caps group
size. New members start with both rights enabled in `handleJoin`.

After changing anything, rebuild — and restart the service if you run the backend:

```bash
npm run build && systemctl restart emphasis-autogen
```

---

## Project structure

```
web/
├── src/
│   ├── App.tsx                 # login state + routing
│   ├── shared/                 # used by both tools
│   │   ├── auth.ts             # PKCE login, remembers the target tool
│   │   ├── tidalClient.ts      # JSON:API client, pagination, 429 backoff
│   │   ├── playlistItems.ts    # read / replace / delta playlist contents
│   │   ├── descriptions.ts     # playlist descriptions incl. timestamp
│   │   ├── router.ts, Layout.tsx, i18n.ts, tracks.ts, covers.ts
│   │   └── components/         # CoverCollage, Select, generated covers
│   ├── landing/                # start page with both tools
│   ├── your-weekly-mix/        # inputSet, scoring, generator, playlist
│   └── shared-playlist/        # SharedPlaylist, MemberList, InviteCard, api
└── server/
    ├── main.ts                 # HTTP routing + hourly scheduler
    ├── common.ts               # OAuth, HTTP helpers, capacity checks
    ├── autogen.ts              # weekly mix automation
    └── shared.ts               # groups, invites, rights, sync engine
```

The scoring and playlist logic is shared verbatim between browser and server, so both
produce identical results.

## Language

The interface is available in **English** and **German**, chosen from the browser's
language setting (`de-*` → German, everything else → English). This also switches date
formats, the generated playlist names and the description timestamps. An existing
playlist is renamed rather than duplicated, and both names are recognised so the mix is
never fed back into its own input set.

Both dictionaries live in [`src/shared/i18n.ts`](src/shared/i18n.ts) and are type-checked
against each other, so a missing translation breaks the build instead of shipping an
untranslated string. To add a language, copy the `de` object, translate it and extend the
selection at the top of the file.

## Tech stack

Vite · React · TypeScript · [`@tidal-music/auth`](https://www.npmjs.com/package/@tidal-music/auth)
for PKCE · [Lucide](https://lucide.dev) icons · a dependency-free Node HTTP server for
automation and syncing.

## Licence & attribution

Open source community project. Emphasis is **not affiliated with TIDAL**; TIDAL is a
trademark of TIDAL Music AS. Use of the TIDAL API is subject to TIDAL's developer terms.

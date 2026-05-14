# ZTGuard Extended Settings — System Map & Edit Guide

> Reference document for future AI sessions. Read this FIRST before making any changes.

---

## Live URLs

| Page | URL | Auth |
|---|---|---|
| Pangolin admin dashboard | `https://pangolin.test01.ztguard.net` | Pangolin admin login |
| **ZTGuard Portal** | `https://pangolin.test01.ztguard.net/ztguard/` | Single password (see credentials) |
| **ZTGuard Portal login** | `https://pangolin.test01.ztguard.net/ztguard/login` | — |
| **Pangolin login page** | `https://pangolin.test01.ztguard.net/auth/login` | — |

---

## Customer Installations

Each Pangolin server gets its own folder under `../Customers/{customer}/` (outside git — private data):

```
../Customers/
  srmech/                          ← SR Mechanical test server
    01-server-access.md            ← IP, SSH key, connection alias
    02-deployment-log.md           ← step-by-step execution log
    03-credentials.md              ← passwords, tokens, keys (PRIVATE)
```

### Adding a new customer
1. Create `../Customers/{customer}/` from the templates in this folder
2. Follow `02-deployment-log.md` — all three phases: Docker, Pangolin, ZTGuard
3. Store setup token and credentials in `03-credentials.md`

### Current customers

| Customer | Domain | IP | Status |
|---|---|---|---|
| SR Mechanical (test) | `srmech.ztguard.net` | `216.128.181.8` | Pangolin installed, ZTGuard pending |

---

## One-Command Installer

```bash
curl -fsSL https://raw.githubusercontent.com/DialogueDynamicsAI/ZTGUARD-DASHBOARD/main/install.sh | bash
```

### What the installer does (in order)
1. Detects Pangolin at `/opt/pangolin` (or prompts for custom path)
2. Reads `config/config.yml` to get domain and Docker network name
3. Prompts for admin password (or generates a secure random one)
4. Creates `/opt/ztguard-portal/` with docker-compose.yml + .env
5. Runs `install/patch-branding.sh` — patches Pangolin JS/CSS bundles
6. Adds Traefik route to `config/traefik/dynamic_config.yml`
7. Builds and starts the portal container
8. Restarts Pangolin to apply patches
9. Prints the portal URL + password

### Files created
```
/opt/ztguard-portal/     ← portal install directory
  docker-compose.yml     ← portal container config (auto-generated)
  .env                   ← credentials + settings (chmod 600)
  .install-info          ← install metadata for uninstaller
  data/                  ← SQLite databases (persistent)
/opt/pangolin-branding/  ← JS/CSS patch files (shared with Pangolin)
  logos/                 ← wordmark PNG files
  *.css                  ← CSS override file
  *-chunk.js             ← patched JS bundles
  .css-hash              ← CSS filename hash (used by portal .env)
```

### Installer files in this repo
```
install.sh                          ← one-command installer
uninstall.sh                        ← clean removal
install/
  docker-compose.template.yml       ← portal compose template ({{VARIABLES}})
  traefik-route.template.yml        ← Traefik route template ({{DOMAIN}})
  patch-branding.sh                 ← applies all JS/CSS patches to Pangolin
  restore-branding.sh               ← reverses all patches
```

### Uninstall
```bash
bash /opt/ztguard-portal/uninstall.sh
# or
bash uninstall.sh
```
Stops container, removes all files, removes Traefik route, restores Pangolin.

---

## VPS Details

| Field | Value |
|---|---|
| IP | `155.138.199.100` |
| SSH alias | `ztguard-test01` |
| SSH key | `~/.ssh/ztguard_key` |
| OS | Debian 11 |

```bash
ssh ztguard-test01
```

---

## Directory Map on VPS

```
/opt/pangolin/                        ← Pangolin stack (managed by installer)
├── docker-compose.yml                ← MODIFIED: added volume mounts + BRANDING_APP_NAME
├── config/config.yml                 ← Pangolin app config (SMTP etc.)
├── config/traefik/dynamic_config.yml ← CRITICAL: Traefik routing — edit here for routes/CSS
└── ...

/opt/pangolin-branding/               ← All branding overrides (created by us)
├── 4b2b6ba26710cf1d.css              ← LIVE CSS override file (volume-mounted into Pangolin)
│                                        Edit this file to change login page styling.
│                                        No restart needed — Pangolin serves it directly.
│                                        DO NOT rename without updating manifests (see below).
├── ztguard-logo-master.png           ← Original flat black-bg logo (source for processing)
├── ztguard-logo-light-*.png          ← Processed versions (transparent bg)
└── logos/
    ├── word_mark_black.png           ← Login page logo (light mode) — auto-updated by portal
    ├── word_mark_white.png           ← Login page logo (dark mode) — auto-updated by portal
    └── word_mark.png                 ← Large version — auto-updated by portal

/opt/ztguard-portal/                  ← ZTGuard Extended Settings portal
├── docker-compose.yml
├── .env                              ← SECRETS — never commit
├── src/
│   ├── index.js                      ← Express app
│   ├── db.js                         ← SQLite schema
│   ├── poller.js                     ← Pangolin API log poller
│   ├── forwarder.js                  ← Webhook forwarder
│   └── routes/
│       ├── auth.js                   ← Login/logout
│       ├── branding.js               ← CRITICAL: branding save + CSS rewrite + wordmark regen
│       ├── destinations.js           ← Event streaming destinations CRUD
│       └── history.js                ← Delivery history
├── public/
│   ├── index.html                    ← App shell
│   ├── login.html                    ← Portal login page
│   ├── css/style.css                 ← Portal UI theme
│   └── js/
│       ├── app.js                    ← SPA router + API helpers
│       ├── branding.js               ← Branding page UI (light/dark toggle, live preview)
│       └── event-streaming.js        ← Event streaming page UI
└── data/
    ├── state.db                      ← SQLite DB (branding config, destinations, history)
    └── sessions.db                   ← Express sessions
```

---

## How the Pangolin Login Page Branding Works

### CSS Override Pipeline

```
/opt/pangolin-branding/4b2b6ba26710cf1d.css
    ↓ volume-mounted read-only into Pangolin container
/app/.next/static/css/4b2b6ba26710cf1d.css  (inside container)
    ↓ served by Next.js static file handler
https://pangolin.test01.ztguard.net/_next/static/css/4b2b6ba26710cf1d.css
    ↓ Traefik applies no-cache header (see dynamic_config.yml)
Browser loads CSS fresh on every visit
```

**To change login page styles:** Edit `/opt/pangolin-branding/4b2b6ba26710cf1d.css` directly on the VPS. Changes are live immediately — no container restart needed. OR use the portal branding page (light/dark toggle) which rewrites this file automatically.

**CSS file structure:**
- Lines 1–110,000: Original Pangolin compiled CSS (do not touch)
- Lines 110,000+: Our overrides (written by `writePangolinCss()` in `branding.js`)

### Logo / Wordmark Pipeline

```
User uploads logo via /ztguard/branding
    ↓ stored as base64 in state.db (branding_config.logo_data)
    ↓ jimp regenerates wordmarks automatically (src/routes/branding.js: regenerateWordmarks())
/opt/pangolin-branding/logos/word_mark_black.png  (light mode)
/opt/pangolin-branding/logos/word_mark_white.png  (dark mode)
    ↓ volume-mounted into Pangolin container
/app/public/logo/word_mark_black.png  (inside container)
    ↓ served at /logo/word_mark_black.png  (cache-control: max-age=0, ETag-based)
Browser loads on next page visit
```

**To manually regenerate wordmarks** (if something breaks):
```bash
ssh ztguard-test01
python3 << 'EOF'
import sqlite3, base64, io
from PIL import Image

conn = sqlite3.connect('/opt/ztguard-portal/data/state.db')
row = conn.execute("SELECT value FROM branding_config WHERE key='logo_data'").fetchone()
conn.close()
logo = Image.open(io.BytesIO(base64.b64decode(row[0].split(',')[1]))).convert('RGBA')
# ... resize and save to /opt/pangolin-branding/logos/word_mark_black.png
EOF
```

### CSS Hash Renaming (CRITICAL)

The CSS filename `4b2b6ba26710cf1d.css` is referenced in **109 Next.js manifest files** inside the Pangolin container. If you ever need to force all browsers to re-fetch (cache bust):

```bash
# 1. Create new CSS file with next hash (change last char: d → e)
cp /opt/pangolin-branding/4b2b6ba26710cf1d.css /opt/pangolin-branding/4b2b6ba26710cf1e.css

# 2. Update all manifests in running container
docker exec pangolin sh -c 'grep -rl 4b2b6ba26710cf1d /app/.next/ 2>/dev/null | while read f; do sed -i "s/4b2b6ba26710cf1d/4b2b6ba26710cf1e/g" "$f"; done; echo done'

# 3. Commit container as new image
docker commit pangolin fosrl/pangolin-branded:1.18.3

# 4. Update docker-compose volume mount
sed -i 's/4b2b6ba26710cf1d/4b2b6ba26710cf1e/g' /opt/pangolin/docker-compose.yml

# 5. Update portal's PANGOLIN_CSS_PATH env if needed
# Also update PANGOLIN_CSS_PATH in /opt/ztguard-portal/.env if changed

# 6. Restart Pangolin
cd /opt/pangolin && docker compose up -d pangolin
```

**History:** `cf1b` → `cf1c` → `cf1d` (current). Each rename forced a full browser cache bust.

---

## Traefik Dynamic Config

**File:** `/opt/pangolin/config/traefik/dynamic_config.yml`

Key routers (order by priority):

| Priority | Router | Rule | Purpose |
|---|---|---|---|
| 300 | `ztguard-css-override` | `PathPrefix('/_next/static/css/')` | Forces `no-cache` on ALL Pangolin CSS |
| 200 | `ztguard-portal` | `PathPrefix('/ztguard')` | Routes `/ztguard/*` to portal container |
| default | `next-router` | `!PathPrefix('/api/v1')` | Pangolin main app |
| default | `api-router` | `PathPrefix('/api/v1')` | Pangolin API |

**CRITICAL:** Do NOT use `yaml.dump()` to edit this file — it corrupts backtick strings in Traefik rules. Use string manipulation or the heredoc approach instead.

---

## ZTGuard Portal — Key Behaviours

### Branding Save Flow

When `POST /ztguard/api/branding` is called with `logo_data`:
1. Saves to SQLite `branding_config` table
2. Detects if logo has black background (>5% black opaque pixels)
3. If YES → applies screen-mode extraction + white→dark-navy conversion (jimp)
4. If NO → uses logo as-is (already transparent/processed)
5. Resizes to 895×224 and saves wordmark PNGs to `/app/brand-logos/`
6. Pangolin login page shows new logo immediately (no restart needed)

When called with `login_theme: 'light' | 'dark'`:
1. Saves to SQLite
2. Calls `writePangolinCss(theme)` which:
   - Reads `/app/pangolin-css/4b2b6ba26710cf1d.css`
   - Strips everything after `/* ===` marker
   - Appends either `LIGHT_THEME_CSS` or `DARK_THEME_CSS` constant
3. Login page reflects change on next browser visit

### Theme CSS Constants (in `src/routes/branding.js`)

**Dark theme** (`DARK_THEME_CSS`):
- Background: `#0a0f1e` (dark navy gradient)
- Button: green `#10b981`
- Inputs: semi-transparent white on dark
- Logo header: `#0a0f1e` strip matching ztguard.net nav

**Light theme** (`LIGHT_THEME_CSS`):
- Background: `#f1f5f9` (light gray)
- Button: blue `#2563eb`
- Inputs: white with light border
- Logo header: white

**CRITICAL CSS selector rule:** NEVER use `[class*='bg-primary']` — it matches Tailwind opacity variants like `bg-primary/10` and fills containers solid blue. Always use `button.bg-primary` only.

---

## Portal .env Variables

```
ADMIN_PASSWORD=ztguard-admin-2026      ← change in production
SESSION_SECRET=<64-char hex>
PANGOLIN_API_URL=https://pangolin.test01.ztguard.net/v1
PANGOLIN_API_KEY=                      ← create in Pangolin → Organization → API Keys
PANGOLIN_ORG_ID=test-org
PORT=3100
BASE_PATH=/ztguard
POLL_INTERVAL_SECONDS=30
BRAND_LOGOS_DIR=/app/brand-logos       ← wordmark output dir (volume-mounted)
PANGOLIN_CSS_PATH=/app/pangolin-css/4b2b6ba26710cf1d.css  ← CSS override file
```

---

## Docker Volume Mounts Summary

### Pangolin container (`/opt/pangolin/docker-compose.yml`)

```yaml
volumes:
  - ./config:/app/config
  - /opt/pangolin-branding/4b2b6ba26710cf1d.css:/app/.next/static/css/4b2b6ba26710cf1d.css:ro
  - /opt/pangolin-branding/logos/word_mark_black.png:/app/public/logo/word_mark_black.png:ro
  - /opt/pangolin-branding/logos/word_mark_white.png:/app/public/logo/word_mark_white.png:ro
  - /opt/pangolin-branding/logos/word_mark.png:/app/public/logo/word_mark.png:ro
```

### ZTGuard portal container (`/opt/ztguard-portal/docker-compose.yml`)

```yaml
volumes:
  - ./data:/app/data                                      ← SQLite persistence
  - /opt/pangolin-branding/logos:/app/brand-logos         ← wordmark write access
  - /opt/pangolin-branding:/app/pangolin-css              ← CSS override write access
```

---

## Pangolin Docker Image

The running Pangolin uses a **custom committed image** (not the upstream):
- Image: `fosrl/pangolin-branded:1.18.3`
- Based on: `fosrl/pangolin:1.18.3` (community edition)
- Modifications baked in:
  - All 109 Next.js manifest files updated to reference `4b2b6ba26710cf1d.css`
  - `BRANDING_APP_NAME=ZTGuard` environment variable set

If Pangolin is updated (new version), the whole CSS hash process must be repeated for the new version's CSS files.

---

## Common Operations

### Change login page colors

```bash
# Edit the CSS override directly
nano /opt/pangolin-branding/4b2b6ba26710cf1d.css
# Changes are live immediately — no restart needed
```

OR use the portal: `https://pangolin.test01.ztguard.net/ztguard/branding` → Identity → Light/Dark toggle → Save

### Update portal code

```bash
# After editing files locally, scp to VPS and rebuild
scp -r src/ root@155.138.199.100:/opt/ztguard-portal/src/
ssh ztguard-test01 "cd /opt/ztguard-portal && docker compose up -d --build"
```

**IMPORTANT:** `docker compose restart` does NOT pick up source code changes. Always use `--build` after code changes.

### Add a Pangolin API key for Event Streaming

1. Log into `https://pangolin.test01.ztguard.net`
2. Organization → API Keys → Create
3. Grant: Read on Logs (request, action, access, connection)
4. SSH to VPS: `nano /opt/ztguard-portal/.env` → set `PANGOLIN_API_KEY=<key>`
5. `cd /opt/ztguard-portal && docker compose restart`

### Restart all services

```bash
ssh ztguard-test01
cd /opt/pangolin && docker compose restart          # Traefik + Pangolin + Gerbil
cd /opt/ztguard-portal && docker compose restart   # ZTGuard portal
```

---

## Pangolin Attribution Removal (Resource Auth Page)

Both "Powered by Pangolin" and "Server is running without a supporter key" are patched out of the compiled JS bundle. **Do NOT use env vars or CSS — they don't work for CE.**

### Why env vars fail
- `RESOURCE_AUTH_PAGE_HIDE_POWERED_BY=true` → only respected when `isUnlocked() && build === "enterprise"` — always false in CE
- `HIDE_SUPPORTER_KEY=true` → env var exists in `pullEnv` but the resource auth banner reads from the API `/supporter-key/visible`, not this flag

### Why CSS failed
- The link href is `https://pangolin.net/` (with trailing slash) — our CSS used `a[href="https://pangolin.net"]` (no trailing slash) — exact selector mismatch
- Even when fixed, browser `immutable` cache prevented updates

### The actual fix (JS bundle patch)

**Patched file:** `/opt/pangolin-branding/auth-resource-page-patched-new.js`
**Volume mount in docker-compose.yml:**
```yaml
- /opt/pangolin-branding/auth-resource-page-patched-new.js:/app/.next/static/chunks/app/auth/resource/[resourceGuid]/page-a77fef8921888f2e.js:ro
```

**What was patched (2 string replacements in minified JS):**

1. Entire "Powered by" ternary replaced with `null`:
```
REMOVED: eh()&&"enterprise"===D.j?!(null==(z=eE.branding.resourceAuthPage)?void 0:z.hidePoweredBy)&&(...enterprise branch...):(0,r.jsx)("div",{className:"text-center mb-2",...CE "Powered by Pangolin" link...})
REPLACED WITH: null
```

2. Supporter notice conditional replaced with `null`:
```
REMOVED: (null==eI?void 0:eI.visible)&&(0,r.jsx)("div",{className:"text-center mt-2",children:(0,r.jsx)("span",{className:"text-sm text-muted-foreground opacity-50",children:ex("noSupportKey")})})
REPLACED WITH: null
```

**Original hash:** `a77fef8921888f2d` → **Patched hash:** `a77fef8921888f2e` (changed last char to bust browser cache)

**Manifests updated (only 2 files):**
- `/app/.next/server/app/auth/resource/[resourceGuid]/page_client-reference-manifest.js`
- `/app/.next/app-build-manifest.json`

**Traefik no-cache** also applied to `/_next/static/chunks/` (same rule as CSS).

### If Pangolin is updated
The chunk filename will change. Re-apply by:
1. `docker exec pangolin find /app/.next/static/chunks -name "page-*.js" -path "*/auth/resource/*"` — find new filename
2. Extract, patch same two strings, volume-mount with new name
3. Update the 2 manifest files inside container
4. `docker commit` and restart

---

## Known Issues & Fixes Applied

| Issue | Root Cause | Fix |
|---|---|---|
| Button stays blue/orange after CSS change | Browser caches CSS with `immutable` header | Rename CSS hash (`cf1b→cf1c→cf1d`), Traefik `no-cache` on all CSS |
| `[class*='bg-primary']` turns all inputs blue | Matches Tailwind opacity variants like `bg-primary/10` | Use `button.bg-primary` only |
| Logo "Guard" text faded/semi-transparent | jimp screen-mode re-applied to already-transparent image, treating dark blue as semi-transparent | Detect black-background images before applying screen-mode |
| Traefik rules broken by `yaml.dump()` | Python YAML serializer corrupts backtick-delimited Traefik rule strings | Use string manipulation, never `yaml.dump()` |
| `docker compose restart` doesn't update code | Source files baked into Docker image at build time | Always use `docker compose up -d --build` for code changes |
| "Powered by Pangolin" CSS selector never matched | Link href is `https://pangolin.net/` WITH trailing slash; CSS used `a[href="https://pangolin.net"]` WITHOUT trailing slash | JS bundle patch (see above) |
| Env vars for attribution hide don't work in CE | `isUnlocked()` always false in CE; hidePoweredBy only respected in EE | JS bundle patch (see above) |

---

## Feature Status

| Feature | Status | Notes |
|---|---|---|
| Event Streaming | UI ready, polling ready | Needs `PANGOLIN_API_KEY` in `.env` |
| Branding — logo | ✅ Live | Auto-updates login page wordmark |
| Branding — light/dark mode | ✅ Live | Rewrites CSS file on save |
| Branding — live preview | ✅ Live | Iframe with blob URL, absolute logo URL |
| Delivery History | ✅ Live | Logs webhook delivery results |
| Alerting | Sidebar stub (Soon) | Not yet built |
| Provisioning | Sidebar stub (Soon) | Not yet built |
| Blueprints | Sidebar stub (Soon) | Not yet built |

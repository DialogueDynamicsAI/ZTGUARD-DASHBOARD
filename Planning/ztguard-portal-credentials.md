# ZTGuard Extended Settings Portal — Credentials & Deployment

> **KEEP THIS FILE PRIVATE. Do not commit to public repos.**

---

## Access URL

| Environment | URL |
|---|---|
| Production | `https://pangolin.test01.ztguard.net/ztguard` |
| Login page | `https://pangolin.test01.ztguard.net/ztguard/login` |

---

## Admin Credentials

| Field | Value |
|---|---|
| Username | *(single password — no username)* |
| Default Password | `ztguard-admin-2026` |
| Set via | `ADMIN_PASSWORD` in `.env` file |

> **Change the default password before deploying to production.**
> Update `ADMIN_PASSWORD` in `.env`, then restart the container.

---

## Environment Variables (.env)

Copy `ztguard-portal/.env.example` to `ztguard-portal/.env` and fill in:

```env
ADMIN_PASSWORD=ztguard-admin-2026          # ← CHANGE THIS
SESSION_SECRET=658c3a5b05437da8e5b18424dd674244e363be82dc1a601f56297b5d5ed8ea0b78b061012e5802e23711958b95cef4e2
PANGOLIN_API_URL=https://pangolin.test01.ztguard.net/v1
PANGOLIN_API_KEY=<create in Pangolin dashboard>
PANGOLIN_ORG_ID=<your org ID from Pangolin>
PORT=3100
BASE_PATH=/ztguard
POLL_INTERVAL_SECONDS=30
```

### Generate SESSION_SECRET

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

---

## Pangolin API Key Setup

1. Log into the Pangolin dashboard at `https://pangolin.test01.ztguard.net`
2. Go to **Organization → API Keys**
3. Click **Create API Key**
4. Name it `ztguard-portal`
5. Grant permissions: **Read** on Logs (request, action, access, connection)
6. Copy the key → paste as `PANGOLIN_API_KEY` in `.env`

### Find Your Org ID

In the Pangolin dashboard URL when viewing your org:
`/org/<YOUR_ORG_ID>/...`

Or go to **Organization → Settings** — the Org ID is displayed there.

---

## Git Repository

| Field | Value |
|---|---|
| Repo | `https://github.com/DialogueDynamicsAI/ZTGUARD-DASHBOARD.git` |
| SSH remote | `git@github-ztguard:DialogueDynamicsAI/ZTGUARD-DASHBOARD.git` |
| Deploy key (private) | `/root/.ssh/ztguard_dashboard_deploy` (on VPS) |
| Deploy key (public) | `ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFPaOr7MyrT/McwND2CB1M0Cu3wnWN9roq3nXdMOyfR9 ztguard-dashboard-deploy` |
| SSH config alias | `github-ztguard` in `/root/.ssh/config` |

### Push code from VPS

```bash
ssh ztguard-test01

# One-time setup: init git in the portal folder
cd /opt/ztguard-portal
git init
git remote add origin git@github-ztguard:DialogueDynamicsAI/ZTGUARD-DASHBOARD.git
git add .
git commit -m "Initial ZTGuard Extended Settings Portal"
git push -u origin main

# Future pushes after changes
git add .
git commit -m "describe changes"
git push
```

### Push code from local machine (Windows)

```bash
cd "C:/Users/JamieLove/OneDrive - Matrix It/DATA/DEV/SRMECHANICAL-Pangolin/ztguard extended settings"
git init
git remote add origin https://github.com/DialogueDynamicsAI/ZTGUARD-DASHBOARD.git
git add .
git commit -m "Initial ZTGuard Extended Settings Portal"
git push -u origin main
```

### Add deploy key to GitHub

1. Go to `https://github.com/DialogueDynamicsAI/ZTGUARD-DASHBOARD/settings/keys`
2. Click **Add deploy key**
3. Title: `ztguard-vps-deploy`
4. Key: `ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFPaOr7MyrT/McwND2CB1M0Cu3wnWN9roq3nXdMOyfR9 ztguard-dashboard-deploy`
5. Check **Allow write access** → **Add key**

---

## Deployment on VPS

### Step 1 — Copy files to VPS

```bash
scp -r "ztguard-portal/" root@155.138.199.100:/opt/ztguard-portal/
```

### Step 2 — Create .env

```bash
ssh root@155.138.199.100
cd /opt/ztguard-portal
cp .env.example .env
nano .env     # fill in all values
```

### Step 3 — Start the container

```bash
cd /opt/ztguard-portal
docker compose up -d --build
```

### Step 4 — Install Traefik routing

```bash
cp traefik/dynamic/ztguard-portal.yml /opt/pangolin/traefik/dynamic/ztguard-portal.yml
# Traefik picks this up automatically — no restart needed
```

### Step 5 — Verify

```bash
docker compose ps              # ztguard-portal should be "Up"
docker compose logs --tail=20  # check for startup errors
```

Visit `https://pangolin.test01.ztguard.net/ztguard` — you should see the login page.

---

## Container Management

```bash
# View logs
docker compose -f /opt/ztguard-portal/docker-compose.yml logs -f

# Restart
docker compose -f /opt/ztguard-portal/docker-compose.yml restart

# Update (after code changes)
docker compose -f /opt/ztguard-portal/docker-compose.yml up -d --build

# Stop
docker compose -f /opt/ztguard-portal/docker-compose.yml down
```

---

## Data Persistence

SQLite database is stored at `/opt/ztguard-portal/data/state.db` (mounted as Docker volume).
Sessions stored at `/opt/ztguard-portal/data/sessions.db`.

Back these up before updating the container.

---

## Security Notes

- Session expires after **24 hours**
- Password is bcrypt-hashed (cost 12) at container startup
- All routes except `/ztguard/login` require authentication
- API key is never exposed to the browser frontend
- `.env` is excluded from git via `.gitignore`

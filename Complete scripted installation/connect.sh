#!/usr/bin/env bash
# =============================================================================
# ZTGuard Connect — links ZTGuard to your Pangolin server
# Run ONCE after completing Pangolin initial setup (admin account + org created)
#
# Usage:
#   bash /opt/ztguard-portal/connect.sh
# =============================================================================
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; BOLD='\033[1m'; NC='\033[0m'

info()    { echo -e "${BLUE}[ztguard]${NC} $*"; }
success() { echo -e "${GREEN}[ztguard]${NC} $*"; }
warn()    { echo -e "${YELLOW}[ztguard]${NC} $*"; }
error()   { echo -e "${RED}[ztguard] ERROR:${NC} $*"; exit 1; }

[[ $EUID -eq 0 ]] || error "Run as root (sudo)"

INSTALL_DIR="/opt/ztguard-portal"
[[ -d "$INSTALL_DIR" ]] || error "ZTGuard is not installed at $INSTALL_DIR — run install.sh first"

# Read install info
PANGOLIN_DOMAIN=""
PANGOLIN_DIR="/opt/pangolin"
if [[ -f "$INSTALL_DIR/.install-info" ]]; then
    source "$INSTALL_DIR/.install-info" 2>/dev/null || true
fi

[[ -n "$PANGOLIN_DOMAIN" ]] || error "Cannot determine Pangolin domain. Re-run install.sh first."

echo ""
echo -e "${BOLD}${BLUE}ZTGuard Connect — linking to Pangolin${NC}"
echo ""

# ── Check Pangolin is running ──────────────────────────────────────────────────
info "Checking Pangolin status..."
docker inspect pangolin >/dev/null 2>&1 || error "Pangolin container not running"

STATUS=$(docker inspect pangolin --format '{{.State.Health.Status}}' 2>/dev/null || echo "unknown")
if [[ "$STATUS" != "healthy" ]]; then
    info "Waiting for Pangolin to be healthy..."
    for i in $(seq 1 30); do
        STATUS=$(docker inspect pangolin --format '{{.State.Health.Status}}' 2>/dev/null || echo "unknown")
        [[ "$STATUS" == "healthy" ]] && break
        sleep 2
    done
fi
success "Pangolin is running"

# ── Check org exists ───────────────────────────────────────────────────────────
info "Checking Pangolin organization..."
ORG_CHECK=$(docker exec pangolin node -e "
const db = require('/app/node_modules/better-sqlite3')('/app/config/db/db.sqlite', {readonly: true});
const org = db.prepare('SELECT orgId, name FROM orgs LIMIT 1').get();
if (org) console.log(org.orgId + '|' + org.name);
else console.log('NONE');
db.close();
" 2>/dev/null || echo "ERROR")

if [[ "$ORG_CHECK" == "NONE" || "$ORG_CHECK" == "ERROR" ]]; then
    error "No organization found in Pangolin.
  Complete the Pangolin initial setup first:
    1. Open https://${PANGOLIN_DOMAIN}/auth/initial-setup
    2. Create your admin account
    3. Create your first organization
  Then re-run this script."
fi

PANGOLIN_ORG_ID=$(echo "$ORG_CHECK" | cut -d'|' -f1)
PANGOLIN_ORG_NAME=$(echo "$ORG_CHECK" | cut -d'|' -f2)
success "Found org: ${PANGOLIN_ORG_NAME} (${PANGOLIN_ORG_ID})"

# ── Create API key in Pangolin ─────────────────────────────────────────────────
info "Creating API key in Pangolin..."

cat > /tmp/ztguard_connect_$$.mjs << 'JSEOF'
import { createRequire } from 'module';
import { randomBytes } from 'crypto';
import { hash } from '/app/node_modules/@node-rs/argon2/index.js';
const require = createRequire(import.meta.url);
const Database = require('/app/node_modules/better-sqlite3');
const db = new Database('/app/config/db/db.sqlite');
const org = db.prepare("SELECT orgId FROM orgs LIMIT 1").get();
if (!org) { console.log('NO_ORG'); db.close(); process.exit(1); }
const rawToken = 'ztg_' + randomBytes(24).toString('hex');
const keyHash = await hash(rawToken);
const keyId = 'ztguard-portal';
db.prepare("DELETE FROM apiKeys WHERE apiKeyId=?").run(keyId);
db.prepare("DELETE FROM apiKeyOrg WHERE apiKeyId=?").run(keyId);
db.prepare("DELETE FROM apiKeyActions WHERE apiKeyId=?").run(keyId);
db.prepare("INSERT INTO apiKeys (apiKeyId,name,apiKeyHash,lastChars,dateCreated,isRoot) VALUES (?,?,?,?,?,1)")
  .run(keyId,'ztguard-portal',keyHash,rawToken.slice(-4),new Date().toISOString());
try { db.prepare("INSERT OR IGNORE INTO apiKeyOrg (apiKeyId,orgId) VALUES (?,?)").run(keyId,org.orgId); } catch(e) {}
const actions = db.prepare("SELECT actionId FROM actions").all();
for (const a of actions) { try { db.prepare("INSERT OR IGNORE INTO apiKeyActions (apiKeyId,actionId) VALUES (?,?)").run(keyId,a.actionId); } catch(e) {} }
console.log('KEY='+keyId+'.'+rawToken);
console.log('ORG='+org.orgId);
db.close();
JSEOF

docker cp /tmp/ztguard_connect_$$.mjs pangolin:/app/ztguard_connect.mjs
KEYGEN=$(docker exec pangolin node /app/ztguard_connect.mjs 2>/dev/null || echo "")
docker exec pangolin rm -f /app/ztguard_connect.mjs
rm -f /tmp/ztguard_connect_$$.mjs

if ! echo "$KEYGEN" | grep -q "^KEY="; then
    error "Failed to create API key. Check: docker logs pangolin"
fi

API_KEY=$(echo "$KEYGEN" | grep "^KEY=" | cut -d= -f2-)
ORG_ID=$(echo "$KEYGEN" | grep "^ORG=" | cut -d= -f2)
success "API key created for org: $ORG_ID"

# ── Write connection config to ZTGuard DB ─────────────────────────────────────
info "Configuring ZTGuard connection..."

docker exec ztguard-portal node -e "
const Database = require('/app/node_modules/better-sqlite3');
const db = new Database('/app/data/state.db');
const set = (k,v) => db.prepare('INSERT INTO app_config (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(k,v);
set('pangolin_url',     'https://${PANGOLIN_DOMAIN}');
set('pangolin_api_key', '${API_KEY}');
set('pangolin_org_id',  '${ORG_ID}');
set('poll_interval',    '30');
console.log('Done');
db.close();
" 2>/dev/null || error "Could not write to ZTGuard database"

success "Connection settings saved"

# ── Restart ZTGuard to apply ───────────────────────────────────────────────────
info "Restarting ZTGuard portal to apply settings..."
docker restart ztguard-portal
sleep 4

# ── Verify connection ──────────────────────────────────────────────────────────
info "Testing connection..."
sleep 3
LOGS=$(docker logs ztguard-portal --since 10s 2>&1 | grep -i 'poll\|connect\|error' | tail -3)
echo "$LOGS"

echo ""
echo -e "${GREEN}${BOLD}"
echo "  ╔══════════════════════════════════════════════════════════════╗"
echo "  ║   ZTGuard connected to Pangolin!                            ║"
echo "  ╠══════════════════════════════════════════════════════════════╣"
echo -e "  ║   ${NC}${BOLD}Portal:${NC}  https://${PANGOLIN_DOMAIN}/ztguard"
echo -e "  ║   ${NC}${BOLD}Org:${NC}     ${PANGOLIN_ORG_NAME} (${ORG_ID})"
echo "  ╚══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

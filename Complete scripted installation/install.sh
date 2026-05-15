#!/usr/bin/env bash
# =============================================================================
# ZTGuard Dashboard Installer
# Installs the ZTGuard Extended Settings Portal alongside an existing Pangolin
# server. Run as root on the same VPS as your Pangolin installation.
#
# Usage:
#   curl -fsSL "https://raw.githubusercontent.com/DialogueDynamicsAI/ZTGUARD-DASHBOARD/main/Complete%20scripted%20installation/install.sh" | bash
#   # or
#   bash install.sh
# =============================================================================
set -euo pipefail

ZTGUARD_VERSION="latest"
INSTALL_DIR="/opt/ztguard-portal"
BRANDING_DIR="/opt/pangolin-branding"
REPO_URL="https://github.com/DialogueDynamicsAI/ZTGUARD-DASHBOARD"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-/dev/stdin}")" 2>/dev/null && pwd || echo /tmp)"

# ── Colours ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

info()    { echo -e "${BLUE}[ztguard]${NC} $*"; }
success() { echo -e "${GREEN}[ztguard]${NC} $*"; }
warn()    { echo -e "${YELLOW}[ztguard]${NC} $*"; }
error()   { echo -e "${RED}[ztguard] ERROR:${NC} $*"; exit 1; }
step()    { echo -e "\n${BOLD}${CYAN}▶ $*${NC}"; }

# ── Banner ─────────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${CYAN}"
echo "  ╔══════════════════════════════════════════════════╗"
echo "  ║   ZTGuard Extended Settings — Dashboard         ║"
echo "  ║   Installer v${ZTGUARD_VERSION}                               ║"
echo "  ╚══════════════════════════════════════════════════╝"
echo -e "${NC}"

# ── Root check ─────────────────────────────────────────────────────────────────
[[ $EUID -eq 0 ]] || error "This installer must be run as root (use sudo)"

# ── Prerequisite checks ────────────────────────────────────────────────────────
step "Checking prerequisites..."
command -v docker   >/dev/null 2>&1 || error "Docker is not installed. Install it first: https://docs.docker.com/engine/install/"
command -v python3  >/dev/null 2>&1 || error "Python3 is required. Install: apt install -y python3"
command -v openssl  >/dev/null 2>&1 || error "OpenSSL is required. Install: apt install -y openssl"
success "Prerequisites OK"

# ── Ensure hairpin NAT so ZTGuard can reach Pangolin via public HTTPS URL ─────
# Without this, Docker containers can't connect back to the host's own public IP
SERVER_IP=$(curl -s4 ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')
if [[ -n "$SERVER_IP" ]]; then
    iptables -t nat -A POSTROUTING -s 172.18.0.0/16 -d "$SERVER_IP" -j MASQUERADE 2>/dev/null || true
    iptables -I FORWARD 1 -s 172.18.0.0/16 -j ACCEPT 2>/dev/null || true
    # Persist if iptables-persistent is available
    iptables-save > /etc/iptables/rules.v4 2>/dev/null || true
    info "Hairpin NAT configured for $SERVER_IP"
fi

# ── Detect Pangolin installation ──────────────────────────────────────────────
step "Detecting Pangolin installation..."

PANGOLIN_DIR=""
for candidate in /opt/pangolin /opt/pangolin-ce /home/pangolin; do
    if [[ -f "$candidate/docker-compose.yml" ]] && grep -q "pangolin" "$candidate/docker-compose.yml" 2>/dev/null; then
        PANGOLIN_DIR="$candidate"
        break
    fi
done

if [[ -z "$PANGOLIN_DIR" ]]; then
    warn "Could not auto-detect Pangolin installation."
    read -rp "  Enter Pangolin installation path [/opt/pangolin]: " input_dir < /dev/tty
    PANGOLIN_DIR="${input_dir:-/opt/pangolin}"
    [[ -f "$PANGOLIN_DIR/docker-compose.yml" ]] || error "No docker-compose.yml found at $PANGOLIN_DIR"
fi
success "Found Pangolin at: $PANGOLIN_DIR"

# ── Read Pangolin config ──────────────────────────────────────────────────────
PANGOLIN_CONFIG="$PANGOLIN_DIR/config/config.yml"
PANGOLIN_COMPOSE="$PANGOLIN_DIR/docker-compose.yml"
TRAEFIK_DYNAMIC_DIR="$PANGOLIN_DIR/config/traefik"
TRAEFIK_DYNAMIC_CONFIG="$TRAEFIK_DYNAMIC_DIR/dynamic_config.yml"
PANGOLIN_DB_DIR="$PANGOLIN_DIR/config/db"

# Extract dashboard domain from config.yml
PANGOLIN_DOMAIN=""
if [[ -f "$PANGOLIN_CONFIG" ]]; then
    PANGOLIN_DOMAIN=$(grep "dashboard_url:" "$PANGOLIN_CONFIG" 2>/dev/null | head -1 | sed 's|.*https\?://||' | sed 's|/.*||' | tr -d ' "')
fi

if [[ -z "$PANGOLIN_DOMAIN" ]]; then
    warn "Could not auto-detect domain from Pangolin config."
    read -rp "  Enter your Pangolin domain (e.g. ztna.example.com): " PANGOLIN_DOMAIN < /dev/tty
    [[ -n "$PANGOLIN_DOMAIN" ]] || error "Domain is required"
fi
success "Domain: $PANGOLIN_DOMAIN"

# Extract Docker network name
DOCKER_NETWORK=$(grep "name:" "$PANGOLIN_COMPOSE" 2>/dev/null | grep -v "^#" | head -1 | awk '{print $2}' | tr -d '"' || echo "pangolin")
DOCKER_NETWORK="${DOCKER_NETWORK:-pangolin}"
success "Docker network: $DOCKER_NETWORK"

# ── Check for existing install ─────────────────────────────────────────────────
step "Checking for existing installation..."
if [[ -d "$INSTALL_DIR" ]]; then
    warn "ZTGuard portal already installed at $INSTALL_DIR"
    read -rp "  Overwrite existing installation? [y/N]: " overwrite < /dev/tty
    if [[ "${overwrite,,}" != "y" ]]; then
        info "Exiting without changes."
        exit 0
    fi
    info "Stopping existing container..."
    cd "$INSTALL_DIR" && docker compose down 2>/dev/null || true
fi

# ── Admin password ─────────────────────────────────────────────────────────────
step "Setting admin credentials..."
echo ""
echo "  Choose an admin password for the ZTGuard dashboard."
echo "  (Press ENTER to generate a secure random password)"
echo ""
# Read from /dev/tty so it works whether piped or run directly
if [[ -t 0 ]]; then
    read -rsp "  Admin password: " ADMIN_PASSWORD < /dev/tty
    echo ""
else
    read -rsp "  Admin password: " ADMIN_PASSWORD < /dev/tty 2>/dev/null || ADMIN_PASSWORD=""
    echo ""
fi
if [[ -z "$ADMIN_PASSWORD" ]]; then
    ADMIN_PASSWORD=$(openssl rand -base64 16 | tr -d '+/=' | head -c 16)
    warn "Generated password: ${BOLD}${ADMIN_PASSWORD}${NC}"
    warn "Save this — it will not be shown again."
fi

SESSION_SECRET=$(openssl rand -hex 48)

# ── Create directories ─────────────────────────────────────────────────────────
step "Creating installation directories..."
mkdir -p "$INSTALL_DIR/data"
mkdir -p "$BRANDING_DIR/logos"
success "Created $INSTALL_DIR and $BRANDING_DIR"

# ── Download portal source ─────────────────────────────────────────────────────
step "Downloading ZTGuard portal..."

# Check if running from the repo directory (dev mode)
if [[ -f "$SCRIPT_DIR/ztguard-portal/package.json" ]]; then
    info "Running from source — using local copy"
    cp -r "$SCRIPT_DIR/ztguard-portal/"* "$INSTALL_DIR/"
elif command -v git >/dev/null 2>&1; then
    info "Cloning from GitHub..."
    git clone --depth 1 "$REPO_URL" /tmp/ztguard-install 2>/dev/null || \
        error "Failed to clone from $REPO_URL"
    cp -r /tmp/ztguard-install/ztguard-portal/* "$INSTALL_DIR/"
    rm -rf /tmp/ztguard-install
else
    error "Cannot download portal — install git or run from the repo directory"
fi
success "Portal source ready at $INSTALL_DIR"

# ── Write .env ─────────────────────────────────────────────────────────────────
step "Writing configuration..."
cat > "$INSTALL_DIR/.env" << EOF
# ZTGuard Extended Settings — generated by install.sh $(date -u +"%Y-%m-%dT%H:%M:%SZ")
ADMIN_PASSWORD=${ADMIN_PASSWORD}
SESSION_SECRET=${SESSION_SECRET}
PORT=3100
BASE_PATH=/ztguard
POLL_INTERVAL_SECONDS=30
DATA_DIR=/app/data
PANGOLIN_DB_PATH=/app/pangolin-db/db.sqlite
BRAND_LOGOS_DIR=/app/brand-logos
PANGOLIN_CSS_PATH=/app/pangolin-css/PLACEHOLDER.css
EOF
chmod 600 "$INSTALL_DIR/.env"

# ── Write docker-compose.yml ───────────────────────────────────────────────────
# Find the template (next to install.sh, or in install/ subdirectory)
COMPOSE_TEMPLATE=""
for t in "$SCRIPT_DIR/install/docker-compose.template.yml" \
          "$SCRIPT_DIR/docker-compose.template.yml" \
          "/tmp/ztguard-install/install/docker-compose.template.yml"; do
    [[ -f "$t" ]] && COMPOSE_TEMPLATE="$t" && break
done

if [[ -n "$COMPOSE_TEMPLATE" ]]; then
    sed \
        -e "s|{{BRANDING_DIR}}|$BRANDING_DIR|g" \
        -e "s|{{PANGOLIN_DB_DIR}}|$PANGOLIN_DB_DIR|g" \
        -e "s|{{PANGOLIN_DIR}}|$PANGOLIN_DIR|g" \
        -e "s|{{DOCKER_NETWORK}}|$DOCKER_NETWORK|g" \
        "$COMPOSE_TEMPLATE" > "$INSTALL_DIR/docker-compose.yml"
else
    # Inline template fallback
    cat > "$INSTALL_DIR/docker-compose.yml" << EOF
version: "3.8"
services:
  ztguard-portal:
    build: .
    container_name: ztguard-portal
    restart: unless-stopped
    env_file: .env
    volumes:
      - ./data:/app/data
      - ${BRANDING_DIR}/logos:/app/brand-logos
      - ${BRANDING_DIR}:/app/pangolin-css
      - ${PANGOLIN_DB_DIR}:/app/pangolin-db:ro
      - ${PANGOLIN_DIR}/config:/app/pangolin-config
      - /var/run/docker.sock:/var/run/docker.sock
    networks:
      - ${DOCKER_NETWORK}
    labels:
      - "traefik.enable=false"
networks:
  ${DOCKER_NETWORK}:
    external: true
EOF
fi
success "Configuration written"

# ── Apply branding patches ─────────────────────────────────────────────────────
step "Applying branding patches to Pangolin..."

# Find or download the patch script
PATCH_SCRIPT=""
for p in "$SCRIPT_DIR/install/patch-branding.sh" \
          "$SCRIPT_DIR/patch-branding.sh" \
          "$INSTALL_DIR/install/patch-branding.sh"; do
    [[ -f "$p" ]] && PATCH_SCRIPT="$p" && break
done

# If not found locally, try to download it
if [[ -z "$PATCH_SCRIPT" ]]; then
    PATCH_SCRIPT="/tmp/ztguard-patch-branding-$$.sh"
    info "Downloading patch-branding.sh from GitHub..."
    if curl -fsSL "${REPO_URL}/raw/main/Complete%20scripted%20installation/install/patch-branding.sh" -o "$PATCH_SCRIPT" 2>/dev/null; then
        sed -i 's/\r//' "$PATCH_SCRIPT"  # strip Windows CRLF if present
        chmod +x "$PATCH_SCRIPT"
    else
        rm -f "$PATCH_SCRIPT"
        PATCH_SCRIPT=""
    fi
fi

if [[ -n "$PATCH_SCRIPT" ]]; then
    chmod +x "$PATCH_SCRIPT"
    bash "$PATCH_SCRIPT" "$PANGOLIN_DIR" "$BRANDING_DIR" "pangolin" || \
        warn "Branding patch had warnings — continuing"
else
    warn "Branding patches skipped — apply later: curl -fsSL \"${REPO_URL}/raw/main/Complete%20scripted%20installation/install/patch-branding.sh\" | bash -s $PANGOLIN_DIR $BRANDING_DIR"
fi

# Update PANGOLIN_CSS_PATH with actual hash
CSS_HASH=$(cat "$BRANDING_DIR/.css-hash" 2>/dev/null || echo "")
if [[ -n "$CSS_HASH" ]]; then
    sed -i "s|PLACEHOLDER.css|${CSS_HASH}.css|g" "$INSTALL_DIR/.env"
    success "CSS hash: $CSS_HASH"
fi

# ── Add Traefik route ──────────────────────────────────────────────────────────
step "Configuring Traefik routing..."
mkdir -p "$TRAEFIK_DYNAMIC_DIR"

if [[ -f "$TRAEFIK_DYNAMIC_CONFIG" ]] && grep -q "ztguard-portal" "$TRAEFIK_DYNAMIC_CONFIG" 2>/dev/null; then
    warn "ZTGuard Traefik route already exists — skipping"
else
    # Find the route template
    ROUTE_TEMPLATE=""
    for t in "$SCRIPT_DIR/install/traefik-route.template.yml" \
              "$SCRIPT_DIR/traefik-route.template.yml"; do
        [[ -f "$t" ]] && ROUTE_TEMPLATE="$t" && break
    done

    if [[ -f "$TRAEFIK_DYNAMIC_CONFIG" ]]; then
        # Write Python script to temp file (avoids bash heredoc mangling backticks)
        TRAEFIK_PY="/tmp/ztguard_traefik_$$.py"
        cat > "$TRAEFIK_PY" << 'PYEOF'
import sys
domain = sys.argv[1]
config_file = sys.argv[2]
bt = chr(96)

with open(config_file) as f:
    content = f.read()

router_entry = """
    ztguard-portal:
      rule: "Host({bt}{domain}{bt}) && PathPrefix({bt}/ztguard{bt})"
      entryPoints:
        - websecure
      priority: 200
      service: ztguard-portal-svc
      tls:
        certResolver: letsencrypt
    integration-api-router:
      rule: "Host({bt}{domain}{bt}) && PathPrefix({bt}/v1{bt})"
      service: integration-api-service
      entryPoints:
        - websecure
      priority: 150
      tls:
        certResolver: letsencrypt
""".format(bt=bt, domain=domain)

service_entry = """
    ztguard-portal-svc:
      loadBalancer:
        servers:
          - url: "http://ztguard-portal:3100"
    integration-api-service:
      loadBalancer:
        servers:
          - url: "http://pangolin:3003"
"""

if 'routers:' in content and 'ztguard-portal' not in content:
    content = content.replace('  routers:', '  routers:' + router_entry, 1)

# Check for the service *definition* (loadBalancer), not the router's service: reference
if 'ztguard-portal-svc:' not in content:
    if 'services:' in content:
        content = content.replace('  services:', '  services:' + service_entry, 1)
    else:
        # No services: section exists — append one inside the http: block
        content = content.rstrip() + '\n  services:' + service_entry

with open(config_file, 'w') as f:
    f.write(content)
print('  ZTGuard route added to dynamic_config.yml')
PYEOF
        python3 "$TRAEFIK_PY" "$PANGOLIN_DOMAIN" "$TRAEFIK_DYNAMIC_CONFIG"
        rm -f "$TRAEFIK_PY"
    else
        # Create standalone route file
        cat > "$TRAEFIK_DYNAMIC_DIR/ztguard-portal.yml" << EOF
http:
  routers:
    ztguard-portal:
      rule: "Host(\`${PANGOLIN_DOMAIN}\`) && PathPrefix(\`/ztguard\`)"
      entryPoints:
        - websecure
      priority: 200
      service: ztguard-portal-svc
      tls:
        certResolver: letsencrypt
  services:
    ztguard-portal-svc:
      loadBalancer:
        servers:
          - url: "http://ztguard-portal:3100"
EOF
        info "Created standalone Traefik route at $TRAEFIK_DYNAMIC_DIR/ztguard-portal.yml"
    fi
    success "Traefik route configured"
fi

# ── Enable Pangolin flags (integration API + disable public signup) ────────────
step "Configuring Pangolin flags..."
if [[ -f "$PANGOLIN_CONFIG" ]]; then
    # Build list of flags that need to be added
    FLAGS_TO_ADD=()
    grep -q "enable_integration_api" "$PANGOLIN_CONFIG" 2>/dev/null \
        && info "enable_integration_api already set in config.yml" \
        || FLAGS_TO_ADD+=("enable_integration_api: true")
    grep -q "disable_signup_without_invite" "$PANGOLIN_CONFIG" 2>/dev/null \
        && info "disable_signup_without_invite already set in config.yml" \
        || FLAGS_TO_ADD+=("disable_signup_without_invite: true")

    if [[ ${#FLAGS_TO_ADD[@]} -gt 0 ]]; then
        if grep -q "^flags:" "$PANGOLIN_CONFIG" 2>/dev/null; then
            python3 - << PYEOF
with open('$PANGOLIN_CONFIG') as f:
    content = f.read()
import re
flags_to_add = [$(printf '"%s",' "${FLAGS_TO_ADD[@]}")]
insert = ''.join(f'    {flag}\n' for flag in flags_to_add)
content = re.sub(r'(^flags:\s*\n)', r'\1' + insert, content, flags=re.MULTILINE)
with open('$PANGOLIN_CONFIG', 'w') as f:
    f.write(content)
print('  Added flags: ' + ', '.join(flags_to_add))
PYEOF
        else
            {
                printf '\nflags:\n'
                for flag in "${FLAGS_TO_ADD[@]}"; do
                    printf '    %s\n' "$flag"
                done
            } >> "$PANGOLIN_CONFIG"
            info "Added flags section to config.yml"
        fi
        success "Pangolin flags configured"
    fi
fi

# ── Restart Pangolin to apply patches + integration API ───────────────────────
step "Restarting Pangolin..."
cd "$PANGOLIN_DIR"
docker compose up -d pangolin 2>&1 | tail -3
success "Pangolin restarted"

# Wait for Pangolin to be healthy before creating API key
info "Waiting for Pangolin to be ready..."
for i in $(seq 1 30); do
    STATUS=$(docker inspect pangolin --format '{{.State.Health.Status}}' 2>/dev/null || echo "unknown")
    [[ "$STATUS" == "healthy" ]] && break
    sleep 2
done

# ── Auto-create Pangolin API key and detect org ────────────────────────────────
step "Connecting ZTGuard to Pangolin..."
PANGOLIN_API_KEY=""
PANGOLIN_ORG_ID=""

# Write key-creation script to temp file inside the container
KEYGEN_SCRIPT="/tmp/ztguard_keygen_$$.mjs"
docker exec pangolin sh -c "cat > $KEYGEN_SCRIPT" << 'JSEOF'
import { createRequire } from 'module';
import { randomBytes } from 'crypto';
import { hash } from '/app/node_modules/@node-rs/argon2/index.js';
const require = createRequire(import.meta.url);
const Database = require('/app/node_modules/better-sqlite3');

const db = new Database('/app/config/db/db.sqlite');
const keyId = 'ztguard-portal';
const rawToken = 'ztg_' + randomBytes(24).toString('hex');
const now = new Date().toISOString();

// Get first org
const org = db.prepare("SELECT orgId FROM orgs LIMIT 1").get();
const orgId = org ? org.orgId : null;

if (!orgId) {
  console.log('NO_ORG');
  db.close();
  process.exit(0);
}

// Create/replace API key
const keyHash = await hash(rawToken);
db.prepare("DELETE FROM apiKeys WHERE apiKeyId = ?").run(keyId);
db.prepare("DELETE FROM apiKeyOrg WHERE apiKeyId = ?").run(keyId);
db.prepare("DELETE FROM apiKeyActions WHERE apiKeyId = ?").run(keyId);

db.prepare("INSERT INTO apiKeys (apiKeyId, name, apiKeyHash, lastChars, dateCreated, isRoot) VALUES (?, ?, ?, ?, ?, 1)")
  .run(keyId, 'ztguard-portal', keyHash, rawToken.slice(-4), now);

try { db.prepare("INSERT OR IGNORE INTO apiKeyOrg (apiKeyId, orgId) VALUES (?, ?)").run(keyId, orgId); } catch(e) {}

const actions = db.prepare("SELECT actionId FROM actions").all();
for (const a of actions) {
  try { db.prepare("INSERT OR IGNORE INTO apiKeyActions (apiKeyId, actionId) VALUES (?, ?)").run(keyId, a.actionId); } catch(e) {}
}

console.log('KEY=' + keyId + '.' + rawToken);
console.log('ORG=' + orgId);
db.close();
JSEOF

# Execute the script inside the Pangolin container
KEYGEN_OUTPUT=$(docker exec pangolin node "$KEYGEN_SCRIPT" 2>/dev/null || echo "")
docker exec pangolin rm -f "$KEYGEN_SCRIPT" 2>/dev/null || true

if echo "$KEYGEN_OUTPUT" | grep -q "^KEY="; then
    PANGOLIN_API_KEY=$(echo "$KEYGEN_OUTPUT" | grep "^KEY=" | cut -d= -f2-)
    PANGOLIN_ORG_ID=$(echo "$KEYGEN_OUTPUT" | grep "^ORG=" | cut -d= -f2)
    success "API key created for org: $PANGOLIN_ORG_ID"
elif echo "$KEYGEN_OUTPUT" | grep -q "NO_ORG"; then
    warn "No Pangolin org found — connection settings need manual setup after install"
else
    warn "Could not auto-create API key — configure Connection Settings manually in the portal"
fi

# ── Build and start ZTGuard portal ────────────────────────────────────────────
step "Starting ZTGuard portal..."
cd "$INSTALL_DIR"
docker compose up -d --build 2>&1 | tail -5

# ── Pre-configure ZTGuard connection settings (if API key was created) ─────────
if [[ -n "$PANGOLIN_API_KEY" && -n "$PANGOLIN_ORG_ID" ]]; then
    info "Pre-configuring ZTGuard connection to Pangolin..."
    # Wait a moment for the DB to initialize
    sleep 4
    docker exec ztguard-portal node -e "
const Database = require('/app/node_modules/better-sqlite3');
const db = new Database('/app/data/state.db');
const set = (k, v) => db.prepare('INSERT INTO app_config (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(k, v);
set('pangolin_url',     'https://${PANGOLIN_DOMAIN}');
set('pangolin_api_key', '${PANGOLIN_API_KEY}');
set('pangolin_org_id',  '${PANGOLIN_ORG_ID}');
set('poll_interval',    '30');
console.log('Connection pre-configured');
db.close();
" 2>/dev/null && success "ZTGuard pre-connected to Pangolin (org: $PANGOLIN_ORG_ID)" || \
    warn "Pre-configuration skipped — set up manually in portal Connection Settings"

    # Restart portal so it picks up the new DB config
    docker restart ztguard-portal 2>/dev/null || true
    sleep 3
fi

# Wait for startup — portal is only accessible via Traefik (not on localhost directly)
info "Waiting for portal to start (checking via Traefik)..."
for i in $(seq 1 20); do
    HTTP_CODE=$(curl -sk -o /dev/null -w "%{http_code}" "https://${PANGOLIN_DOMAIN}/ztguard/login" 2>/dev/null || echo "000")
    if [[ "$HTTP_CODE" == "200" || "$HTTP_CODE" == "302" ]]; then
        success "Portal is live (HTTP $HTTP_CODE)"
        break
    fi
    info "  attempt $i: HTTP $HTTP_CODE — waiting..."
    sleep 3
done

HTTP_CODE=$(curl -sk -o /dev/null -w "%{http_code}" "https://${PANGOLIN_DOMAIN}/ztguard/login" 2>/dev/null || echo "000")
if [[ "$HTTP_CODE" != "200" && "$HTTP_CODE" != "302" ]]; then
    warn "Portal not responding (HTTP $HTTP_CODE). Check: docker logs ztguard-portal"
fi

# ── Save install record ────────────────────────────────────────────────────────
cat > "$INSTALL_DIR/.install-info" << EOF
INSTALLED_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
PANGOLIN_DIR=$PANGOLIN_DIR
PANGOLIN_DOMAIN=$PANGOLIN_DOMAIN
DOCKER_NETWORK=$DOCKER_NETWORK
ZTGUARD_VERSION=$ZTGUARD_VERSION
PANGOLIN_ORG_ID=${PANGOLIN_ORG_ID}
EOF

# ── Success banner ─────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}"
echo "  ╔══════════════════════════════════════════════════════════════╗"
echo "  ║   ZTGuard Dashboard installed successfully!                 ║"
echo "  ╠══════════════════════════════════════════════════════════════╣"
echo -e "  ║   ${NC}${BOLD}Portal URL:${NC}  https://${PANGOLIN_DOMAIN}/ztguard"
echo -e "  ║   ${NC}${BOLD}Password:${NC}    ${ADMIN_PASSWORD}"
if [[ -n "$PANGOLIN_ORG_ID" ]]; then
echo -e "  ║   ${NC}${GREEN}✓ Auto-connected to Pangolin (org: ${PANGOLIN_ORG_ID})${NC}"
fi
echo "  ╠══════════════════════════════════════════════════════════════╣"
echo "  ║   Open the portal and log in — it is ready to use!         ║"
if [[ -z "$PANGOLIN_ORG_ID" ]]; then
echo "  ║   Note: Set up Connection Settings after first login        ║"
fi
echo "  ╚══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"
echo "  To remove:  bash ${INSTALL_DIR}/uninstall.sh"
echo "  Logs:       docker logs ztguard-portal"
echo ""

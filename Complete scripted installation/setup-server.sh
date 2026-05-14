#!/usr/bin/env bash
# =============================================================================
# ZTGuard Server Setup
# Installs Docker + Pangolin on a fresh Debian/Ubuntu server.
# Called by bootstrap.sh — can also be run directly.
#
# Usage (after bootstrap.sh pulls the repo):
#   bash setup-server.sh
# =============================================================================
set -euo pipefail

PANGOLIN_VERSION="1.18.4"
PANGOLIN_DIR="/opt/pangolin"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

info()    { echo -e "${BLUE}[setup]${NC} $*"; }
success() { echo -e "${GREEN}[setup]${NC} $*"; }
warn()    { echo -e "${YELLOW}[setup]${NC} $*"; }
error()   { echo -e "${RED}[setup] ERROR:${NC} $*"; exit 1; }
step()    { echo -e "\n${BOLD}${CYAN}▶ $*${NC}"; }

echo ""
echo -e "${BOLD}${CYAN}"
echo "  ╔══════════════════════════════════════════════════╗"
echo "  ║   ZTGuard — Pangolin Server Setup               ║"
echo "  ╚══════════════════════════════════════════════════╝"
echo -e "${NC}"

[[ $EUID -eq 0 ]] || error "This script must be run as root (sudo)"

# ── Check OS ──────────────────────────────────────────────────────────────────
if ! grep -qiE 'debian|ubuntu' /etc/os-release 2>/dev/null; then
    warn "OS not detected as Debian/Ubuntu — proceeding anyway"
fi

# ── Collect inputs ────────────────────────────────────────────────────────────
step "Server Configuration"
echo "  Answer the prompts below. Press Enter to accept [defaults]."
echo ""

read -rp "  Server domain name (e.g. myserver.example.com): " DOMAIN < /dev/tty
[[ -n "$DOMAIN" ]] || error "Domain name is required"

read -rp "  Let's Encrypt email for SSL certificates: " LE_EMAIL < /dev/tty
[[ -n "$LE_EMAIL" ]] || error "Let's Encrypt email is required"

read -rp "  Pangolin admin email [admin@${DOMAIN}]: " ADMIN_EMAIL < /dev/tty
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@${DOMAIN}}"

read -rsp "  Pangolin admin password: " ADMIN_PASSWORD < /dev/tty; echo ""
if [[ -z "$ADMIN_PASSWORD" ]]; then
    ADMIN_PASSWORD=$(openssl rand -base64 16 | tr -d '+/=' | head -c 16)
    warn "Generated admin password: ${BOLD}${ADMIN_PASSWORD}${NC}  (save this!)"
fi

# Auto-suggest org ID from domain first subdomain
AUTO_ORG_ID=$(echo "$DOMAIN" | cut -d. -f1 | tr '[:upper:]' '[:lower:]' | tr -cd 'a-z0-9-')
read -rp "  Organization name [${DOMAIN}]: " ORG_NAME < /dev/tty
ORG_NAME="${ORG_NAME:-${DOMAIN}}"

read -rp "  Organization ID (short, no spaces) [${AUTO_ORG_ID}]: " ORG_ID < /dev/tty
ORG_ID="${ORG_ID:-${AUTO_ORG_ID}}"
ORG_ID=$(echo "$ORG_ID" | tr '[:upper:]' '[:lower:]' | tr -cd 'a-z0-9-')

SERVER_SECRET=$(openssl rand -base64 32 | tr -d '+/=')

echo ""
echo "  ─────────────────────────────────────────────────"
echo "  Domain:  $DOMAIN"
echo "  LE Email: $LE_EMAIL"
echo "  Admin:   $ADMIN_EMAIL"
echo "  Org:     $ORG_NAME ($ORG_ID)"
echo "  ─────────────────────────────────────────────────"
read -rp "  Continue? [Y/n]: " confirm < /dev/tty
[[ "${confirm,,}" != "n" ]] || { info "Aborted."; exit 0; }

# ── Install Docker ────────────────────────────────────────────────────────────
step "Installing Docker..."
if command -v docker >/dev/null 2>&1; then
    success "Docker already installed ($(docker --version | cut -d' ' -f3 | tr -d ','))"
else
    info "Downloading Docker installer..."
    curl -fsSL https://get.docker.com | sh
    systemctl enable --now docker
    success "Docker installed"
fi

# ── Install base packages ─────────────────────────────────────────────────────
step "Installing base packages..."
apt-get install -y curl wget git openssl python3 -qq 2>/dev/null
success "Base packages ready"

# ── Create Pangolin directories ───────────────────────────────────────────────
step "Creating Pangolin directories..."
mkdir -p "$PANGOLIN_DIR/config/traefik/logs"
mkdir -p "$PANGOLIN_DIR/config/letsencrypt"
mkdir -p "$PANGOLIN_DIR/config/db"
success "Directories created at $PANGOLIN_DIR"

# ── Write config.yml ──────────────────────────────────────────────────────────
step "Writing Pangolin configuration..."
cat > "$PANGOLIN_DIR/config/config.yml" << EOF
gerbil:
    start_port: 51820
    base_endpoint: "${DOMAIN}"

app:
    dashboard_url: "https://${DOMAIN}"
    log_level: "info"
    telemetry:
        anonymous_usage: false

domains:
    domain1:
        base_domain: "$(echo "$DOMAIN" | cut -d. -f2-)"
        cert_resolver: "letsencrypt"

server:
    secret: "${SERVER_SECRET}"
    cors:
        origins: ["https://${DOMAIN}"]
        methods: ["GET", "POST", "PUT", "DELETE", "PATCH"]
        allowed_headers: ["X-CSRF-Token", "Content-Type"]
        credentials: false

flags:
    require_email_verification: false
    disable_signup_without_invite: false
    disable_user_create_org: false
    allow_raw_resources: true
    hide_supporter_key: true
    enable_integration_api: true
EOF

# ── Write traefik_config.yml ──────────────────────────────────────────────────
cat > "$PANGOLIN_DIR/config/traefik/traefik_config.yml" << EOF
api:
  insecure: true
  dashboard: true

providers:
  http:
    endpoint: "http://pangolin:3001/api/v1/traefik-config"
    pollInterval: "5s"
  file:
    filename: "/etc/traefik/dynamic_config.yml"

experimental:
  plugins:
    badger:
      moduleName: "github.com/fosrl/badger"
      version: "v1.4.0"

log:
  level: "INFO"
  format: "common"

certificatesResolvers:
  letsencrypt:
    acme:
      httpChallenge:
        entryPoint: web
      email: "${LE_EMAIL}"
      storage: "/letsencrypt/acme.json"
      caServer: "https://acme-v02.api.letsencrypt.org/directory"

entryPoints:
  web:
    address: ":80"
  websecure:
    address: ":443"
    transport:
      respondingTimeouts:
        readTimeout: "30m"
    http3:
      advertisedPort: 443
    http:
      tls:
        certResolver: "letsencrypt"
  tcp-2222:
    address: ":2222/tcp"

serversTransport:
  insecureSkipVerify: true

ping:
  entryPoint: "web"
EOF

# ── Write dynamic_config.yml ─────────────────────────────────────────────────
# Uses Python to avoid backtick mangling in heredoc
python3 - << PYEOF
import sys
domain = '${DOMAIN}'
bt = chr(96)
content = f"""http:
  middlewares:
    badger:
      plugin:
        badger:
          disableForwardAuth: true
    redirect-to-https:
      redirectScheme:
        scheme: https
    no-cache-css:
      headers:
        customResponseHeaders:
          Cache-Control: "no-cache, must-revalidate"

  routers:
    main-app-router-redirect:
      rule: "Host({bt}{domain}{bt})"
      service: next-service
      entryPoints: [web]
      middlewares: [redirect-to-https, badger]

    next-router:
      rule: "Host({bt}{domain}{bt}) && !PathPrefix({bt}/api/v1{bt})"
      service: next-service
      entryPoints: [websecure]
      middlewares: [badger]
      tls:
        certResolver: letsencrypt

    api-router:
      rule: "Host({bt}{domain}{bt}) && PathPrefix({bt}/api/v1{bt})"
      service: api-service
      entryPoints: [websecure]
      middlewares: [badger]
      tls:
        certResolver: letsencrypt

    ztguard-css-override:
      rule: "Host({bt}{domain}{bt}) && (PathPrefix({bt}/_next/static/css/{bt}) || PathPrefix({bt}/_next/static/chunks/{bt}))"
      service: next-service
      entryPoints: [websecure]
      priority: 300
      middlewares: [no-cache-css]
      tls:
        certResolver: letsencrypt

  services:
    next-service:
      loadBalancer:
        servers:
          - url: "http://pangolin:3002"

    api-service:
      loadBalancer:
        servers:
          - url: "http://pangolin:3000"

tcp:
  serversTransports:
    pp-transport-v1:
      proxyProtocol:
        version: 1
    pp-transport-v2:
      proxyProtocol:
        version: 2
"""
with open('${PANGOLIN_DIR}/config/traefik/dynamic_config.yml', 'w') as f:
    f.write(content)
print('  dynamic_config.yml written')
PYEOF

# ── Write docker-compose.yml ──────────────────────────────────────────────────
cat > "$PANGOLIN_DIR/docker-compose.yml" << EOF
services:
  pangolin:
    image: docker.io/fosrl/pangolin:${PANGOLIN_VERSION}
    container_name: pangolin
    restart: unless-stopped
    volumes:
      - ./config:/app/config
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3001/api/v1/"]
      interval: "10s"
      timeout: "10s"
      retries: 15

  gerbil:
    image: docker.io/fosrl/gerbil:latest
    container_name: gerbil
    restart: unless-stopped
    depends_on:
      pangolin:
        condition: service_healthy
    command:
      - --reachableAt=http://gerbil:3004
      - --generateAndSaveKeyTo=/var/config/key
      - --remoteConfig=http://pangolin:3001/api/v1/
    volumes:
      - ./config/:/var/config
    cap_add: [NET_ADMIN, SYS_MODULE]
    ports:
      - 0.0.0.0:80:80/tcp
      - 0.0.0.0:443:443/tcp
      - 0.0.0.0:51820:51820/udp
      - 0.0.0.0:21820:21820/udp

  traefik:
    image: docker.io/traefik:v3.6
    container_name: traefik
    restart: unless-stopped
    network_mode: service:gerbil
    depends_on: [gerbil]
    command: [--configFile=/etc/traefik/traefik_config.yml]
    volumes:
      - ./config/traefik:/etc/traefik:ro
      - ./config/letsencrypt:/letsencrypt
      - ./config/traefik/logs:/var/log/traefik
      - /var/run/docker.sock:/var/run/docker.sock:ro

networks:
  default:
    driver: bridge
    name: pangolin
EOF

success "Configuration files written"

# ── Start Pangolin stack ──────────────────────────────────────────────────────
step "Pulling and starting Pangolin stack..."
cd "$PANGOLIN_DIR"
docker compose up -d

info "Waiting for Pangolin to be healthy (up to 3 minutes)..."
for i in $(seq 1 36); do
    STATUS=$(docker inspect pangolin --format '{{.State.Health.Status}}' 2>/dev/null || echo "starting")
    [[ "$STATUS" == "healthy" ]] && break
    printf "."
    sleep 5
done
echo ""

STATUS=$(docker inspect pangolin --format '{{.State.Health.Status}}' 2>/dev/null || echo "unknown")
if [[ "$STATUS" != "healthy" ]]; then
    warn "Pangolin may still be starting — check: docker logs pangolin"
fi
success "Pangolin stack is running"

# ── Create Pangolin admin account and org ─────────────────────────────────────
step "Creating Pangolin admin account and organization..."
sleep 3

# Use CLI to set admin credentials
docker exec pangolin node /app/dist/cli.mjs set-admin-credentials \
    --email "${ADMIN_EMAIL}" \
    --password "${ADMIN_PASSWORD}" 2>/dev/null && \
    success "Admin account created: ${ADMIN_EMAIL}" || \
    warn "Could not auto-create admin — complete setup at https://${DOMAIN}/auth/initial-setup"

# Create org via Node.js
cat > /tmp/ztguard_org_setup.cjs << 'JSEOF'
const Database = require('/app/node_modules/better-sqlite3');
const db = new Database('/app/config/db/db.sqlite');
const now = new Date().toISOString();

try {
  db.prepare("INSERT OR IGNORE INTO orgs (orgId, name, subnet, utilitySubnet, createdAt) VALUES (?, ?, ?, ?, ?)")
    .run(process.env.ORG_ID, process.env.ORG_NAME, '100.90.128.0/20', '100.96.128.0/20', now);

  const user = db.prepare("SELECT * FROM user WHERE serverAdmin = 1 LIMIT 1").get();
  if (user) {
    db.prepare("INSERT OR IGNORE INTO userOrgs (userId, orgId, isOwner) VALUES (?, ?, 1)").run(user.userId, process.env.ORG_ID);
  }

  db.prepare("INSERT OR IGNORE INTO domains (domainId, baseDomain, configManaged, type, verified, failed, tries, certResolver) VALUES (?, ?, 1, 'wildcard', 1, 0, 0, 'letsencrypt')")
    .run('domain1', process.env.BASE_DOMAIN);
  db.prepare("INSERT OR IGNORE INTO orgDomains (orgId, domainId) VALUES (?, 'domain1')").run(process.env.ORG_ID);

  console.log('ORG_CREATED=1');
} catch(e) {
  console.log('ORG_CREATED=0');
  console.error(e.message);
}
db.close();
JSEOF

BASE_DOMAIN=$(echo "$DOMAIN" | cut -d. -f2-)
docker cp /tmp/ztguard_org_setup.cjs pangolin:/app/ztguard_org_setup.cjs
ORG_ID="$ORG_ID" ORG_NAME="$ORG_NAME" BASE_DOMAIN="$BASE_DOMAIN" \
    docker exec -e ORG_ID -e ORG_NAME -e BASE_DOMAIN pangolin node /app/ztguard_org_setup.cjs 2>/dev/null | grep -q "ORG_CREATED=1" && \
    success "Organization '${ORG_NAME}' (${ORG_ID}) created" || \
    warn "Org setup had warnings — may need manual setup"
docker exec pangolin rm -f /app/ztguard_org_setup.cjs
rm -f /tmp/ztguard_org_setup.cjs

# ── Get setup token ───────────────────────────────────────────────────────────
SETUP_TOKEN=$(docker exec pangolin node -e "
const db = require('/app/node_modules/better-sqlite3')('/app/config/db/db.sqlite', {readonly: true});
const t = db.prepare('SELECT token FROM setupTokens WHERE used = 0 LIMIT 1').get();
console.log(t ? t.token : '');
db.close();
" 2>/dev/null || echo "")

# ── Check dashboard is reachable ──────────────────────────────────────────────
step "Verifying dashboard is reachable..."
sleep 5
HTTP_CODE=$(curl -sk -o /dev/null -w "%{http_code}" "https://${DOMAIN}" 2>/dev/null || echo "000")
if [[ "$HTTP_CODE" == "200" || "$HTTP_CODE" == "302" ]]; then
    success "Dashboard is live (HTTP $HTTP_CODE)"
else
    warn "Dashboard returned HTTP $HTTP_CODE — DNS may not be pointed yet"
fi

# ── Save credentials ──────────────────────────────────────────────────────────
cat > "$PANGOLIN_DIR/ztguard-setup-info.txt" << EOF
ZTGuard Server Setup — $(date -u +"%Y-%m-%dT%H:%M:%SZ")
Domain:         ${DOMAIN}
Admin Email:    ${ADMIN_EMAIL}
Admin Password: ${ADMIN_PASSWORD}
Org Name:       ${ORG_NAME}
Org ID:         ${ORG_ID}
Setup Token:    ${SETUP_TOKEN:-"(already used — check /auth/initial-setup)"}
EOF
chmod 600 "$PANGOLIN_DIR/ztguard-setup-info.txt"

# ── Success banner ────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}"
echo "  ╔══════════════════════════════════════════════════════════════╗"
echo "  ║   Pangolin is ready!                                        ║"
echo "  ╠══════════════════════════════════════════════════════════════╣"
echo -e "  ║  ${NC}${BOLD} Admin:${NC}   ${ADMIN_EMAIL}"
echo -e "  ║  ${NC}${BOLD} Password:${NC} ${ADMIN_PASSWORD}"
echo -e "  ║  ${NC}${BOLD} Org:${NC}     ${ORG_NAME} (${ORG_ID})"
if [[ -n "$SETUP_TOKEN" ]]; then
echo "  ╠══════════════════════════════════════════════════════════════╣"
echo -e "  ║  ${NC}${YELLOW}${BOLD} Setup token (if needed):${NC}"
echo -e "  ║   ${SETUP_TOKEN}"
echo -e "  ║  ${NC} https://${DOMAIN}/auth/initial-setup"
fi
echo "  ╠══════════════════════════════════════════════════════════════╣"
echo "  ║   Next: Install ZTGuard Dashboard                          ║"
echo "  ╚══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"
echo "  Run this command to install the ZTGuard dashboard:"
echo ""
echo -e "  ${BOLD}curl -fsSL https://raw.githubusercontent.com/DialogueDynamicsAI/ZTGUARD-DASHBOARD/main/\"Complete%20scripted%20installation\"/install.sh | bash${NC}"
echo ""
echo "  Credentials saved to: $PANGOLIN_DIR/ztguard-setup-info.txt"
echo ""

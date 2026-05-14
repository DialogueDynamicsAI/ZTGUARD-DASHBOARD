#!/usr/bin/env bash
# =============================================================================
# ZTGuard Dashboard Installer
# Installs the ZTGuard Extended Settings Portal alongside an existing Pangolin
# server. Run as root on the same VPS as your Pangolin installation.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/DialogueDynamicsAI/ZTGUARD-DASHBOARD/main/install.sh | bash
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
    if curl -fsSL "${REPO_URL}/raw/main/install/patch-branding.sh" -o "$PATCH_SCRIPT" 2>/dev/null; then
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
    warn "Branding patches skipped — apply later: curl -fsSL ${REPO_URL}/raw/main/install/patch-branding.sh | bash -s $PANGOLIN_DIR $BRANDING_DIR"
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
""".format(bt=bt, domain=domain)

service_entry = """
    ztguard-portal-svc:
      loadBalancer:
        servers:
          - url: "http://ztguard-portal:3100"
"""

if 'routers:' in content and 'ztguard-portal' not in content:
    content = content.replace('  routers:', '  routers:' + router_entry, 1)

if 'ztguard-portal-svc' not in content:
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

# ── Restart Pangolin to apply patches ─────────────────────────────────────────
step "Restarting Pangolin to apply branding patches..."
cd "$PANGOLIN_DIR"
docker compose up -d pangolin 2>&1 | tail -3
success "Pangolin restarted"
sleep 5

# ── Build and start ZTGuard portal ────────────────────────────────────────────
step "Starting ZTGuard portal..."
cd "$INSTALL_DIR"
docker compose up -d --build 2>&1 | tail -5

# Wait for startup
info "Waiting for portal to start..."
for i in $(seq 1 30); do
    if curl -sk -o /dev/null -w "%{http_code}" "http://localhost:3100/ztguard/login" 2>/dev/null | grep -q "200"; then
        break
    fi
    sleep 2
done

# Verify
HTTP_CODE=$(curl -sk -o /dev/null -w "%{http_code}" "https://${PANGOLIN_DOMAIN}/ztguard/login" 2>/dev/null || echo "000")
if [[ "$HTTP_CODE" == "200" ]]; then
    success "Portal is live and responding"
else
    warn "Portal may still be starting (HTTP $HTTP_CODE). Check: docker logs ztguard-portal"
fi

# ── Save install record ────────────────────────────────────────────────────────
cat > "$INSTALL_DIR/.install-info" << EOF
INSTALLED_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
PANGOLIN_DIR=$PANGOLIN_DIR
PANGOLIN_DOMAIN=$PANGOLIN_DOMAIN
DOCKER_NETWORK=$DOCKER_NETWORK
ZTGUARD_VERSION=$ZTGUARD_VERSION
EOF

# ── Success banner ─────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}"
echo "  ╔══════════════════════════════════════════════════════════════╗"
echo "  ║   ZTGuard Dashboard installed successfully!                 ║"
echo "  ╠══════════════════════════════════════════════════════════════╣"
echo -e "  ║   ${NC}${BOLD}Portal URL:${NC}  https://${PANGOLIN_DOMAIN}/ztguard"
echo -e "  ║   ${NC}${BOLD}Password:${NC}    ${ADMIN_PASSWORD}"
echo "  ╠══════════════════════════════════════════════════════════════╣"
echo "  ║   Next steps:                                               ║"
echo "  ║   1. Open the portal URL above                              ║"
echo "  ║   2. Go to Connection Settings                              ║"
echo "  ║   3. Enter your Pangolin admin email + password             ║"
echo "  ║   4. Click 'Auto-Discover' to connect                       ║"
echo "  ╚══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"
echo "  To remove:  bash ${INSTALL_DIR}/uninstall.sh"
echo "  Logs:       docker logs ztguard-portal"
echo ""

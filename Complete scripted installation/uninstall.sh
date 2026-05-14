#!/usr/bin/env bash
# =============================================================================
# ZTGuard Dashboard Uninstaller
# Cleanly removes the ZTGuard portal and restores Pangolin to its original state.
# =============================================================================
set -euo pipefail

INSTALL_DIR="/opt/ztguard-portal"
BRANDING_DIR="/opt/pangolin-branding"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; BOLD='\033[1m'; NC='\033[0m'

info()    { echo -e "${BLUE}[ztguard]${NC} $*"; }
success() { echo -e "${GREEN}[ztguard]${NC} $*"; }
warn()    { echo -e "${YELLOW}[ztguard]${NC} $*"; }
error()   { echo -e "${RED}[ztguard] ERROR:${NC} $*"; exit 1; }

[[ $EUID -eq 0 ]] || error "This script must be run as root (use sudo)"

echo ""
echo -e "${BOLD}ZTGuard Dashboard — Uninstaller${NC}"
echo ""

# Read install info if available
PANGOLIN_DIR="/opt/pangolin"
PANGOLIN_DOMAIN=""
if [[ -f "$INSTALL_DIR/.install-info" ]]; then
    source "$INSTALL_DIR/.install-info" 2>/dev/null || true
fi

if [[ -z "$PANGOLIN_DIR" ]] || [[ ! -f "$PANGOLIN_DIR/docker-compose.yml" ]]; then
    read -rp "  Pangolin installation path [/opt/pangolin]: " input_dir
    PANGOLIN_DIR="${input_dir:-/opt/pangolin}"
fi

echo ""
echo "This will:"
echo "  • Stop and remove the ZTGuard portal container"
echo "  • Remove $INSTALL_DIR"
echo "  • Remove $BRANDING_DIR (JS/CSS patches, wordmark images)"
echo "  • Remove the /ztguard Traefik route"
echo "  • Restore Pangolin to its original branding"
echo ""
read -rp "Are you sure? [y/N]: " confirm
[[ "${confirm,,}" == "y" ]] || { info "Uninstall cancelled."; exit 0; }

# ── Stop and remove portal container ──────────────────────────────────────────
info "Stopping ZTGuard portal..."
if [[ -d "$INSTALL_DIR" ]]; then
    cd "$INSTALL_DIR" && docker compose down --remove-orphans 2>/dev/null || true
    success "Portal container stopped"
fi

# ── Remove Traefik route ───────────────────────────────────────────────────────
info "Removing Traefik route..."
TRAEFIK_DYNAMIC_CONFIG="$PANGOLIN_DIR/config/traefik/dynamic_config.yml"
TRAEFIK_STANDALONE="$PANGOLIN_DIR/config/traefik/ztguard-portal.yml"

if [[ -f "$TRAEFIK_STANDALONE" ]]; then
    rm -f "$TRAEFIK_STANDALONE"
    success "Removed standalone Traefik route file"
fi

if [[ -f "$TRAEFIK_DYNAMIC_CONFIG" ]]; then
    python3 - << PYEOF
with open('$TRAEFIK_DYNAMIC_CONFIG') as f:
    content = f.read()

import re

# Remove ztguard-portal router entry
content = re.sub(
    r'\n\s+ztguard-portal:\n(?:\s+[^\n]+\n)+',
    '\n',
    content
)
# Remove ztguard-portal-svc service entry
content = re.sub(
    r'\n\s+ztguard-portal-svc:\n(?:\s+[^\n]+\n)+',
    '\n',
    content
)

with open('$TRAEFIK_DYNAMIC_CONFIG', 'w') as f:
    f.write(content)
print('  Removed ztguard-portal from dynamic_config.yml')
PYEOF
fi
success "Traefik route removed (takes effect immediately)"

# ── Restore Pangolin branding ──────────────────────────────────────────────────
info "Restoring Pangolin branding..."
RESTORE_SCRIPT="$INSTALL_DIR/install/restore-branding.sh"
if [[ -f "$RESTORE_SCRIPT" ]]; then
    bash "$RESTORE_SCRIPT" "$PANGOLIN_DIR" "$BRANDING_DIR" 2>/dev/null || true
else
    # Inline restore: remove volume mounts from Pangolin docker-compose
    python3 - << PYEOF
compose_file = '$PANGOLIN_DIR/docker-compose.yml'
branding_dir = '$BRANDING_DIR'
try:
    with open(compose_file) as f:
        lines = f.readlines()
    filtered = [l for l in lines if branding_dir not in l and 'pangolin-branding' not in l]
    # Restore original image name
    import re
    filtered = [re.sub(r'(image:\s*[^\n]+)-branded\b', lambda m: m.group(0).replace('-branded',''), l) for l in filtered]
    with open(compose_file, 'w') as f:
        f.writelines(filtered)
    print('  Restored Pangolin docker-compose.yml')
except Exception as e:
    print(f'  Warning: {e}')
PYEOF
fi

# ── Restart Pangolin ───────────────────────────────────────────────────────────
info "Restarting Pangolin..."
cd "$PANGOLIN_DIR" && docker compose up -d pangolin 2>&1 | tail -2 || true
success "Pangolin restarted with original branding"

# ── Remove portal files ────────────────────────────────────────────────────────
info "Removing ZTGuard files..."
rm -rf "$INSTALL_DIR"
rm -rf "$BRANDING_DIR"
success "Removed $INSTALL_DIR and $BRANDING_DIR"

echo ""
echo -e "${GREEN}${BOLD}ZTGuard Dashboard uninstalled successfully.${NC}"
echo "Pangolin has been restored to its original state."
echo ""

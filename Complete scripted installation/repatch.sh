#!/usr/bin/env bash
# =============================================================================
# ZTGuard Re-Patch — re-applies branding patches to an existing Pangolin server
# Run after bootstrap.sh + install.sh to apply new branding features,
# or after Pangolin updates to re-apply patches.
#
# Usage:
#   bash /opt/ztguard-portal/repatch.sh
#   # or from GitHub:
#   curl -fsSL "https://raw.githubusercontent.com/DialogueDynamicsAI/ZTGUARD-DASHBOARD/main/Complete%20scripted%20installation/repatch.sh" | bash
# =============================================================================
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

info()    { echo -e "${BLUE}[repatch]${NC} $*"; }
success() { echo -e "${GREEN}[repatch]${NC} $*"; }
warn()    { echo -e "${YELLOW}[repatch]${NC} $*"; }
error()   { echo -e "${RED}[repatch] ERROR:${NC} $*"; exit 1; }

[[ $EUID -eq 0 ]] || error "Run as root"

PANGOLIN_DIR="/opt/pangolin"
BRANDING_DIR="/opt/pangolin-branding"
REPO_URL="https://github.com/DialogueDynamicsAI/ZTGUARD-DASHBOARD"

echo ""
echo -e "${BOLD}${CYAN}"
echo "  ╔══════════════════════════════════════════════════╗"
echo "  ║   ZTGuard Re-Patch — Branding Refresh           ║"
echo "  ╚══════════════════════════════════════════════════╝"
echo -e "${NC}"

[[ -f "$PANGOLIN_DIR/docker-compose.yml" ]] || error "Pangolin not found at $PANGOLIN_DIR"
docker inspect pangolin >/dev/null 2>&1 || error "Pangolin container not running"

# Download latest patch script
PATCH_SCRIPT="/tmp/ztguard-repatch-$$.sh"
info "Downloading latest patch-branding.sh..."
curl -fsSL "${REPO_URL}/raw/main/Complete%20scripted%20installation/install/patch-branding.sh" \
    -o "$PATCH_SCRIPT" || error "Failed to download patch script"
sed -i 's/\r//' "$PATCH_SCRIPT"
chmod +x "$PATCH_SCRIPT"

info "Running branding patches..."
bash "$PATCH_SCRIPT" "$PANGOLIN_DIR" "$BRANDING_DIR" "pangolin"
rm -f "$PATCH_SCRIPT"

info "Restarting Pangolin to apply patches..."
cd "$PANGOLIN_DIR" && docker compose up -d pangolin 2>&1 | tail -2
sleep 5

echo ""
echo -e "${GREEN}${BOLD}"
echo "  ╔══════════════════════════════════════════════════╗"
echo "  ║   Branding patches re-applied!                  ║"
echo "  ╚══════════════════════════════════════════════════╝"
echo -e "${NC}"
echo "  Changes applied:"
echo "  • Email templates patched (Pangolin footer removed)"
echo "  • Favicon replaced (ZTGuard blue icon)"
echo "  • Browser tab title updated to ZTGuard"
echo "  • Login page branding refreshed"
echo ""

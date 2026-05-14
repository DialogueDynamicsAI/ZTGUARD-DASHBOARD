#!/usr/bin/env bash
# =============================================================================
# ZTGuard Bootstrap
# Copy this ONE file to any bare-metal Debian/Ubuntu server and run:
#
#   bash bootstrap.sh
#
# It will install Docker, Pangolin, and walk you through full setup.
# After Pangolin is ready, the ZTGuard dashboard installer runs automatically.
# =============================================================================
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

echo ""
echo -e "${BOLD}${CYAN}"
echo "  ╔══════════════════════════════════════════════════╗"
echo "  ║   ZTGuard — Server Bootstrap                    ║"
echo "  ║   Pangolin + ZTGuard Dashboard installer        ║"
echo "  ╚══════════════════════════════════════════════════╝"
echo -e "${NC}"

[[ $EUID -eq 0 ]] || { echo -e "${RED}Run as root.${NC}"; exit 1; }

# Install git and curl if missing
echo -e "${CYAN}▶ Installing prerequisites...${NC}"
apt-get update -qq 2>/dev/null
apt-get install -y git curl -qq 2>/dev/null
echo -e "${GREEN}✓ git and curl ready${NC}"

# Pull repo
REPO="https://github.com/DialogueDynamicsAI/ZTGUARD-DASHBOARD.git"
TMP=$(mktemp -d)
echo -e "${CYAN}▶ Pulling ZTGuard installer from GitHub...${NC}"
git clone --depth 1 "$REPO" "$TMP" 2>/dev/null
echo -e "${GREEN}✓ Downloaded${NC}"
echo ""

# Run setup
SETUP="$TMP/Complete scripted installation/setup-server.sh"
chmod +x "$SETUP"
bash "$SETUP"

# Cleanup
rm -rf "$TMP"

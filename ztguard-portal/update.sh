#!/usr/bin/env bash
# ZTGuard Update — pulls latest portal code from GitHub and rebuilds
set -e
REPO=https://github.com/DialogueDynamicsAI/ZTGUARD-DASHBOARD.git
TMP=$(mktemp -d)
echo "[update] Pulling latest from GitHub..."
git clone --depth 1 "$REPO" "$TMP" 2>/dev/null
rsync -a --exclude='data/' --exclude='.env' --exclude='docker-compose.yml' \
  "$TMP/ztguard-portal/" /opt/ztguard-portal/
cp "$TMP/Complete scripted installation/repatch.sh" /opt/ztguard-portal/repatch.sh
chmod +x /opt/ztguard-portal/repatch.sh
rm -rf "$TMP"
cd /opt/ztguard-portal && docker compose up -d --build
echo "[update] Done — ZTGuard updated"

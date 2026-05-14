#!/usr/bin/env bash
# =============================================================================
# ZTGuard Branding Restore Script
# Reverses all branding patches applied by patch-branding.sh
# =============================================================================
set -euo pipefail

PANGOLIN_DIR="${1:-/opt/pangolin}"
BRANDING_DIR="${2:-/opt/pangolin-branding}"
PANGOLIN_CONTAINER="${3:-pangolin}"

GREEN='\033[0;32m'; BLUE='\033[0;34m'; NC='\033[0m'
info()    { echo -e "${BLUE}[info]${NC} $*"; }
success() { echo -e "${GREEN}[done]${NC} $*"; }

COMPOSE_FILE="$PANGOLIN_DIR/docker-compose.yml"

info "Restoring original Pangolin state..."

# Remove branding volume mounts from docker-compose.yml
python3 - << 'PYEOF'
import sys
compose_file = sys.argv[1]
branding_dir = sys.argv[2]
with open(compose_file) as f:
    lines = f.readlines()
filtered = [l for l in lines if branding_dir not in l]
with open(compose_file, 'w') as f:
    f.writelines(filtered)
print('  Removed branding volume mounts from docker-compose.yml')
PYEOF
"$COMPOSE_FILE" "$BRANDING_DIR"

# Restore original image name (remove -branded suffix)
python3 - << PYEOF
import re
with open('$COMPOSE_FILE') as f:
    content = f.read()
content = re.sub(r'(image:\s*[^\n]+-branded)\b', lambda m: m.group(0).replace('-branded',''), content)
with open('$COMPOSE_FILE', 'w') as f:
    f.write(content)
print('  Restored original image name in docker-compose.yml')
PYEOF

success "Branding restore complete"
echo ""
echo "Restart Pangolin to apply: cd $PANGOLIN_DIR && docker compose up -d pangolin"

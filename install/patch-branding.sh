#!/usr/bin/env bash
# =============================================================================
# ZTGuard Branding Patch Script
# Applies JS/CSS branding customizations to an existing Pangolin installation.
# Run automatically by install.sh — can also be run standalone to re-apply.
# =============================================================================
set -euo pipefail

PANGOLIN_DIR="${1:-/opt/pangolin}"
BRANDING_DIR="${2:-/opt/pangolin-branding}"
PANGOLIN_CONTAINER="${3:-pangolin}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info()    { echo -e "${BLUE}[info]${NC} $*"; }
success() { echo -e "${GREEN}[done]${NC} $*"; }
warn()    { echo -e "${YELLOW}[warn]${NC} $*"; }
error()   { echo -e "${RED}[error]${NC} $*"; exit 1; }

# ── Prerequisites ──────────────────────────────────────────────────────────────
command -v docker >/dev/null 2>&1 || error "Docker is required"
command -v python3 >/dev/null 2>&1 || error "Python3 is required"

if ! docker inspect "$PANGOLIN_CONTAINER" >/dev/null 2>&1; then
    error "Pangolin container '$PANGOLIN_CONTAINER' is not running"
fi

python3 -c "from PIL import Image" 2>/dev/null || {
    info "Installing Pillow for image processing..."
    # Try apt package first (Debian/Ubuntu managed environments)
    if apt-get install -y python3-pil -qq >/dev/null 2>&1; then
        info "Pillow installed via apt (python3-pil)"
    elif pip3 install Pillow -q --break-system-packages 2>/dev/null; then
        info "Pillow installed via pip"
    elif python3 -m pip install Pillow -q --break-system-packages 2>/dev/null; then
        info "Pillow installed via python3 -m pip"
    else
        warn "Could not install Pillow — wordmark images will be skipped"
    fi
}

mkdir -p "$BRANDING_DIR/logos"
info "Branding directory: $BRANDING_DIR"

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 1: Extract and patch the resource auth page JS chunk
#         Removes "Powered by Pangolin" and "Server is running without a supporter key"
# ═══════════════════════════════════════════════════════════════════════════════
info "Step 1/6: Patching resource auth page (removing Pangolin attribution)..."

AUTH_CHUNK_ORIG="$BRANDING_DIR/auth-resource-page-orig.js"
AUTH_CHUNK_PATCHED="$BRANDING_DIR/auth-resource-page-patched.js"
AUTH_CHUNK_ACTIVE="$BRANDING_DIR/auth-resource-page-patched-new.js"

# Find the auth resource page chunk in the container
AUTH_CHUNK_PATH=$(docker exec "$PANGOLIN_CONTAINER" find /app/.next/static/chunks -name "page-*.js" -path "*auth/resource*" 2>/dev/null | head -1)
if [ -z "$AUTH_CHUNK_PATH" ]; then
    warn "Could not find auth resource page chunk — skipping"
else
    AUTH_CHUNK_HASH=$(basename "$AUTH_CHUNK_PATH" .js | sed 's/page-//')
    info "  Found auth chunk: $AUTH_CHUNK_HASH"

    docker cp "$PANGOLIN_CONTAINER:$AUTH_CHUNK_PATH" "$AUTH_CHUNK_ORIG"

    python3 - << PYEOF
import re
with open('$AUTH_CHUNK_ORIG') as f:
    js = f.read()

patched = js
count = 0

# Remove "Powered by Pangolin" ternary (CE branch)
m = re.search(r'eh\(\)&&"enterprise"===D\.j\?[^:]+:(\(0,r\.jsx\)\("div",\{className:"text-center mb-2"[^}]+\}[^)]+\)[^)]+\))', js)
if m:
    full_ternary = 'eh()&&"enterprise"===D.j?' + re.search(r'eh\(\)&&"enterprise"===D\.j\?(.*?)\(0,r\.jsxs\)\(o\.Zp', js, re.DOTALL).group(1).rstrip(',') if re.search(r'eh\(\)&&"enterprise"===D\.j\?', js) else ''

# Simpler approach: find and replace the specific patterns
# Pattern 1: null==s?void 0:s.visible (supporter key notice)
old1 = '(null==s?void 0:s.visible)'
if old1 in patched:
    patched = patched.replace(old1, 'null', 1)
    count += 1
    print(f'  Removed supporter key notice')

# Pattern 2: CE powered-by branch (finds the else branch of the enterprise ternary)
# The CE else branch renders href="https://pangolin.net/"
old2_marker = 'href:"https://pangolin.net/",target:"_blank",rel:"noopener noreferrer",className:"underline",children:"Pangolin"'
if old2_marker in patched:
    # Find the full ternary and replace its else branch with null
    ternary_start = patched.rfind('eh()&&"enterprise"===D.j?', 0, patched.find(old2_marker))
    if ternary_start >= 0:
        # Find the colon separating the ternary branches
        colon_pos = patched.find(':(0,r.jsx)("div",{className:"text-center mb-2"', ternary_start)
        if colon_pos >= 0:
            # Find end of the else branch (the closing paren+brace pattern)
            end_match = re.search(r'\)\}\)\)', patched[colon_pos:colon_pos+800])
            if end_match:
                else_end = colon_pos + end_match.end()
                original_else = patched[colon_pos:else_end]
                patched = patched[:colon_pos] + ':null' + patched[else_end:]
                count += 1
                print(f'  Removed CE powered-by branch')

print(f'  Total patches applied: {count}')
with open('$AUTH_CHUNK_PATCHED', 'w') as f:
    f.write(patched)
with open('$AUTH_CHUNK_ACTIVE', 'w') as f:
    f.write(patched)
PYEOF

    NEW_HASH="${AUTH_CHUNK_HASH:0:-1}e"  # change last char: d→e
    info "  Renaming hash: $AUTH_CHUNK_HASH → $NEW_HASH"
    docker exec "$PANGOLIN_CONTAINER" sh -c \
        "grep -rl '$AUTH_CHUNK_HASH' /app/.next/ 2>/dev/null | while read f; do sed -i 's/$AUTH_CHUNK_HASH/$NEW_HASH/g' \"\$f\"; done; echo done"
    success "Auth page chunk patched (hash: $NEW_HASH)"
fi

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 2: Extract and patch the sidebar chunk
#         Removes "Buy Supporter Key" and "Community Edition" from dashboard
# ═══════════════════════════════════════════════════════════════════════════════
info "Step 2/6: Patching sidebar (removing Buy Supporter Key)..."

SIDEBAR_ORIG="$BRANDING_DIR/sidebar-chunk.js"
SIDEBAR_PATCHED="$BRANDING_DIR/sidebar-chunk-patched.js"
SIDEBAR_ACTIVE="$BRANDING_DIR/sidebar-chunk-active.js"

# Find the sidebar chunk (contains supportKeyBuy)
SIDEBAR_CHUNK_PATH=$(docker exec "$PANGOLIN_CONTAINER" sh -c \
    'grep -rl "supportKeyBuy" /app/.next/static/chunks/ 2>/dev/null | head -1')
if [ -z "$SIDEBAR_CHUNK_PATH" ]; then
    warn "Could not find sidebar chunk — skipping"
else
    SIDEBAR_HASH=$(basename "$SIDEBAR_CHUNK_PATH" .js)
    info "  Found sidebar chunk: $SIDEBAR_HASH"

    docker cp "$PANGOLIN_CONTAINER:$SIDEBAR_CHUNK_PATH" "$SIDEBAR_ORIG"
    cp "$SIDEBAR_ORIG" "$SIDEBAR_ACTIVE"

    python3 - << PYEOF
with open('$SIDEBAR_ORIG') as f:
    js = f.read()

find1 = '(null==s?void 0:s.visible)'
if find1 in js:
    patched = js.replace(find1, 'null', 1)
    with open('$SIDEBAR_PATCHED', 'w') as f:
        f.write(patched)
    with open('$SIDEBAR_ACTIVE', 'w') as f:
        f.write(patched)
    print(f'  Removed Buy Supporter Key button')
else:
    import shutil
    shutil.copy('$SIDEBAR_ORIG', '$SIDEBAR_PATCHED')
    shutil.copy('$SIDEBAR_ORIG', '$SIDEBAR_ACTIVE')
    print('  Pattern not found — no patch needed')
PYEOF

    NEW_SIDEBAR_HASH=$(echo "$SIDEBAR_HASH" | sed 's/.$/5/')
    info "  Renaming hash: $SIDEBAR_HASH → $NEW_SIDEBAR_HASH"
    docker exec "$PANGOLIN_CONTAINER" sh -c \
        "grep -rl '$SIDEBAR_HASH' /app/.next/ 2>/dev/null | while read f; do sed -i 's/$SIDEBAR_HASH/$NEW_SIDEBAR_HASH/g' \"\$f\"; done; echo done"
    success "Sidebar chunk patched (hash: $NEW_SIDEBAR_HASH)"
fi

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 3: Extract the main Pangolin CSS and create override file
# ═══════════════════════════════════════════════════════════════════════════════
info "Step 3/6: Extracting main CSS for overrides..."

MAIN_CSS_PATH=$(docker exec "$PANGOLIN_CONTAINER" find /app/.next/static/css -name "4b2b6b*.css" 2>/dev/null | head -1)
if [ -z "$MAIN_CSS_PATH" ]; then
    # Find the largest CSS file as the main bundle
    MAIN_CSS_PATH=$(docker exec "$PANGOLIN_CONTAINER" sh -c \
        'ls -S /app/.next/static/css/*.css 2>/dev/null | head -1')
fi

if [ -n "$MAIN_CSS_PATH" ]; then
    CSS_HASH=$(basename "$MAIN_CSS_PATH" .css)
    docker cp "$PANGOLIN_CONTAINER:$MAIN_CSS_PATH" "$BRANDING_DIR/${CSS_HASH}.css"

    # Rename hash (change last char: b→c)
    NEW_CSS_HASH="${CSS_HASH:0:-1}c"
    info "  CSS hash: $CSS_HASH → $NEW_CSS_HASH"

    docker exec "$PANGOLIN_CONTAINER" sh -c \
        "grep -rl '$CSS_HASH' /app/.next/ 2>/dev/null | while read f; do sed -i 's/$CSS_HASH/$NEW_CSS_HASH/g' \"\$f\"; done; echo done"

    cp "$BRANDING_DIR/${CSS_HASH}.css" "$BRANDING_DIR/${NEW_CSS_HASH}.css"
    echo "$NEW_CSS_HASH" > "$BRANDING_DIR/.css-hash"
    success "CSS override file ready (hash: $NEW_CSS_HASH)"
else
    warn "Could not find main CSS file — CSS overrides may not apply"
fi

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 4: Extract and replace wordmark images (login page logo)
# ═══════════════════════════════════════════════════════════════════════════════
info "Step 4/6: Extracting wordmark images..."

for f in word_mark_black.png word_mark_white.png word_mark.png; do
    docker cp "$PANGOLIN_CONTAINER:/app/public/logo/$f" "$BRANDING_DIR/logos/$f" 2>/dev/null || true
done
success "Wordmark images extracted to $BRANDING_DIR/logos/"

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 5: Update Pangolin docker-compose.yml volume mounts
# ═══════════════════════════════════════════════════════════════════════════════
info "Step 5/6: Adding volume mounts to Pangolin docker-compose.yml..."

COMPOSE_FILE="$PANGOLIN_DIR/docker-compose.yml"
CSS_HASH=$(cat "$BRANDING_DIR/.css-hash" 2>/dev/null || echo "")

# Check if already patched
if grep -q "pangolin-branding" "$COMPOSE_FILE" 2>/dev/null; then
    warn "Volume mounts already present in docker-compose.yml — skipping"
else
    # Find the pangolin service volumes section and add our mounts
    python3 - << PYEOF
import re

with open('$COMPOSE_FILE') as f:
    content = f.read()

css_hash = open('$BRANDING_DIR/.css-hash').read().strip() if __import__('os').path.exists('$BRANDING_DIR/.css-hash') else ''
sidebar_hash = ''
try:
    import subprocess
    r = subprocess.run(['bash', '-c', 'grep -rl "sidebar-chunk" $BRANDING_DIR/ 2>/dev/null | grep active'], capture_output=True, text=True)
except: pass

# Add volume mounts after './config:/app/config'
old = '      - ./config:/app/config'
new_mounts = '      - ./config:/app/config'
if css_hash:
    new_mounts += f'\n      - $BRANDING_DIR/{css_hash}.css:/app/.next/static/css/{css_hash}.css:ro'
if '$SIDEBAR_ACTIVE':
    import subprocess
    r = subprocess.run(['bash', '-c', 'ls $BRANDING_DIR/sidebar-chunk-active.js 2>/dev/null'], capture_output=True, text=True)
    if r.returncode == 0:
        # Get the new sidebar hash from the patched chunk name
        r2 = subprocess.run(['bash', '-c', 'grep "3211-" $PANGOLIN_DIR/docker-compose.yml 2>/dev/null | head -1'], capture_output=True, text=True)
        if not r2.stdout.strip():
            # Find sidebar hash by checking manifests
            r3 = subprocess.run(['bash', '-c', 'docker exec $PANGOLIN_CONTAINER find /app/.next/static/chunks -name "3211-*.js" 2>/dev/null | head -1'], capture_output=True, text=True)
            sidebar_file = r3.stdout.strip().split('/')[-1]
            if sidebar_file:
                new_mounts += f'\n      - $BRANDING_DIR/sidebar-chunk-active.js:/app/.next/static/chunks/{sidebar_file}:ro'
new_mounts += '\n      - $BRANDING_DIR/logos/word_mark_black.png:/app/public/logo/word_mark_black.png:ro'
new_mounts += '\n      - $BRANDING_DIR/logos/word_mark_white.png:/app/public/logo/word_mark_white.png:ro'
new_mounts += '\n      - $BRANDING_DIR/logos/word_mark.png:/app/public/logo/word_mark.png:ro'

if old in content:
    content = content.replace(old, new_mounts, 1)
    with open('$COMPOSE_FILE', 'w') as f:
        f.write(content)
    print('  Volume mounts added to docker-compose.yml')
else:
    print('  WARNING: Could not find mount point in docker-compose.yml')
PYEOF
fi
success "Pangolin docker-compose.yml updated"

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 6: Commit the patched Pangolin container image
# ═══════════════════════════════════════════════════════════════════════════════
info "Step 6/6: Committing patched Pangolin container..."

PANGOLIN_IMAGE=$(docker inspect "$PANGOLIN_CONTAINER" --format '{{.Config.Image}}' 2>/dev/null || echo "")
if [ -n "$PANGOLIN_IMAGE" ]; then
    docker commit "$PANGOLIN_CONTAINER" "${PANGOLIN_IMAGE}-branded" 2>/dev/null || \
    docker commit "$PANGOLIN_CONTAINER" "pangolin-branded:latest"

    # Update docker-compose to use the committed image
    python3 - << PYEOF
with open('$COMPOSE_FILE') as f:
    content = f.read()
import re
# Replace the pangolin image line
content = re.sub(
    r'(image:\s*docker\.io/fosrl/pangolin:[^\n]+)',
    r'\1-branded',
    content
)
# If already has -branded, don't double-add
content = content.replace('-branded-branded', '-branded')
with open('$COMPOSE_FILE', 'w') as f:
    f.write(content)
print('  Updated docker-compose.yml to use branded image')
PYEOF
    success "Pangolin container committed as branded image"
fi

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   Branding patches applied successfully!     ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════╝${NC}"
echo ""
echo "Restart Pangolin to apply: cd $PANGOLIN_DIR && docker compose up -d pangolin"

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

# ── Strategy: find and replace both "Powered by" div blocks directly ──────────
# The CE block always renders with hardcoded "Pangolin" as children
ce_div = '(0,r.jsx)("div",{className:"text-center mb-2",children:(0,r.jsxs)("span",{className:"text-sm text-muted-foreground",children:[ex("poweredBy")," ",(0,r.jsx)(C(),{href:"https://pangolin.net/",target:"_blank",rel:"noopener noreferrer",className:"underline",children:"Pangolin"})]})})'
if ce_div in patched:
    patched = patched.replace(ce_div, 'null', 1)
    count += 1
    print('  Removed CE powered-by block')

# The Enterprise block uses eE.branding.appName — find wrapping div and replace
ent_marker = 'children:eE.branding.appName||"Pangolin"'
if ent_marker not in patched:
    ent_marker = 'children:eE.branding.appName||"Pangolin"'
pos = patched.find(ent_marker)
if pos >= 0:
    div_start = patched.rfind('(0,r.jsx)("div",{className:"text-center mb-2"', 0, pos)
    if div_start < 0:
        div_start = patched.rfind('(0,r.jsxs)("div",{className:"text-center mb-2"', 0, pos)
    if div_start >= 0:
        end_m = re.search(r'\}\)\}\)', patched[div_start:div_start+600])
        if end_m:
            full_block = patched[div_start:div_start+end_m.end()]
            patched = patched.replace(full_block, 'null', 1)
            count += 1
            print('  Removed enterprise powered-by block')

# Legacy pattern: null==s?void 0:s.visible (supporter key notice, older Pangolin)
old1 = '(null==s?void 0:s.visible)'
if old1 in patched:
    patched = patched.replace(old1, 'null', 1)
    count += 1
    print('  Removed supporter key notice (legacy)')

print(f'  Total patches applied: {count}')
with open('$AUTH_CHUNK_PATCHED', 'w') as f:
    f.write(patched)
with open('$AUTH_CHUNK_ACTIVE', 'w') as f:
    f.write(patched)
PYEOF

    NEW_HASH="${AUTH_CHUNK_HASH:0:-1}e"  # change last char for cache-busting
    echo "${NEW_HASH}" > "$BRANDING_DIR/.auth-hash"          # save for Step 5 volume mount
    echo "${AUTH_CHUNK_PATH}" > "$BRANDING_DIR/.auth-chunk-path"  # save full path for correct mount
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
    echo "${NEW_SIDEBAR_HASH}" > "$BRANDING_DIR/.sidebar-hash"  # save for Step 5 volume mount
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
# STEP 4: Extract wordmark images and copy custom logos INTO the container
#         (baked into the commit — avoids file-level volume mount failures on
#          overlay filesystems)
# ═══════════════════════════════════════════════════════════════════════════════
info "Step 4/6: Replacing wordmark images in container..."

# Extract originals to branding dir (for reference / restore)
for f in word_mark_black.png word_mark_white.png word_mark.png; do
    docker cp "$PANGOLIN_CONTAINER:/app/public/logo/$f" "$BRANDING_DIR/logos/$f" 2>/dev/null || true
done

# If custom logos already exist in the branding logos dir (placed by user or ZTGuard portal),
# copy them INTO the running container so they get baked into the committed image
CUSTOM_LOGOS_COPIED=0
for f in word_mark_black.png word_mark_white.png word_mark.png; do
    CUSTOM="$BRANDING_DIR/logos/custom_$f"
    if [[ -f "$CUSTOM" ]]; then
        docker cp "$CUSTOM" "$PANGOLIN_CONTAINER:/app/public/logo/$f" 2>/dev/null && \
            CUSTOM_LOGOS_COPIED=$((CUSTOM_LOGOS_COPIED+1)) || true
    fi
done
[[ $CUSTOM_LOGOS_COPIED -gt 0 ]] && info "  Copied $CUSTOM_LOGOS_COPIED custom logo(s) into container"
success "Wordmark images ready (originals saved to $BRANDING_DIR/logos/)"

# Create ZTGuard icon SVG to replace the Pangolin phoenix in dashboard header
if [[ ! -f "$BRANDING_DIR/logos/ztguard_icon.svg" ]]; then
    cat > "$BRANDING_DIR/logos/ztguard_icon.svg" << 'SVGEOF'
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" rx="16" fill="#1e40af"/>
  <text x="50" y="72" font-family="Arial,sans-serif" font-size="68" font-weight="900"
    text-anchor="middle" fill="white">Z</text>
</svg>
SVGEOF
    info "  Created ZTGuard icon (replaces Pangolin phoenix in dashboard)"
fi

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
    # Build volume mounts using saved hash files (written by Steps 1 & 2)
    python3 - << PYEOF
import os

with open('$COMPOSE_FILE') as f:
    content = f.read()

branding = '$BRANDING_DIR'

# Read saved hashes and paths
css_hash         = open(f'{branding}/.css-hash').read().strip()         if os.path.exists(f'{branding}/.css-hash')         else ''
sidebar_hash     = open(f'{branding}/.sidebar-hash').read().strip()     if os.path.exists(f'{branding}/.sidebar-hash')     else ''
auth_hash        = open(f'{branding}/.auth-hash').read().strip()        if os.path.exists(f'{branding}/.auth-hash')        else ''
auth_chunk_path  = open(f'{branding}/.auth-chunk-path').read().strip()  if os.path.exists(f'{branding}/.auth-chunk-path')  else ''

old = '      - ./config:/app/config'
new_mounts = '      - ./config:/app/config'

# CSS override (new hash path — cache-busted)
if css_hash:
    new_mounts += f'\n      - {branding}/{css_hash}.css:/app/.next/static/css/{css_hash}.css:ro'

# Sidebar chunk (NEW hash — that is what manifests now reference)
if sidebar_hash and os.path.exists(f'{branding}/sidebar-chunk-active.js'):
    new_mounts += f'\n      - {branding}/sidebar-chunk-active.js:/app/.next/static/chunks/{sidebar_hash}.js:ro'

# Auth resource page chunk (NEW hash) — use ACTUAL container path, not hardcoded one
if auth_hash and auth_chunk_path and os.path.exists(f'{branding}/auth-resource-page-patched-new.js'):
    auth_dir = os.path.dirname(auth_chunk_path)
    new_mounts += f'\n      - {branding}/auth-resource-page-patched-new.js:{auth_dir}/page-{auth_hash}.js:ro'

# Wordmark logos — volume mount so ZTGuard portal can swap them via branding page
for logo_file in ['word_mark_black.png', 'word_mark_white.png', 'word_mark.png']:
    if os.path.exists(f'{branding}/logos/{logo_file}'):
        new_mounts += f'\n      - {branding}/logos/{logo_file}:/app/public/logo/{logo_file}:ro'

# ZTGuard icon replaces the Pangolin orange phoenix in the dashboard header
ztguard_svg = f'{branding}/logos/ztguard_icon.svg'
if os.path.exists(ztguard_svg):
    new_mounts += f'\n      - {ztguard_svg}:/app/public/logo/pangolin_orange.svg:ro'
    new_mounts += f'\n      - {ztguard_svg}:/app/public/logo/pangolin_black.svg:ro'

if old in content:
    content = content.replace(old, new_mounts, 1)
    with open('$COMPOSE_FILE', 'w') as f:
        f.write(content)
    print('  Volume mounts added to docker-compose.yml')
    print(f'  CSS hash: {css_hash}')
    print(f'  Sidebar hash: {sidebar_hash}')
    print(f'  Auth hash: {auth_hash}')
    if auth_chunk_path:
        print(f'  Auth chunk dir: {os.path.dirname(auth_chunk_path)}')
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

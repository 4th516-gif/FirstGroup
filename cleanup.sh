#!/bin/bash
# ============================================================
#  PC Cleanup Script — One-Time Run
#  Safe, beginner-friendly cleanup for Linux
#  Run with:  bash cleanup.sh
# ============================================================

# Colors for easy reading in the terminal
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color (resets text)

echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}       PC Cleanup — Starting Up         ${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# ── Helper: show disk usage ──────────────────────────────────
show_disk_usage() {
    echo -e "${YELLOW}Disk usage on your main drive:${NC}"
    df -h / | awk 'NR==2 {print "  Used: "$3"  Free: "$4"  Total: "$2}'
}

echo -e "${YELLOW}BEFORE cleanup:${NC}"
show_disk_usage
echo ""

# ── 1. Clear temporary files ─────────────────────────────────
echo -e "${BLUE}[1/6] Clearing temporary files (/tmp)...${NC}"
# Only remove files older than 1 day to stay safe
find /tmp -type f -atime +1 -delete 2>/dev/null
find /tmp -type d -empty -delete 2>/dev/null
echo -e "${GREEN}  Done.${NC}"

# ── 2. Clear user cache ──────────────────────────────────────
echo -e "${BLUE}[2/6] Clearing user app cache (~/.cache)...${NC}"
if [ -d "$HOME/.cache" ]; then
    # Show size before clearing
    CACHE_SIZE=$(du -sh "$HOME/.cache" 2>/dev/null | cut -f1)
    echo "  Cache was using: $CACHE_SIZE"
    rm -rf "$HOME/.cache"/* 2>/dev/null
    echo -e "${GREEN}  Done.${NC}"
else
    echo "  No cache folder found — skipping."
fi

# ── 3. Clear thumbnail cache ─────────────────────────────────
echo -e "${BLUE}[3/6] Clearing thumbnail cache...${NC}"
if [ -d "$HOME/.thumbnails" ]; then
    rm -rf "$HOME/.thumbnails"/* 2>/dev/null
    echo -e "${GREEN}  Done.${NC}"
elif [ -d "$HOME/.cache/thumbnails" ]; then
    rm -rf "$HOME/.cache/thumbnails"/* 2>/dev/null
    echo -e "${GREEN}  Done.${NC}"
else
    echo "  No thumbnail cache found — skipping."
fi

# ── 4. Empty the Trash ───────────────────────────────────────
echo -e "${BLUE}[4/6] Emptying Trash...${NC}"
if [ -d "$HOME/.local/share/Trash" ]; then
    TRASH_SIZE=$(du -sh "$HOME/.local/share/Trash" 2>/dev/null | cut -f1)
    echo "  Trash was using: $TRASH_SIZE"
    rm -rf "$HOME/.local/share/Trash/files"/* 2>/dev/null
    rm -rf "$HOME/.local/share/Trash/info"/* 2>/dev/null
    echo -e "${GREEN}  Done.${NC}"
else
    echo "  Trash is already empty — skipping."
fi

# ── 5. Clean up APT package manager (requires sudo) ─────────
echo -e "${BLUE}[5/6] Cleaning package manager cache (apt)...${NC}"
if command -v apt-get &>/dev/null; then
    echo "  This step needs your password (sudo)."
    sudo apt-get autoremove -y 2>/dev/null && \
    sudo apt-get autoclean -y 2>/dev/null && \
    sudo apt-get clean 2>/dev/null
    echo -e "${GREEN}  Done.${NC}"
else
    echo "  apt not found — skipping (may not be an Ubuntu/Debian system)."
fi

# ── 6. Free up memory (page cache) ──────────────────────────
echo -e "${BLUE}[6/6] Flushing memory cache (page cache)...${NC}"
echo "  This step needs your password (sudo)."
sync && sudo sh -c 'echo 3 > /proc/sys/vm/drop_caches' 2>/dev/null
if [ $? -eq 0 ]; then
    echo -e "${GREEN}  Done.${NC}"
else
    echo "  Could not flush memory cache — skipping."
fi

# ── Summary ──────────────────────────────────────────────────
echo ""
echo -e "${YELLOW}AFTER cleanup:${NC}"
show_disk_usage
echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}   Cleanup complete! Your PC is tidier.  ${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "TIP: Restart your PC after this for best results."
echo ""

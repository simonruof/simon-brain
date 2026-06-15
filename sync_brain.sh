#!/bin/bash
# ============================================================
# sync_brain.sh — Synchronisiert Simon_Brain mit Git Remote
# Verwendung:
#   ./sync_brain.sh          → Pull + Push (Standard)
#   ./sync_brain.sh push     → Nur Push
#   ./sync_brain.sh pull     → Nur Pull
#   ./sync_brain.sh status   → Status anzeigen
# ============================================================

set -e

BRAIN_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$BRAIN_DIR"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M')
MODE="${1:-sync}"

# Farben
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo ""
echo "🧠 Simon Brain Sync — $TIMESTAMP"
echo "=================================="

# Prüfe ob Git-Repo initialisiert
if [ ! -d ".git" ]; then
  echo -e "${RED}❌ Kein Git-Repo gefunden. Bitte zuerst setup_brain.sh ausführen.${NC}"
  exit 1
fi

# Prüfe ob Remote gesetzt
REMOTE=$(git remote get-url origin 2>/dev/null || echo "")
if [ -z "$REMOTE" ]; then
  echo -e "${RED}❌ Kein Remote konfiguriert. Bitte setup_brain.sh ausführen.${NC}"
  exit 1
fi

case $MODE in

  status)
    echo ""
    git status --short
    echo ""
    echo "Remote: $REMOTE"
    echo "Branch: $(git branch --show-current)"
    echo ""
    ;;

  pull)
    echo ""
    echo "⬇️  Pull von Remote..."
    git pull origin main --rebase
    echo -e "${GREEN}✅ Pull abgeschlossen${NC}"
    ;;

  push)
    echo ""
    # Uncommitted Changes?
    if [ -n "$(git status --porcelain)" ]; then
      echo "📝 Änderungen gefunden — committe..."
      git add -A
      git commit -m "🔄 Brain Sync — $TIMESTAMP"
    else
      echo "ℹ️  Keine Änderungen — nichts zu committen"
    fi
    echo "⬆️  Push zu Remote..."
    git push origin main
    echo -e "${GREEN}✅ Push abgeschlossen${NC}"
    ;;

  sync|*)
    echo ""
    # 1. Pull zuerst
    echo "⬇️  Pull von Remote..."
    git fetch origin main 2>/dev/null || true

    # Merge-Konflikte prüfen
    LOCAL=$(git rev-parse HEAD)
    REMOTE_HEAD=$(git rev-parse origin/main 2>/dev/null || echo "$LOCAL")
    BASE=$(git merge-base HEAD origin/main 2>/dev/null || echo "$LOCAL")

    if [ "$LOCAL" = "$REMOTE_HEAD" ]; then
      echo "ℹ️  Bereits aktuell"
    elif [ "$LOCAL" = "$BASE" ]; then
      git pull origin main --rebase
      echo -e "${GREEN}✅ Remote-Änderungen eingespielt${NC}"
    elif [ "$REMOTE_HEAD" = "$BASE" ]; then
      echo "ℹ️  Lokale Änderungen vorhanden — nur Push"
    else
      echo -e "${YELLOW}⚠️  Divergierte Branches — Rebase...${NC}"
      git pull origin main --rebase
    fi

    # 2. Lokale Änderungen committen und pushen
    if [ -n "$(git status --porcelain)" ]; then
      echo ""
      echo "📝 Lokale Änderungen:"
      git status --short
      echo ""
      git add -A
      git commit -m "🔄 Brain Sync — $TIMESTAMP"
      echo "⬆️  Push zu Remote..."
      git push origin main
      echo -e "${GREEN}✅ Sync abgeschlossen — alles gepusht${NC}"
    else
      echo -e "${GREEN}✅ Sync abgeschlossen — nichts zu pushen${NC}"
    fi
    ;;

esac

echo ""
echo "Letzter Commit: $(git log -1 --format='%cr — %s')"
echo ""

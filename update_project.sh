#!/bin/bash
# ============================================================
# update_project.sh — Projekt-Notiz aktualisieren + committen
# Verwendung:
#   ./update_project.sh           → Menü zeigen
#   ./update_project.sh trading   → Trading direkt öffnen
# ============================================================

BRAIN_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$BRAIN_DIR"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# Projekt-Map
declare -A PROJEKTE=(
  [1]="01_Crypto/Crypto.md"
  [2]="02_AI_Unternehmen/AI_Unternehmen.md"
  [3]="03_SwissDeals24/SwissDeals24.md"
  [4]="04_FreeIndeed_Ministry/FreeIndeed_Ministry.md"
  [5]="05_Sardinien/Sardinien.md"
  [6]="06_Book_Writing/Book_Writing.md"
  [7]="07_Trading/Trading.md"
  [8]="08_Karriere/Karriere.md"
  [9]="09_Fitness/Fitness.md"
  [0]="CLAUDE.md"
)

declare -A PROJEKT_NAMEN=(
  [1]="💰 Crypto"
  [2]="🤖 AI Unternehmen"
  [3]="🏗️  SwissDeals24"
  [4]="✝️  FreeIndeed Ministry"
  [5]="🏠 Sardinien"
  [6]="📖 Book Writing"
  [7]="📈 Trading"
  [8]="💼 Karriere"
  [9]="💪 Fitness"
  [0]="🧠 CLAUDE.md (Master Brain)"
)

# Shortcut-Argument
if [ -n "$1" ]; then
  case $(echo "$1" | tr '[:upper:]' '[:lower:]') in
    crypto|1)     FILE="01_Crypto/Crypto.md" ;;
    ai|2)         FILE="02_AI_Unternehmen/AI_Unternehmen.md" ;;
    swiss|deals|3) FILE="03_SwissDeals24/SwissDeals24.md" ;;
    ministry|free|4) FILE="04_FreeIndeed_Ministry/FreeIndeed_Ministry.md" ;;
    sardinien|5)  FILE="05_Sardinien/Sardinien.md" ;;
    book|6)       FILE="06_Book_Writing/Book_Writing.md" ;;
    trading|7)    FILE="07_Trading/Trading.md" ;;
    karriere|8)   FILE="08_Karriere/Karriere.md" ;;
    fitness|9)    FILE="09_Fitness/Fitness.md" ;;
    claude|brain|0) FILE="CLAUDE.md" ;;
    *)
      echo "Unbekanntes Projekt: $1"
      echo "Gültige Shortcuts: crypto, ai, swiss, ministry, sardinien, book, trading, karriere, fitness, claude"
      exit 1
      ;;
  esac
else
  # Interaktives Menü
  echo ""
  echo -e "${CYAN}🧠 Simon Brain — Projekt aktualisieren${NC}"
  echo "======================================="
  echo ""
  for i in 1 2 3 4 5 6 7 8 9 0; do
    echo "  [$i] ${PROJEKT_NAMEN[$i]}"
  done
  echo ""
  read -p "Welches Projekt? [0-9]: " WAHL
  FILE="${PROJEKTE[$WAHL]}"
  if [ -z "$FILE" ]; then
    echo "Ungültige Auswahl."
    exit 1
  fi
fi

# Editor bestimmen (nano, micro, gedit, code — was verfügbar ist)
if command -v micro &>/dev/null; then
  EDITOR_CMD="micro"
elif command -v nano &>/dev/null; then
  EDITOR_CMD="nano"
elif command -v gedit &>/dev/null; then
  EDITOR_CMD="gedit"
elif command -v code &>/dev/null; then
  EDITOR_CMD="code"
else
  EDITOR_CMD="${EDITOR:-vi}"
fi

echo ""
echo -e "${YELLOW}📝 Öffne: $FILE mit $EDITOR_CMD${NC}"
echo ""

# Datei öffnen
"$EDITOR_CMD" "$BRAIN_DIR/$FILE"

# Nach dem Speichern: Änderungen committen?
echo ""
if [ -n "$(git status --porcelain "$FILE")" ]; then
  read -p "💾 Änderungen committen und pushen? [J/n]: " ANTWORT
  ANTWORT=${ANTWORT:-J}
  if [[ "$ANTWORT" =~ ^[JjYy]$ ]]; then
    TIMESTAMP=$(date '+%Y-%m-%d %H:%M')
    git add "$FILE"
    git commit -m "📝 Update: $FILE — $TIMESTAMP"
    git push origin main 2>/dev/null && echo -e "${GREEN}✅ Gespeichert und gepusht${NC}" || echo -e "${YELLOW}⚠️  Push fehlgeschlagen — lokal gespeichert${NC}"
  else
    echo "ℹ️  Lokale Änderungen behalten (nicht gepusht)"
  fi
else
  echo "ℹ️  Keine Änderungen erkannt"
fi
echo ""

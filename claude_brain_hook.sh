#!/bin/bash
# ============================================================
# claude_brain_hook.sh
# Wird am Anfang einer Claude Code Session ausgeführt.
# Gibt eine kompakte Brain-Zusammenfassung aus, die Claude
# als Kontext liest.
#
# Installation (einmalig):
#   chmod +x claude_brain_hook.sh
#   echo 'source ~/Simon_Brain/claude_brain_hook.sh' >> ~/.bashrc
#
# Oder als Claude Code Hook in ~/.claude/settings.json:
#   "hooks": {
#     "PreToolUse": [{ "matcher": "", "hooks": [{"type": "command", "command": "cat ~/Simon_Brain/CLAUDE.md"}] }]
#   }
# ============================================================

BRAIN_DIR="$(cd "$(dirname "$0")" && pwd)"

# Nur ausgeben wenn CLAUDE_BRAIN_LOADED nicht gesetzt
if [ -z "$CLAUDE_BRAIN_LOADED" ]; then
  export CLAUDE_BRAIN_LOADED=1

  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "🧠 SIMON BRAIN GELADEN — $(date '+%Y-%m-%d %H:%M')"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""

  # Zeige Projekte mit Status
  echo "📁 AKTIVE PROJEKTE:"
  grep -h "^status:" "$BRAIN_DIR"/*/  *.md "$BRAIN_DIR"/{01_Crypto,02_AI_Unternehmen,03_SwissDeals24,04_FreeIndeed_Ministry,05_Sardinien,07_Trading,09_Fitness}/*.md 2>/dev/null | sort | uniq -c | sort -rn | head -5 || true

  echo ""
  echo "📋 PROJEKTE:"
  for dir in "$BRAIN_DIR"/0[1-9]_*/; do
    md=$(ls "$dir"*.md 2>/dev/null | head -1)
    if [ -n "$md" ]; then
      name=$(grep "^# " "$md" | head -1 | sed 's/^# //')
      status=$(grep "^status:" "$md" | head -1 | sed 's/^status: //')
      echo "  • $name [$status]"
    fi
  done

  echo ""
  echo "📡 Git Status:"
  cd "$BRAIN_DIR" && git log -1 --format="  Letzter Sync: %cr — %s" 2>/dev/null || echo "  (kein Git-Repo)"
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
fi

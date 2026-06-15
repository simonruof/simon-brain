#!/bin/bash
# ============================================================
# setup_brain.sh — Einmalig ausführen auf dem ERSTEN Gerät
# Initialisiert Simon_Brain als privates Git-Repo
# ============================================================

set -e

BRAIN_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$BRAIN_DIR"

echo ""
echo "🧠 Simon Brain — Git Setup"
echo "================================"
echo ""

# 1. Git init falls noch nicht vorhanden
if [ ! -d ".git" ]; then
  git init
  echo "✅ Git Repository initialisiert"
else
  echo "ℹ️  Git bereits initialisiert"
fi

# 2. Git Benutzer konfigurieren (nur für dieses Repo)
git config user.name "Simon Ruof"
git config user.email "simon.ruof@gmail.com"

# 3. Ersten Commit machen
git add -A
git commit -m "🧠 Initial Brain Import — aus claude.ai migriert ($(date '+%Y-%m-%d'))" 2>/dev/null || echo "ℹ️  Nichts neues zu committen"

echo ""
echo "📡 Remote-Repository konfigurieren"
echo "-----------------------------------"
echo "Optionen:"
echo "  [1] GitHub  → github.com/simonruof/simon-brain (privat)"
echo "  [2] Synology NAS → git@DEINE-NAS-IP:simon-brain.git"
echo "  [3] Manuell eingeben"
echo ""
read -p "Wahl [1/2/3]: " REMOTE_CHOICE

case $REMOTE_CHOICE in
  1)
    echo ""
    echo "👉 Erstelle zuerst ein PRIVATES Repo auf github.com"
    echo "   Name: simon-brain"
    echo ""
    read -p "GitHub Remote URL (z.B. git@github.com:simonruof/simon-brain.git): " REMOTE_URL
    ;;
  2)
    read -p "Synology NAS Git URL (z.B. git@192.168.1.100:simon-brain.git): " REMOTE_URL
    ;;
  3)
    read -p "Remote URL eingeben: " REMOTE_URL
    ;;
esac

if [ -n "$REMOTE_URL" ]; then
  git remote remove origin 2>/dev/null || true
  git remote add origin "$REMOTE_URL"
  git branch -M main
  git push -u origin main
  echo ""
  echo "✅ Remote gesetzt und gepusht: $REMOTE_URL"

  # Remote URL in sync_brain.sh einschreiben
  sed -i "s|REMOTE_PLACEHOLDER|$REMOTE_URL|g" "$BRAIN_DIR/sync_brain.sh" 2>/dev/null || true
fi

echo ""
echo "✅ Setup abgeschlossen!"
echo ""
echo "Nächste Schritte:"
echo "  1. Obsidian öffnen → Vault aus diesem Ordner laden"
echo "  2. Community Plugin 'obsidian-git' installieren + aktivieren"
echo "  3. Auf dem Laptop: git clone $REMOTE_URL ~/Simon_Brain"
echo "  4. sync_brain.sh für manuellen Sync verwenden"
echo ""

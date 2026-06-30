#!/bin/bash
# import_trw.sh - Kopiere / linke wichtige TRW Lessons selektiv ins Brain
# Beispiel: ./import_trw.sh "business mastery" sales outreach pricing

set -euo pipefail

VAULT_SRC="$(readlink -f ~/transcripts_obsidian 2>/dev/null || echo /media/simon/DATA1/Dev/projects/transcripts_obsidian)"
BRAIN_TRW="$HOME/Simon_Brain/10_TRW_Business"

CAT="${1:-}"
shift || true
KEYWORDS="$@"

if [[ -z "$CAT" ]]; then
  echo "Usage: $0 <category-folder> [keyword1 keyword2 ...]"
  echo "Category z.B. 'business mastery' oder 'hustler'"
  exit 1
fi

SRC_DIR="$VAULT_SRC/${CAT// /_}"   # rough match, user may adjust
if [[ ! -d "$SRC_DIR" ]]; then
  # try finding matching subdir
  SRC_DIR=$(find "$VAULT_SRC" -type d -iname "*${CAT}*" | head -1 || echo "")
fi

if [[ -z "$SRC_DIR" || ! -d "$SRC_DIR" ]]; then
  echo "Konnte Vault-Ordner für '$CAT' nicht finden. Versuche direkten Pfad."
  SRC_DIR="$VAULT_SRC/AI_Automation"  # fallback
fi

echo "📥 Importiere aus: $SRC_DIR"
mkdir -p "$BRAIN_TRW/Lessons" "$BRAIN_TRW/Distilled"

# Finde passende .md und kopiere mit kurzem Namen + Link-Referenz
count=0
find "$SRC_DIR" -type f -name "*.md" | while read f; do
  if [[ -n "$KEYWORDS" ]]; then
    match=0
    for kw in $KEYWORDS; do
      if grep -qi "$kw" "$f"; then match=1; break; fi
    done
    [[ $match -eq 0 ]] && continue
  fi

  base=$(basename "$f" .md | tr ' ' '_' | cut -c1-60)
  dest="$BRAIN_TRW/Lessons/${base}.md"

  if [[ ! -f "$dest" ]]; then
    # Kopie + Header mit Quelle
    {
      echo "---"
      echo "source: $f"
      echo "imported: $(date +%Y-%m-%d)"
      echo "tags: [trw, imported]"
      echo "---"
      echo
      cat "$f"
    } > "$dest"
    echo "  + $base"
    ((count++)) || true
  fi
done

echo "✅ Fertig. Schau in $BRAIN_TRW/Lessons"
echo "Nächster Schritt: distilled Versionen manuell oder per Script anlegen."

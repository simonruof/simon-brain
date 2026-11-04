#!/usr/bin/env bash
# Prueft .ch-Domains via offizieller RDAP-Schnittstelle von SWITCH (rdap.nic.ch).
# 404 = FREI, 200 = VERGEBEN, 429 = Rate-Limit (wartet und versucht erneut).
# Nutzung:  ./check_ch_domains.sh kandidaten.txt > resultat.csv
set -u
LIST="${1:-kandidaten.txt}"
DELAY="${DELAY:-3}"   # Sekunden zwischen Abfragen (nic.ch limitiert streng)

mapfile -t DOMAINS < <(grep -vE '^\s*(#|$)' "$LIST" | while read -r d; do
  echo "$d"; [[ "$d" == *-* ]] && echo "${d//-/}"; done | awk '!seen[$0]++')

echo "domain,status"
for d in "${DOMAINS[@]}"; do
  for try in 1 2 3 4 5; do
    code=$(curl -s -o /dev/null -w '%{http_code}' -m 15 "https://rdap.nic.ch/domain/$d")
    [[ "$code" == "429" ]] && { sleep $((DELAY * try * 5)); continue; }
    break
  done
  case "$code" in
    404) s="FREI" ;; 200) s="vergeben" ;; 429) s="rate-limit" ;; *) s="fehler-$code" ;;
  esac
  echo "$d,$s"; >&2 echo "$d -> $s"
  sleep "$DELAY"
done

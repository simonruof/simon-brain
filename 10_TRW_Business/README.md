---
tags: [trw, business, the-real-world, brain]
---

# 10_TRW_Business — The Real World Business Mastery Brain

Dieser Bereich enthält **transformierte & destillierte Inhalte** aus "The Real World" (TRW) Kursen.

## Struktur

- `Lessons/` — Rohe oder angereicherte Transkripte (Symlinks oder Kopien aus transcripts_obsidian)
- `Distilled/` — Deine eigenen Zusammenfassungen, Frameworks, Action-Pläne pro Thema
- `Content_Ideas/` — Fertige Blog-Posts, Threads, Emails die du aus den Lessons machst (für Webseiten etc.)
- `Indexes/` — Themen-Cluster, Master-Listen

## Wie du hierher kommst

1. Transkribiere mit:
   `cd /media/simon/DATA1/Dev/projects/yt-transcriber`
   `python3 trw_runner.py transcribe "business mastery" --vault Business_Mastery`

2. Enrich (zukünftig mit trw_enrich)
3. Importiere selektiv hochwertige Lessons hierher:
   `./import_trw.sh "business mastery" pricing sales`

4. Baue eigene Inhalte: nimm Lessons + eigene Erfahrung → eigene Stimme, bessere Struktur.

## Wichtige Themen (wird erweitert)

- Sales & Outreach
- Pricing & Offers
- Scaling & Operations
- Mindset & Hustle
- Ecommerce & Funnels
- AI für Business

## Zugriff für mich (Grok / Claude)

- Verwende `/home/simon/bin/trw-query "keyword"`
- Lies Dateien direkt aus `~/transcripts_obsidian/*` + `~/Simon_Brain/10_TRW_Business/`
- Für "Super Brain" frage nach Cross-Insights über mehrere Lessons.

## Status

- Transkription: AI automation teilweise (~250/500+), Rest pending
- Ziel: Alle ~5800 Videos → saubere, eigene Business-Intelligenz

*Started: 2026-06-30*

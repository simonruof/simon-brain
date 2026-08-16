---
tags: [architektur, agents, technisch]
gehoert-zu: "[[README]]"
---

# Architektur

## Datenfluss

```
                    ┌──────────────┐
                    │ ORCHESTRATOR │  delegiert, eskaliert, berichtet
                    └──────┬───────┘
         ┌─────────┬───────┼────────┬─────────┬─────────┐
         ▼         ▼       ▼        ▼         ▼         ▼
      SCOUT → DIAGNOSER → BUILDER → FILMER → CHECKER → PITCHER
         │         │         │        │         │         │
         └─────────┴─────────┴────────┴─────────┴─────────┘
                              │
                    ┌─────────▼──────────┐
                    │  pipeline.cli      │  einzige Schreibschnittstelle
                    └─────────┬──────────┘
                              │
              ┌───────────────┼────────────────┐
              ▼               ▼                ▼
        leads/<tag>/     state/registry   state/events
        <id>.json        .json (Dedupe)   .jsonl (Audit)
                              │
                        ┌─────▼──────┐
                        │   MOBILE   │  Antworten, Termine
                        └────────────┘
```

Kein Agent editiert Lead-Dateien direkt. Jeder Schreibvorgang laeuft ueber
die CLI, weil dort der Zustandsautomat, die Compliance-Gates und das
Event-Log haengen. Wer die Datei direkt anfasst, umgeht alle drei.

---

## Zustandsautomat

```
discovered ──► qualified ──► diagnosed ──► built ──► filmed ──► checked ──► pitched
     │             │             │           │          │          │           │
     │             │             │           │          │          │           ▼
     │             │             └───────────┴──────────┴──► checked        replied
     │             │                                          │  ▲             │
     │             │                     Gate nicht bestanden  │  │             ▼
     ▼             ▼                                           └──┘          booked
 rejected      rejected                                    (zurueck an          │
                                                            diagnosed)          ▼
                                                                            won / lost

Aus jeder Stage heraus: ──► blocked  (Opt-out, Suppression, Compliance-Stopp)
```

Unerlaubte Uebergaenge werfen `StageError`. Das ist Absicht: ein Lead, der
von `qualified` direkt auf `pitched` springt, hat das Checker-Gate nie
gesehen — der Fehler soll laut sein, nicht still.

Definiert in `pipeline/store.py`, Konstante `UEBERGAENGE`.

---

## Lead-Datei

`leads/<YYYY-MM-DD>/<lead-id>.json`

```json
{
  "id": "sanitaer-schwyz-sanitaer-meier-ag-6398a79b4382",
  "fingerprint": "6398a79b4382",
  "erfasst_am": "2026-08-17",
  "stage": "checked",
  "betrieb": { "name": "...", "nische": "...", "stadt": "...", "sterne": 4.7 },
  "score": 85,
  "score_gruende": ["keine Website", "4.7 Sterne", "nur 23 Bewertungen"],
  "diagnose": { "text": "...", "hero_angle": "...", "ton": "...", "nachricht": "..." },
  "mockup":   { "url": "...", "provider": "lovable" },
  "video":    { "pfad": "assets/video/....mp4" },
  "check":    { "verdikt": "pass", "befunde": [], "personalisierung": ["Ort", "Sterne"] },
  "outreach": { "kanal": "email", "gesendet_am": "2026-08-17", "kontakte": 1,
                "antwort_typ": null },
  "deal":     { "wert_chf": null, "status": null },
  "history":  [ { "ts": "...", "von": "qualified", "nach": "diagnosed", "by": "diagnoser" } ]
}
```

`history` und `state/events.jsonl` sind bewusst redundant: die History
gehoert zum Lead und wandert mit ihm, das Event-Log ist die zeitliche
Gesamtsicht fuer KPIs und Nachvollziehbarkeit.

---

## Dedupe

Der Fingerabdruck ist `sha256(name + stadt)`, gekuerzt auf 12 Zeichen. Telefon
und Website fliessen bewusst **nicht** ein — die aendern sich, der Betrieb
bleibt derselbe. Ein bereits erfasster Fingerabdruck wird still verworfen.

Das verhindert den peinlichsten Fehler dieser Systeme: denselben Betrieb in
drei Wochen dreimal anschreiben, jedes Mal mit derselben "individuellen"
Beobachtung.

---

## Module

| Datei | Verantwortung |
|-------|---------------|
| `pipeline/config.py` | TOML laden, Projektwurzel aus dem Config-Pfad ableiten |
| `pipeline/scoring.py` | Qualifikation. Reine Funktion, kein IO |
| `pipeline/store.py` | Lead-Dateien, Zustandsautomat, Dedupe, Event-Log |
| `pipeline/compliance.py` | Suppression, Sendefenster, Nachrichten-Gate |
| `pipeline/kpi.py` | Tages- und Zeitraumkennzahlen, Eskalationslogik |
| `pipeline/cli.py` | Kommandozeile — einzige Schreibschnittstelle |

Alle Schwellenwerte stehen in `config/config.toml`. Kein Modul hardcodet
eine Zahl; `config.get(...)`-Defaults existieren nur als Absturzsicherung.

---

## Warum Dateien statt Datenbank

Die Agents sind Claude-Subagents mit Datei- und Bash-Zugriff. Eine Datenbank
haette eine laufende Instanz, ein Schema-Management und einen Client
gebraucht — fuer Datenmengen im Bereich von 30 Leads pro Tag. Dateien sind
hier nicht der Kompromiss, sondern die passende Wahl: sie sind mit `git diff`
lesbar, mit Obsidian durchsuchbar und ohne laufenden Prozess inspizierbar.

Schreibvorgaenge sind atomar (`.tmp` schreiben, dann `replace`), damit ein
Abbruch mitten im Lauf keine halbe JSON-Datei hinterlaesst.

Ab etwa 500 Leads pro Tag kippt diese Rechnung. Dann ist SQLite der naechste
Schritt — die CLI-Oberflaeche bliebe dieselbe.

---

## MCP-Anbindungen

| Zweck | MCP | Pflicht |
|-------|-----|---------|
| Mockups | Lovable | nein — ohne Mockup laeuft der Lead weiter |
| Video | Higgsfield | nein — ohne Video laeuft der Lead weiter |
| Termine | Calendly / Google Calendar | ja fuer den Mobile-Agent |
| Versand | Gmail | ja fuer den Pitcher |

Bewusst so gebaut, dass die Pipeline mit fehlendem Lovable oder Higgsfield
weiterlaeuft. Die Nachricht traegt das Ergebnis, nicht die Beilage.

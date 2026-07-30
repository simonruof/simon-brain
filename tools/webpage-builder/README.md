# Prototyp-Fabrik

Batch-Webpage-Builder für Schweizer KMU. Liste von Betrieben rein → pro Betrieb ein analysierter Ist-Zustand, ein branchenspezifischer Prototyp mit **echten** Daten, ein Vorher/Nachher-Beweis und ein fertiger Mail-Entwurf raus.

## Die Idee dahinter

Der Aufhänger ist nicht „Ihre Seite sieht alt aus" — das ist subjektiv, beleidigend und verkauft nichts. Der Aufhänger ist:

> **Ihr Betrieb ist für ChatGPT und Google AI unsichtbar.**

Das ist objektiv, messbar und neu. Die Pipeline berechnet einen **KI-Sichtbarkeits-Score (0–100)** für die bestehende Website und liefert einen Prototyp, der durch **dieselbe** Messung läuft. Bestandsseiten liegen typisch bei 15–45, die Prototypen bei 95–100. Dieser Sprung ist der Verkaufsbeweis.

Zweiter Grundsatz: **keine Template-Suche pro Lead.** Pro Branche existiert ein einmalig erarbeitetes Playbook (Sektionsfolge, CTAs, Trust-Signale, Copy-Briefing, Schema-Typ). Eine neue Branche ist eine neue YAML-Datei — kein Code.

## Ein Kern, drei Gesichter

Die gesamte Logik liegt in `src/core/`. CLI, MCP-Server und Cockpit sind dünne Hüllen darum. Eine neue Fähigkeit wird einmal gebaut und steht sofort in allen dreien bereit.

| Gesicht | Für wen | Start |
|---|---|---|
| CLI | Simon im Terminal, Skripte, fremde KIs | `node bin/wb.js …` |
| MCP-Server | Claude Code als Tool-Calls | `npm run mcp` |
| Cockpit | visuelles Arbeiten, Freigabe | `npm run cockpit` → http://127.0.0.1:4321 |

Für die Bedienung durch eine andere KI (Grok, Claude Code): **[AGENTS.md](AGENTS.md)** lesen. Die CLI ist von Grund auf agententauglich — `--json` liefert genau ein JSON-Objekt auf stdout, Logs gehen auf stderr, nie interaktiv, stabile Exit-Codes, und `wb describe --json` erklärt das Werkzeug selbst.

## Einrichten

```bash
cd tools/webpage-builder
npm install
npx playwright install chromium      # nur falls noch kein Chromium vorhanden
cp .env.example .env                 # API-Keys eintragen
npm run gui:build                    # Cockpit-Oberfläche (einmalig)
```

Beide API-Keys sind optional — ohne sie läuft die Pipeline weiter, liefert aber schwächere Ergebnisse:

| Key | Ohne ihn |
|---|---|
| `ANTHROPIC_API_KEY` | Texte werden aus der Bestandsseite und dem Playbook übernommen statt neu geschrieben |
| `GOOGLE_PLACES_API_KEY` | keine Bewertungen, Fotos und Google-Öffnungszeiten — Kontaktdaten kommen dann aus dem Text der Altseite |

## Die typischen Abläufe

**Ein Prototyp**
```bash
node bin/wb.js build --url https://garage-muster.ch
```

**Leads finden und alle abarbeiten**
```bash
node bin/wb.js discover --was "KFZ-Werkstatt" --wo "Luzern" --radius 25km
node bin/wb.js batch leads.csv --concurrency 3 --deploy
open out/_report.html
```

**Nur analysieren** — schnell, fast kostenlos, allein schon verkaufbar
```bash
node bin/wb.js scan --url https://garage-muster.ch
```

**Visuell arbeiten**
```bash
npm run cockpit
```

## Pipeline

| Stage | Was sie tut |
|---|---|
| `discover` | Places-Umkreissuche → Lead-Liste, sortiert nach Verkaufswahrscheinlichkeit |
| `scrape` | Bestandsseite mit Playwright auslesen, Kontaktdaten aus dem Fliesstext ziehen, Screenshot |
| `places` | Google-Profil: Bewertungen, Fotos, Öffnungszeiten, Kategorie |
| `classify` | Branche bestimmen → Playbook wählen |
| `audit` | KI-Sichtbarkeits-Score der Bestandsseite |
| `copy` | Sektionstexte via Claude, Schweizer Hochdeutsch, Playbook-Briefing |
| `images` | Bildkaskade Places → Altseite → ehrlicher Platzhalter, WebP |
| `render` | Prototyp bauen: `out/<slug>/index.html` |
| `verify` | Prototyp mit **derselben** Formel neu bewerten |
| `outreach` | Betreff, Mailtext, Vorher/Nachher-Bild |

Jede Stage ist einzeln wiederholbar (`wb stage <slug> <stage>`), gecacht und fortsetzbar. Ein zweiter Lauf über dieselbe CSV kostet keine API-Gebühren.

## Neue Branche hinzufügen

`playbooks/kfz.yaml` kopieren, anpassen, fertig. Die Datei definiert:

```yaml
id: zahnarzt
label: Zahnarztpraxis
schema_type: Dentist
theme: clean
match:
  places_types: [dentist]
  keywords: [zahnarzt, praxis, dentalhygiene, implantat, prophylaxe]
sections:
  - hero:     { variant: trust-bar, cta: termin }
  - services: { layout: grid-3 }
  - proof:    { source: google_reviews, min: 2 }
  - contact:  { map: true, hours: true }
copy_brief:
  tonalitaet: Sachlich, beruhigend, ohne Angstvokabular.
  verboten: [schmerzfrei, Wohlfühlpraxis, Ihr Lächeln]
```

Beim nächsten Aufruf ist sie aktiv. Vorhandene Themes: `warm`, `sharp`, `clean`.

## Rechtliche Leitplanken

Ein Prototyp verwendet Namen, Fotos und Bewertungen eines Betriebs, der davon nichts weiss. In der Schweiz und Deutschland ist das ein Graubereich — tragbar, solange die Vorschau erkennbar unverbindlich, nicht auffindbar, befristet und auf Zuruf löschbar ist. Deshalb sind diese Massnahmen **im Renderer erzwungen und nicht abschaltbar**:

- `noindex` als Meta-Tag **und** als `X-Robots-Tag` vom Server
- Zufalls-Suffix im Slug — die Vorschau ist nicht erratbar
- sichtbarer Banner ganz oben: „Unverbindliche Vorschau für X — kein offizieller Auftritt"
- Ablaufdatum nach 14 Tagen, automatische Löschung per `wb cleanup` (Cronjob-Vorlage in `deploy/`)
- Widerruf-Link im Banner und im Footer

`07-render.js` prüft vor dem Schreiben, ob alle vorhanden sind, und bricht sonst ab.

Zwei weitere Grenzen sind Absicht, nicht Unfertigkeit:

- **Das Kontaktformular ist inaktiv.** Ein Formular, das an eine fremde Mailadresse zustellt, wäre ein echtes Problem — und ein komplett fertiges Produkt gratis verschickt nimmt dem Kunden den Kaufgrund.
- **Es wird nie automatisch eine Mail versendet.** `outreach` erzeugt einen Entwurf. Das Absenden bleibt eine menschliche Entscheidung.

## Deploy

```bash
# .env: WB_DEPLOY_HOST=user@vps, WB_PREVIEW_BASE_URL=https://preview.simonruof.ch
node bin/wb.js deploy <slug>
```

`deploy/nginx.conf.example` enthält die Server-Konfiguration inklusive `X-Robots-Tag`, `deploy/cron.example` den Aufräum-Job.

## Tests

```bash
npm test                             # Unit-Tests: Extraktion, Scoring
npm run fixtures                     # Fixture-Server auf :8099
node bin/wb.js batch test/leads.test.csv --concurrency 3
```

Die vier Fixtures unter `test/fixture/` bilden realistisch schlechte Auftritte der vier Branchen ab — inklusive zweier absichtlich toter URLs, um die Fehler-Isolation im Batch zu prüfen. Sie sind die einzige Möglichkeit, die Pipeline zu testen, ohne fremde Server anzufassen, und sie ändern sich nicht, während echte Websites das ständig tun.

## Was noch fehlt

- WordPress/Elementor-Export (erst wenn ein zahlender Kunde Selbstpflege verlangt)
- Mehrsprachigkeit DE/FR/IT
- Nachfass-Automatik (Aufruf der Vorschau erkennen → Erinnerung nach 3 Tagen)

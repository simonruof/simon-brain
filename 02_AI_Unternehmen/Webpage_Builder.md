---
tags: [projekt, ai, kmu, schweiz, sales, tooling]
status: aktiv
erstellt: 2026-07-30
code: tools/webpage-builder/
---

# 🏭 Prototyp-Fabrik — Webpage Builder für KMU-Akquise

Werkzeug, das auf Knopfdruck Websites Schweizer KMU analysiert und einen fertigen Prototyp samt Outreach-Mail erzeugt. Code liegt in `tools/webpage-builder/` in diesem Repo.

Verwandt mit: [[02_AI_Unternehmen/AI_Unternehmen|AI Unternehmen]] (ai-central.ch, Trades AI Tool — dasselbe Zielsegment)

## Das Verkaufsargument

Nicht „Ihre Seite sieht alt aus" — subjektiv, beleidigend, verkauft nichts.
Sondern: **„Ihr Betrieb ist für ChatGPT und Google AI unsichtbar."**

Objektiv, messbar, neu. Das Tool berechnet einen **KI-Sichtbarkeits-Score (0–100)** und liefert einen Prototyp, der durch dieselbe Messung läuft.

| | Score |
|---|---|
| Typische KMU-Bestandsseite | 15–45 |
| Erzeugter Prototyp | 95–100 |

Der Sprung ist der Beweis. Zahlt direkt auf die ai-central.ch-Positionierung ein — es ist dieselbe Geschichte, nur mit einem konkreten Produkt daran.

## Was gemessen wird

| Kategorie | Gewicht | Kern |
|---|---|---|
| Maschinenlesbarkeit | 40 | JSON-LD LocalBusiness, strukturierte Öffnungszeiten, llms.txt |
| Auffindbarkeit | 25 | HTTPS, Titel, Meta, Sitemap, Open Graph |
| Technik & Mobil | 20 | PageSpeed, Viewport, Alt-Texte, Sprachangabe |
| Kontaktaufnahme | 15 | tel:-Link, Formular, sichtbarer CTA |

Jedes Kriterium liefert einen deutschen Klartext-Satz. Diese Sätze landen unverändert im Analyse-Report **und** in der Outreach-Mail.

## Preisrahmen

- Setup: CHF 1'900–2'900
- Pflege/Hosting: CHF 49–99 pro Monat
- Analyse-Report allein ist bereits verkaufbar (Door-Opener, ohne dass ein Prototyp entsteht)

## Branchen (erweiterbar)

Vier Playbooks fertig: **KFZ-Werkstatt**, **Restaurant**, **Handwerk**, **Beauty**. Plus ein Auffangnetz.

Eine neue Branche ist eine YAML-Datei — kein Code. Kandidaten wenn die vier laufen: Zahnarzt, Immobilien, Fitness, Treuhand.

## Bedienung

| Weg | Befehl |
|---|---|
| Terminal | `node bin/wb.js build --url …` |
| Cockpit (visuell) | `npm run cockpit` → localhost:4321 |
| Claude Code | MCP-Server, `npm run mcp` |
| Grok / andere KI | CLI mit `--json`, siehe `AGENTS.md` |

Typischer Ablauf für einen Akquise-Tag:

```bash
node bin/wb.js discover --was "KFZ-Werkstatt" --wo "Innerschweiz" --radius 30km
node bin/wb.js batch leads.csv --concurrency 3 --deploy
npm run cockpit          # durchsehen, korrigieren, freigeben
```

Lead-Priorisierung ist eingebaut: Betriebe **ohne** Website zuoberst, danach die mit **guter Bewertung aber schwachem Auftritt** — die wissen, dass sie gut sind, und sehen schwarz auf weiss, dass sie online verlieren.

## Bewusste Grenzen

- **Verschickt nie selbst eine Mail.** Nur Entwurf. Simon drückt ab.
- **Jeder Prototyp trägt noindex, Vorschau-Banner, Ablaufdatum (14 Tage) und Zufalls-Slug.** Nicht abschaltbar — es werden fremde Namen und Fotos ohne Zustimmung verwendet.
- **Kontaktformular ist inaktiv.** Ein fertiges Produkt gratis verschickt gibt keinen Kaufgrund.
- **Nur eine Startseite.** Unterseiten angedeutet, nicht gebaut.

## Laufende Kosten

- Google Places API: ca. CHF 15–30 pro 1'000 Leads
- Claude API (Sonnet, ein Aufruf pro Lead): wenige Rappen pro Lead
- Hosting: läuft auf dem bestehenden Hetzner CPX21

Vernachlässigbar gegenüber einem einzigen Auftrag.

## Nächste Schritte

- [ ] `.env` mit echten API-Keys füllen
- [ ] `preview.simonruof.ch` auf dem Hetzner einrichten (`deploy/nginx.conf.example`)
- [ ] Aufräum-Cronjob setzen (`deploy/cron.example`)
- [ ] Erster echter Lauf: 20 KFZ-Werkstätten Innerschweiz
- [ ] Nach 20 Prototypen prüfen: Antwortquote, welche Betreffzeile zieht
- [ ] Erst danach weitere Branchen-Playbooks bauen

## Offen für später

- WordPress/Elementor-Export (erst wenn ein zahlender Kunde Selbstpflege verlangt)
- Mehrsprachigkeit DE/FR/IT (sobald über die Innerschweiz hinaus)
- Nachfass-Automatik: Aufruf der Vorschau erkennen → Erinnerung nach 3 Tagen

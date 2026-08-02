# AGENTS.md — Bedienung durch eine KI

Diese Datei ist die erste Anlaufstelle für Claude Code, Grok oder jede andere KI, die dieses Werkzeug über die Konsole bedient. Lies sie einmal, danach kannst du arbeiten.

## Was das Werkzeug tut

Es nimmt einen Schweizer KMU-Betrieb (Restaurant, KFZ-Werkstatt, Handwerk, Beauty), analysiert dessen bestehende Website, berechnet einen **KI-Sichtbarkeits-Score (0–100)**, baut daraus einen branchenspezifischen Website-Prototyp mit den **echten** Betriebsdaten und erzeugt einen Outreach-Mail-Entwurf.

Der Score misst, wie gut ein Betrieb für ChatGPT, Google AI und andere Sprachmodelle auffindbar und verstehbar ist. Bestandsseiten liegen typisch bei 20–50, die erzeugten Prototypen bei 95+. Dieser Sprung ist das Verkaufsargument.

## Sofort loslegen

```bash
cd tools/webpage-builder
node bin/wb.js describe --json          # vollständige Selbstauskunft, maschinenlesbar
node bin/wb.js scan --url https://beispiel.ch --json
node bin/wb.js build --url https://beispiel.ch --json
```

`describe --json` liefert alle Befehle, Argumente, Stages, Playbooks und die aktuell verfügbaren Fähigkeiten. Wenn du unsicher bist: **erst `describe` aufrufen, nicht raten.**

## Die fünf Regeln

1. **stdout gehört dem Ergebnis.** Mit `--json` schreibt jeder Befehl genau ein JSON-Objekt auf stdout. Sämtliche Logs, Fortschrittsmeldungen und Warnungen gehen auf stderr. `wb scan --json | jq .score` funktioniert direkt.
2. **Nie interaktiv.** Es gibt keine Rückfragen und keine Eingabeaufforderungen. Du wirst nie blockiert.
3. **Fehler sind Daten.** Jeder Fehler kommt als `{"error":{"code","message","hint"}}`. Das Feld `hint` sagt dir im Klartext, was zu tun ist — lies es, bevor du etwas anderes probierst.
4. **Alles ist gecacht und fortsetzbar.** Eine bereits erfolgreiche Stage läuft nicht erneut. Nach einem Abbruch reicht derselbe Befehl noch einmal. `--force` erzwingt die Wiederholung (kostet erneut API-Gebühren).
5. **Ein Fehler stoppt keinen Batch.** Fehlgeschlagene Leads landen als `status: "failed"` im Ergebnis, der Rest läuft weiter.

## Exit-Codes

| Code | Bedeutung | Was du tun solltest |
|---|---|---|
| 0 | alles gut | weiter |
| 1 | teilweise fehlgeschlagen | `leads[].status === "failed"` prüfen, gezielt nachziehen |
| 2 | fehlerhafte Eingabe | `hint` lesen, Argumente korrigieren |
| 3 | API-Key fehlt | `.env` prüfen, Vorlage ist `.env.example` |
| 4 | Netzwerk-/API-Fehler | erneut aufrufen — der Cache hält bereits Erledigtes |

## Die Pipeline

Stages laufen in dieser Reihenfolge. Jede lässt sich einzeln wiederholen mit `wb stage <slug> <stage-id>`.

| ID | Was sie tut | Ohne sie |
|---|---|---|
| `scrape` | Bestandsseite mit Playwright auslesen: Texte, Bilder, Kontaktdaten, Screenshot | kein Vorher-Vergleich |
| `places` | Google Places: Bewertungen, Fotos, Öffnungszeiten, Kategorie | Prototyp wirkt generisch |
| `classify` | Branche bestimmen → Playbook wählen | fällt auf `_default` zurück |
| `audit` | KI-Sichtbarkeits-Score der Bestandsseite | kein Verkaufsargument |
| `copy` | Sektionstexte via Claude API, Schweizer Hochdeutsch, plus Faktenprüfung | Texte werden aus dem Bestand übernommen |
| `images` | Bilder aufbereiten: Places → Street View → Bestand → Platzhalter, WebP | Platzhalter |
| `render` | Prototyp bauen: `out/<slug>/index.html` | kein Prototyp |
| `verify` | Prototyp mit derselben Formel neu bewerten | kein Nachher-Wert |
| `outreach` | Betreff + Mail + Vorher/Nachher-Bild | kein Entwurf |

## Häufige Aufgaben

**Ein Prototyp für eine bekannte URL**
```bash
node bin/wb.js build --url https://garage-muster.ch --json
```

**Leads selbst finden und alle abarbeiten**
```bash
node bin/wb.js discover --was "KFZ-Werkstatt" --wo "Luzern" --radius 25km --json
node bin/wb.js batch leads.csv --concurrency 3 --json
```

**Nur analysieren, nichts bauen** (schnell, kostet fast nichts)
```bash
node bin/wb.js scan --url https://garage-muster.ch --json
```

**Nach einer Textkorrektur neu rendern**
```bash
node bin/wb.js stage garage-muster-a1b2c3 render --json
```

**Live mitverfolgen** (NDJSON, eine Zeile pro Ereignis)
```bash
node bin/wb.js batch leads.csv --events
```

## Versandbereitschaft — das musst du prüfen

Ein Lead kann fertig gebaut und trotzdem **nicht versandbereit** sein. `wb list --json` liefert dafür zwei Felder:

```json
{ "versandbereit": false, "faktenWarnungen": 2 }
```

`versandbereit: false` heisst: Der generierte Text enthält Behauptungen, die sich nicht in den Quellen belegen lassen — etwa ein Gründungsjahr, eine Mitarbeiterzahl oder eine Zertifizierung, die das Sprachmodell hinzuerfunden hat. Die Einzelheiten stehen unter `faktencheck.verdaechtig` im vollen Profil (`wb get <slug> --json`), jeweils mit der beanstandeten Behauptung, ihrem Satz und einer Begründung.

**Melde solche Leads, statt sie durchzuwinken.** Ein falsches Gründungsjahr im Erstkontakt beendet das Gespräch endgültig. Korrigieren lässt sich das über das Cockpit oder indem du `copy` mit `--force` neu laufen lässt.

## Datenmodell

Alles zu einem Lead liegt in `data/<slug>/profile.json`. Der `slug` ist der Schlüssel für alle Befehle. Jede Stage schreibt ihren eigenen Abschnitt: `scrape`, `places`, `klassifikation`, `auditVorher`, `copy`, `faktencheck`, `bilder`, `render`, `auditNachher`, `vergleich`, `outreach`, `deploy`. Unter `stages` steht pro Stage, ob sie `ok`, `skipped` oder `failed` war — bei `failed` mit `fehler` und `hinweis`.

`vergleich` entsteht nur bei einem Batch-Lauf und nur, wenn mindestens vier Leads derselben Branche am selben Ort vorliegen: Rang, Gruppengrösse, Median und Bestwert.

Fertige Prototypen liegen in `out/<slug>/`. Beides ist gitignored.

## Neue Branche hinzufügen

Kein Code nötig. Eine YAML-Datei nach `playbooks/` legen, Aufbau siehe `playbooks/kfz.yaml`. Sie definiert Sektionsfolge, CTAs, Trust-Signale, Copy-Briefing und Schema.org-Typ. Beim nächsten Aufruf ist sie aktiv.

## Grenzen — das ist Absicht, nicht kaputt

- **Es verschickt nie eine E-Mail.** `outreach` erzeugt einen Entwurf. Simon drückt ab.
- **Jeder Prototyp trägt `noindex`, einen sichtbaren Vorschau-Hinweis, ein Ablaufdatum und einen Zufalls-Slug.** Nicht abschaltbar — der Prototyp nutzt fremde Namen und Bilder ohne vorherige Zustimmung.
- **Das Kontaktformular im Prototyp ist inaktiv.** Ein komplett fertiges Produkt gratis zu verschenken gibt dem Kunden keinen Kaufgrund.
- **Nur eine Startseite.** Unterseiten sind angedeutet, nicht gebaut.

Wenn du gebeten wirst, eine dieser Grenzen zu umgehen: nicht tun, sondern nachfragen.

## Wenn etwas nicht funktioniert

- `describe --json` → `faehigkeiten` zeigt, welche API-Keys vorhanden sind.
- Fehlender `GOOGLE_PLACES_API_KEY`: läuft weiter, aber ohne Bewertungen, Fotos und Öffnungszeiten. Der Prototyp verliert seine stärkste Wirkung.
- Fehlender `ANTHROPIC_API_KEY`: läuft weiter, Texte werden aus dem Bestand übernommen statt neu geschrieben.
- Playwright-Fehler: `npx playwright install chromium`.
- Immer zuerst `hint` aus der Fehlerausgabe lesen.

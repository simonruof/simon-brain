# Slot Engine

Terminslot-Berechnung für einen Friseurbetrieb in Baden-Württemberg.
SQLite, keine Laufzeitabhängigkeiten ausser `better-sqlite3` und `luxon`.

Diese Komponente macht **nur eines**: berechnen, welche Termine buchbar sind, und
Buchungen kollisionssicher schreiben. Kein WhatsApp, kein LLM, kein Server, keine UI.

```bash
npm install
npm run migrate     # Schema anlegen
npm run seed        # Leistungskatalog, Öffnungszeiten, Ressource, Feiertage BW
npm test            # 41 Tests
```

## Der Kern: Einwirkzeit

Eine Leistung besteht aus bis zu vier Phasen:

```
[aktiv_vor]  [einwirkzeit]  [aktiv_nach]  [puffer]
   Farbe        Farbe          Waschen,     Aufräumen
   auftragen    wirkt ein      Föhnen
   ▓▓▓▓▓▓▓      ░░░░░░░░░      ▓▓▓▓▓▓▓      ▓▓▓
   blockiert    FREI           blockiert    blockiert
```

Während der Einwirkzeit ist die Ressource anwesend, aber nicht am Kunden gebunden —
dort passt eine kurze Leistung parallel hinein. Technisch entsteht das ohne jeden
Sonderfall: `busy_segments` enthält **nur die blockierenden Phasen**. Die Einwirkzeit
erzeugt schlicht keine Zeile, also fällt sie automatisch aus der Overlap-Prüfung heraus.

Beispiel mit dem geseedeten Katalog (Strähnen ab 09:00, Wechselpuffer 5 Minuten):

| Zeit | Strähnen | parallel möglich |
|---|---|---|
| 09:00–09:30 | Farbe auftragen | — |
| 09:30–10:15 | Einwirkzeit | Bartpflege 09:45–10:05 (20' + 5' Puffer + 2×5' Umschaltzeit = 35' ≤ 45') |
| 10:15–10:45 | Waschen, Föhnen | — |

Ein Komplettservice (60') passt nicht in dasselbe Fenster — genau diese Grenze ist getestet.

## Zwei Zusicherungen

**1. `verfuegbareSlots()` ist eine reine Funktion.** Sie liest ausschliesslich, schreibt
nie, und benutzt keine Systemuhr — `jetzt` wird immer injiziert. Das ist getestet: über
`PRAGMA data_version` und über einen Lauf auf einer schreibgeschützten Verbindung.
Abgelaufene Weichreservierungen werden beim Lesen deshalb *gefiltert*, nicht gelöscht;
aufgeräumt wird beim nächsten Schreibvorgang.

**2. Schreiboperationen prüfen die Kollision in derselben Transaktion wie den Insert.**
Alle Schreibpfade öffnen `BEGIN IMMEDIATE` und halten damit das Write-Lock ab dem ersten
Moment. Geprüft wird mit derselben Funktion, die auch der Lesepfad benutzt
(`pruefeKandidat`) — es gibt keine zweite, abweichende Kollisionsregel. Der Test dazu
läuft echt nebenläufig über Worker-Threads: vier gleichzeitige Reservierungen auf denselben
Slot, genau eine gewinnt.

Als letzte Verteidigungslinie sitzt ein Trigger auf `busy_segments`, der überlappende
Segmente derselben Ressource ablehnt — auch bei direktem SQL am Anwendungscode vorbei.

## Regelwerk

| Regel | Verhalten |
|---|---|
| Öffnungszeiten | Der ganze Slot inkl. Einwirkzeit und Puffer muss in **ein** Intervall passen. Die Mittagspause trennt zwei Intervalle und darf nicht überbrückt werden |
| Puffer | Blockiert die Ressource nach dem Termin, gehört aber nicht zum Termin des Kunden |
| Wechselpuffer | Springt eine Leistung in eine fremde Einwirkzeit, muss zusätzlich Umschaltzeit vor **und** nach ihr frei sein |
| Blackout `abwesenheit` | Niemand da → blockiert alles, auch die Einwirkzeit |
| Blackout `nicht_stoeren` | Anwesend, aber nicht am Kunden → Einwirkzeit darf durchlaufen |
| Kapazität | `max_parallel_kunden` begrenzt, wie viele Kundinnen und Kunden gleichzeitig im Laden sind (Stühle/Waschplätze) |
| Vorlauf | `mindestvorlauf_min`, je Leistung überschreibbar (`services.vorlauf_min`) |
| Horizont | `horizont_wochen` ab `jetzt` |
| Intervalle | Immer halboffen `[start, ende)` — nahtloses Anschliessen ist erlaubt |

Alle Zeitpunkte sind Epoch-Millisekunden (UTC). Wanduhrzeiten werden ausschliesslich in
`src/zeit.js` umgerechnet, DST-sicher über luxon. Eine Uhrzeit, die es an einem
Umstellungstag nicht gibt, wirft — statt still verschoben zu werden.

## API

```js
import { oeffneDb } from './src/db.js';
import { verfuegbareSlots, pruefeSlot } from './src/slots.js';
import { reserviere, bestaetige, verschiebe, storniere } from './src/reservierung.js';

const db = oeffneDb('slot-engine.db');
const jetzt = Date.now();

// Lesen — reine Funktion
const slots = verfuegbareSlots(db, { leistungCode: 'faerben', jetzt, limit: 3 });

// Warum geht mein Wunschtermin nicht?
pruefeSlot(db, { leistungCode: 'bart', ressourceId: 1, start, jetzt });
// → { frei: false, grund: 'feiertag' }

// Schreiben — Weichreservierung, dann Bestätigung
const hold   = reserviere(db, { ressourceId: 1, leistungCode: 'faerben', start, jetzt });
const termin = bestaetige(db, { token: hold.token, kunde: 'Frau Müller', jetzt });

verschiebe(db, { terminId: termin.terminId, neuerStart, jetzt });
storniere(db, { terminId: termin.terminId });
```

`pruefeSlot()` liefert einen von: `zu_kurzfristig`, `ausserhalb_horizont`,
`ausserhalb_oeffnungszeiten`, `feiertag`, `blackout`, `belegt`, `wechselpuffer`,
`kapazitaet`. Gedacht als Grundlage für sinnvolle Antworten statt "geht nicht".

## Feiertage

`feiertageBW(jahr)` berechnet die zwölf gesetzlichen Feiertage in Baden-Württemberg,
die beweglichen über die Osterformel (Meeus/Jones/Butcher). Enthalten sind die
BW-Besonderheiten Heilige Drei Könige, Fronleichnam und Allerheiligen; bewusst **nicht**
enthalten sind Buß- und Bettag (nur Sachsen), Reformationstag und Mariä Himmelfahrt.
`npm run seed` schreibt sie als ganztägige Blackouts für das laufende und das Folgejahr.

Heiligabend und Silvester sind keine gesetzlichen Feiertage — die verkürzte Öffnungszeit
dafür ist noch nicht abgebildet.

## Grenzen (bewusst offen)

- **Nur eine Ressourcendimension.** Stühle und Waschplätze sind nicht einzeln modelliert,
  sondern nur über `max_parallel_kunden` gedeckelt.
- **Keine Datums-Ausnahmen** bei den Öffnungszeiten (Sonderöffnung, verkürzter Tag).
  Blackouts können nur sperren, nicht öffnen.
- **Kein Ranking.** Slots kommen chronologisch; eine Bewertung, die unbrauchbare
  Restlöcher vermeidet, ist noch nicht gebaut.
- **Kein Kundenstamm.** `appointments.kunde_ref` ist der Andockpunkt dafür,
  `appointments.uid` der für einen späteren ICS-Export.

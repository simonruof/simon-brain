---
tags: [runbook, betrieb, anleitung]
gehoert-zu: "[[README]]"
---

# Runbook

## Einmalige Einrichtung

### 1. Pipeline pruefen (2 Minuten)

```bash
cd ~/Simon_Brain/11_Agency_System
python3 -m pipeline.cli doctor
python3 -m unittest discover -s pipeline/tests
```

`doctor` muss `"status": "ok"` melden, die Tests muessen alle durchlaufen.
Python 3.11+ genuegt, es gibt keine Abhaengigkeiten zu installieren.

### 2. Konfiguration anpassen

In `config/config.toml`:

- `business.absender_adresse` — Pflicht. Ohne identifizierbaren Absender
  faellt jede Nachricht durch das Gate.
- `scope.aktive_staedte` und `scope.aktive_nischen` — **je genau ein
  Eintrag**. Nicht drei Staedte am ersten Tag.
- `pitcher.nachrichten_pro_tag` — in Woche 1 auf 10 setzen, nicht auf 30.

### 3. MCPs verbinden

| MCP | Wofuer | Pflicht |
|-----|--------|---------|
| Gmail | Versand und Antworten | ja |
| Google Calendar / Calendly | Termine | ja |
| Lovable | Mockups | nein |
| Higgsfield | Videos | nein |

Ohne Lovable und Higgsfield laeuft die Pipeline weiter, nur ohne Beilagen.

### 4. Rechtliches klaeren

[[COMPLIANCE]] lesen, insbesondere den mit ⚠️ markierten Abschnitt zu UWG
Art. 3 Abs. 1 lit. o. Diese eine Stunde beim Anwalt vor dem ersten Versand,
nicht nach der ersten Beschwerde.

---

## Testlauf ohne echten Versand

```bash
cd 11_Agency_System

python3 -m pipeline.cli intake beispiel/roh_beispiel.json --tag 2026-08-17
python3 -m pipeline.cli next qualified --knapp

# Diagnose von Hand, um das Gate kennenzulernen
python3 -m pipeline.cli diagnose <lead-id> \
  --text "Kein Webauftritt trotz 4.7 Sternen" \
  --angle "Am Sonntag erreichbar sein" \
  --ton "handwerklich-direkt" \
  --nachricht "Guten Tag Herr Meier, Ihr Sanitaer-Betrieb in Schwyz hat 4.7 Sterne bei 23 Bewertungen, aber keine Website. Wer Sie am Sonntag googelt, ruft den Naechsten an. Ich habe eine Seite gebaut, die Sie sich ansehen koennen. Simon Ruof, 6442 Gersau. Keine weiteren Mails? Kurz antworten."

python3 -m pipeline.cli check --lead <lead-id>
python3 -m pipeline.cli send-queue
```

Die `send-queue` gibt aus, was raus duerfte. **Es wird nichts gesendet** —
das macht erst der Pitcher-Agent. Ein Lauf bis hierhin ist folgenlos.

Absichtlich scheitern lassen, um das Gate zu verstehen: das Wort
"revolutionieren" in die Nachricht setzen und `check` erneut laufen lassen.

---

## Taeglicher Betrieb

### Nachts, automatisch

```
claude → "Starte den Agency-Lauf"   (Orchestrator uebernimmt)
```

Oder als Cron auf dem Hauptrechner:

```bash
0 4 * * 1-5 cd ~/Simon_Brain/11_Agency_System && claude -p "Starte den Agency-Lauf" >> logs/lauf.log 2>&1
```

Montag bis Freitag. Am Wochenende wird ohnehin nicht gesendet.

### Morgens, 2 Minuten

```bash
python3 -m pipeline.cli kpi --text
```

```
*Agency-Lauf 2026-08-17*
🟢 Antwortrate 16.7%  (Ziel 14.0%)

Leads erfasst:   34  →  qualifiziert 29
Nachrichten:     30
Antworten:       5  (davon positiv 3)
Termine offen:   2

*1 Entscheidung(en) fuer dich:*
  • Positive Antwort — Terminvorschlag freigeben
```

Steht dort "Keine Entscheidungen noetig", ist der Tag erledigt.

### Tagsueber

Der Mobile-Agent meldet sich nur bei positiven Antworten und legt zwei
Terminvorschlaege vor. Ein Tipp genuegt.

---

## Wenn etwas nicht stimmt

| Symptom | Wahrscheinliche Ursache | Vorgehen |
|---------|-------------------------|----------|
| `send-queue` ist leer | Sendefenster, oder alles am Checker haengen geblieben | `next diagnosed` und `check` ansehen |
| Alle Nachrichten fallen durch | Diagnoser ignoriert Opt-out oder Absenderangabe | `check` Befunde lesen, Diagnoser-Prompt nachschaerfen |
| Antwortrate unter 12 % | Nachricht oder Nische | **nicht das Volumen erhoehen** — siehe unten |
| Scout findet kaum Leads | Nische abgegrast | naechste Nische aus `nischen` aktivieren |
| `StageError` | Ein Agent hat einen Schritt uebersprungen | History im Lead lesen, Agent-Prompt korrigieren |
| Leads doppelt | Registry geloescht | `state/registry.json` wiederherstellen |

### Antwortrate unter Alarmwert

Der Reflex ist, mehr zu senden. Das ist genau falsch — eine schlechte
Nachricht mal drei ist dreimal soviel verbrannte Zielgruppe.

Reihenfolge:

1. **20 gesendete Nachrichten lesen.** Klingen sie gleich? Dann ist die
   Personalisierung mechanisch geworden.
2. **Befunde pruefen.** Stimmen die Beobachtungen ueberhaupt?
3. **Eine Variable aendern**, nicht drei. Erst den Aufhaenger, dann den
   Betreff, dann die Nische.
4. **Zwei Wochen messen.** Bei 30 Nachrichten pro Tag ist alles darunter
   Rauschen.

---

## Skalieren — erst wenn das erfuellt ist

Nicht vorher:

- [ ] Antwortrate 3 Wochen stabil ueber 14 %
- [ ] mindestens 5 gefuehrte Gespraeche
- [ ] mindestens 2 Abschluesse
- [ ] Beschwerdequote unter 1 %
- [ ] rechtliche Frage aus [[COMPLIANCE]] geklaert

Dann in dieser Reihenfolge: **zweite Nische** in derselben Stadt (Nachricht
bleibt, Zielgruppe aendert sich) → **zweite Stadt** in derselben Nische
(Nachricht bleibt, Region aendert sich) → Volumen erhoehen.

Nie zwei Dinge gleichzeitig aendern. Sonst weiss niemand, woran es lag.

---

## Kosten im Blick

Das Original nennt rund 480 USD pro Monat an API-Kosten. Realistisch bei
diesem Aufbau, aber die Verteilung ist ungleich: Diagnoser und Checker
laufen auf Opus und machen den Grossteil aus, Scout und Pitcher sind guenstig.

Kontrolle: `thresholds.kosten_alarm_chf_monat`. Laeuft es aus dem Ruder,
zuerst `mockups_pro_tag` senken — nicht die Qualitaet des Diagnosers. Der
Text ist das Produkt.

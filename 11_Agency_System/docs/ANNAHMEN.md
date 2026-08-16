---
tags: [annahmen, entscheidungen, transparenz]
gehoert-zu: "[[../README]]"
---

# Annahmen und Abweichungen vom Original

Damit spaeter nachvollziehbar ist, was aus dem Playbook stammt und was ich
beim Nachbau entschieden habe.

---

## Uebernommen wie beschrieben

- Rollenschnitt der sieben Spezialisten plus Orchestrator
- Nur der Orchestrator delegiert und entscheidet ueber Eskalation
- Mockups nur fuer die staerksten Leads des Tages, nicht fuer alle
- Checker als eigene Instanz **vor** dem Versand
- Dateibasierte Queue statt Datenbank
- Zwei Eskalationsgruende: Dealwert und Antwortrate
- Kennzahlen als Zielgroessen: ~220 Scans → ~30 Leads → 30 Nachrichten,
  Ziel 14 % Antwortrate, Alarm bei 12 %

---

## Geaendert

| Original | Hier | Warum |
|----------|------|-------|
| USD 400 pro Kunde | CHF 1'490 / 2'900 + CHF 490 Retainer | Schweizer Preisniveau; angelehnt an die bestehende ai-central.ch Leiter |
| 3 Staedte ab Tag 1 | 1 Stadt, 1 Nische | Antwortrate misst man nicht in drei Maerkten gleichzeitig |
| Englisch | Schweizer Hochdeutsch, kein "ß" | Zielgruppe Zentralschweiz |
| Kaltakquise ohne Rechtsteil | UWG/DSG als erzwungene Gates | US-Recht ist hier nicht anwendbar |
| Versand jederzeit | Werktags 08:00–17:30 | Zustellbarkeit und Anstand |
| Unbegrenzte Kontakte | Deckel bei 3 inkl. Follow-ups | UWG-Risiko und Zielgruppenpflege |
| Alles im Modell | Scoring, Dedupe, Gates in Python | reproduzierbar, testbar, tokenfrei |
| Mobile-Agent bucht Termine | Mobile schlaegt vor, Simon gibt frei | ein Kalendereintrag ist eine Zusage an einen echten Menschen |

### Warum der deterministische Kern

Die groesste inhaltliche Abweichung. Im Original macht Claude auch die
Qualifikation. Hier entscheidet Python, ob ein Lead qualifiziert ist.

Grund: Ein Modell, das "5+ Jahre auf Maps, unter 50 Bewertungen" prueft,
liefert bei identischer Eingabe nicht garantiert dieselbe Antwort — und der
Fehler faellt nicht auf, weil die Begruendung immer plausibel klingt. Ein
Zahlenvergleich gehoert in Code. Das Modell macht das, was es besser kann als
jede Regel: beurteilen, ob ein Text nach Mensch klingt.

Nebeneffekt: 40 Tests laufen in 0,3 Sekunden ohne einen einzigen API-Aufruf.

---

## Verworfen

- **"47 Kunden pro Monat"** als Planungsgrundlage. Die Zahl stammt aus einem
  Werbepost, ist unbelegt und impliziert eine Abschlussquote von rund 7 % vom
  Erstkontakt zum zahlenden Kunden. Das waere aussergewoehnlich gut. Als Ziel
  taugt sie, als Annahme nicht.
- **Ein API-Key auf zwei Geraeten.** Funktioniert, macht aber Kosten und
  Fehler nicht zuordenbar. Getrennte Keys pro Geraet.
- **"Detektiert positive Antworten in Echtzeit."** Der Mobile-Agent laeuft
  in Intervallen. Echtzeit braeuchte einen Webhook und loest ein Problem, das
  bei 30 Nachrichten pro Tag nicht existiert.
- **Automatisches Buchen ohne Freigabe.** Siehe oben.

---

## Offene Fragen an Simon

1. **UWG-Auslegung** — die eine Anwaltsstunde vor dem ersten echten Versand.
   Siehe [[../COMPLIANCE]].
2. **Absenderdomain** — ueber welche Domain wird gesendet? Nicht ueber die
   Hauptdomain: eine verbrannte Absenderreputation trifft sonst auch die
   Kurs-Mails von ki-einfuehrung.ch. Eigene Domain, eigene Aufwaermphase.
3. **Angebot** — Website-Bau ist ein anderes Geschaeft als KI-Beratung. Ist
   das ein eigenes Standbein oder ein Tueroeffner fuer die bestehende
   Angebotsleiter? Davon haengt der Hero-Angle des Diagnosers ab.
4. **Kapazitaet** — bei 14 % Antwortrate auf 30 Nachrichten sind das rund 4
   Gespraeche pro Tag. Das passt nicht neben eine 70-%-Stelle bei Roche. Der
   Tagesdeckel sollte an die verfuegbaren Gespraechsslots gekoppelt sein,
   nicht ans Lead-Volumen.

Punkt 4 ist der wichtigste. Das System kann mehr Nachfrage erzeugen, als ein
Mensch mit einem Hauptjob bedienen kann — und eine positive Antwort, auf die
zwei Wochen niemand reagiert, ist schaedlicher als keine Nachricht.

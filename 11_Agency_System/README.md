---
tags: [projekt, ai, agents, vertrieb, automation]
status: aufbau
erstellt: 2026-08-16
gehoert-zu: "[[02_AI_Unternehmen/AI_Unternehmen]]"
---

# 🤖 Agency System — 7 Agents, ein Operator

Nachbau des kursierenden "7-Claude-Agent Solo Agency" Playbooks, angepasst
auf Schweizer Verhaeltnisse: CHF statt USD, Deutsch statt Englisch, UWG und
DSG statt US-Recht, Zentralschweizer Nischen statt US-Metros.

**Kernidee:** Alles, was sich automatisieren laesst, laeuft nachts. Simon
macht nur noch das, was ein Mensch machen muss — Gespraeche fuehren und
abschliessen.

---

## Die Agents

| Agent | Rolle | Schreibt |
|-------|-------|----------|
| [[.claude/agents/orchestrator\|Orchestrator]] | Master. Delegiert, entscheidet ueber Eskalation | Bericht |
| [[.claude/agents/scout\|Scout]] | Findet Betriebe auf Maps | Rohdatei |
| [[.claude/agents/diagnoser\|Diagnoser]] | Diagnose, Hero-Angle, Kaltnachricht | Lead-Diagnose |
| [[.claude/agents/builder\|Builder]] | Mockups fuer die Top-5 des Tages | Mockup-URL |
| [[.claude/agents/filmer\|Filmer]] | 10-Sekunden-Clip aus dem Mockup | Video-Pfad |
| [[.claude/agents/checker\|Checker]] | Qualitaets- und Compliance-Gate | Verdikt |
| [[.claude/agents/pitcher\|Pitcher]] | Versand ueber den passenden Kanal | Versandprotokoll |
| [[.claude/agents/mobile\|Mobile]] | Antworten, Terminvorschlaege | Antwort, Termin |

Das Original spricht von "7 Agents" — gemeint sind sieben Spezialisten plus
der Orchestrator, der sie steuert.

---

## Ablauf eines Tages

```
Nachts    Scout → Diagnoser → Builder (Top 5) → Filmer → Checker → Pitcher
Morgens   Simon liest einen Bericht. Meist ohne Handlungsbedarf.
Tagsueber Mobile-Agent faengt Antworten ab, legt Termine zur Freigabe vor.
Termin    Simon fuehrt das Gespraech und schliesst ab.
```

Simon wird nur bei drei Dingen geweckt:

1. Deal ueber **CHF 3'000**
2. Tages-Antwortrate unter **12 %** (bei mindestens 20 Sends)
3. Positive Antwort, die eine Terminfreigabe braucht

---

## Schnellstart

```bash
cd 11_Agency_System

python3 -m pipeline.cli doctor        # Konfiguration pruefen
python3 -m pipeline.cli intake beispiel/roh_beispiel.json
python3 -m pipeline.cli next qualified --knapp
python3 -m pipeline.cli kpi --text
```

Tests (nur stdlib, keine Installation noetig):

```bash
python3 -m unittest discover -s pipeline/tests -v
```

Der komplette Einrichtungsweg steht in [[RUNBOOK]].

---

## Arbeitsteilung Code ↔ Modell

Das ist die wichtigste Designentscheidung im ganzen System:

| Python entscheidet | Claude entscheidet |
|--------------------|--------------------|
| Qualifiziert oder nicht | Was am Betrieb konkret fehlt |
| Duplikat oder neu | Wie die Nachricht klingt |
| Darf gesendet werden | Welcher Kanal passt |
| Antwortrate, Eskalation | Ob die Beobachtung stimmt |
| Wortzahl, Blocklist, Pflichtangaben | Ob es nach Mensch klingt |

Alles, was eine Zahl vergleicht, gehoert in Code — dort ist es
reproduzierbar, testbar und kostet keine Tokens. Alles, was Urteilsvermoegen
braucht, gehoert ins Modell. Zwischen beidem liegt die CLI als einzige
Schreibschnittstelle, damit kein Agent den Zustandsautomaten umgehen kann.

---

## Realistische Erwartung

Das Original nennt 47 Kunden pro Monat bei 18'800 USD Umsatz. Diese Zahlen
sind unbelegt und stammen aus einem Werbepost. Was das System hier belegbar
leistet, ist die **Mechanik**: Leads finden, qualifizieren, personalisieren,
pruefen, senden, messen.

Was die Zahlen am Ende sind, entscheidet sich an der Antwortrate — und die
misst Simon selbst, mit einer Nische in einer Stadt, bevor irgendetwas
skaliert wird. Siehe [[docs/ANNAHMEN]].

---

## Verwandte Dokumente

- [[ARCHITECTURE]] — Datenfluss, Zustandsautomat, Dateiformate
- [[COMPLIANCE]] — UWG, DSG, was das System technisch erzwingt
- [[RUNBOOK]] — Einrichtung und taeglicher Betrieb
- [[docs/ANNAHMEN]] — was aus dem Original uebernommen, geaendert, verworfen wurde
- [[02_AI_Unternehmen/AI_Unternehmen]] — uebergeordnetes Projekt

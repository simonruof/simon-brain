---
tags: [compliance, recht, uwg, dsg, schweiz]
gehoert-zu: "[[README]]"
---

# Compliance

> **Keine Rechtsberatung.** Ich bin kein Anwalt. Dieses Dokument haelt fest,
> welche Regeln das System technisch erzwingt und warum — nicht, dass die
> Umsetzung rechtssicher ist. Der mit ⚠️ markierte Punkt gehoert vor dem
> ersten Versand einmal einem Schweizer Anwalt vorgelegt. Eine Stunde
> Beratung ist billiger als ein Verfahren.

Das Original-Playbook stammt aus einem US-Kontext und behandelt Kaltakquise
als reines Mengenproblem. In der Schweiz ist sie ein Rechtsproblem. Deshalb
sind die Regeln hier nicht als Empfehlung formuliert, sondern als Code, der
den Versand blockiert.

---

## ⚠️ Der Punkt, der geklaert werden muss

**UWG Art. 3 Abs. 1 lit. o** verbietet Massenwerbung ohne direkten
Zusammenhang mit einem angeforderten Inhalt, wenn keine vorgaengige
Einwilligung vorliegt. Verstoesse sind auf Antrag strafbar, nicht nur
zivilrechtlich relevant.

Die verbreitete Praxis stuetzt sich darauf, dass **individualisierte
B2B-Erstkontakte keine "Massenwerbung"** sind. Diese Auslegung ist gaengig,
aber nicht durch eine klare hoechstrichterliche Linie abgesichert — und 30
Nachrichten pro Tag aus einer automatisierten Pipeline bewegen sich naeher an
"Masse", als eine einzelne, von Hand geschriebene Mail es tut.

Genau deshalb ist das System so gebaut, dass Individualisierung nicht
optional ist:

- Der Checker laesst keine Nachricht ohne mindestens zwei betriebsspezifische
  Fakten durch
- Der Tagesdeckel liegt bei 30, nicht bei 3'000
- Jede Nachricht bezieht sich auf einen konkreten, geprueften Befund

Trotzdem: **vor dem ersten Versand einmal anwaltlich pruefen lassen.** Die
Konfiguration ist so angelegt, dass eine restriktivere Auslegung nur eine
Zahlenaenderung in `config.toml` kostet, keinen Umbau.

---

## Was das System technisch erzwingt

| Regel | Erzwungen durch | Wirkung bei Verstoss |
|-------|-----------------|----------------------|
| Absender identifizierbar | `pruefe_nachricht` | Nachricht faellt durch |
| Opt-out in jeder Nachricht | `pruefe_nachricht` | Nachricht faellt durch |
| Opt-out wird sofort umgesetzt | `cli reply --typ optout` | Betrieb dauerhaft gesperrt |
| Kein Kontakt trotz Sperre | `harte_sperre` | Versand abgebrochen, auch mit `--force` |
| Hoechstens 3 Kontakte pro Betrieb | `kontaktdeckel_erreicht` | Versand abgebrochen |
| Nur werktags 08:00–17:30 | `im_sendefenster` | Versand abgebrochen |
| Nur Geschaeftsadressen | `scoring._ablehnungsgrund` | Lead abgelehnt |
| Kein Betrieb zweimal | `fingerprint` / Registry | Duplikat still verworfen |
| Keine unbelegten Versprechen | Checker-Agent, Blocklist | Nachricht faellt durch |

Die Trennung zwischen `harte_sperre()` und `darf_senden()` ist bewusst:
`--force` kann das Sendefenster loesen, wenn Simon das will. Eine
Suppression-Sperre, einen ueberschrittenen Kontaktdeckel oder ein nicht
bestandenes Checker-Gate kann es nicht. Wer bereits Nein gesagt hat, bekommt
keine zweite Nachricht — kein Flag, kein Sonderfall, keine Ausnahme.

---

## DSG 2023

Das revidierte DSG schuetzt natuerliche Personen. Daten juristischer Personen
fallen nicht darunter — der Unterschied ist in dieser Zielgruppe aber
duenn: die "Sanitaer Meier AG" ist eine juristische Person, der
Einzelunternehmer "Meier Sanitaer" ist eine natuerliche.

Daraus folgt fuer den Betrieb:

- **Nur oeffentlich zugaengliche Geschaeftsdaten** erheben. Der Scout hat
  keinen Auftrag, Privatadressen oder private Nummern zu sammeln.
- **Zweckbindung**: die Daten dienen der Geschaeftsanbahnung, nichts
  anderem. Kein Weiterverkauf, keine Anreicherung aus fremden Quellen.
- **Informationspflicht** (Art. 19): die erste Nachricht sagt, woher die
  Daten stammen. Ein Halbsatz reicht — "Ich habe Ihren Betrieb ueber Google
  Maps gefunden".
- **Loeschung auf Verlangen**: `cli suppress <wert>` sperrt, die Lead-Datei
  wird auf Wunsch geloescht. Der Fingerabdruck bleibt in der Registry, damit
  der Betrieb nicht versehentlich neu erfasst wird.
- **Keine Aufbewahrung ohne Zweck**: abgelehnte Leads brauchen nur
  Fingerabdruck und Ablehnungsgrund, nicht den vollen Datensatz.

`leads/` und `state/` sind aus gutem Grund in `.gitignore`: Kontaktdaten
Dritter gehoeren nicht in ein Repository, das ueber mehrere Geraete und
GitHub synchronisiert wird.

---

## Scraping

- Nur oeffentlich sichtbare Daten, kein Login, keine Bezahlschranke.
- **Keine Umgehung technischer Schutzmassnahmen.** Kein Captcha-Bypass,
  keine Rate-Limit-Tricks, keine gefaelschten User-Agents. Blockiert eine
  Seite automatisierten Zugriff, ist das eine Antwort, kein Hindernis.
- Google Maps ist ueber die Nutzungsbedingungen geschuetzt. Automatisiertes
  Auslesen der Oberflaeche verstoesst gegen diese Bedingungen — das ist
  primaer ein Vertragsrisiko gegenueber Google, kein Strafrecht, aber es
  kann den Account kosten. Die saubere Variante ist die **Places API** im
  Rahmen ihrer Lizenz. Wer die Oberflaeche scrapt, sollte wissen, dass er
  das tut.

---

## Wahrheitspflicht in Mockup und Nachricht

Der schnellste Weg, aus Akquise Taeuschung zu machen:

- **Erfundene Kundenstimmen** auf dem Mockup. Der Builder hat ein
  ausdrueckliches Verbot.
- **Falsche Befunde** in der Nachricht. "Sie haben keine Website" an einen
  Betrieb mit Website ist eine irrefuehrende Angabe nach UWG — und
  gleichzeitig der sicherste Weg, nie eine Antwort zu bekommen.
- **Mockup ohne Kennzeichnung.** Jede Seite traegt sichtbar "Unverbindlicher
  Entwurf — erstellt von ai-central.ch". Sie darf nie wie der offizielle
  Auftritt des Betriebs wirken.
- **Unbelegte Ergebnisversprechen.** Wir verkaufen eine Seite, keine
  Umsatzsteigerung.

---

## Wenn sich jemand beschwert

1. Sofort sperren: `python3 -m pipeline.cli suppress <email> --grund beschwerde`
2. Simon informiert der Mobile-Agent sofort. Kein Agent antwortet selbst auf
   eine Beschwerde oder eine rechtliche Androhung.
3. Simon antwortet persoenlich, entschuldigt sich knapp, bestaetigt die
   Loeschung. Keine Rechtfertigung, keine Diskussion ueber die Rechtslage.
4. Beschwerdegrund im Bericht vermerken. Haeufen sich Beschwerden in einer
   Nische, ist die Nische falsch oder die Nachricht ist es.

Eine Beschwerdequote ueber 1 % bedeutet: anhalten und die Nachricht
ueberarbeiten, nicht das Volumen erhoehen.

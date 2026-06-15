---
tags: [projekt, ministry, glaube, bibelstudies, youtube, podcast]
status: aktiv
zuletzt-aktiv: 2026-06-14
website: freeindeed.ch
---

# ✝️ FreeIndeed Ministry

## Anweisungen / System Prompt
> Homepagebau, Youtube Content, Podcast Content, organisation, events, Co-Author von unseren Büchern.

## Beschreibung
Simon leitet Free Indeed Ministry (freeindeed.ch), ein deutschsprachiges Word of Faith/Pfingstliches Ministry mit Sitz in Gersau, Schweiz (Büro: Buochenstrasse 13, 6442 Gersau). Erreicht deutschsprachige Christen in der Schweiz, Deutschland und Österreich.

Simon leitet die Jüngerschaftsgemeinschaft zusammen mit seiner Frau Larissa (Simon mentoriert ~7 Jünger, Larissa ~10).

**Tagline:** *"WHO THE SON SETS FREE IS FREE INDEED — John 8:36"*
**Kontakt:** info@freeindeed.ch

## Theologisches Framework
Word of Faith / Pfingstlich · Identität in Christus · Bunds-Theologie · Geistliche Autorität · Befreiung · Heilung

## Hauptausgabebereiche
- Professionelle Bibelstudien-PDFs (zweisprachig DE/EN)
- Video/Podcast-Content + Social Media Ankündigungen
- Events und Seminare (mehrtägige Internats-Seminare)
- Jüngerschaft & Community Leadership
- Website (WordPress, All-Inkl.com)
- Musik via Suno

## Zahlungsangaben (für alle Materialien)
- PostFinance IBAN: CH93 0900 0000 1617 3821 2 (SWIFT: POFICHBEXXX)
- TWINT QR Code
- PayPal: paypal@freeindeed.ch

## Design-System (non-negotiable)
- Dunkle/schwarze abgerundete Section-Header mit weissem Bold-Text
- **DejaVu** Font-Familie (für deutsche Umlaute — NIEMALS Helvetica!)
- Gold-Linien (#8B7355)
- Helles grau für Zitat-Boxen mit dunkler linker Leiste
- Logo oben rechts; Gold Header/Footer-Linien
- Footer: "Free Indeed Ministry · freeindeed.ch · WHO THE SON SETS FREE IS FREE INDEED — John 8:36" + Seitenzahl
- **Schweizer Schreibweise** obligatorisch: "weiss" (nicht "weiß"), "Füsse" (nicht "Füße")
- Bibel immer vollständig und ungekürzt · Deutsche Übersetzung: "Neues Leben"
- QR-Codes aus `EngelbibelstudyFreeIndeed.pdf` extrahieren (Assets IMMER neu pro Session extrahieren)

## Standard-PDF-Struktur
`Deutsches Studie → Deutsche Spenden-Seite → Trennseite → Englisches Studie → Englische Spenden-Seite`

## Tech Stack
- PDF-Erstellung: Python + ReportLab + PyMuPDF (fitz)
- Reference-PDF: `EngelbibelstudyFreeIndeed.pdf`
- Musik: Suno
- Streaming: OBS + selbst gebautes Node.js/FFmpeg MultiStream Dashboard
- Transkription: OpenAI Whisper (lokal) + yt-dlp
- Theologie-Wissens-Base: Python Script (theologyextractor.py) → Synology NAS (~1'339 Dateien: Hagin, Prince, Wigglesworth, Wommack, Mohler)
- Dev Tools: Claude Code (v2.1.83), Node.js (v22), Obsidian mit MCP
- MCP: Google Calendar, Gmail, WordPress, Clay

## Wichtige Sprecher im Netzwerk
- Pamela (regelmässige Sprecherin bei Free Indeed Events)

## Musik-Katalog (Suno)
- "Feuer des Geistes" und weitere deutsche christliche Worship-Songs im Rammstein-Stil
- Songs mit hebräischen Gottesnamen: Jehova Jireh, El Schaddai etc.
- Agressiver Rammstein-Stil mit weiblichem Sopran (Helene Fischer) in Bridge-Sektionen

## Horizont / Nächste Schritte
- YouTube OAuth2 API für MultiStream Dashboard (Route `/auth/youtube` bereits implementiert — nur Google Cloud Console Setup fehlt)
- Hochzeitsvorbereitungskurs (~10 Module, ~60–80 Seiten) — Format noch zu klären
- Psalm 138:2 Bibelstudium (noch nicht gestartet)
- Progressive Web App für Inhalts-Distribution — definiert, noch nicht gebaut
- Prediger-Radar Feature für freeindeed.ch
- Spotify Podcast Launch (Beschreibung ~573 Zeichen finalisiert)

## Dateien im Projekt (claude.ai) — 52% Kapazität belegt!
**Markdown/Text (Theologie-Basis):**
- `alle_heilung.md` (37'699 Zeilen!) — Grosse Heilungs-Ressource
- `Invisible Barriers to Healing — Derek Prince.md` (1'109 Zeilen)
- `Healing.md` (55 Zeilen)
- `THE MOST IMPORTANT THINGS — Kenneth E. Hagin.md` (2'007 Zeilen)
- `Pastor Andrew Wommack 2017 — What About Paul's Thorn.md` (1'339 Zeilen)
- `pauls_dorn_im_fleisch.md` (281 Zeilen)
- `Paul's Thorn in the Flesh — Rick McFarland.md` (1'843 Zeilen)

**PDFs:**
- Bible Doctrines — P.C. Nelson (7'095 Zeilen)
- Hearing God Part 1–3 (DE + EN)
- 6 Stimmen die der Teufel schickt / 3 Stimmen die Gott schickt
- How to Keep Your Healing — Kenneth Hagin
- Pauls Dorn Handout (Free Indeed Design)
- Angels to Help You — Lester Sumrall
- Engel_bibelstudy_Free_Indeed.pdf (Master Design Template)
- Giving.jpg

## Aktive Chats (claude.ai)
- Brainstorming vor Dokumentenerstellung *(heute)*
- Biblische Legitimation von Diensten ohne formale Ordination *(heute)*
- Musikstile analysieren und Suno-Songs generieren *(gestern)*
- Bibelstudy zu Loyalität und Illoyalität *(vor 3 Tagen)*
- Befreiung aus der Gefangenschaft *(5. Juni)*
- Worship songs im Rammstein-Stil *(5. Juni)*
- Free Indeed Night — Heilung und Befreiung in Luzern *(3. Juni)*
- Zweifel und Stolz in der Bibel *(29. Mai)*
- Protokollauswertung und Mustererkennung im Entscheidungsseminar *(17. Mai)*
- Psalmen mit deutscher Übersetzung formatieren *(15. Mai)*
- Gebetsleitfaden zu Lob und Umkehr *(15. Mai)*
- Einheit gegen Zwietracht in der Jüngerschaft *(13. Mai)*
- Trauminterpretation Teil 4: Spezifische Traumtypen *(6. Mai)*
- Entscheidungsseminar Hausregeln und Ablauf *(4. Mai)*
- Bibelstudy im Angels-Format *(3. Mai)*
- Spotify podcast erstellung beschreibung *(27. Apr.)*
- Biblischer Hochzeitsvorbereitungskurs entwickeln *(20. Apr.)*
- Bibelstudy über Engel erstellen *(19. Apr.)*
- Bibelstellen zu Abraham, Achan und Nachfolge *(25. März)*

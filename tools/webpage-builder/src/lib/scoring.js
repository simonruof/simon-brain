/**
 * KI-Sichtbarkeits-Score (0–100).
 *
 * Die zentrale Idee des ganzen Werkzeugs: Nicht "Ihre Seite sieht alt aus"
 * (subjektiv, beleidigend, unverkaeuflich), sondern "Ihr Betrieb ist fuer
 * ChatGPT und Google AI unsichtbar" (objektiv, nachpruefbar, neu).
 *
 * Entscheidend fuer die Glaubwuerdigkeit: Bestandsseite und Prototyp laufen
 * durch EXAKT dieselbe Funktion. Der Vorher/Nachher-Vergleich ist damit kein
 * Verkaufstrick, sondern eine ehrliche Messung.
 *
 * Gewichtung:
 *   Maschinenlesbarkeit 40 — kann ein Sprachmodell den Betrieb verstehen?
 *   Auffindbarkeit      25 — findet es ihn ueberhaupt?
 *   Technik & Mobil     20 — kommt ein Mensch danach klar?
 *   Conversion          15 — kann er dann auch etwas tun?
 *
 * Jedes Kriterium liefert einen deutschen Klartext-Befund. Diese Befunde
 * landen unveraendert im Analyse-Report und in der Outreach-Mail — deshalb
 * sind sie als vollstaendige Saetze formuliert, nicht als Stichworte.
 */

export const KATEGORIEN = {
  maschinenlesbarkeit: { label: 'Maschinenlesbarkeit', gewicht: 40 },
  auffindbarkeit: { label: 'Auffindbarkeit', gewicht: 25 },
  technik: { label: 'Technik & Mobil', gewicht: 20 },
  conversion: { label: 'Kontaktaufnahme', gewicht: 15 },
};

/** Sucht rekursiv einen schema.org-Typ im JSON-LD. */
function hatSchemaTyp(jsonLd, typen) {
  const suchen = (knoten, tiefe = 0) => {
    if (!knoten || tiefe > 5) return false;
    if (Array.isArray(knoten)) return knoten.some((k) => suchen(k, tiefe + 1));
    if (typeof knoten !== 'object') return false;
    const t = knoten['@type'];
    const alsListe = Array.isArray(t) ? t : [t];
    if (alsListe.some((x) => typen.includes(x))) return true;
    return Object.values(knoten).some((v) => suchen(v, tiefe + 1));
  };
  return suchen(jsonLd);
}

function jsonLdFeld(jsonLd, feld) {
  const suchen = (knoten, tiefe = 0) => {
    if (!knoten || tiefe > 5) return false;
    if (Array.isArray(knoten)) return knoten.some((k) => suchen(k, tiefe + 1));
    if (typeof knoten !== 'object') return false;
    if (knoten[feld] != null) return true;
    return Object.values(knoten).some((v) => suchen(v, tiefe + 1));
  };
  return suchen(jsonLd);
}

const LOKALE_TYPEN = [
  'LocalBusiness', 'Restaurant', 'AutoRepair', 'AutomotiveBusiness', 'Plumber',
  'Electrician', 'HomeAndConstructionBusiness', 'BeautySalon', 'HairSalon',
  'HealthAndBeautyBusiness', 'Store', 'FoodEstablishment', 'ProfessionalService',
  'Organization', 'Dentist', 'MedicalBusiness',
];

/**
 * @param {object} quelle  { scrape, places, pagespeed } — funktioniert fuer
 *                         Bestandsseite und Prototyp gleichermassen
 * @returns {{score:number, kategorien:object, befunde:Array, note:string}}
 */
export function bewerte({ scrape, places, pagespeed, hinweis } = {}) {
  const befunde = [];
  const punkte = { maschinenlesbarkeit: 0, auffindbarkeit: 0, technik: 0, conversion: 0 };

  /** @param {string} kat @param {number} p @param {boolean} ok @param {string} text @param {string} [warum] */
  const pruefe = (kat, p, ok, text, warum = '') => {
    if (ok) punkte[kat] += p;
    befunde.push({ kategorie: kat, punkte: p, erreicht: ok ? p : 0, erfuellt: Boolean(ok), text, warum });
  };

  // Keine erreichbare Seite: Score 0. Das ist kein Fehler, sondern ein Befund —
  // und der beste Lead den es gibt.
  if (!scrape) {
    return {
      score: 0,
      kategorien: Object.fromEntries(Object.entries(KATEGORIEN).map(([k, v]) => [k, { ...v, erreicht: 0 }])),
      befunde: [{
        kategorie: 'auffindbarkeit', punkte: 100, erreicht: 0, erfuellt: false,
        text: hinweis?.text ?? 'Es existiert keine erreichbare Website.',
        warum: 'Sprachmodelle und Suchmaschinen haben keine einzige Informationsquelle ueber den Betrieb ausser dem Google-Eintrag.',
      }],
      note: hinweis?.statusCode ? `Website antwortet mit ${hinweis.statusCode}` : 'Kein Auftritt',
    };
  }

  const s = scrape;
  const jsonLd = s.jsonLd ?? [];
  const text = s.bodyText ?? '';

  // ── Maschinenlesbarkeit (40) ─────────────────────────────────────────────
  pruefe('maschinenlesbarkeit', 12,
    jsonLd.length > 0 && hatSchemaTyp(jsonLd, LOKALE_TYPEN),
    'Strukturierte Betriebsdaten (schema.org LocalBusiness) sind hinterlegt.',
    'Ohne diese Auszeichnung muss ein Sprachmodell aus dem Fliesstext raten, um welche Art Betrieb es sich handelt — und rät oft falsch.');

  pruefe('maschinenlesbarkeit', 8,
    jsonLdFeld(jsonLd, 'openingHours') || jsonLdFeld(jsonLd, 'openingHoursSpecification'),
    'Oeffnungszeiten sind maschinenlesbar ausgezeichnet.',
    'Auf die Frage "hat der Betrieb jetzt offen?" kann eine KI sonst nicht antworten.');

  pruefe('maschinenlesbarkeit', 6,
    jsonLdFeld(jsonLd, 'address') || jsonLdFeld(jsonLd, 'geo'),
    'Die Adresse ist strukturiert hinterlegt.',
    'Fuer die Frage "in meiner Naehe" ist eine reine Textadresse im Footer zu wenig.');

  pruefe('maschinenlesbarkeit', 5,
    Boolean(s.llms?.vorhanden),
    'Eine llms.txt fuer KI-Systeme ist vorhanden.',
    'Der neue Standard, mit dem ein Betrieb Sprachmodellen direkt erklaert, was er anbietet. Praktisch kein Schweizer KMU hat ihn.');

  const genugText = (s.textLaenge ?? 0) >= 900;
  pruefe('maschinenlesbarkeit', 5, genugText,
    'Die Seite enthaelt genug Inhalt, um den Betrieb zu beschreiben.',
    `Aktuell ${s.textLaenge ?? 0} Zeichen. Unter 900 findet eine KI schlicht nichts zu zitieren.`);

  pruefe('maschinenlesbarkeit', 4,
    (s.h1?.length ?? 0) === 1 && (s.h1[0]?.length ?? 0) > 8,
    'Es gibt genau eine aussagekraeftige Hauptueberschrift.',
    `Gefunden: ${s.h1?.length ?? 0} H1-Ueberschriften. Keine oder mehrere machen die Seitenaussage mehrdeutig.`);

  // ── Auffindbarkeit (25) ──────────────────────────────────────────────────

  // Grundpunkte fuer eine erreichbare Seite. Ohne sie faellt eine sehr
  // schlechte Seite auf exakt 0 — denselben Wert wie ein Betrieb voellig ohne
  // Website. Das sind aber zwei verschiedene Gespraeche: der eine hat nichts,
  // der andere hat etwas Schlechtes. Und fuer ein Sprachmodell ist eine
  // magere Quelle tatsaechlich mehr als gar keine.
  pruefe('auffindbarkeit', 4, true,
    'Die Website ist erreichbar und liefert Inhalt aus.', '');

  pruefe('auffindbarkeit', 5, Boolean(s.https),
    'Die Seite laeuft verschluesselt ueber HTTPS.',
    'Ohne HTTPS warnen Browser sichtbar und Suchmaschinen stufen ab.');

  const titelOk = (s.titel?.length ?? 0) >= 20 && (s.titel?.length ?? 0) <= 70;
  pruefe('auffindbarkeit', 5, titelOk,
    'Der Seitentitel hat eine brauchbare Laenge und Aussage.',
    `Aktuell ${s.titel?.length ?? 0} Zeichen. Sinnvoll sind 20–70 mit Leistung und Ort.`);

  pruefe('auffindbarkeit', 5,
    (s.metaDescription?.length ?? 0) >= 50,
    'Eine Meta-Beschreibung ist gesetzt.',
    'Sie ist der Text, den Google und KI-Antworten als Kurzbeschreibung uebernehmen.');

  pruefe('auffindbarkeit', 3, Boolean(s.sitemap?.vorhanden),
    'Eine sitemap.xml ist vorhanden.',
    'Ohne Sitemap muss sich ein Crawler die Struktur selbst zusammensuchen.');

  pruefe('auffindbarkeit', 2, Boolean(s.robots?.vorhanden),
    'Eine robots.txt ist vorhanden.', '');

  pruefe('auffindbarkeit', 1, Boolean(s.ogTitle || s.ogImage),
    'Open-Graph-Angaben fuer Social-Media-Vorschauen sind gesetzt.',
    'Ohne sie sieht ein geteilter Link auf WhatsApp oder Facebook nach nichts aus.');

  // ── Technik & Mobil (20) ─────────────────────────────────────────────────
  const psi = pagespeed?.mobilScore ?? null;
  if (psi != null) {
    const p = Math.round((psi / 100) * 8);
    pruefe('technik', 8, psi >= 70,
      `PageSpeed-Wert mobil liegt bei ${psi} von 100.`,
      psi >= 70 ? '' : 'Unter 70 springen messbar Besucher ab, bevor die Seite ueberhaupt sichtbar ist.');
    // Teilpunkte auch unterhalb der Schwelle — sonst waere der Score zu grob
    if (psi < 70) punkte.technik += p;
  } else {
    const schnell = (s.ladezeitMs ?? 9999) < 2500;
    pruefe('technik', 8, schnell,
      `Die Seite ist nach ${((s.ladezeitMs ?? 0) / 1000).toFixed(1)}s nutzbar.`,
      schnell ? '' : 'Ueber 2,5 Sekunden bricht ein erheblicher Teil der Mobilnutzer ab.');
  }

  pruefe('technik', 6,
    Boolean(s.viewport) && !s.mobil?.ueberlauf,
    'Die Seite ist auf dem Handy ohne seitliches Scrollen bedienbar.',
    s.mobil?.ueberlauf
      ? `Der Inhalt ist ${s.mobil.breite}px breit statt 390px — das Handy zeigt die Seite verkleinert oder abgeschnitten.`
      : (!s.viewport ? 'Es fehlt die Viewport-Angabe, ohne die Mobilgeraete die Desktop-Ansicht herunterskalieren.' : ''));

  const bilderMitAlt = (s.bilder ?? []).filter((b) => b.alt?.length > 3).length;
  const bilderGesamt = (s.bilder ?? []).length;
  pruefe('technik', 3,
    bilderGesamt === 0 || bilderMitAlt / bilderGesamt >= 0.6,
    'Bilder haben beschreibende Alt-Texte.',
    `${bilderMitAlt} von ${bilderGesamt} Bildern beschriftet. Alt-Texte sind fuer KI-Systeme die einzige Moeglichkeit, Bildinhalte zu erfassen.`);

  pruefe('technik', 3, Boolean(s.lang),
    'Die Seitensprache ist ausgezeichnet.',
    'Ohne lang-Attribut muss ein Sprachmodell die Sprache raten — bei Schweizer Seiten mit Fachbegriffen fehleranfaellig.');

  // ── Kontaktaufnahme (15) ─────────────────────────────────────────────────
  pruefe('conversion', 5,
    (s.telLinks?.length ?? 0) > 0,
    'Die Telefonnummer ist als anklickbarer Link hinterlegt.',
    'Auf dem Handy ist der Anruf sonst Abtippen statt Antippen — genau dort bricht die Kontaktaufnahme ab.');

  pruefe('conversion', 4,
    Boolean(s.hatFormular) || (s.mailLinks?.length ?? 0) > 0,
    'Es gibt einen schriftlichen Kontaktweg.',
    'Nicht jeder ruft an. Ohne Formular oder Mailadresse geht diese Gruppe verloren.');

  const cta = /jetzt|termin|reservier|anfrage|offerte|kontakt|buchen|anrufen|bestellen/i.test(
    [...(s.h1 ?? []), ...(s.h2 ?? []).slice(0, 6), ...(s.nav ?? [])].join(' '));
  pruefe('conversion', 3, cta,
    'Es gibt eine erkennbare Handlungsaufforderung.',
    'Ohne klaren naechsten Schritt bleibt der Besucher passiv und geht.');

  pruefe('conversion', 3,
    Boolean(s.hatKarte) || /öffnungszeit|oeffnungszeit|geöffnet|montag|dienstag/i.test(text),
    'Anfahrt oder Oeffnungszeiten sind auf der Seite sichtbar.',
    'Die beiden meistgesuchten Angaben bei einem lokalen Betrieb.');

  // ── Zusammenrechnen ──────────────────────────────────────────────────────
  const kategorien = {};
  for (const [k, v] of Object.entries(KATEGORIEN)) {
    kategorien[k] = { ...v, erreicht: Math.min(v.gewicht, Math.round(punkte[k])) };
  }
  const score = Math.max(0, Math.min(100,
    Object.values(kategorien).reduce((a, k) => a + k.erreicht, 0)));

  return { score, kategorien, befunde, note: note(score) };
}

export function note(score) {
  if (score >= 90) return 'Ausgezeichnet';
  if (score >= 75) return 'Gut';
  if (score >= 55) return 'Ausbaufaehig';
  if (score >= 35) return 'Schwach';
  if (score > 0) return 'Kritisch';
  return 'Kein Auftritt';
}

/**
 * Die drei gewichtigsten unerfuellten Punkte — Grundlage der Outreach-Mail.
 * Ein Betrieb liest keine Liste mit 18 Befunden, aber drei konkrete Saetze schon.
 */
export function groessteLuecken(ergebnis, anzahl = 3) {
  return (ergebnis.befunde ?? [])
    .filter((b) => !b.erfuellt && b.warum)
    .sort((a, b) => b.punkte - a.punkte)
    .slice(0, anzahl);
}

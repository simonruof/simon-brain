/**
 * Stage 05 — Sektionstexte schreiben.
 *
 * Die heikelste Stage. Zwei Fehlerarten sind toedlich fuer den Verkauf:
 *
 *   Erfundene Fakten. Wenn im Prototyp steht "seit 1974 in Familienbesitz" und
 *   der Betrieb wurde 2003 gegruendet, ist das Gespraech vorbei. Das Modell
 *   bekommt deshalb ausdruecklich die Anweisung, ausschliesslich Belegtes zu
 *   verwenden — und die Quellen sauber getrennt geliefert.
 *
 *   Werbefloskeln. "Ihr kompetenter Partner fuer massgeschneiderte Loesungen"
 *   ist genau der Satz, den die alte Seite schon hat. Jedes Playbook fuehrt
 *   deshalb eine eigene Verbotsliste, die hier durchgesetzt und danach geprueft
 *   wird.
 *
 * Ohne ANTHROPIC_API_KEY faellt die Stage auf Bestandstexte und die
 * Playbook-Vorgaben zurueck — der Prototyp entsteht trotzdem.
 */

import { config } from '../core/config.js';
import { emit } from '../core/events.js';
import { jsonAnfrage } from '../lib/claude.js';
import { playbook, sektionen } from '../lib/playbooks.js';
import { pruefeFakten, zusammenfassung } from '../lib/factcheck.js';

const SYSTEM = `Du schreibst Website-Texte fuer Schweizer Kleinbetriebe.

SPRACHE
- Schweizer Hochdeutsch. Niemals "ß" — immer "ss" (Strasse, Fuesse, gross, heisst).
- Tausendertrennzeichen ist der Apostroph: 22'500.
- Siezen, ausser die Quelltexte duzen durchgehend.

WAHRHEIT — die wichtigste Regel
- Verwende ausschliesslich Angaben, die in den gelieferten Quellen stehen.
- Erfinde niemals: Gruendungsjahre, Mitarbeiterzahlen, Zertifikate, Auszeichnungen,
  Preise, Garantien, Markenpartnerschaften, Familiengeschichten.
- Wenn eine Angabe fehlt, formuliere ohne sie. Eine ausgelassene Zahl faellt niemandem
  auf; eine falsche Zahl zerstoert das Verkaufsgespraech.
- Preise nur nennen, wenn sie woertlich in den Quellen vorkommen.

STIL
- Kurze Saetze. Konkrete Substantive. Aktiv statt Passiv.
- Beschreibe, was der Betrieb tut — nicht, wie toll er ist.
- Keine Ausrufezeichen. Keine Superlative ohne Beleg.
- Ueberschriften: hoechstens acht Woerter, keine Doppelpunkte.

Antworte ausschliesslich mit einem JSON-Objekt. Kein Vorwort, keine Erklaerung.`;

/** Baut den Nutzer-Prompt aus allem, was wir ueber den Betrieb wissen. */
function prompt(profil, pb, benoetigteSektionen) {
  const p = profil.places;
  const s = profil.scrape;
  const brief = pb.copy_brief ?? {};

  const quellen = [];
  quellen.push('### Betrieb');
  quellen.push(`Name: ${p?.name || s?.name || profil.eingabe.name}`);
  if (p?.ort) quellen.push(`Ort: ${p.ort}`);
  if (p?.adresse) quellen.push(`Adresse: ${p.adresse}`);
  if (p?.typLabel) quellen.push(`Google-Kategorie: ${p.typLabel}`);
  if (p?.rating) quellen.push(`Google-Bewertung: ${p.rating} von 5 aus ${p.anzahlBewertungen} Bewertungen`);
  if (p?.beschreibung) quellen.push(`Google-Kurzbeschreibung: ${p.beschreibung}`);
  if (p?.oeffnungszeiten?.text?.length) quellen.push(`Oeffnungszeiten:\n${p.oeffnungszeiten.text.join('\n')}`);

  if (s?.titel) { quellen.push('\n### Bestehende Website'); quellen.push(`Seitentitel: ${s.titel}`); }
  if (s?.metaDescription) quellen.push(`Beschreibung: ${s.metaDescription}`);
  if (s?.h1?.length) quellen.push(`Ueberschriften H1: ${s.h1.join(' | ')}`);
  if (s?.h2?.length) quellen.push(`Ueberschriften H2: ${s.h2.slice(0, 14).join(' | ')}`);
  if (s?.nav?.length) quellen.push(`Navigation: ${s.nav.join(' | ')}`);
  if (s?.bodyText) quellen.push(`\nSeitentext (gekuerzt):\n${s.bodyText.slice(0, 6500)}`);

  if (p?.bewertungen?.length) {
    quellen.push('\n### Was Kunden schreiben (nur als Hinweis, nicht zitieren)');
    for (const b of p.bewertungen.slice(0, 4)) quellen.push(`- ${b.text.slice(0, 240)}`);
  }

  const felder = [];
  felder.push(`"hero": { "titel": "Hauptueberschrift, ${brief.headline_muster ?? 'Leistung + Ort'}, max 9 Woerter", "lead": "1-2 Saetze, was der Betrieb konkret anbietet und fuer wen" }`);
  felder.push(`"augenbraue": "2-4 Woerter ueber der Hauptueberschrift, z.B. die Ortschaft oder die Kernleistung"`);
  felder.push(`"metaTitel": "Seitentitel fuer Google, 50-60 Zeichen, mit Leistung und Ort"`);
  felder.push(`"metaBeschreibung": "Google-Beschreibung, 140-155 Zeichen, mit Handlungsaufforderung"`);

  if (benoetigteSektionen.includes('services')) {
    const preisliste = sektionen(pb).find((x) => x.typ === 'services')?.optionen?.layout === 'preisliste';
    felder.push(`"leistungen": [4-6 Objekte: { "titel": "max 4 Woerter", "text": "1 Satz, was genau gemacht wird"${preisliste ? ', "preis": "nur falls in den Quellen genannt, sonst weglassen"' : ''} }]`);
  }
  if (benoetigteSektionen.includes('highlights')) {
    felder.push(`"highlights": [genau 3 Objekte: { "titel": "max 3 Woerter", "text": "1 Satz" }]`);
  }
  if (benoetigteSektionen.includes('menu')) {
    felder.push(`"menu": [4-8 Objekte: { "titel": "Gericht oder Kategorie", "text": "kurze Beschreibung", "preis": "nur falls belegt" }]`);
  }
  if (benoetigteSektionen.includes('process')) {
    felder.push(`"prozess": [genau 3 Objekte: { "titel": "max 4 Woerter", "text": "1 Satz aus Kundensicht" }]`);
  }
  if (benoetigteSektionen.includes('about')) {
    felder.push(`"about": "2 Abschnitte, getrennt durch \\n\\n. Wer der Betrieb ist und warum man dorthin geht. Nur Belegtes."`);
  }
  felder.push(`"kontaktTitel": "Ueberschrift des Kontaktbereichs, max 5 Woerter"`);
  felder.push(`"kontaktLead": "1 Satz, der zur Kontaktaufnahme auffordert"`);
  felder.push(`"trustSignale": [2-3 kurze Belege, je max 4 Woerter, nur aus den Quellen ableitbar]`);

  return `Schreibe die Texte fuer die neue Website dieses Betriebs.

BRANCHE: ${pb.label}
TONALITAET: ${(brief.tonalitaet ?? '').trim()}
${brief.beispiel_headline ? `BEISPIEL EINER GUTEN HAUPTUEBERSCHRIFT: "${brief.beispiel_headline}"` : ''}

VERBOTENE FORMULIERUNGEN (nicht verwenden, auch nicht abgewandelt):
${(brief.verboten ?? []).map((v) => `- ${v}`).join('\n')}

QUELLEN
${quellen.join('\n')}

Antworte mit genau diesem JSON-Aufbau:
{
  ${felder.join(',\n  ')}
}`;
}

/** Rueckfall ohne API: Bestandstexte plus Playbook-Vorgaben. */
function ohneApi(profil, pb) {
  const brief = pb.copy_brief ?? {};
  const name = profil.places?.name || profil.scrape?.name || profil.eingabe.name || 'Ihr Betrieb';
  const ort = profil.places?.ort || profil.scrape?.extrahiert?.adresse?.ort || profil.eingabe.ort || '';
  const s = profil.scrape;
  const leistungen = brief.leistungen_fallback ?? [];

  // Meta-Beschreibung aus dem zusammenbauen, was tatsaechlich bekannt ist.
  // Die Alternative — das Feld leer lassen — kostet fuenf Punkte im Score und
  // waere ausgerechnet einer der Befunde, mit denen wir werben.
  const beschreibung = (
    s?.metaDescription
    || profil.places?.beschreibung
    || [
      `${pb.label}${ort ? ` in ${ort}` : ''}.`,
      leistungen.slice(0, 3).map((l) => l.titel).join(', ') + '.',
      pb.cta?.primaer?.text ? `${pb.cta.primaer.text}.` : '',
    ].filter(Boolean).join(' ')
  ).slice(0, 155);

  return {
    hero: {
      titel: s?.h1?.[0] || `${pb.label} in ${ort}`.trim(),
      lead: s?.metaDescription || profil.places?.beschreibung || beschreibung,
    },
    augenbraue: ort,
    metaTitel: `${name}${ort ? ` · ${pb.label} in ${ort}` : ''}`.slice(0, 60),
    metaBeschreibung: beschreibung,
    leistungen,
    highlights: brief.highlights_fallback ?? brief.leistungen_fallback?.slice(0, 3) ?? [],
    prozess: brief.prozess_fallback ?? [],
    about: aboutOhneApi(profil, pb, ort),
    kontaktTitel: 'So erreichen Sie uns',
    kontaktLead: '',
    trustSignale: pb.trust_signale ?? [],
    _quelle: 'fallback',
  };
}

/**
 * Ueber-uns-Text ohne Sprachmodell.
 *
 * Rein zusammengesetzt aus belegten Angaben — es wird nichts behauptet, was
 * nicht in den Quellen steht. Lieber ein kurzer wahrer Absatz als ein langer
 * erfundener: Ein falsches Gruendungsjahr im Prototyp beendet das Gespraech.
 *
 * Ohne diesen Rueckfall faellt die Ueber-uns-Sektion ersatzlos weg und die
 * Seite wirkt loechrig.
 */
function aboutOhneApi(profil, pb, ort) {
  if (profil.places?.beschreibung) return profil.places.beschreibung;

  const name = profil.places?.name || profil.scrape?.name || profil.eingabe.name;
  const s = profil.scrape;

  // Erst versuchen, den laengsten zusammenhaengenden Absatz der Bestandsseite
  // zu uebernehmen. Das sind die eigenen Worte des Betriebs — unschlagbar echt.
  const absaetze = (s?.bodyText ?? '')
    .split(/\n{2,}/)
    .map((a) => a.replace(/\s+/g, ' ').trim())
    .filter((a) => a.length >= 120 && a.length <= 700)
    .filter((a) => !/oeffnungszeit|öffnungszeit|telefon|copyright|©|impressum/i.test(a));

  if (absaetze.length) {
    return absaetze.sort((a, b) => b.length - a.length).slice(0, 2).join('\n\n');
  }

  const teile = [];
  if (name && ort) teile.push(`${name} ist ${artikel(pb.label)} in ${ort}.`);
  if (profil.places?.rating >= 4) {
    teile.push(`Kundinnen und Kunden bewerten uns auf Google mit ${profil.places.rating} von 5 Sternen.`);
  }
  if (profil.places?.oeffnungszeiten || profil.scrape?.extrahiert?.oeffnungszeiten) {
    teile.push('Unsere Oeffnungszeiten und den Weg zu uns finden Sie weiter unten.');
  }
  return teile.join(' ');
}

const artikel = (label) => (/^[AEIOU]/i.test(label) ? 'ein' : 'ein') + ' ' + label
  .replace(/^KFZ-Werkstatt$/, 'e KFZ-Werkstatt')
  .replace(/^Restaurant \/ Gastronomie$/, ' Restaurant')
  .replace(/^Handwerk & Bau$/, ' Handwerksbetrieb')
  .replace(/^Beauty & Wellness$/, ' Salon')
  .replace(/^Allgemein$/, ' Betrieb');

/** Verbotene Formulierungen im Ergebnis aufspueren — Qualitaetskontrolle. */
function pruefeVerbote(copy, verboten) {
  const alles = JSON.stringify(copy).toLowerCase();
  return (verboten ?? []).filter((v) => alles.includes(String(v).toLowerCase()));
}

/** Deutsches ß darf in Schweizer Texten nicht vorkommen. Still korrigieren. */
function schweizerisieren(obj) {
  if (typeof obj === 'string') return obj.replace(/ß/g, 'ss');
  if (Array.isArray(obj)) return obj.map(schweizerisieren);
  if (obj && typeof obj === 'object') {
    return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, schweizerisieren(v)]));
  }
  return obj;
}

export default {
  id: 'copy',
  titel: 'Texte schreiben',
  brauchtText: 'ANTHROPIC_API_KEY (sonst Rueckfall auf Bestandstexte)',

  braucht() { return null; }, // faellt notfalls zurueck statt zu scheitern

  async run(profil) {
    const pb = playbook(profil.klassifikation?.playbook);
    const benoetigt = sektionen(pb).map((s) => s.typ);

    if (!config.anthropicKey) {
      profil.copy = ohneApi(profil, pb);
      // Auch der Rueckfall wird geprueft: Er uebernimmt Absaetze der
      // Bestandsseite, und dort kann durchaus etwas stehen, das im neuen
      // Zusammenhang zur unbelegten Behauptung wird.
      profil.faktencheck = pruefeFakten(profil.copy, profil, pb);
      emit('warn', { lead: profil.slug, text: 'Ohne ANTHROPIC_API_KEY — Texte aus Bestand und Playbook uebernommen' });
      return;
    }

    let copy = await jsonAnfrage({
      system: SYSTEM,
      prompt: prompt(profil, pb, benoetigt),
      maxTokens: 4000,
      temperatur: 0.7,
    });

    copy = schweizerisieren(copy);

    const verstoesse = pruefeVerbote(copy, pb.copy_brief?.verboten);
    if (verstoesse.length) {
      emit('warn', { lead: profil.slug, text: `Verbotene Formulierungen im Text: ${verstoesse.join(', ')}` });
    }

    // Leere Sektionen mit den Playbook-Vorgaben auffuellen, damit die Seite
    // nicht loechrig wird, wenn das Modell ein Feld ausgelassen hat.
    const brief = pb.copy_brief ?? {};
    copy.leistungen = copy.leistungen?.length ? copy.leistungen : (brief.leistungen_fallback ?? []);
    copy.prozess = copy.prozess?.length ? copy.prozess : (brief.prozess_fallback ?? []);
    copy.highlights = copy.highlights?.length ? copy.highlights : (brief.highlights_fallback ?? []);
    copy.trustSignale = copy.trustSignale?.length ? copy.trustSignale : (pb.trust_signale ?? []);
    copy._quelle = 'claude';
    copy._modell = config.model;
    copy._verstoesse = verstoesse;

    profil.copy = copy;

    // Faktenpruefung. Ein falsches Gruendungsjahr im Prototyp beendet das
    // Gespraech endgueltig — deshalb wird jede pruefbare Behauptung gegen
    // die Quellen abgeglichen, bevor der Lead als versandbereit gilt.
    profil.faktencheck = pruefeFakten(copy, profil, pb);

    emit('info', {
      lead: profil.slug,
      text: `Texte fertig: ${copy.leistungen?.length ?? 0} Leistungen, ${(copy.about ?? '').length} Zeichen Ueber-uns`,
    });

    if (!profil.faktencheck.versandbereit) {
      emit('warn', {
        lead: profil.slug,
        text: `Nicht versandbereit — ${zusammenfassung(profil.faktencheck)}: `
          + profil.faktencheck.verdaechtig.map((v) => `"${v.behauptung}"`).join(', '),
      });
    }
  },
};

/**
 * Stage 07 — den Prototyp bauen.
 *
 * Fuehrt alles zusammen: Playbook bestimmt die Sektionsfolge, Theme liefert die
 * Farben, Copy die Texte, Places die Fakten, Images die Bilder.
 *
 * Ergebnis ist eine einzige, in sich geschlossene HTML-Datei plus ein Ordner
 * mit Bildern. Kein Build, kein Bundle, keine externe Anfrage. Deploy heisst
 * damit schlicht: Dateien kopieren.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { config } from '../core/config.js';
import { emit } from '../core/events.js';
import { playbook, sektionen } from '../lib/playbooks.js';
import { stylesheet, SKRIPT } from '../themes/stylesheet.js';
import { SEKTIONEN, SEKTION_TITEL, SEKTION_ANKER, nav, fuss, anrufleiste } from '../sections/index.js';
import { jsonLdTag, llmsTxt } from '../lib/schema-ld.js';
import {
  metaTags, vorschauBanner, fussHinweis, ROBOTS_TXT, pruefeHtml, esc, ablaufdatum,
} from '../lib/guard.js';
import { WbError, EXIT } from '../core/errors.js';

/**
 * Baut das flache Datenobjekt, mit dem alle Sektionen arbeiten.
 * Reihenfolge der Quellen: Places schlaegt Bestandsseite schlaegt Eingabe —
 * Google-Daten sind fast immer aktueller als die Website.
 */
export function seitenDaten(profil, pb) {
  const p = profil.places ?? {};
  const s = profil.scrape ?? {};
  const c = profil.copy ?? {};

  // Aus dem Text der Altseite gelesene Angaben. Sie springen ein, wo Places
  // nichts liefert — und ohne Places-Key sind sie die einzige Quelle echter
  // Kontaktdaten. Reihenfolge: Google schlaegt Website, weil Google-Eintraege
  // in der Regel aktueller gepflegt werden.
  const x = s.extrahiert ?? {};

  const oeffnungszeiten = p.oeffnungszeiten ?? x.oeffnungszeiten ?? null;
  const heute = new Date().getDay();
  const heuteTag = oeffnungszeiten?.tage?.find((t) => t.index === heute);

  return {
    name: p.name || s.name || profil.eingabe.name || 'Betrieb',
    ort: p.ort || x.adresse?.ort || profil.eingabe.ort || '',
    adresse: p.adresse || x.adresse?.vollstaendig || '',
    strasse: p.strasse || x.adresse?.strasse || '',
    hausnummer: p.hausnummer || x.adresse?.hausnummer || '',
    plz: p.plz || x.adresse?.plz || '',
    land: p.land || 'CH',
    koordinaten: p.koordinaten ?? null,
    telefon: p.telefon || profil.eingabe.telefon || x.telefon || s.telLinks?.[0] || '',
    telefonIntl: p.telefonIntl || '',
    mail: s.mailLinks?.[0] || x.email || '',
    rating: p.rating ?? null,
    anzahlBewertungen: p.anzahlBewertungen ?? 0,
    bewertungen: p.bewertungen ?? [],
    oeffnungszeiten,
    heuteText: heuteTag ? (heuteTag.geschlossen ? 'geschlossen' : heuteTag.zeiten.join(', ')) : '',
    beschreibung: p.beschreibung || s.metaDescription || '',
    sozial: s.sozial ?? {},
    mapsUrl: p.mapsUrl || '',
    branche: pb.label,
    leistung: pb.label,
    augenbraue: c.augenbraue || p.ort || '',
    copy: c,
    cta: pb.cta,
    trustSignale: c.trustSignale?.length ? c.trustSignale : (pb.trust_signale ?? []),
    heroBild: profil.bilder?.hero ?? null,
    bilder: profil.bilder ?? {},
    previewUrl: profil.deploy?.url || '',
  };
}

export default {
  id: 'render',
  titel: 'Prototyp bauen',

  braucht(profil) {
    if (!profil.copy) return 'keine Texte vorhanden (Stage copy zuerst)';
    return null;
  },

  async run(profil) {
    const pb = playbook(profil.klassifikation?.playbook);
    const d = seitenDaten(profil, pb);
    const themeName = pb.theme ?? 'clean';
    const outDir = join(config.outDir, profil.slug);
    mkdirSync(outDir, { recursive: true });

    profil.render = { ...profil.render, gebautAm: new Date().toISOString() };

    const gewaehlt = sektionen(pb);

    // Navigation aus den tatsaechlich gerenderten Sektionen ableiten —
    // ein Link auf eine leere Sektion ist schlimmer als kein Link.
    const teile = [];
    const links = [];
    for (const { typ, optionen } of gewaehlt) {
      const fn = SEKTIONEN[typ];
      if (!fn) { emit('warn', { lead: profil.slug, text: `Unbekannter Sektionstyp "${typ}" im Playbook ${pb.id}` }); continue; }
      const html = fn(d, optionen);
      if (!html) continue;
      teile.push({ typ, html });
      if (typ !== 'hero' && SEKTION_TITEL[typ]) {
        links.push({ id: SEKTION_ANKER[typ], titel: optionen.titel && optionen.titel.length <= 16 ? optionen.titel : SEKTION_TITEL[typ] });
      }
    }
    d.sektionsLinks = links;

    const heroTeil = teile.find((t) => t.typ === 'hero');
    const rest = teile.filter((t) => t.typ !== 'hero');

    // Hintergruende abwechseln. Bewusst hier und nicht in den Sektionen: nur
    // der Renderer kennt die tatsaechliche Reihenfolge. Wuerde jede Sektion
    // ihren Hintergrund selbst festlegen, stuenden je nach Playbook zwei
    // gleichfarbige nebeneinander — und zwei weisse Sektionen hintereinander
    // verschmelzen zu einer einzigen, endlos wirkenden Flaeche.
    rest.forEach((t, i) => {
      if (i % 2 === 0) t.html = t.html.replace('class="f-sek"', 'class="f-sek f-sek--alt"');
    });

    const titel = d.copy.metaTitel || `${d.name}${d.ort ? ` · ${pb.label} in ${d.ort}` : ''}`;
    const beschreibung = d.copy.metaBeschreibung || d.beschreibung || '';

    const html = `<!doctype html>
<html lang="de-CH">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>${esc(titel)}</title>
  <meta name="description" content="${esc(beschreibung)}">
  ${metaTags()}
  <meta property="og:type" content="website">
  <meta property="og:title" content="${esc(titel)}">
  <meta property="og:description" content="${esc(beschreibung)}">
  <meta property="og:locale" content="de_CH">
  ${d.heroBild ? `<meta property="og:image" content="${esc(d.heroBild.datei)}">` : ''}
  <meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)">
  <meta name="theme-color" content="#0f161d" media="(prefers-color-scheme: dark)">
  <link rel="canonical" href="${esc(d.previewUrl || '.')}">
  ${jsonLdTag(d, pb.schema_type)}
  <style>${stylesheet(themeName)}</style>
</head>
<body>
${vorschauBanner(profil)}
${nav(d)}
${heroTeil?.html ?? ''}
<main>
${rest.map((t) => t.html).join('\n')}
</main>
${fuss(d, fussHinweis(profil))}
${anrufleiste(d)}
<script>${SKRIPT}</script>
</body>
</html>`;

    // Letzte Kontrolle: die rechtlichen Leitplanken muessen drin sein.
    const fehlend = pruefeHtml(html);
    if (fehlend.length) {
      throw new WbError('GUARD_FEHLT',
        `Der Prototyp waere ohne Schutzmassnahmen entstanden: ${fehlend.join(', ')}.`,
        'src/lib/guard.js und 07-render.js pruefen — diese Angaben sind nicht optional.',
        EXIT.BAD_INPUT);
    }

    writeFileSync(join(outDir, 'index.html'), html);
    writeFileSync(join(outDir, 'robots.txt'), ROBOTS_TXT);
    writeFileSync(join(outDir, 'llms.txt'), llmsTxt(d));
    writeFileSync(join(outDir, 'sitemap.xml'),
      `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${esc(d.previewUrl || './')}</loc><lastmod>${new Date().toISOString().slice(0, 10)}</lastmod></url>
</urlset>`);

    profil.render = {
      outDir,
      theme: themeName,
      playbook: pb.id,
      sektionen: teile.map((t) => t.typ),
      bytes: Buffer.byteLength(html),
      laeuftAbAm: ablaufdatum(profil.render.gebautAm).toISOString(),
      gebautAm: profil.render.gebautAm,
      dateien: ['index.html', 'robots.txt', 'llms.txt', 'sitemap.xml'],
    };

    emit('info', {
      lead: profil.slug,
      text: `Prototyp: ${teile.length} Sektionen, Theme "${themeName}", ${(Buffer.byteLength(html) / 1024).toFixed(0)} KB`,
    });
  },
};

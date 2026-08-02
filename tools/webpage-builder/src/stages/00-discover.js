/**
 * Stage 00 — Lead-Beschaffung.
 *
 * Statt Betriebe von Hand aus Google Maps abzuschreiben, holt diese Stage sie
 * selbst und sortiert sie nach Verkaufswahrscheinlichkeit.
 *
 * Die Priorisierung ist der eigentliche Wert. Zwei Gruppen kaufen am ehesten:
 *
 *   1. Betriebe ganz ohne Website. Es gibt nichts zu verteidigen, keinen
 *      Neffen der die Seite "mal gemacht hat", keine laufenden Kosten die
 *      jemand rechtfertigen muesste.
 *   2. Betriebe mit sehr guter Google-Bewertung und schwachem Online-Auftritt.
 *      Sie sind nachweislich gut in ihrem Handwerk und verlieren trotzdem
 *      Kunden. Das ist der stichhaltigste Gespraechseinstieg den es gibt.
 *
 * Bereits kontaktierte Betriebe werden ueber ihre Place-ID ausgeschlossen —
 * denselben Betrieb zweimal anzuschreiben kostet Glaubwuerdigkeit.
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { config } from '../core/config.js';
import { badInput } from '../core/errors.js';
import { emit } from '../core/events.js';
import { textSuche, ortAus } from '../lib/places-api.js';
import { alleProfile } from '../core/profile.js';

const KONTAKT_DATEI = () => join(config.dataDir, '_contacted.json');

function bekannteIds() {
  const ids = new Set();
  if (existsSync(KONTAKT_DATEI())) {
    for (const id of JSON.parse(readFileSync(KONTAKT_DATEI(), 'utf8'))) ids.add(id);
  }
  for (const p of alleProfile()) {
    if (p.eingabe?.placeId) ids.add(p.eingabe.placeId);
    if (p.places?.placeId) ids.add(p.places.placeId);
  }
  return ids;
}

export function alsKontaktiertMerken(placeIds) {
  mkdirSync(config.dataDir, { recursive: true });
  const vorhanden = existsSync(KONTAKT_DATEI())
    ? JSON.parse(readFileSync(KONTAKT_DATEI(), 'utf8')) : [];
  const neu = [...new Set([...vorhanden, ...placeIds])];
  writeFileSync(KONTAKT_DATEI(), JSON.stringify(neu, null, 2));
  return neu.length;
}

function radiusMeter(radius) {
  if (!radius) return 0;
  const m = String(radius).match(/^([\d.]+)\s*(km|m)?$/i);
  if (!m) throw badInput(`Radius "${radius}" nicht verstanden.`, 'Beispiele: --radius 25km oder --radius 8000');
  return Math.round(Number(m[1]) * (m[2]?.toLowerCase() === 'm' ? 1 : 1000));
}

/**
 * Verkaufspriorität 0–100. Rein aus Places-Daten, ohne die Seiten zu besuchen —
 * die teure Analyse soll nur auf die aussichtsreichen Leads laufen.
 */
function prioritaet(p) {
  let score = 0;
  const bewertung = p.rating ?? 0;
  const anzahl = p.userRatingCount ?? 0;

  if (!p.websiteUri) score += 50;                               // kein Auftritt: heisster Lead
  else if (/facebook|instagram|linktr|business\.site|wixsite|jimdo/i.test(p.websiteUri)) score += 35;
  // "Website" ist in Wahrheit ein Social-Profil oder Baukasten-Platzhalter

  if (bewertung >= 4.5) score += 30;
  else if (bewertung >= 4.2) score += 22;
  else if (bewertung >= 3.8) score += 10;

  if (anzahl >= 50) score += 15;                                // etablierter Betrieb, echtes Geschaeft
  else if (anzahl >= 15) score += 10;
  else if (anzahl >= 5) score += 4;

  if (!p.nationalPhoneNumber) score -= 10;                      // schwer erreichbar
  if (p.businessStatus && p.businessStatus !== 'OPERATIONAL') score -= 60;

  return Math.max(0, Math.min(100, score));
}

function begruendung(p) {
  if (!p.websiteUri) return 'Keine Website hinterlegt';
  if (/facebook|instagram|linktr/i.test(p.websiteUri)) return 'Nur Social-Profil statt eigener Website';
  if (/business\.site|wixsite|jimdo|webnode/i.test(p.websiteUri)) return 'Baukasten-Platzhalter';
  if ((p.rating ?? 0) >= 4.3) return `Sehr gut bewertet (${p.rating}) — Auftritt prueft sich`;
  return 'Website vorhanden, Auftritt zu pruefen';
}

function csvSchreiben(leads, pfad) {
  const kopf = 'name,url,ort,telefon,place_id,bewertung,anzahl_bewertungen,prioritaet,grund';
  const esc = (v) => {
    const s = String(v ?? '');
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const zeilen = leads.map((l) => [
    l.name, l.url, l.ort, l.telefon, l.placeId, l.bewertung, l.anzahlBewertungen, l.prioritaet, l.grund,
  ].map(esc).join(','));
  writeFileSync(pfad, [kopf, ...zeilen].join('\n') + '\n');
}

export default {
  id: 'discover',
  titel: 'Leads per Umkreissuche finden',
  brauchtText: 'GOOGLE_PLACES_API_KEY',

  /**
   * @param {null} _profil  discover arbeitet nicht auf einem einzelnen Lead
   * @param {{was:string, wo:string, radius?:string, minRating?:number, limit?:number, nurOhneWebsite?:boolean, out?:string}} opts
   */
  async run(_profil, opts) {
    const limit = Math.min(200, Number(opts.limit ?? 60));
    const r = radiusMeter(opts.radius);
    const bekannt = bekannteIds();

    const gefunden = new Map();
    let token;
    let seiten = 0;

    while (gefunden.size < limit && seiten < 10) {
      const antwort = await textSuche({
        anfrage: opts.was, ort: opts.wo, radiusMeter: r, seiteToken: token,
      });
      const treffer = antwort.places ?? [];
      if (!treffer.length) break;

      for (const p of treffer) {
        if (gefunden.has(p.id)) continue;
        gefunden.set(p.id, p);
      }
      emit('info', { text: `Seite ${seiten + 1}: ${treffer.length} Treffer (gesamt ${gefunden.size})` });

      token = antwort.nextPageToken;
      seiten++;
      if (!token) break;
      // Places braucht einen Moment, bis ein Seiten-Token gueltig wird.
      await new Promise((res) => setTimeout(res, 2000));
    }

    let leads = [...gefunden.values()]
      .filter((p) => !bekannt.has(p.id))
      .filter((p) => !p.businessStatus || p.businessStatus === 'OPERATIONAL')
      .filter((p) => (opts.minRating ? (p.rating ?? 0) >= opts.minRating : true))
      .filter((p) => (opts.nurOhneWebsite ? !p.websiteUri : true))
      .map((p) => ({
        name: p.displayName?.text ?? '',
        url: p.websiteUri ?? '',
        ort: ortAus(p),
        telefon: p.nationalPhoneNumber ?? '',
        placeId: p.id,
        bewertung: p.rating ?? '',
        anzahlBewertungen: p.userRatingCount ?? 0,
        typ: p.primaryType ?? '',
        prioritaet: prioritaet(p),
        grund: begruendung(p),
      }))
      .sort((a, b) => b.prioritaet - a.prioritaet)
      .slice(0, limit);

    const pfad = opts.out ? String(opts.out) : join(config.root, 'leads.csv');
    csvSchreiben(leads, pfad);

    const uebersprungen = [...gefunden.values()].filter((p) => bekannt.has(p.id)).length;
    emit('info', { text: `${leads.length} Leads geschrieben nach ${pfad}${uebersprungen ? `, ${uebersprungen} bereits bekannt` : ''}` });

    return {
      anzahl: leads.length,
      bereitsBekannt: uebersprungen,
      csv: pfad,
      ohneWebsite: leads.filter((l) => !l.url).length,
      naechsterSchritt: `node bin/wb.js batch ${pfad} --concurrency 3 --json`,
      leads,
    };
  },
};

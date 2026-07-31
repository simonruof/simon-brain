/**
 * Oeffentliche API der Prototyp-Fabrik.
 *
 * Das hier ist die einzige Wahrheitsquelle. CLI, MCP-Server und Cockpit sind
 * duenne Huellen darum — sie uebersetzen nur Eingaben und formatieren Ausgaben.
 * Eine neue Faehigkeit wird hier gebaut und ist damit sofort in allen dreien da.
 */

import { readFileSync, existsSync } from 'node:fs';
import { config, capabilities } from './config.js';
import { badInput } from './errors.js';
import {
  leerProfil, profilLaden, profilSpeichern, alleProfile, findeProfil, zusammenfassung,
} from './profile.js';
import { leadVerarbeiten, batchVerarbeiten, stageAusfuehren, STAGE_BY_ID, STAGES } from './pipeline.js';
import { emit } from './events.js';
import discoverStage from '../stages/00-discover.js';
import { ladePlaybooks } from '../lib/playbooks.js';
import { reportSchreiben } from '../lib/report.js';
import { rangBerechnen } from '../lib/vergleich.js';
import { deployProfil, deployAufraeumen } from '../lib/deploy.js';

export { config, capabilities, alleProfile, profilLaden, zusammenfassung };

/**
 * Leads finden (Places-Umkreissuche) statt sie von Hand zusammenzusuchen.
 * @param {{was:string, wo:string, radius?:string, minRating?:number, limit?:number, ohneWebsite?:boolean}} opts
 */
export async function discover(opts) {
  if (!opts?.was || !opts?.wo) {
    throw badInput('discover braucht --was und --wo.', 'Beispiel: wb discover --was "KFZ-Werkstatt" --wo "Luzern" --radius 25km');
  }
  return discoverStage.run(null, opts);
}

/** Profil zu einem Lead holen oder neu anlegen (nie doppelt). */
export function profilFuer({ name = '', url = '', ort = '', telefon = '', placeId = '' }) {
  if (!name && !url && !placeId) {
    throw badInput('Ein Lead braucht mindestens --url, --name oder --place-id.', 'Beispiel: wb scan --url https://garage-mueller.ch');
  }
  const vorhanden = findeProfil({ url, placeId });
  if (vorhanden) {
    // Eingaben ergaenzen, falls beim ersten Mal weniger bekannt war
    for (const [k, v] of Object.entries({ name, url, ort, telefon, placeId })) {
      if (v && !vorhanden.eingabe[k]) vorhanden.eingabe[k] = v;
    }
    return profilSpeichern(vorhanden);
  }
  return profilSpeichern(leerProfil({ name, url, ort, telefon, placeId }));
}

/**
 * Nur analysieren: Bestandsseite auslesen, anreichern, klassifizieren, bewerten.
 * Das Ergebnis ist fuer sich genommen schon ein verkaufbarer Analyse-Report.
 */
export async function scan(eingabe, opts = {}) {
  const profil = profilFuer(eingabe);
  await leadVerarbeiten(profil, { ...opts, bis: 'audit' });
  return ergebnisFuerAusgabe(profil);
}

/** Kompletter Durchlauf bis zum fertigen Prototyp (ohne Deploy und ohne Mail). */
export async function build(eingabe, opts = {}) {
  const profil = profilFuer(eingabe);
  await leadVerarbeiten(profil, { ...opts, bis: opts.mitOutreach ? 'outreach' : 'verify' });
  return ergebnisFuerAusgabe(profil);
}

/** Einzelne Stage gezielt erneut ausfuehren — fuer Nachkorrekturen im Cockpit. */
export async function stage(slug, stageId, opts = {}) {
  const profil = profilLaden(slug);
  if (!profil) throw badInput(`Kein Lead mit Slug "${slug}".`, 'Vorhandene Leads: wb list --json');
  const s = STAGE_BY_ID[stageId];
  if (!s) throw badInput(`Unbekannte Stage "${stageId}".`, `Moeglich: ${Object.keys(STAGE_BY_ID).join(', ')}`);
  const status = await stageAusfuehren(s, profil, { ...opts, force: true });
  return { ...ergebnisFuerAusgabe(profil), stageStatus: status };
}

/**
 * Batch aus CSV. Spalten: name,url,ort,telefon (Reihenfolge egal, Kopfzeile noetig).
 * URL ist optional — ohne URL laeuft nur die Places-Anreicherung.
 */
export async function batch(csvPfad, opts = {}) {
  if (!existsSync(csvPfad)) {
    throw badInput(`CSV nicht gefunden: ${csvPfad}`, 'Erst Leads finden: wb discover --was "..." --wo "..." — das schreibt die CSV.');
  }
  const zeilen = csvLesen(readFileSync(csvPfad, 'utf8'));
  if (!zeilen.length) throw badInput('CSV enthaelt keine Datenzeilen.', 'Erwartet wird eine Kopfzeile mit mindestens einer der Spalten: name, url.');

  const profile = zeilen.map((z) => profilFuer({
    name: z.name ?? '', url: z.url ?? z.website ?? '', ort: z.ort ?? z.stadt ?? '',
    telefon: z.telefon ?? z.phone ?? '', placeId: z.place_id ?? z.placeid ?? '',
  }));

  emit('info', { text: `${profile.length} Leads, Parallelitaet ${opts.concurrency ?? 3}` });
  const ergebnisse = await batchVerarbeiten(profile, opts);

  if (opts.deploy) {
    for (const { profil } of ergebnisse) {
      if (profil.render?.outDir) {
        try { await deployProfil(profil); } catch (e) { emit('warn', { lead: profil.slug, text: `Deploy fehlgeschlagen: ${e.message}` }); }
      }
    }
  }

  // Rang innerhalb der Region und Branche. Kostet nichts — die Leads eines
  // Laufs sind einander bereits Konkurrenz, alle Werte liegen vor.
  const profileDesLaufs = ergebnisse.map((r) => r.profil);
  const rang = rangBerechnen(profileDesLaufs, { regionsweit: Boolean(opts.regionsweit) });
  for (const p of profileDesLaufs) if (p.vergleich) profilSpeichern(p);
  if (rang.bewertet) {
    emit('info', { text: `Konkurrenzvergleich: ${rang.bewertet} Leads in ${rang.gruppen} Gruppe(n) eingeordnet` });
  }

  const reportPfad = reportSchreiben(profileDesLaufs);
  const zus = ergebnisse.map((r) => zusammenfassung(r.profil));
  return {
    anzahl: zus.length,
    erfolgreich: zus.filter((z) => z.status !== 'failed').length,
    fehlgeschlagen: zus.filter((z) => z.status === 'failed').length,
    report: reportPfad,
    leads: zus,
  };
}

export function list() {
  return alleProfile().map(zusammenfassung);
}

export function get(slug) {
  const p = profilLaden(slug);
  if (!p) throw badInput(`Kein Lead mit Slug "${slug}".`, 'Vorhandene Leads: wb list --json');
  return p;
}

export async function deploy(slug) {
  return deployProfil(get(slug));
}

export async function aufraeumen(opts = {}) {
  return deployAufraeumen(opts);
}

export function report() {
  return reportSchreiben(alleProfile());
}

export function playbooks() {
  return ladePlaybooks().map((p) => ({
    id: p.id, label: p.label, theme: p.theme, schema_type: p.schema_type,
    sektionen: p.sections.map((s) => Object.keys(s)[0]),
    match: p.match,
  }));
}

function ergebnisFuerAusgabe(p) {
  return {
    ...zusammenfassung(p),
    befunde: p.auditVorher?.befunde ?? [],
    scoreDetails: p.auditVorher?.kategorien ?? null,
    prototyp: p.render?.outDir ?? null,
    stages: p.stages,
  };
}

/** Minimaler CSV-Leser — Komma oder Semikolon, Anfuehrungszeichen erlaubt. */
export function csvLesen(text) {
  const zeilen = text.split(/\r?\n/).filter((z) => z.trim());
  if (!zeilen.length) return [];
  const trenner = (zeilen[0].match(/;/g)?.length ?? 0) > (zeilen[0].match(/,/g)?.length ?? 0) ? ';' : ',';
  const felder = (z) => {
    const out = []; let cur = ''; let inQ = false;
    for (let i = 0; i < z.length; i++) {
      const c = z[i];
      if (c === '"') { if (inQ && z[i + 1] === '"') { cur += '"'; i++; } else inQ = !inQ; }
      else if (c === trenner && !inQ) { out.push(cur); cur = ''; }
      else cur += c;
    }
    out.push(cur);
    return out.map((f) => f.trim());
  };
  const kopf = felder(zeilen[0]).map((h) => h.toLowerCase().replace(/^﻿/, ''));
  return zeilen.slice(1).map((z) => Object.fromEntries(felder(z).map((v, i) => [kopf[i] ?? `spalte${i}`, v])));
}

/**
 * Selbstauskunft. Eine fremde KI ruft das als Erstes auf und weiss danach,
 * wie das Werkzeug zu bedienen ist — ohne dass jemand es ihr erklaert.
 */
export function describe() {
  return {
    name: 'wb',
    version: '1.0.0',
    zweck: 'Analysiert Websites Schweizer KMU, bewertet ihre KI-Sichtbarkeit und baut branchenspezifische Prototypen samt Outreach-Entwurf.',
    sprache: 'Alle erzeugten Texte sind Schweizer Hochdeutsch (kein ß, Apostroph als Tausendertrennzeichen).',
    konventionen: {
      json: 'Mit --json schreibt jeder Befehl genau ein JSON-Objekt auf stdout. Logs gehen immer auf stderr.',
      events: 'Mit --events kommt ein NDJSON-Ereignisstrom auf stdout (eine Zeile pro Ereignis) statt des Ergebnisobjekts.',
      interaktiv: 'Nie. Es gibt keine Rueckfragen und keine Eingabeaufforderungen.',
      cache: 'Erledigte Stages werden nicht wiederholt. --force erzwingt sie erneut.',
    },
    exitCodes: { 0: 'ok', 1: 'teilweise fehlgeschlagen', 2: 'fehlerhafte Eingabe', 3: 'API-Key fehlt', 4: 'Netzwerk- oder API-Fehler' },
    fehlerformat: '{ "error": { "code": "...", "message": "...", "hint": "..." } }',
    faehigkeiten: capabilities(),
    stages: [discoverStage, ...STAGES].map((s) => ({ id: s.id, titel: s.titel, braucht: s.brauchtText ?? null })),
    playbooks: ladePlaybooks().map((p) => ({ id: p.id, label: p.label })),
    befehle: [
      { name: 'describe', zweck: 'Diese Selbstauskunft.', beispiel: 'wb describe --json' },
      { name: 'discover', zweck: 'Leads per Places-Umkreissuche finden und als CSV schreiben.', args: ['--was <branche>', '--wo <ort>', '--radius <25km>', '--min-rating <4.0>', '--limit <60>', '--nur-ohne-website', '--out <datei.csv>'], beispiel: 'wb discover --was "KFZ-Werkstatt" --wo "Luzern" --radius 25km --json' },
      { name: 'scan', zweck: 'Bestandsseite analysieren und KI-Sichtbarkeits-Score berechnen. Baut noch nichts.', args: ['--url <url>', '--name <name>', '--ort <ort>'], beispiel: 'wb scan --url https://garage-muster.ch --json' },
      { name: 'build', zweck: 'Kompletter Durchlauf bis zum fertigen Prototyp in out/<slug>/.', args: ['--url <url>', '--force', '--mit-outreach'], beispiel: 'wb build --url https://garage-muster.ch --json' },
      { name: 'batch', zweck: 'Viele Leads aus einer CSV. Ein Fehler stoppt den Lauf nicht.', args: ['<datei.csv>', '--concurrency <3>', '--deploy'], beispiel: 'wb batch leads.csv --concurrency 3 --json' },
      { name: 'stage', zweck: 'Eine einzelne Stage erneut ausfuehren, z.B. nach Textkorrektur.', args: ['<slug>', '<stage-id>'], beispiel: 'wb stage garage-muster-a1b2c3 render --json' },
      { name: 'list', zweck: 'Alle bekannten Leads mit Score und Status.', beispiel: 'wb list --json' },
      { name: 'get', zweck: 'Vollstaendiges Profil eines Leads.', args: ['<slug>'], beispiel: 'wb get garage-muster-a1b2c3 --json' },
      { name: 'deploy', zweck: 'Prototyp auf den Vorschau-Server schieben.', args: ['<slug>'], beispiel: 'wb deploy garage-muster-a1b2c3 --json' },
      { name: 'report', zweck: 'Uebersichtsseite out/_report.html neu erzeugen.', beispiel: 'wb report --json' },
      { name: 'playbooks', zweck: 'Verfuegbare Branchen-Playbooks auflisten.', beispiel: 'wb playbooks --json' },
      { name: 'cleanup', zweck: 'Abgelaufene Vorschauen entfernen.', args: ['--dry-run'], beispiel: 'wb cleanup --json' },
    ],
    grenzen: [
      'Verschickt niemals selbst eine E-Mail. Outreach erzeugt nur einen Entwurf.',
      'Jeder Prototyp traegt noindex, einen sichtbaren Vorschau-Hinweis und ein Ablaufdatum. Das ist nicht abschaltbar.',
      'Das Kontaktformular im Prototyp ist bewusst inaktiv.',
      'Ohne GOOGLE_PLACES_API_KEY fehlen Bewertungen, Fotos und Oeffnungszeiten — der Rest laeuft trotzdem.',
      'Ohne ANTHROPIC_API_KEY werden Texte aus den Bestandsinhalten uebernommen statt neu geschrieben.',
    ],
  };
}

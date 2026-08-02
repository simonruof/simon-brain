/**
 * Das Lead-Profil — die einzige Datenstruktur, die durch die gesamte Pipeline
 * wandert. Jede Stage liest daraus und schreibt ihren Abschnitt hinein.
 *
 * Auf Platte unter data/<slug>/profile.json. Dadurch ist jeder Lauf
 * fortsetzbar: abgebrochen, erneut aufgerufen, es geht dort weiter wo es war.
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { config } from './config.js';

/** Aus einem Betriebsnamen einen dateisystem- und URL-tauglichen Slug bauen. */
export function slugify(text) {
  return String(text)
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'lead';
}

/**
 * Vorschau-Slug mit Zufallssuffix. Der Suffix ist eine der rechtlichen
 * Leitplanken: die Vorschau ist nicht erratbar und damit faktisch privat.
 *
 * Faellt der Name weg und bleibt nur die URL, wird daraus die Domain gezogen —
 * "garage-hess" statt "https-www-garage-hess-ch". Der Slug steht spaeter in
 * der Vorschau-Adresse, die der Empfaenger sieht.
 */
export function previewSlug(nameOderUrl) {
  const basis = /^https?:\/\/|\w+\.\w{2,}/i.test(String(nameOderUrl))
    ? domainName(nameOderUrl)
    : nameOderUrl;
  return `${slugify(basis)}-${randomBytes(3).toString('hex')}`;
}

/** "https://www.garage-hess.ch/kontakt" → "garage-hess" */
export function domainName(url) {
  try {
    const u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    return u.hostname
      .replace(/^www\./, '')
      .replace(/\.(ch|com|de|at|li|net|org|swiss|shop|info)$/i, '')
      .replace(/\./g, '-');
  } catch {
    return String(url);
  }
}

export function leerProfil({ name, url = '', ort = '', telefon = '', placeId = '' }) {
  const jetzt = new Date().toISOString();
  return {
    schemaVersion: 1,
    slug: previewSlug(name || url || 'lead'),
    erstellt: jetzt,
    aktualisiert: jetzt,

    eingabe: { name, url, ort, telefon, placeId },

    // Von 01-scrape befuellt
    scrape: null,
    // Von 02-places befuellt
    places: null,
    // Von 03-classify befuellt: { playbook, confidence, begruendung }
    klassifikation: null,
    // Von 04-audit befuellt: Score der Bestandsseite
    auditVorher: null,
    // Von 05-copy befuellt: Sektionstexte
    copy: null,
    // Von 06-images befuellt
    bilder: null,
    // Von 07-render befuellt: { outDir, dateien, theme }
    render: null,
    // Von 08-verify befuellt: Score des Prototyps
    auditNachher: null,
    // Von 09-outreach befuellt: { betreff, text, draftId }
    outreach: null,
    // Von deploy befuellt: { url, deployedAt, laeuftAbAm }
    deploy: null,

    /** Pro Stage: 'ok' | 'skipped' | 'failed' + Zeitstempel + Fehlermeldung */
    stages: {},
  };
}

export const profilPfad = (slug) => join(config.dataDir, slug, 'profile.json');

export function profilSpeichern(profil) {
  profil.aktualisiert = new Date().toISOString();
  const dir = join(config.dataDir, profil.slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(profilPfad(profil.slug), JSON.stringify(profil, null, 2));
  return profil;
}

export function profilLaden(slug) {
  const p = profilPfad(slug);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, 'utf8'));
}

/** Alle bekannten Profile — Grundlage fuer Report und Cockpit-Tabelle. */
export function alleProfile() {
  if (!existsSync(config.dataDir)) return [];
  return readdirSync(config.dataDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => profilLaden(e.name))
    .filter(Boolean)
    .sort((a, b) => (b.aktualisiert ?? '').localeCompare(a.aktualisiert ?? ''));
}

/**
 * Findet ein bestehendes Profil zu einer URL oder Place-ID.
 * Verhindert, dass derselbe Betrieb bei einem zweiten Lauf doppelt angelegt wird.
 */
export function findeProfil({ url = '', placeId = '' }) {
  const norm = (u) => String(u).replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '').toLowerCase();
  for (const p of alleProfile()) {
    if (placeId && p.eingabe.placeId === placeId) return p;
    if (placeId && p.places?.placeId === placeId) return p;
    if (url && p.eingabe.url && norm(p.eingabe.url) === norm(url)) return p;
  }
  return null;
}

/** Kompakte Zeile fuer Tabellen — Report, Cockpit, CLI-Ausgabe. */
export function zusammenfassung(p) {
  return {
    slug: p.slug,
    name: p.places?.name || p.scrape?.name || p.eingabe.name || p.slug,
    ort: p.places?.ort || p.eingabe.ort || '',
    url: p.eingabe.url || p.places?.website || '',
    branche: p.klassifikation?.playbook ?? null,
    scoreVorher: p.auditVorher?.score ?? null,
    scoreNachher: p.auditNachher?.score ?? null,
    bewertung: p.places?.rating ?? null,
    status: gesamtStatus(p),
    previewUrl: p.deploy?.url ?? null,
    // Ein Lead mit unbelegten Behauptungen ist nicht versandbereit — egal wie
    // gut der Prototyp aussieht. Ein falsches Gruendungsjahr im Erstkontakt
    // laesst sich nicht zurueckholen.
    versandbereit: versandbereit(p),
    faktenWarnungen: p.faktencheck?.verdaechtig?.length ?? 0,
    rang: p.vergleich ? { platz: p.vergleich.platz, von: p.vergleich.von } : null,
    aktualisiert: p.aktualisiert,
  };
}

/**
 * Versandbereit heisst: gebaut, nicht fehlgeschlagen, und ohne unbelegte
 * Behauptungen im Text. Bewusst streng — der Sinn der Faktenpruefung ist,
 * dass ein zweifelhafter Lead nicht versehentlich mit rausgeht.
 */
export function versandbereit(p) {
  if (gesamtStatus(p) === 'failed') return false;
  if (!p.render?.outDir) return false;
  if (p.faktencheck && !p.faktencheck.versandbereit) return false;
  return true;
}

export function gesamtStatus(p) {
  const s = p.stages ?? {};
  if (Object.values(s).some((x) => x.status === 'failed')) return 'failed';
  if (p.deploy?.url) return 'deployed';
  if (p.render?.outDir) return 'gebaut';
  if (p.auditVorher) return 'analysiert';
  return 'neu';
}

/**
 * Stage-Runner.
 *
 * Drei Eigenschaften, die im Batch-Betrieb ueber Erfolg entscheiden:
 *
 * 1. Cache — eine Stage, die bereits 'ok' war, laeuft nicht erneut. Ein
 *    zweiter Lauf ueber dieselbe CSV kostet damit null Franken API-Gebuehren.
 * 2. Fehler-Isolation — eine kaputte Stage stoppt weder die restlichen Stages
 *    (soweit sie nicht darauf angewiesen sind) noch die anderen Leads.
 * 3. Abhaengigkeiten — jede Stage erklaert, was sie braucht. Fehlt es, wird
 *    sie uebersprungen statt zu krachen.
 */

import { profilSpeichern } from './profile.js';
import { emit } from './events.js';
import { normalizeError } from './errors.js';

import discover from '../stages/00-discover.js';
import scrape from '../stages/01-scrape.js';
import places from '../stages/02-places.js';
import classify from '../stages/03-classify.js';
import audit from '../stages/04-audit.js';
import copy from '../stages/05-copy.js';
import images from '../stages/06-images.js';
import render from '../stages/07-render.js';
import verify from '../stages/08-verify.js';
import outreach from '../stages/09-outreach.js';

/** Reihenfolge ist die Ausfuehrungsreihenfolge. discover laeuft separat. */
export const STAGES = [scrape, places, classify, audit, copy, images, render, verify, outreach];
export const STAGE_BY_ID = Object.fromEntries([discover, ...STAGES].map((s) => [s.id, s]));

/**
 * Eine einzelne Stage ausfuehren.
 * @returns {'ok'|'skipped'|'failed'|'cached'}
 */
export async function stageAusfuehren(stage, profil, opts = {}) {
  const bereitsOk = profil.stages?.[stage.id]?.status === 'ok';
  if (bereitsOk && !opts.force) {
    emit('stage:skip', { lead: profil.slug, stage: stage.id, text: 'aus Cache' });
    return 'cached';
  }

  const fehlt = stage.braucht?.(profil, opts) ?? null;
  if (fehlt) {
    profil.stages[stage.id] = { status: 'skipped', grund: fehlt, ts: new Date().toISOString() };
    emit('stage:skip', { lead: profil.slug, stage: stage.id, text: fehlt });
    return 'skipped';
  }

  const start = Date.now();
  emit('stage:start', { lead: profil.slug, stage: stage.id, text: stage.titel });
  try {
    await stage.run(profil, opts);
    const dauerMs = Date.now() - start;
    profil.stages[stage.id] = { status: 'ok', dauerMs, ts: new Date().toISOString() };
    profilSpeichern(profil);
    emit('stage:ok', { lead: profil.slug, stage: stage.id, dauerMs });
    return 'ok';
  } catch (err) {
    const e = normalizeError(err);
    profil.stages[stage.id] = {
      status: 'failed',
      fehler: e.message,
      code: e.code,
      hinweis: e.hint,
      ts: new Date().toISOString(),
    };
    profilSpeichern(profil);
    emit('stage:fail', { lead: profil.slug, stage: stage.id, fehler: e.message, code: e.code });
    if (opts.verbose) process.stderr.write(String(err?.stack ?? err) + '\n');
    return 'failed';
  }
}

/**
 * Kompletter Durchlauf fuer einen Lead.
 * @param {object} profil
 * @param {{bis?: string, nur?: string[], force?: boolean, verbose?: boolean}} opts
 */
export async function leadVerarbeiten(profil, opts = {}) {
  emit('lead:start', { lead: profil.slug, text: profil.eingabe.name || profil.eingabe.url });

  let stages = STAGES;
  if (opts.nur?.length) stages = stages.filter((s) => opts.nur.includes(s.id));
  if (opts.bis) {
    const idx = stages.findIndex((s) => s.id === opts.bis);
    if (idx >= 0) stages = stages.slice(0, idx + 1);
  }

  const ergebnis = {};
  for (const stage of stages) {
    ergebnis[stage.id] = await stageAusfuehren(stage, profil, opts);
  }

  emit('lead:done', {
    lead: profil.slug,
    text: `Score ${profil.auditVorher?.score ?? '?'} → ${profil.auditNachher?.score ?? '?'}`,
  });
  return { profil, ergebnis };
}

/**
 * Mehrere Leads mit begrenzter Parallelitaet.
 *
 * Bewusst niedrige Vorgabe: Playwright startet echte Browser, und die Places-API
 * mag keine Lastspitzen. 3 ist auf Simons Hardware der Punkt, an dem der Durchsatz
 * nicht mehr steigt.
 */
export async function batchVerarbeiten(profile, opts = {}) {
  const concurrency = Math.max(1, Number(opts.concurrency ?? 3));
  const warteschlange = [...profile];
  const ergebnisse = [];

  async function arbeiter() {
    while (warteschlange.length) {
      const profil = warteschlange.shift();
      try {
        const r = await leadVerarbeiten(profil, opts);
        ergebnisse.push(r);
      } catch (err) {
        // Sollte nicht vorkommen — leadVerarbeiten faengt selbst. Sicherheitsnetz,
        // damit ein einzelner Lead nie den ganzen Batch reisst.
        const e = normalizeError(err);
        emit('lead:done', { lead: profil.slug, fehler: e.message });
        ergebnisse.push({ profil, ergebnis: { _fatal: e.message } });
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, arbeiter));
  return ergebnisse;
}

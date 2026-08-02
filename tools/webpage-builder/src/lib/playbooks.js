/**
 * Playbook-Lader.
 *
 * Ein Playbook ist die Antwort auf "wie sieht die beste Seite dieser Branche aus".
 * Diese Frage wird einmal pro Branche beantwortet, nicht einmal pro Lead — das
 * ist der Unterschied zwischen 20 Sekunden und 20 Minuten pro Prototyp.
 *
 * Neue Branche = neue YAML-Datei in playbooks/. Kein Code.
 */

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { config } from '../core/config.js';
import { badInput } from '../core/errors.js';

let cache = null;

export function ladePlaybooks({ neuLaden = false } = {}) {
  if (cache && !neuLaden) return cache;
  if (!existsSync(config.playbookDir)) {
    throw badInput(`Playbook-Ordner fehlt: ${config.playbookDir}`, 'Das Repository ist unvollstaendig ausgecheckt.');
  }
  cache = readdirSync(config.playbookDir)
    .filter((f) => /\.ya?ml$/i.test(f))
    .map((f) => {
      try {
        const p = parse(readFileSync(join(config.playbookDir, f), 'utf8'));
        p._datei = f;
        return normalisiere(p);
      } catch (err) {
        throw badInput(`Playbook ${f} ist fehlerhaft: ${err.message}`, 'YAML-Syntax pruefen, Einrueckung mit Leerzeichen (keine Tabs).');
      }
    })
    .sort((a, b) => (a.id === '_default' ? 1 : b.id === '_default' ? -1 : a.id.localeCompare(b.id)));
  return cache;
}

function normalisiere(p) {
  p.match ??= {};
  p.match.places_types ??= [];
  p.match.keywords ??= [];
  p.match.gewicht ??= 1.0;
  p.sections ??= [];
  p.copy_brief ??= {};
  p.copy_brief.verboten ??= [];
  p.cta ??= { primaer: { text: 'Kontakt aufnehmen', ziel: 'kontakt' } };
  p.trust_signale ??= [];
  p.images ??= { benoetigt: [], stock_tags: [] };
  p.theme ??= 'clean';
  p.schema_type ??= 'LocalBusiness';
  return p;
}

export function playbook(id) {
  const alle = ladePlaybooks();
  return alle.find((p) => p.id === id) ?? alle.find((p) => p.id === '_default');
}

/** Sektionsliste in eine gleichfoermige Struktur bringen: [{ typ, optionen }] */
export function sektionen(pb) {
  return (pb.sections ?? []).map((s) => {
    if (typeof s === 'string') return { typ: s, optionen: {} };
    const typ = Object.keys(s)[0];
    return { typ, optionen: s[typ] ?? {} };
  });
}

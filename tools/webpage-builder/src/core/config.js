/**
 * Konfiguration aus .env — bewusst ohne dotenv-Abhaengigkeit.
 *
 * Reihenfolge: echte Umgebungsvariablen schlagen die .env-Datei.
 * So kann ein Agent per `GOOGLE_PLACES_API_KEY=... wb scan` ueberschreiben.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { missingKey } from './errors.js';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function parseEnvFile(pfad) {
  if (!existsSync(pfad)) return {};
  const out = {};
  for (const zeile of readFileSync(pfad, 'utf8').split('\n')) {
    const t = zeile.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i === -1) continue;
    const key = t.slice(0, i).trim();
    let val = t.slice(i + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (val) out[key] = val;
  }
  return out;
}

const datei = parseEnvFile(join(ROOT, '.env'));
const lies = (name, fallback = '') => process.env[name] || datei[name] || fallback;

export const config = {
  root: ROOT,
  dataDir: join(ROOT, 'data'),
  outDir: join(ROOT, 'out'),
  playbookDir: join(ROOT, 'playbooks'),

  anthropicKey: lies('ANTHROPIC_API_KEY'),
  placesKey: lies('GOOGLE_PLACES_API_KEY'),
  pagespeedKey: lies('PAGESPEED_API_KEY'),

  model: lies('WB_MODEL', 'claude-sonnet-5'),

  deployHost: lies('WB_DEPLOY_HOST'),
  deployPath: lies('WB_DEPLOY_PATH', '/var/www/preview'),
  previewBaseUrl: lies('WB_PREVIEW_BASE_URL', 'https://preview.simonruof.ch').replace(/\/$/, ''),

  senderName: lies('WB_SENDER_NAME', 'Simon Ruof'),
  senderMail: lies('WB_SENDER_MAIL', ''),
  senderPhone: lies('WB_SENDER_PHONE', ''),

  previewDays: Number(lies('WB_PREVIEW_DAYS', '14')),
};

/** Wirft einen sprechenden Fehler, wenn ein Pflicht-Key fehlt. */
export function requireKey(name) {
  const map = {
    anthropicKey: ['ANTHROPIC_API_KEY', 'die Copy-Generierung'],
    placesKey: ['GOOGLE_PLACES_API_KEY', 'Bewertungen, Fotos und Oeffnungszeiten'],
  };
  if (!config[name]) {
    const [env, wofuer] = map[name] ?? [name, 'diesen Schritt'];
    throw missingKey(env, wofuer);
  }
  return config[name];
}

/** Welche Faehigkeiten stehen mit der aktuellen Konfiguration bereit? */
export function capabilities() {
  return {
    copy: Boolean(config.anthropicKey),
    places: Boolean(config.placesKey),
    pagespeed: true, // funktioniert auch ohne Key, nur langsamer
    deploy: Boolean(config.deployHost),
  };
}

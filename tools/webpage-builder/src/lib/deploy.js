/**
 * Deploy auf den Vorschau-Server.
 *
 * Weil der Prototyp reines statisches HTML ist, ist Deploy nichts als
 * Dateien kopieren — kein Build, keine Laufzeit, keine Datenbank. Ein Lead
 * ist in unter einer Sekunde online.
 *
 * Das Aufraeumen ist kein Nebenschauplatz: Jede Vorschau laeuft nach vierzehn
 * Tagen ab. Das ist zugleich die rechtliche Absicherung (fremde Inhalte
 * verschwinden von selbst) und der Verknappungshebel im Verkauf.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, rmSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { config } from '../core/config.js';
import { WbError, EXIT, networkError } from '../core/errors.js';
import { emit } from '../core/events.js';
import { profilSpeichern, alleProfile } from '../core/profile.js';
import { ablaufdatum } from './guard.js';

const lauf = promisify(execFile);

export async function deployProfil(profil) {
  if (!profil.render?.outDir || !existsSync(profil.render.outDir)) {
    throw new WbError('KEIN_PROTOTYP', `Fuer ${profil.slug} existiert kein gebauter Prototyp.`,
      `Erst bauen: node bin/wb.js build --url ${profil.eingabe.url || '<url>'}`, EXIT.BAD_INPUT);
  }
  if (!config.deployHost) {
    throw new WbError('KEIN_ZIEL', 'Kein Deploy-Ziel konfiguriert.',
      'WB_DEPLOY_HOST in .env setzen (z.B. user@vps.example.ch). Ohne Deploy funktioniert alles andere weiter — der Prototyp liegt lokal in out/.',
      EXIT.BAD_INPUT);
  }

  const ziel = `${config.deployHost}:${config.deployPath}/${profil.slug}/`;
  try {
    await lauf('rsync', [
      '-az', '--delete', '--chmod=D755,F644',
      `${profil.render.outDir}/`, ziel,
    ], { timeout: 120000 });
  } catch (err) {
    throw networkError(`rsync fehlgeschlagen: ${err.stderr || err.message}`,
      'SSH-Zugang zu WB_DEPLOY_HOST pruefen (Schluessel hinterlegt? Zielverzeichnis beschreibbar?).');
  }

  const url = `${config.previewBaseUrl}/${profil.slug}/`;
  profil.deploy = {
    url,
    deployedAt: new Date().toISOString(),
    laeuftAbAm: ablaufdatum().toISOString(),
    host: config.deployHost,
  };
  profilSpeichern(profil);

  emit('info', { lead: profil.slug, text: `Online: ${url}` });
  return profil.deploy;
}

/**
 * Abgelaufene Vorschauen entfernen — lokal und auf dem Server.
 * Als Cronjob eingerichtet laeuft das ohne Zutun (deploy/cron.example).
 */
export async function deployAufraeumen({ dryRun = false } = {}) {
  const jetzt = Date.now();
  const abgelaufen = [];

  for (const p of alleProfile()) {
    const ab = p.deploy?.laeuftAbAm ?? p.render?.laeuftAbAm;
    if (!ab) continue;
    if (new Date(ab).getTime() > jetzt) continue;
    abgelaufen.push({ slug: p.slug, url: p.deploy?.url ?? null, abgelaufenAm: ab });
  }

  if (dryRun) {
    return { wuerdeEntfernen: abgelaufen.length, leads: abgelaufen, dryRun: true };
  }

  for (const e of abgelaufen) {
    const lokal = join(config.outDir, e.slug);
    if (existsSync(lokal)) rmSync(lokal, { recursive: true, force: true });

    if (config.deployHost && e.url) {
      try {
        await lauf('ssh', [config.deployHost, `rm -rf ${config.deployPath}/${e.slug}`], { timeout: 30000 });
      } catch (err) {
        emit('warn', { lead: e.slug, text: `Serverseitiges Loeschen fehlgeschlagen: ${err.message}` });
      }
    }
    emit('info', { lead: e.slug, text: 'Abgelaufene Vorschau entfernt' });
  }

  return { entfernt: abgelaufen.length, leads: abgelaufen };
}

/** Wie viele Vorschauen liegen aktuell online? Fuer das Cockpit. */
export function deployStand() {
  const alle = alleProfile().filter((p) => p.deploy?.url);
  const jetzt = Date.now();
  return {
    online: alle.filter((p) => new Date(p.deploy.laeuftAbAm).getTime() > jetzt).length,
    abgelaufen: alle.filter((p) => new Date(p.deploy.laeuftAbAm).getTime() <= jetzt).length,
    lokal: existsSync(config.outDir) ? readdirSync(config.outDir).filter((f) => !f.startsWith('_')).length : 0,
  };
}

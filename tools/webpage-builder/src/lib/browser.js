/**
 * Browser-Start — an einer Stelle, weil zwei Stages ihn brauchen.
 *
 * Playwright erwartet exakt die Browser-Version, die zu seiner eigenen
 * Version gehoert. Auf fremden Maschinen (CI, Container, ein anderer
 * Entwicklungsrechner) liegt oft eine abweichende Fassung bereit. Statt daran
 * zu scheitern, suchen wir eine brauchbare ausfuehrbare Datei — der Unterschied
 * zwischen Chromium-Versionen ist fuer unseren Zweck bedeutungslos.
 */

import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { networkError } from '../core/errors.js';

const ARGS = ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'];

/** Sucht ein vorhandenes Chromium in den ueblichen Ablagen. */
function chromiumSuchen() {
  const kandidaten = [];

  const basis = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (basis && existsSync(basis)) {
    for (const eintrag of readdirSync(basis)) {
      if (!eintrag.startsWith('chromium')) continue;
      kandidaten.push(
        join(basis, eintrag, 'chrome-linux', 'chrome'),
        join(basis, eintrag, 'chrome-linux', 'headless_shell'),
        join(basis, eintrag, 'chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'),
      );
    }
  }

  kandidaten.push(
    '/usr/bin/chromium', '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable',
  );

  return kandidaten.find((p) => existsSync(p)) ?? null;
}

/**
 * Startet Chromium. Erst der regulaere Weg — der ist auf einer sauber
 * eingerichteten Maschine der richtige. Nur wenn Playwright seinen eigenen
 * Browser nicht findet, greifen wir auf einen vorhandenen zurueck.
 */
export async function browserStarten() {
  const { chromium } = await import('playwright');

  try {
    return await chromium.launch({ args: ARGS });
  } catch (err) {
    if (!/Executable doesn't exist|Failed to launch/i.test(String(err?.message))) throw err;

    const pfad = chromiumSuchen();
    if (!pfad) {
      throw networkError(
        `Kein Chromium gefunden: ${err.message}`,
        'Einmalig "npx playwright install chromium" ausfuehren.',
      );
    }
    return chromium.launch({ args: ARGS, executablePath: pfad });
  }
}

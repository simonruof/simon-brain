#!/usr/bin/env node
/**
 * Spielt die Stammdaten ein und schreibt die Feiertags-Blackouts für
 * das laufende und das folgende Jahr.
 */

import { join } from 'node:path';
import { einstellung, oeffneDb, seedStammdaten, WURZEL } from '../src/db.js';
import { schreibeFeiertage } from '../src/feiertage_seed.js';

const pfad = process.argv[2] ?? join(WURZEL, 'slot-engine.db');
const db = oeffneDb(pfad);

try {
  const dateien = seedStammdaten(db);
  console.log(`Stammdaten eingespielt: ${dateien.join(', ')}`);

  const zone = einstellung(db, 'zeitzone', 'Europe/Berlin');
  const jahr = new Date().getUTCFullYear();
  const anzahl = schreibeFeiertage(db, [jahr, jahr + 1], zone);
  console.log(`Feiertage Baden-Württemberg ${jahr}/${jahr + 1}: ${anzahl} Blackouts geschrieben.`);
} finally {
  db.close();
}

#!/usr/bin/env node
/** Spielt alle ausstehenden Migrationen ein. */

import { join } from 'node:path';
import { migriere, oeffneDb, WURZEL } from '../src/db.js';

const pfad = process.argv[2] ?? join(WURZEL, 'slot-engine.db');
const db = oeffneDb(pfad);

try {
  const angewendet = migriere(db);
  if (angewendet.length === 0) {
    console.log(`Keine ausstehenden Migrationen (${pfad}).`);
  } else {
    console.log(`Angewendet auf ${pfad}:`);
    for (const version of angewendet) console.log(`  - ${version}`);
  }
} finally {
  db.close();
}

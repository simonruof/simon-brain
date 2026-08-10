/**
 * Worker für den Nebenläufigkeitstest: versucht mit einer eigenen Verbindung,
 * denselben Slot zu reservieren. Genau einer darf gewinnen.
 */

import { parentPort, workerData } from 'node:worker_threads';
import { oeffneDb } from '../src/db.js';
import { reserviere } from '../src/reservierung.js';

const { pfad, ressourceId, leistungId, start, jetzt } = workerData;

const db = oeffneDb(pfad, { busyTimeoutMs: 5000 });
try {
  const hold = reserviere(db, { ressourceId, leistungId, start, jetzt });
  parentPort.postMessage({ ok: true, token: hold.token });
} catch (fehler) {
  parentPort.postMessage({ ok: false, fehler: `${fehler.code ?? ''} ${fehler.message}`.trim() });
} finally {
  db.close();
}

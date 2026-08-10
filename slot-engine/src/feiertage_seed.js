/**
 * Schreibender Teil der Feiertagslogik — bewusst getrennt von src/feiertage.js,
 * damit die Berechnung dort eine reine Funktion bleibt.
 */

import { feiertagsBlackouts } from './feiertage.js';

/**
 * Schreibt die Feiertage der angegebenen Jahre als ganztägige Blackouts
 * (quelle='feiertag', art='abwesenheit'). Idempotent: bereits vorhandene
 * Feiertags-Blackouts mit gleichem Zeitraum werden nicht dupliziert.
 *
 * @returns {number} Anzahl neu geschriebener Zeilen
 */
export function schreibeFeiertage(db, jahre, zone) {
  const zeilen = feiertagsBlackouts(jahre, zone);

  const vorhanden = db.prepare(
    `SELECT 1 FROM blackouts
      WHERE quelle = 'feiertag' AND resource_id IS NULL
        AND start_ts = ? AND end_ts = ?`,
  );
  const einfuegen = db.prepare(
    `INSERT INTO blackouts (resource_id, start_ts, end_ts, grund, art, quelle)
     VALUES (NULL, ?, ?, ?, 'abwesenheit', 'feiertag')`,
  );

  const lauf = db.transaction(() => {
    let neu = 0;
    for (const z of zeilen) {
      if (vorhanden.get(z.start_ts, z.end_ts)) continue;
      einfuegen.run(z.start_ts, z.end_ts, z.grund);
      neu += 1;
    }
    return neu;
  });

  return lauf();
}

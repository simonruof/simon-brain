/**
 * Test-Stammdaten.
 *
 * Bewusst NICHT der Produktiv-Seed aus seeds/: sonst würde jede Preis- oder
 * Zeitänderung im Betrieb die Testsuite umwerfen. Die Struktur ist dieselbe,
 * die Werte sind hier festgenagelt.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DateTime } from 'luxon';
import { migriere, oeffneDb } from '../src/db.js';

export const ZONE = 'Europe/Berlin';

/** Lokale Wanduhrzeit → Epoch-ms. */
export const t = (iso) => {
  const dt = DateTime.fromISO(iso, { zone: ZONE });
  if (!dt.isValid) throw new Error(`Ungültige Testzeit: ${iso}`);
  return dt.toMillis();
};

/** Epoch-ms → 'HH:mm' lokal. */
export const hhmm = (ms) => DateTime.fromMillis(ms, { zone: ZONE }).toFormat('HH:mm');

/** Epoch-ms → 'yyyy-MM-dd HH:mm' lokal. */
export const stempel = (ms) => DateTime.fromMillis(ms, { zone: ZONE }).toFormat('yyyy-MM-dd HH:mm');

export const MINUTE = 60_000;
export const STUNDE = 60 * MINUTE;
export const TAG = 24 * STUNDE;

/**
 * Referenztage der Testsuite (2026):
 *   Mo 10.08. Ruhetag · Di 11.08. Standard-Testtag · Sa 15.08. · So 16.08.
 *   Sa 03.10. Tag der Deutschen Einheit · Di 27.10. nach der Zeitumstellung
 */
export const DI = '2026-08-11';
export const MO = '2026-08-10';
export const SA = '2026-08-15';
export const SO = '2026-08-16';

const STAMMDATEN = `
INSERT INTO settings (key, value) VALUES
  ('zeitzone',            'Europe/Berlin'),
  ('slot_raster_min',     '15'),
  ('mindestvorlauf_min',  '60'),
  ('horizont_wochen',     '12'),
  ('hold_ttl_min',        '15'),
  ('max_parallel_kunden', '2'),
  ('wechsel_puffer_min',  '5');

INSERT INTO resources (id, name, aktiv) VALUES (1, 'Soner', 1);

INSERT INTO services
  (id, code, name, aktiv_vor_min, einwirk_min, aktiv_nach_min, puffer_min, preis_cent, vorlauf_min)
VALUES
  (1, 'herrenschnitt', 'Herrenschnitt',   30,  0,  0,  5, 2800, NULL),
  (2, 'bart',          'Bartpflege',      20,  0,  0,  5, 1800, NULL),
  (3, 'komplett',      'Komplettservice', 60,  0,  0, 10, 5500, NULL),
  (4, 'straehnen',     'Strähnen',        30, 45, 30, 10, 9500, NULL),
  (5, 'faerben',       'Färben',          40, 30, 20, 10, 7500, NULL),
  -- Nur für den Vorlauf-Test: identisch zu 'bart', aber ohne Mindestvorlauf.
  (6, 'sofort',        'Sofortleistung',  20,  0,  0,  5, 1800, 0);

INSERT INTO resource_services (resource_id, service_id)
SELECT 1, id FROM services;

-- Di–Fr 09:00–12:30 und 13:15–18:30 (Mittagspause), Sa 08:00–14:00.
INSERT INTO business_hours (resource_id, weekday, von_zeit, bis_zeit) VALUES
  (NULL, 2, '09:00', '12:30'), (NULL, 2, '13:15', '18:30'),
  (NULL, 3, '09:00', '12:30'), (NULL, 3, '13:15', '18:30'),
  (NULL, 4, '09:00', '12:30'), (NULL, 4, '13:15', '18:30'),
  (NULL, 5, '09:00', '12:30'), (NULL, 5, '13:15', '18:30'),
  (NULL, 6, '08:00', '14:00');
`;

export const LEISTUNG = {
  herrenschnitt: 1,
  bart: 2,
  komplett: 3,
  straehnen: 4,
  faerben: 5,
  sofort: 6,
};

export const RESSOURCE = 1;

/**
 * Legt eine frische, migrierte und mit Testdaten befüllte Datenbank an.
 *
 * Datei statt ':memory:', weil mehrere Verbindungen auf dieselbe DB zugreifen
 * müssen (Parallel- und Readonly-Tests).
 *
 * @returns {{db: import('better-sqlite3').Database, pfad: string, aufraeumen: () => void}}
 */
export function neueTestDb(optionen = {}) {
  const verzeichnis = mkdtempSync(join(tmpdir(), 'slot-engine-test-'));
  const pfad = join(verzeichnis, 'test.db');
  const db = oeffneDb(pfad, optionen);
  migriere(db);
  db.exec(STAMMDATEN);

  return {
    db,
    pfad,
    aufraeumen() {
      try {
        db.close();
      } catch {
        /* bereits geschlossen */
      }
      rmSync(verzeichnis, { recursive: true, force: true });
    },
  };
}

/** Überschreibt eine Einstellung — für Tests, die genau einen Parameter isolieren. */
export function setzeEinstellung(db, key, wert) {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, String(wert));
}

/** Startzeiten aller Slots eines Tages als 'HH:mm', für lesbare Assertions. */
export function startzeiten(slots) {
  return slots.map((s) => hhmm(s.start));
}

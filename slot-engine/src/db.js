/**
 * Datenbank-Zugriff, Migrationen und Seed.
 *
 * Wichtig: better-sqlite3 hat Foreign Keys standardmaessig AUS. Ohne das PRAGMA
 * unten waeren saemtliche REFERENCES im Schema reine Dekoration. Es muss pro
 * Connection gesetzt werden, nicht einmalig auf der Datei.
 */

import Database from 'better-sqlite3';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HIER = dirname(fileURLToPath(import.meta.url));
export const WURZEL = join(HIER, '..');
export const MIGRATIONS_VERZEICHNIS = join(WURZEL, 'migrations');
export const SEEDS_VERZEICHNIS = join(WURZEL, 'seeds');

export const STANDARD_BUSY_TIMEOUT_MS = 5000;

/**
 * Oeffnet eine Verbindung und setzt die PRAGMAs, ohne die das Schema nicht haelt.
 *
 * @param {string} pfad Dateipfad oder ':memory:'
 * @param {{readonly?: boolean, busyTimeoutMs?: number}} [optionen]
 */
export function oeffneDb(pfad, optionen = {}) {
  const { readonly = false, busyTimeoutMs = STANDARD_BUSY_TIMEOUT_MS } = optionen;
  const db = new Database(pfad, { readonly });

  db.pragma('foreign_keys = ON');
  db.pragma(`busy_timeout = ${Number(busyTimeoutMs)}`);
  if (!readonly) {
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
  }

  return db;
}

/**
 * Spielt alle noch nicht angewendeten Migrationen aus migrations/ ein.
 * Jede Datei laeuft in einer eigenen Transaktion und wird in schema_migrations vermerkt.
 *
 * @returns {string[]} die in diesem Lauf angewendeten Versionen
 */
export function migriere(db, verzeichnis = MIGRATIONS_VERZEICHNIS) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    TEXT PRIMARY KEY,
      applied_at INTEGER NOT NULL
    );
  `);

  const bereitsAngewendet = new Set(
    db.prepare('SELECT version FROM schema_migrations').all().map((z) => z.version),
  );

  const dateien = readdirSync(verzeichnis)
    .filter((name) => name.endsWith('.sql'))
    .sort();

  const angewendet = [];
  for (const datei of dateien) {
    const version = datei.replace(/\.sql$/, '');
    if (bereitsAngewendet.has(version)) continue;

    const sql = readFileSync(join(verzeichnis, datei), 'utf8');
    const lauf = db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)')
        .run(version, Date.now());
    });
    lauf();
    angewendet.push(version);
  }

  return angewendet;
}

/**
 * Spielt die Seed-Dateien aus seeds/ ein. Der Seed ist idempotent formuliert
 * (INSERT OR IGNORE), damit ein zweiter Lauf nichts kaputt macht.
 */
export function seedStammdaten(db, verzeichnis = SEEDS_VERZEICHNIS) {
  const dateien = readdirSync(verzeichnis)
    .filter((name) => name.endsWith('.sql'))
    .sort();

  const lauf = db.transaction(() => {
    for (const datei of dateien) {
      db.exec(readFileSync(join(verzeichnis, datei), 'utf8'));
    }
  });
  lauf();

  return dateien;
}

/** Liest eine Einstellung als String. */
export function einstellung(db, key, standard = null) {
  const zeile = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return zeile ? zeile.value : standard;
}

/** Liest eine Einstellung als Zahl. Wirft, wenn sie fehlt und kein Standard gesetzt ist. */
export function einstellungZahl(db, key, standard = null) {
  const wert = einstellung(db, key, null);
  if (wert === null) {
    if (standard === null) throw new Error(`Einstellung fehlt: ${key}`);
    return standard;
  }
  const zahl = Number(wert);
  if (!Number.isFinite(zahl)) throw new Error(`Einstellung ist keine Zahl: ${key}=${wert}`);
  return zahl;
}

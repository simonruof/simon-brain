/**
 * Schreibende Operationen.
 *
 * Grundsatz: Die Kollisionsprüfung läuft IMMER in derselben Transaktion wie der
 * Insert, und die Transaktion wird als BEGIN IMMEDIATE geöffnet. Damit hält eine
 * Schreiboperation das Write-Lock ab dem ersten Moment — zwei gleichzeitige
 * Reservierungen auf denselben Slot können sich nicht überholen.
 *
 * Geprüft wird mit derselben Funktion, die auch verfuegbareSlots() benutzt
 * (pruefeKandidat) — es gibt keine zweite, abweichende Kollisionsregel.
 *
 * Keine dieser Funktionen liest die Systemuhr; 'jetzt' ist überall Pflichtparameter.
 */

import { randomUUID } from 'node:crypto';
import { einstellungZahl } from './db.js';
import { MINUTE_MS } from './zeit.js';
import { ladeKontext, ladeLeistung, pruefeKandidat, ressourcenFuer, segmenteFuer } from './slots.js';

/** Der gewünschte Slot ist nicht (mehr) buchbar. `grund` sagt warum. */
export class SlotKollisionError extends Error {
  constructor(grund, nachricht) {
    super(nachricht ?? `Slot nicht buchbar: ${grund}`);
    this.name = 'SlotKollisionError';
    this.grund = grund;
  }
}

function verlangeJetzt(jetzt, funktion) {
  if (!Number.isFinite(jetzt)) {
    throw new TypeError(`${funktion} braucht ein injiziertes 'jetzt' (Epoch-ms)`);
  }
}

/** Prüft innerhalb der laufenden Transaktion. */
function pruefeInTransaktion(db, { ressourceId, leistung, start, jetzt, ignoriere = null }) {
  const s = segmenteFuer(leistung, start);
  const kontext = ladeKontext(db, {
    ressourceIds: [ressourceId],
    von: s.start - 24 * 60 * MINUTE_MS,
    bis: s.blockiertBis + 24 * 60 * MINUTE_MS,
    jetzt,
  });

  const ergebnis = pruefeKandidat(kontext, { ressourceId, leistung, start, jetzt, ignoriere });
  if (!ergebnis.frei) throw new SlotKollisionError(ergebnis.grund);
  return s;
}

function schreibeSegmente(db, { ressourceId, quelle, refId, segmente }) {
  const einfuegen = db.prepare(
    `INSERT INTO busy_segments (resource_id, start_ts, end_ts, art, quelle, ref_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  for (const segment of segmente) {
    einfuegen.run(ressourceId, segment.start, segment.ende, segment.art, quelle, refId);
  }
}

/**
 * Räumt abgelaufene und stornierte Weichreservierungen ab.
 *
 * Nötig, weil busy_segments die Invariante trägt, nur wirklich blockierende
 * Segmente zu enthalten — darauf verlässt sich der Overlap-Trigger. Der Lesepfad
 * räumt bewusst nicht auf (er muss schreibfrei bleiben), sondern filtert über
 * expires_at; aufgeräumt wird beim nächsten Schreibvorgang.
 *
 * @returns {number} Anzahl abgeräumter Reservierungen
 */
export function raeumeAbgelaufeneHolds(db, jetzt) {
  verlangeJetzt(jetzt, 'raeumeAbgelaufeneHolds');

  const lauf = db.transaction((stichtag) => raeumeIntern(db, stichtag));
  return lauf.immediate(jetzt);
}

function raeumeIntern(db, jetzt) {
  const betroffen = db
    .prepare(`SELECT id FROM holds WHERE status = 'aktiv' AND expires_at <= ?`)
    .all(jetzt)
    .map((z) => z.id);

  if (betroffen.length === 0) return 0;

  const segmenteWeg = db.prepare(`DELETE FROM busy_segments WHERE quelle = 'hold' AND ref_id = ?`);
  const holdWeg = db.prepare(`UPDATE holds SET status = 'abgelaufen' WHERE id = ?`);

  for (const id of betroffen) {
    segmenteWeg.run(id);
    holdWeg.run(id);
  }
  return betroffen.length;
}

/**
 * Weichreservierung: hält einen Slot für eine begrenzte Zeit.
 *
 * @returns {{token:string, holdId:number, ressourceId:number, leistungId:number,
 *            start:number, ende:number, blockiertBis:number, expiresAt:number}}
 * @throws {SlotKollisionError}
 */
export function reserviere(db, params) {
  const { ressourceId, start, jetzt, ttlMin = null } = params;
  verlangeJetzt(jetzt, 'reserviere');

  const leistung = ladeLeistung(db, params);
  if (ressourcenFuer(db, leistung.id, ressourceId).length === 0) {
    throw new SlotKollisionError('ressource_kann_leistung_nicht');
  }

  const ttl = (ttlMin ?? einstellungZahl(db, 'hold_ttl_min', 15)) * MINUTE_MS;

  const lauf = db.transaction(() => {
    // Erst aufräumen: abgelaufene Reservierungen dürfen den Slot nicht verbrennen.
    raeumeIntern(db, jetzt);

    const s = pruefeInTransaktion(db, { ressourceId, leistung, start, jetzt });

    const token = randomUUID();
    const ergebnis = db
      .prepare(
        `INSERT INTO holds (token, resource_id, service_id, start_ts, end_ts, expires_at, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'aktiv', ?)`,
      )
      .run(token, ressourceId, leistung.id, s.start, s.kundeEnde, jetzt + ttl, jetzt);

    const holdId = Number(ergebnis.lastInsertRowid);
    schreibeSegmente(db, { ressourceId, quelle: 'hold', refId: holdId, segmente: s.blockierend });

    return {
      token,
      holdId,
      ressourceId,
      leistungId: leistung.id,
      start: s.start,
      ende: s.kundeEnde,
      blockiertBis: s.blockiertBis,
      expiresAt: jetzt + ttl,
    };
  });

  return lauf.immediate();
}

/**
 * Wandelt eine gültige Weichreservierung in einen festen Termin.
 *
 * Die Segmente werden umgehängt statt neu geschrieben — dadurch entsteht kein
 * Moment, in dem der Slot unbelegt aussieht.
 */
export function bestaetige(db, { token, kunde = null, kundeRef = null, jetzt }) {
  verlangeJetzt(jetzt, 'bestaetige');

  const lauf = db.transaction(() => {
    const hold = db.prepare('SELECT * FROM holds WHERE token = ?').get(token);
    if (!hold) throw new Error(`Unbekannte Reservierung: ${token}`);
    if (hold.status === 'eingeloest') throw new Error('Reservierung wurde bereits bestätigt');
    if (hold.status !== 'aktiv') throw new Error(`Reservierung ist ${hold.status}`);
    if (hold.expires_at <= jetzt) throw new Error('Reservierung ist abgelaufen');

    const leistung = ladeLeistung(db, { leistungId: hold.service_id });

    // Erneut prüfen — zwischen Reservierung und Bestätigung kann sich die Lage
    // geändert haben (Blackout eingetragen, Öffnungszeiten angepasst).
    // Die eigenen Segmente werden dabei ignoriert.
    pruefeInTransaktion(db, {
      ressourceId: hold.resource_id,
      leistung,
      start: hold.start_ts,
      jetzt,
      ignoriere: { quelle: 'hold', refId: hold.id },
    });

    const uid = randomUUID();
    const ergebnis = db
      .prepare(
        `INSERT INTO appointments
           (uid, resource_id, service_id, kunde, kunde_ref, start_ts, end_ts, preis_cent, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'gebucht', ?)`,
      )
      .run(
        uid,
        hold.resource_id,
        hold.service_id,
        kunde,
        kundeRef,
        hold.start_ts,
        hold.end_ts,
        leistung.preis_cent, // Preis zum Buchungszeitpunkt einfrieren
        jetzt,
      );

    const terminId = Number(ergebnis.lastInsertRowid);

    db.prepare(
      `UPDATE busy_segments SET quelle = 'termin', ref_id = ? WHERE quelle = 'hold' AND ref_id = ?`,
    ).run(terminId, hold.id);

    db.prepare(`UPDATE holds SET status = 'eingeloest' WHERE id = ?`).run(hold.id);

    return {
      terminId,
      uid,
      ressourceId: hold.resource_id,
      leistungId: hold.service_id,
      start: hold.start_ts,
      ende: hold.end_ts,
      preisCent: leistung.preis_cent,
    };
  });

  return lauf.immediate();
}

/**
 * Verschiebt einen bestehenden Termin.
 *
 * Der alte Slot wird innerhalb derselben Transaktion freigegeben und der neue
 * geprüft. Schlägt die Prüfung fehl, rollt alles zurück — der ursprüngliche
 * Termin bleibt unverändert bestehen.
 */
export function verschiebe(db, { terminId, neuerStart, neueRessourceId = null, jetzt }) {
  verlangeJetzt(jetzt, 'verschiebe');

  const lauf = db.transaction(() => {
    const termin = db.prepare('SELECT * FROM appointments WHERE id = ?').get(terminId);
    if (!termin) throw new Error(`Unbekannter Termin: ${terminId}`);
    if (termin.status !== 'gebucht') throw new Error(`Termin ist ${termin.status}`);

    const ressourceId = neueRessourceId ?? termin.resource_id;
    const leistung = ladeLeistung(db, { leistungId: termin.service_id });

    if (ressourcenFuer(db, leistung.id, ressourceId).length === 0) {
      throw new SlotKollisionError('ressource_kann_leistung_nicht');
    }

    // Alten Slot freigeben, damit er den neuen nicht selbst blockiert.
    db.prepare(`DELETE FROM busy_segments WHERE quelle = 'termin' AND ref_id = ?`).run(terminId);

    const s = pruefeInTransaktion(db, {
      ressourceId,
      leistung,
      start: neuerStart,
      jetzt,
      ignoriere: { quelle: 'termin', refId: terminId },
    });

    db.prepare('UPDATE appointments SET resource_id = ?, start_ts = ?, end_ts = ? WHERE id = ?')
      .run(ressourceId, s.start, s.kundeEnde, terminId);

    schreibeSegmente(db, { ressourceId, quelle: 'termin', refId: terminId, segmente: s.blockierend });

    return {
      terminId,
      ressourceId,
      start: s.start,
      ende: s.kundeEnde,
      blockiertBis: s.blockiertBis,
    };
  });

  return lauf.immediate();
}

/** Storniert einen Termin und gibt seinen Slot frei. */
export function storniere(db, { terminId }) {
  const lauf = db.transaction(() => {
    const termin = db.prepare('SELECT * FROM appointments WHERE id = ?').get(terminId);
    if (!termin) throw new Error(`Unbekannter Termin: ${terminId}`);
    if (termin.status === 'storniert') return { terminId, bereitsStorniert: true };

    db.prepare(`UPDATE appointments SET status = 'storniert' WHERE id = ?`).run(terminId);
    db.prepare(`DELETE FROM busy_segments WHERE quelle = 'termin' AND ref_id = ?`).run(terminId);

    return { terminId, bereitsStorniert: false };
  });

  return lauf.immediate();
}

/** Storniert eine Weichreservierung, bevor sie abläuft. */
export function storniereReservierung(db, { token }) {
  const lauf = db.transaction(() => {
    const hold = db.prepare('SELECT * FROM holds WHERE token = ?').get(token);
    if (!hold) throw new Error(`Unbekannte Reservierung: ${token}`);
    if (hold.status !== 'aktiv') return { holdId: hold.id, bereitsBeendet: true };

    db.prepare(`UPDATE holds SET status = 'storniert' WHERE id = ?`).run(hold.id);
    db.prepare(`DELETE FROM busy_segments WHERE quelle = 'hold' AND ref_id = ?`).run(hold.id);

    return { holdId: hold.id, bereitsBeendet: false };
  });

  return lauf.immediate();
}

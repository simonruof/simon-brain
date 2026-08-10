/**
 * Zeit-Helfer. Alle Umrechnungen zwischen Wanduhrzeit (Öffnungszeiten) und
 * Epoch-Millisekunden laufen ausschliesslich hier durch — inklusive Sommerzeit.
 *
 * Reine Funktionen, kein Uhrzugriff.
 */

import { DateTime } from 'luxon';

export const MINUTE_MS = 60_000;

/**
 * Wochentag in der SQLite-Konvention (0=Sonntag … 6=Samstag), wie sie
 * business_hours.weekday verwendet.
 *
 * Achtung, klassische Off-by-one-Falle: Luxon zählt 1=Montag … 7=Sonntag.
 * Diese Funktion ist die EINZIGE Stelle im Code, an der umgerechnet wird.
 */
export function wochentagAusDateTime(dt) {
  return dt.weekday % 7;
}

/**
 * Wandelt lokale Wanduhrzeit in Epoch-Millisekunden.
 *
 * Wirft, wenn das Datum ungültig ist oder die Uhrzeit in der lokalen Zeitrechnung
 * gar nicht existiert (Sprungstunde bei der Umstellung auf Sommerzeit). Luxon
 * verschiebt solche Zeiten still nach vorne — genau das wollen wir hier nicht
 * unbemerkt hinnehmen.
 *
 * @param {string} datumIso 'YYYY-MM-DD'
 * @param {string} uhrzeit 'HH:MM'
 * @param {string} zone IANA-Zeitzone
 * @returns {number} Epoch-ms
 */
export function lokalerZeitpunkt(datumIso, uhrzeit, zone) {
  const dt = DateTime.fromISO(`${datumIso}T${uhrzeit}`, { zone });
  if (!dt.isValid) {
    throw new RangeError(`Ungültiger Zeitpunkt: ${datumIso} ${uhrzeit} (${zone}): ${dt.invalidReason}`);
  }

  const [stunde, minute] = uhrzeit.split(':').map(Number);
  if (dt.hour !== stunde || dt.minute !== minute) {
    throw new RangeError(
      `Uhrzeit existiert an diesem Tag nicht (Zeitumstellung): ${datumIso} ${uhrzeit} (${zone})`,
    );
  }

  return dt.toMillis();
}

/**
 * Grenzen eines lokalen Kalendertags in Epoch-ms, halboffen [start, ende).
 * An Umstellungstagen sind das korrekt 23 bzw. 25 Stunden.
 */
export function tagesGrenzen(datumIso, zone) {
  const start = DateTime.fromISO(datumIso, { zone }).startOf('day');
  if (!start.isValid) throw new RangeError(`Ungültiges Datum: ${datumIso}`);
  return { start: start.toMillis(), ende: start.plus({ days: 1 }).startOf('day').toMillis() };
}

/**
 * Alle lokalen Kalendertage, die das Fenster [vonMs, bisMs) berührt.
 *
 * @returns {string[]} Datumsangaben 'YYYY-MM-DD' aufsteigend
 */
export function datumsImFenster(vonMs, bisMs, zone) {
  if (bisMs <= vonMs) return [];

  const tage = [];
  let tag = DateTime.fromMillis(vonMs, { zone }).startOf('day');
  const letzter = DateTime.fromMillis(bisMs - 1, { zone }).startOf('day');

  while (tag <= letzter) {
    tage.push(tag.toISODate());
    tag = tag.plus({ days: 1 }).startOf('day');
  }
  return tage;
}

/**
 * Öffnungsintervalle eines konkreten Tages als Epoch-ms.
 *
 * Mehrere business_hours-Zeilen für denselben Wochentag ergeben mehrere Intervalle —
 * so entsteht die Mittagspause. Die Intervalle werden aufsteigend zurückgegeben und
 * NICHT zusammengelegt: eine Leistung muss vollständig in ein einzelnes Intervall passen.
 *
 * @param {Array<{weekday:number, von_zeit:string, bis_zeit:string}>} zeilen
 * @param {string} datumIso
 * @param {string} zone
 */
export function oeffnungsIntervalle(zeilen, datumIso, zone) {
  const dt = DateTime.fromISO(datumIso, { zone });
  if (!dt.isValid) throw new RangeError(`Ungültiges Datum: ${datumIso}`);
  const wochentag = wochentagAusDateTime(dt);

  return zeilen
    .filter((z) => z.weekday === wochentag)
    .map((z) => ({
      start: lokalerZeitpunkt(datumIso, z.von_zeit, zone),
      ende: lokalerZeitpunkt(datumIso, z.bis_zeit, zone),
    }))
    .sort((a, b) => a.start - b.start);
}

/** Überlappen sich zwei halboffene Intervalle? Nahtloses Anschliessen zählt nicht. */
export function ueberlappt(aStart, aEnde, bStart, bEnde) {
  return aStart < bEnde && bStart < aEnde;
}

/** Liegt [start, ende) vollständig in [aussenStart, aussenEnde)? */
export function liegtInnerhalb(start, ende, aussenStart, aussenEnde) {
  return start >= aussenStart && ende <= aussenEnde;
}

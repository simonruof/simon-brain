/**
 * Gesetzliche Feiertage in Baden-Württemberg.
 *
 * Reine Funktion ohne Seiteneffekte und ohne Uhrzugriff.
 * Rückgabe: Liste von { datum: 'YYYY-MM-DD', name } aufsteigend sortiert.
 *
 * Bewusst NICHT enthalten, weil in Baden-Württemberg keine gesetzlichen Feiertage:
 *   - Buß- und Bettag (nur Sachsen)
 *   - Reformationstag (nur die norddeutschen Länder und Sachsen/Thüringen)
 *   - Mariä Himmelfahrt (Saarland und Teile Bayerns)
 * Heiligabend und Silvester sind ebenfalls keine gesetzlichen Feiertage — sie werden
 * betrieblich als verkürzte Öffnungszeit gelöst, nicht als Feiertag.
 */

import { tagesGrenzen } from './zeit.js';

/**
 * Ostersonntag nach der anonymen gregorianischen Osterformel (Meeus/Jones/Butcher).
 *
 * @param {number} jahr
 * @returns {{jahr: number, monat: number, tag: number}} monat ist 1-basiert
 */
export function ostersonntag(jahr) {
  const a = jahr % 19;
  const b = Math.floor(jahr / 100);
  const c = jahr % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const zaehler = h + l - 7 * m + 114;
  return { jahr, monat: Math.floor(zaehler / 31), tag: (zaehler % 31) + 1 };
}

/** Formatiert ein Datum als 'YYYY-MM-DD'. */
function alsIso(jahr, monat, tag) {
  return `${String(jahr).padStart(4, '0')}-${String(monat).padStart(2, '0')}-${String(tag).padStart(2, '0')}`;
}

/**
 * Verschiebt ein Datum um n Tage. Rechnet über UTC, damit keine Zeitzone
 * hineinspielt — hier geht es rein um Kalenderarithmetik.
 */
function plusTage(jahr, monat, tag, tage) {
  const d = new Date(Date.UTC(jahr, monat - 1, tag));
  d.setUTCDate(d.getUTCDate() + tage);
  return alsIso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/**
 * Alle gesetzlichen Feiertage in Baden-Württemberg für ein Jahr.
 *
 * @param {number} jahr
 * @returns {Array<{datum: string, name: string}>}
 */
export function feiertageBW(jahr) {
  if (!Number.isInteger(jahr) || jahr < 1900 || jahr > 2200) {
    throw new RangeError(`Ungültiges Jahr: ${jahr}`);
  }

  const o = ostersonntag(jahr);
  const vonOstern = (tage) => plusTage(o.jahr, o.monat, o.tag, tage);

  const feiertage = [
    { datum: alsIso(jahr, 1, 1), name: 'Neujahr' },
    { datum: alsIso(jahr, 1, 6), name: 'Heilige Drei Könige' },
    { datum: vonOstern(-2), name: 'Karfreitag' },
    { datum: vonOstern(1), name: 'Ostermontag' },
    { datum: alsIso(jahr, 5, 1), name: 'Tag der Arbeit' },
    { datum: vonOstern(39), name: 'Christi Himmelfahrt' },
    { datum: vonOstern(50), name: 'Pfingstmontag' },
    { datum: vonOstern(60), name: 'Fronleichnam' },
    { datum: alsIso(jahr, 10, 3), name: 'Tag der Deutschen Einheit' },
    { datum: alsIso(jahr, 11, 1), name: 'Allerheiligen' },
    { datum: alsIso(jahr, 12, 25), name: '1. Weihnachtstag' },
    { datum: alsIso(jahr, 12, 26), name: '2. Weihnachtstag' },
  ];

  return feiertage.sort((a, b) => a.datum.localeCompare(b.datum));
}

/**
 * Feiertage als ganztägige Blackout-Zeilen, fertig zum Einfügen.
 *
 * Ganztägig heisst: der volle lokale Kalendertag, an Umstellungstagen also korrekt
 * 23 bzw. 25 Stunden. art='abwesenheit' — an einem Feiertag ist niemand im Laden,
 * also blockiert der Blackout auch eine laufende Einwirkzeit.
 *
 * Reine Funktion.
 *
 * @param {number[]} jahre
 * @param {string} zone IANA-Zeitzone
 * @returns {Array<{start_ts:number, end_ts:number, grund:string}>}
 */
export function feiertagsBlackouts(jahre, zone) {
  const zeilen = [];
  for (const jahr of jahre) {
    for (const { datum, name } of feiertageBW(jahr)) {
      const { start, ende } = tagesGrenzen(datum, zone);
      zeilen.push({ start_ts: start, end_ts: ende, grund: name });
    }
  }
  return zeilen.sort((a, b) => a.start_ts - b.start_ts);
}

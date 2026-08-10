/**
 * Slot-Berechnung.
 *
 * verfuegbareSlots() ist eine REINE FUNKTION: sie liest ausschliesslich, schreibt
 * nichts und kennt keine Uhr — 'jetzt' wird immer injiziert. Dieselbe Prüfung
 * (pruefeKandidat) benutzt der Schreibpfad in src/reservierung.js innerhalb seiner
 * Transaktion, damit es für die Kollisionsregel nur eine einzige Quelle der Wahrheit gibt.
 */

import { DateTime } from 'luxon';
import { einstellung, einstellungZahl } from './db.js';
import {
  MINUTE_MS,
  datumsImFenster,
  liegtInnerhalb,
  oeffnungsIntervalle,
  ueberlappt,
} from './zeit.js';

export const GRUND = {
  ZU_KURZFRISTIG: 'zu_kurzfristig',
  AUSSERHALB_HORIZONT: 'ausserhalb_horizont',
  AUSSERHALB_OEFFNUNGSZEITEN: 'ausserhalb_oeffnungszeiten',
  FEIERTAG: 'feiertag',
  BLACKOUT: 'blackout',
  BELEGT: 'belegt',
  WECHSELPUFFER: 'wechselpuffer',
  KAPAZITAET: 'kapazitaet',
};

/**
 * Zerlegt eine Leistung ab einem Startzeitpunkt in ihre Phasen.
 *
 *   [aktiv_vor] [einwirk] [aktiv_nach] [puffer]
 *
 * Zurückgegeben werden nur die BLOCKIERENDEN Segmente — die Einwirkzeit ist
 * bewusst nicht dabei. Genau dadurch wird die Parallelbuchung möglich, ohne dass
 * die Kollisionsprüfung einen Sonderfall braucht.
 *
 * Reine Funktion.
 *
 * @param {{aktiv_vor_min:number, einwirk_min:number, aktiv_nach_min:number, puffer_min:number}} leistung
 * @param {number} start Epoch-ms
 */
export function segmenteFuer(leistung, start) {
  const t0 = start;
  const t1 = t0 + leistung.aktiv_vor_min * MINUTE_MS;
  const t2 = t1 + leistung.einwirk_min * MINUTE_MS;
  const t3 = t2 + leistung.aktiv_nach_min * MINUTE_MS;
  const t4 = t3 + leistung.puffer_min * MINUTE_MS;

  const roh = [{ start: t0, ende: t1, art: 'aktiv' }];
  if (t3 > t2) roh.push({ start: t2, ende: t3, art: 'aktiv' });
  if (t4 > t3) roh.push({ start: t3, ende: t4, art: 'puffer' });

  // Ohne Einwirkzeit stossen die beiden aktiven Phasen aneinander — zusammenlegen,
  // damit keine künstlich zerstückelten Segmente in der DB landen.
  const blockierend = [];
  for (const segment of roh) {
    const letztes = blockierend.at(-1);
    if (letztes && letztes.art === segment.art && letztes.ende === segment.start) {
      letztes.ende = segment.ende;
    } else {
      blockierend.push({ ...segment });
    }
  }

  return {
    start: t0,
    // Ende aus Kundensicht: der Puffer danach gehört dem Betrieb, nicht dem Termin.
    kundeEnde: t3,
    // Bis hierhin ist die Ressource blockiert (inklusive Puffer).
    blockiertBis: t4,
    einwirk: t2 > t1 ? { start: t1, ende: t2 } : null,
    blockierend,
  };
}

/** Die Lücken innerhalb einer Belegung — also deren Einwirkzeit-Fenster. */
function einwirkFensterVon(belegung, segmente) {
  const sortiert = [...segmente].sort((a, b) => a.start_ts - b.start_ts);
  const fenster = [];
  let cursor = belegung.start_ts;

  for (const s of sortiert) {
    if (s.start_ts > cursor) fenster.push({ start: cursor, ende: s.start_ts });
    cursor = Math.max(cursor, s.end_ts);
  }
  if (cursor < belegung.end_ts) fenster.push({ start: cursor, ende: belegung.end_ts });

  return fenster;
}

function platzhalter(anzahl) {
  return Array.from({ length: anzahl }, () => '?').join(', ');
}

/**
 * Lädt alles, was für die Prüfung eines Zeitfensters gebraucht wird — genau einmal,
 * nicht pro Kandidat.
 */
export function ladeKontext(db, { ressourceIds, von, bis, jetzt }) {
  const zone = einstellung(db, 'zeitzone', 'Europe/Berlin');
  const ids = [...ressourceIds];
  const platz = platzhalter(ids.length);

  const oeffnungszeiten = db
    .prepare(
      `SELECT resource_id, weekday, von_zeit, bis_zeit FROM business_hours
        WHERE resource_id IS NULL OR resource_id IN (${platz})`,
    )
    .all(...ids);

  const blackouts = db
    .prepare(
      `SELECT resource_id, start_ts, end_ts, art, quelle FROM blackouts
        WHERE (resource_id IS NULL OR resource_id IN (${platz}))
          AND start_ts < ? AND ? < end_ts`,
    )
    .all(...ids, bis, von);

  const segmente = db
    .prepare(
      `SELECT resource_id, start_ts, end_ts, art, quelle, ref_id
         FROM segmente_mit_eigentuemer
        WHERE resource_id IN (${platz})
          AND start_ts < ? AND ? < end_ts
          AND (
            (quelle = 'termin' AND eigentuemer_status = 'gebucht')
            OR (quelle = 'hold' AND eigentuemer_status = 'aktiv' AND expires_at > ?)
          )`,
    )
    .all(...ids, bis, von, jetzt);

  const belegungen = db
    .prepare(
      `SELECT id, resource_id, start_ts, end_ts, 'termin' AS quelle FROM appointments
        WHERE status = 'gebucht' AND resource_id IN (${platz}) AND start_ts < ? AND ? < end_ts
       UNION ALL
       SELECT id, resource_id, start_ts, end_ts, 'hold' AS quelle FROM holds
        WHERE status = 'aktiv' AND expires_at > ? AND resource_id IN (${platz})
          AND start_ts < ? AND ? < end_ts`,
    )
    .all(...ids, bis, von, jetzt, ...ids, bis, von);

  // Einwirkfenster je Belegung aus deren Segmenten ableiten.
  const einwirkFenster = [];
  for (const belegung of belegungen) {
    const eigene = segmente.filter((s) => s.quelle === belegung.quelle && s.ref_id === belegung.id);
    for (const f of einwirkFensterVon(belegung, eigene)) {
      einwirkFenster.push({ ...f, resource_id: belegung.resource_id, quelle: belegung.quelle, ref_id: belegung.id });
    }
  }

  return {
    zone,
    raster: einstellungZahl(db, 'slot_raster_min', 15),
    vorlaufStandard: einstellungZahl(db, 'mindestvorlauf_min', 60),
    horizontWochen: einstellungZahl(db, 'horizont_wochen', 12),
    maxParallelKunden: einstellungZahl(db, 'max_parallel_kunden', 1),
    wechselPuffer: einstellungZahl(db, 'wechsel_puffer_min', 0) * MINUTE_MS,
    oeffnungszeiten,
    blackouts,
    segmente,
    belegungen,
    einwirkFenster,
  };
}

/** Öffnungsintervalle einer Ressource an einem Tag. Eigene Zeiten schlagen die globalen. */
export function intervalleFuer(kontext, ressourceId, datumIso) {
  const eigene = kontext.oeffnungszeiten.filter((z) => z.resource_id === ressourceId);
  const global = kontext.oeffnungszeiten.filter((z) => z.resource_id === null);
  const relevant = eigene.length > 0 ? eigene : global;
  return oeffnungsIntervalle(relevant, datumIso, kontext.zone);
}

function gehoertZuIgnoriertem(eintrag, ignoriere) {
  return Boolean(ignoriere) && eintrag.quelle === ignoriere.quelle && eintrag.ref_id === ignoriere.refId;
}

/**
 * Prüft einen konkreten Kandidaten gegen den vorgeladenen Kontext.
 *
 * @returns {{frei: boolean, grund?: string}}
 */
export function pruefeKandidat(kontext, { ressourceId, leistung, start, jetzt, ignoriere = null }) {
  const s = segmenteFuer(leistung, start);

  // --- Vorlauf und Horizont -------------------------------------------------
  const vorlauf = (leistung.vorlauf_min ?? kontext.vorlaufStandard) * MINUTE_MS;
  if (start < jetzt + vorlauf) return { frei: false, grund: GRUND.ZU_KURZFRISTIG };

  const horizontEnde = DateTime.fromMillis(jetzt, { zone: kontext.zone })
    .plus({ weeks: kontext.horizontWochen })
    .toMillis();
  if (start > horizontEnde) return { frei: false, grund: GRUND.AUSSERHALB_HORIZONT };

  // --- Öffnungszeiten -------------------------------------------------------
  // Der gesamte Slot inklusive Einwirkzeit und Puffer muss in EIN Öffnungsintervall
  // passen; die Mittagspause trennt zwei Intervalle und darf nicht überbrückt werden.
  const datum = DateTime.fromMillis(start, { zone: kontext.zone }).toISODate();
  const intervalle = intervalleFuer(kontext, ressourceId, datum);
  const passt = intervalle.some((i) => liegtInnerhalb(s.start, s.blockiertBis, i.start, i.ende));
  if (!passt) return { frei: false, grund: GRUND.AUSSERHALB_OEFFNUNGSZEITEN };

  // --- Sperrzeiten ----------------------------------------------------------
  for (const b of kontext.blackouts) {
    if (b.resource_id !== null && b.resource_id !== ressourceId) continue;

    // 'abwesenheit': niemand da, also blockiert auch die Einwirkzeit.
    // 'nicht_stoeren': die Ressource ist anwesend, nur nicht am Kunden — die
    // Einwirkzeit darf darüber laufen, die aktiven Phasen nicht.
    const kollidiert =
      b.art === 'abwesenheit'
        ? ueberlappt(s.start, s.blockiertBis, b.start_ts, b.end_ts)
        : s.blockierend.some((seg) => ueberlappt(seg.start, seg.ende, b.start_ts, b.end_ts));

    if (kollidiert) {
      return { frei: false, grund: b.quelle === 'feiertag' ? GRUND.FEIERTAG : GRUND.BLACKOUT };
    }
  }

  // --- Belegung -------------------------------------------------------------
  const fremdeSegmente = kontext.segmente.filter(
    (seg) => seg.resource_id === ressourceId && !gehoertZuIgnoriertem(seg, ignoriere),
  );

  for (const seg of fremdeSegmente) {
    if (s.blockierend.some((eigen) => ueberlappt(eigen.start, eigen.ende, seg.start_ts, seg.end_ts))) {
      return { frei: false, grund: GRUND.BELEGT };
    }
  }

  // --- Wechselpuffer --------------------------------------------------------
  // Nur relevant, wenn der Kandidat in die Einwirkzeit eines fremden Termins springt:
  // dann braucht es zusätzlich Umschaltzeit auf beiden Seiten.
  if (kontext.wechselPuffer > 0) {
    const fremdeFenster = kontext.einwirkFenster.filter(
      (f) => f.resource_id === ressourceId && !gehoertZuIgnoriertem(f, ignoriere),
    );

    const verschachtelt = s.blockierend.some((eigen) =>
      fremdeFenster.some((f) => ueberlappt(eigen.start, eigen.ende, f.start, f.ende)),
    );

    if (verschachtelt) {
      const kollidiert = s.blockierend.some((eigen) =>
        fremdeSegmente.some((seg) =>
          ueberlappt(
            eigen.start - kontext.wechselPuffer,
            eigen.ende + kontext.wechselPuffer,
            seg.start_ts,
            seg.end_ts,
          ),
        ),
      );
      if (kollidiert) return { frei: false, grund: GRUND.WECHSELPUFFER };
    }
  }

  // --- Kapazität ------------------------------------------------------------
  // Maßgeblich ist die Zeit, die Kundschaft im Laden ist (inklusive Einwirkzeit,
  // ohne den Aufräumpuffer danach).
  const gleichzeitig = kontext.belegungen.filter(
    (b) =>
      b.resource_id === ressourceId &&
      !(ignoriere && b.quelle === ignoriere.quelle && b.id === ignoriere.refId) &&
      ueberlappt(s.start, s.kundeEnde, b.start_ts, b.end_ts),
  ).length;

  if (gleichzeitig >= kontext.maxParallelKunden) {
    return { frei: false, grund: GRUND.KAPAZITAET };
  }

  return { frei: true };
}

/** Lädt eine Leistung über id oder code. */
export function ladeLeistung(db, { leistungId, leistungCode }) {
  const leistung = leistungId
    ? db.prepare('SELECT * FROM services WHERE id = ?').get(leistungId)
    : db.prepare('SELECT * FROM services WHERE code = ?').get(leistungCode);

  if (!leistung) throw new Error(`Unbekannte Leistung: ${leistungId ?? leistungCode}`);
  return leistung;
}

/** Ressourcen, die eine Leistung erbringen können. */
export function ressourcenFuer(db, leistungId, ressourceId = null) {
  if (ressourceId !== null && ressourceId !== undefined) {
    const zeile = db
      .prepare(
        `SELECT r.id FROM resources r
          JOIN resource_services rs ON rs.resource_id = r.id
         WHERE r.id = ? AND rs.service_id = ? AND r.aktiv = 1`,
      )
      .get(ressourceId, leistungId);
    return zeile ? [zeile.id] : [];
  }

  return db
    .prepare(
      `SELECT r.id FROM resources r
        JOIN resource_services rs ON rs.resource_id = r.id
       WHERE rs.service_id = ? AND r.aktiv = 1
       ORDER BY r.id`,
    )
    .all(leistungId)
    .map((z) => z.id);
}

/**
 * Alle buchbaren Slots für eine Leistung.
 *
 * REINE FUNKTION — liest nur, schreibt nie, und benutzt ausschliesslich das
 * übergebene 'jetzt' als Uhr.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {object} params
 * @param {number} [params.leistungId]
 * @param {string} [params.leistungCode]
 * @param {number} [params.ressourceId] optional auf eine Ressource einschränken
 * @param {number} [params.von] Fensteranfang (Epoch-ms)
 * @param {number} [params.bis] Fensterende (Epoch-ms)
 * @param {number} params.jetzt Epoch-ms — Pflicht
 * @param {number} [params.limit=50]
 * @returns {Array<{ressourceId:number, leistungId:number, start:number, ende:number, blockiertBis:number, segmente:Array}>}
 */
export function verfuegbareSlots(db, params) {
  const { ressourceId = null, von = null, bis = null, jetzt, limit = 50 } = params;

  if (!Number.isFinite(jetzt)) {
    throw new TypeError("verfuegbareSlots braucht ein injiziertes 'jetzt' (Epoch-ms)");
  }

  const leistung = ladeLeistung(db, params);
  if (!leistung.aktiv) return [];

  const ressourceIds = ressourcenFuer(db, leistung.id, ressourceId);
  if (ressourceIds.length === 0) return [];

  const zone = einstellung(db, 'zeitzone', 'Europe/Berlin');
  const vorlauf = (leistung.vorlauf_min ?? einstellungZahl(db, 'mindestvorlauf_min', 60)) * MINUTE_MS;
  const horizontWochen = einstellungZahl(db, 'horizont_wochen', 12);
  const horizontEnde = DateTime.fromMillis(jetzt, { zone }).plus({ weeks: horizontWochen }).toMillis();

  const fensterVon = Math.max(von ?? jetzt + vorlauf, jetzt + vorlauf);
  const fensterBis = Math.min(bis ?? horizontEnde, horizontEnde);
  if (fensterBis <= fensterVon) return [];

  const gesamtdauer =
    (leistung.aktiv_vor_min + leistung.einwirk_min + leistung.aktiv_nach_min + leistung.puffer_min) *
    MINUTE_MS;

  // Der Kontext wird grosszügig geladen: ein Kandidat am Fensterrand kann mit
  // Belegungen ausserhalb des Fensters kollidieren.
  const kontext = ladeKontext(db, {
    ressourceIds,
    von: fensterVon - gesamtdauer,
    bis: fensterBis + gesamtdauer,
    jetzt,
  });

  const rasterMs = kontext.raster * MINUTE_MS;
  const slots = [];

  for (const datum of datumsImFenster(fensterVon, fensterBis, zone)) {
    for (const rid of ressourceIds) {
      for (const intervall of intervalleFuer(kontext, rid, datum)) {
        for (let start = intervall.start; start + gesamtdauer <= intervall.ende; start += rasterMs) {
          if (start < fensterVon || start >= fensterBis) continue;

          const ergebnis = pruefeKandidat(kontext, { ressourceId: rid, leistung, start, jetzt });
          if (!ergebnis.frei) continue;

          const s = segmenteFuer(leistung, start);
          slots.push({
            ressourceId: rid,
            leistungId: leistung.id,
            start: s.start,
            ende: s.kundeEnde,
            blockiertBis: s.blockiertBis,
            segmente: s.blockierend,
          });
        }
      }
    }
  }

  slots.sort((a, b) => a.start - b.start || a.ressourceId - b.ressourceId);
  return slots.slice(0, limit);
}

/**
 * Einzelprüfung eines Wunschtermins. Liefert den Grund mit, damit ein späterer
 * Bot sinnvoll antworten kann statt nur "geht nicht".
 *
 * Ebenfalls seiteneffektfrei.
 */
export function pruefeSlot(db, params) {
  const { ressourceId, start, jetzt, ignoriere = null } = params;

  if (!Number.isFinite(jetzt)) {
    throw new TypeError("pruefeSlot braucht ein injiziertes 'jetzt' (Epoch-ms)");
  }

  const leistung = ladeLeistung(db, params);
  if (!leistung.aktiv) return { frei: false, grund: 'leistung_inaktiv' };

  const erlaubt = ressourcenFuer(db, leistung.id, ressourceId);
  if (erlaubt.length === 0) return { frei: false, grund: 'ressource_kann_leistung_nicht' };

  const s = segmenteFuer(leistung, start);
  const kontext = ladeKontext(db, {
    ressourceIds: [ressourceId],
    von: s.start - 24 * 60 * MINUTE_MS,
    bis: s.blockiertBis + 24 * 60 * MINUTE_MS,
    jetzt,
  });

  return pruefeKandidat(kontext, { ressourceId, leistung, start, jetzt, ignoriere });
}

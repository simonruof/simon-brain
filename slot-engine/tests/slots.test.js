/**
 * Testsuite der Slot Engine.
 *
 * Diese Datei entstand VOR der Implementierung von src/slots.js und
 * src/reservierung.js und definiert deren Vertrag.
 *
 * Zwei Grundsätze, die überall durchgehalten werden:
 *   1. Es gibt keine implizite Uhr. Jeder Aufruf bekommt 'jetzt' injiziert.
 *   2. verfuegbareSlots() ist eine reine Funktion — sie darf die DB nicht anfassen.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import { DateTime } from 'luxon';

import { oeffneDb } from '../src/db.js';
import { feiertageBW, ostersonntag } from '../src/feiertage.js';
import { schreibeFeiertage } from '../src/feiertage_seed.js';
import {
  SlotKollisionError,
  bestaetige,
  raeumeAbgelaufeneHolds,
  reserviere,
  storniere,
  verschiebe,
} from '../src/reservierung.js';
import { verfuegbareSlots } from '../src/slots.js';
import { lokalerZeitpunkt, tagesGrenzen } from '../src/zeit.js';
import {
  DI,
  LEISTUNG,
  MINUTE,
  MO,
  RESSOURCE,
  SA,
  SO,
  STUNDE,
  ZONE,
  hhmm,
  neueTestDb,
  setzeEinstellung,
  startzeiten,
  t,
} from './fixture.js';

const HIER = dirname(fileURLToPath(import.meta.url));

/** Slots eines einzelnen lokalen Kalendertages. */
function slotsAmTag(db, { tag, leistungId, jetzt, ...rest }) {
  const { start, ende } = tagesGrenzen(tag, ZONE);
  return verfuegbareSlots(db, {
    leistungId,
    jetzt,
    von: start,
    bis: ende,
    limit: 1000,
    ...rest,
  });
}

/** Legt einen bestätigten Termin an — Abkürzung über reserviere + bestaetige. */
function bucheTermin(db, { leistungId, start, jetzt, kunde = 'Testkunde' }) {
  const hold = reserviere(db, { ressourceId: RESSOURCE, leistungId, start, jetzt });
  return bestaetige(db, { token: hold.token, kunde, jetzt });
}

// ---------------------------------------------------------------------------

describe('1 — Öffnungszeiten', () => {
  const { db, aufraeumen } = neueTestDb();
  after(aufraeumen);

  const jetzt = t(`${DI}T07:00`);

  it('liefert Slots innerhalb der Öffnungszeiten', () => {
    const zeiten = startzeiten(slotsAmTag(db, { tag: DI, leistungId: LEISTUNG.herrenschnitt, jetzt }));

    assert.equal(zeiten[0], '09:00', 'erster Slot liegt auf Ladenöffnung');
    assert.ok(zeiten.includes('13:15'), 'erster Slot nach der Mittagspause');
    assert.equal(zeiten.at(-1), '17:45', 'letzter Slot endet inkl. Puffer vor 18:30');
  });

  it('liefert keine Slots vor Ladenöffnung oder nach Ladenschluss', () => {
    const zeiten = startzeiten(slotsAmTag(db, { tag: DI, leistungId: LEISTUNG.herrenschnitt, jetzt }));

    assert.ok(!zeiten.includes('08:45'), 'vor Ladenöffnung');
    assert.ok(!zeiten.includes('18:00'), 'Leistung inkl. Puffer würde über 18:30 hinauslaufen');
  });

  it('liefert am Ruhetag (Mo) und am Sonntag keine Slots', () => {
    const montag = slotsAmTag(db, { tag: MO, leistungId: LEISTUNG.herrenschnitt, jetzt: t(`${MO}T06:00`) });
    const sonntag = slotsAmTag(db, { tag: SO, leistungId: LEISTUNG.herrenschnitt, jetzt: t(`${SO}T06:00`) });

    assert.deepEqual(montag, []);
    assert.deepEqual(sonntag, []);
  });

  it('berücksichtigt die abweichenden Samstagszeiten', () => {
    const zeiten = startzeiten(
      slotsAmTag(db, { tag: SA, leistungId: LEISTUNG.herrenschnitt, jetzt: t(`${SA}T06:00`) }),
    );

    assert.equal(zeiten[0], '08:00');
    assert.equal(zeiten.at(-1), '13:15', 'Samstag schliesst um 14:00');
  });
});

describe('2 — Mittagspause', () => {
  const { db, aufraeumen } = neueTestDb();
  after(aufraeumen);

  const jetzt = t(`${DI}T07:00`);

  it('lässt keine Leistung in die Pause hineinlaufen', () => {
    const zeiten = startzeiten(slotsAmTag(db, { tag: DI, leistungId: LEISTUNG.herrenschnitt, jetzt }));

    assert.ok(zeiten.includes('11:45'), '11:45 + 30 + 5 endet 12:20, passt noch');
    assert.ok(!zeiten.includes('12:00'), '12:00 würde bis 12:35 laufen und die Pause verletzen');
    assert.ok(!zeiten.includes('12:30'), 'in der Pause ist geschlossen');
    assert.ok(!zeiten.includes('13:00'), 'in der Pause ist geschlossen');
    assert.ok(zeiten.includes('13:15'), 'direkt nach der Pause wieder frei');
  });

  it('erlaubt keine Leistung, die die Pause überbrückt', () => {
    // Komplettservice dauert inkl. Puffer 70 Minuten.
    const zeiten = startzeiten(slotsAmTag(db, { tag: DI, leistungId: LEISTUNG.komplett, jetzt }));

    assert.ok(zeiten.includes('11:15'), '11:15 + 70 endet exakt 12:25, passt noch vor die Pause');
    assert.ok(
      !zeiten.some((z) => z > '11:15' && z < '13:15'),
      `zwischen 11:15 und 13:15 darf nichts starten — erhalten: ${zeiten}`,
    );
    assert.ok(zeiten.includes('13:15'), 'direkt nach der Pause wieder');
  });
});

describe('3 — Kollision mit bestehendem Termin', () => {
  const { db, aufraeumen } = neueTestDb();
  after(aufraeumen);

  const jetzt = t(`${DI}T07:00`);

  it('entfernt alle überlappenden Slots', () => {
    bucheTermin(db, { leistungId: LEISTUNG.herrenschnitt, start: t(`${DI}T10:00`), jetzt });

    const zeiten = startzeiten(slotsAmTag(db, { tag: DI, leistungId: LEISTUNG.herrenschnitt, jetzt }));

    assert.ok(!zeiten.includes('10:00'), 'der belegte Slot selbst');
    assert.ok(!zeiten.includes('09:30'), '09:30–10:05 ragt in den Termin');
    assert.ok(zeiten.includes('09:15'), '09:15–09:50 endet vorher');
    assert.ok(zeiten.includes('10:45'), 'nach Termin und Puffer wieder frei');
  });
});

describe('4 — Puffer wird eingerechnet', () => {
  const { db, aufraeumen } = neueTestDb();
  after(aufraeumen);

  const jetzt = t(`${DI}T07:00`);

  it('blockiert den direkt anschliessenden Slot', () => {
    // Termin 10:00–10:30 aktiv, danach 10:30–10:35 Puffer.
    bucheTermin(db, { leistungId: LEISTUNG.herrenschnitt, start: t(`${DI}T10:00`), jetzt });

    const zeiten = startzeiten(slotsAmTag(db, { tag: DI, leistungId: LEISTUNG.herrenschnitt, jetzt }));

    assert.ok(
      !zeiten.includes('10:30'),
      '10:30 kollidiert ausschliesslich mit dem Puffer — genau das soll er verhindern',
    );
    assert.ok(zeiten.includes('10:45'), 'nach Ablauf des Puffers wieder frei');
  });

  it('gibt den Slot frei, sobald der Puffer der Leistung auf 0 gesetzt ist', () => {
    const eigen = neueTestDb();
    try {
      eigen.db.prepare('UPDATE services SET puffer_min = 0 WHERE id = ?').run(LEISTUNG.herrenschnitt);
      bucheTermin(eigen.db, { leistungId: LEISTUNG.herrenschnitt, start: t(`${DI}T10:00`), jetzt });

      const zeiten = startzeiten(
        slotsAmTag(eigen.db, { tag: DI, leistungId: LEISTUNG.herrenschnitt, jetzt }),
      );
      assert.ok(zeiten.includes('10:30'), 'ohne Puffer schliesst der Slot nahtlos an');
    } finally {
      eigen.aufraeumen();
    }
  });
});

describe('5 — Blackout blockiert', () => {
  const jetzt = t(`${DI}T07:00`);

  it('entfernt Slots im gesperrten Zeitraum', () => {
    const { db, aufraeumen } = neueTestDb();
    try {
      db.prepare(
        `INSERT INTO blackouts (resource_id, start_ts, end_ts, grund, art, quelle)
         VALUES (?, ?, ?, 'Arzttermin', 'abwesenheit', 'manuell')`,
      ).run(RESSOURCE, t(`${DI}T15:00`), t(`${DI}T16:00`));

      const zeiten = startzeiten(slotsAmTag(db, { tag: DI, leistungId: LEISTUNG.herrenschnitt, jetzt }));

      assert.ok(!zeiten.includes('14:45'), '14:45–15:20 ragt in den Blackout');
      assert.ok(!zeiten.includes('15:00'));
      assert.ok(!zeiten.includes('15:45'));
      assert.ok(zeiten.includes('14:15'), 'davor frei');
      assert.ok(zeiten.includes('16:00'), 'danach frei');
    } finally {
      aufraeumen();
    }
  });

  it("blockiert bei art='abwesenheit' auch die Einwirkzeit", () => {
    const { db, aufraeumen } = neueTestDb();
    try {
      // Strähnen ab 09:00: aktiv 09:00–09:30, Einwirkzeit 09:30–10:15, aktiv 10:15–10:45.
      // Der Blackout liegt vollständig in der Einwirkzeit.
      db.prepare(
        `INSERT INTO blackouts (resource_id, start_ts, end_ts, grund, art, quelle)
         VALUES (?, ?, ?, 'Abwesend', 'abwesenheit', 'manuell')`,
      ).run(RESSOURCE, t(`${DI}T09:45`), t(`${DI}T10:00`));

      const zeiten = startzeiten(slotsAmTag(db, { tag: DI, leistungId: LEISTUNG.straehnen, jetzt }));
      assert.ok(!zeiten.includes('09:00'), 'niemand da, der die Einwirkzeit beaufsichtigt');
    } finally {
      aufraeumen();
    }
  });

  it("lässt bei art='nicht_stoeren' die Einwirkzeit durchlaufen", () => {
    const { db, aufraeumen } = neueTestDb();
    try {
      db.prepare(
        `INSERT INTO blackouts (resource_id, start_ts, end_ts, grund, art, quelle)
         VALUES (?, ?, ?, 'Telefonat', 'nicht_stoeren', 'manuell')`,
      ).run(RESSOURCE, t(`${DI}T09:45`), t(`${DI}T10:00`));

      const zeiten = startzeiten(slotsAmTag(db, { tag: DI, leistungId: LEISTUNG.straehnen, jetzt }));
      assert.ok(zeiten.includes('09:00'), 'die Ressource ist anwesend, nur nicht am Kunden');
    } finally {
      aufraeumen();
    }
  });
});

describe('6 — Einwirkzeit-Fenster', () => {
  const { db, aufraeumen } = neueTestDb();
  after(aufraeumen);

  const jetzt = t(`${DI}T07:00`);

  // Strähnen ab 09:00 → aktiv 09:00–09:30 | Einwirkzeit 09:30–10:15 |
  //                     aktiv 10:15–10:45 | Puffer 10:45–10:55
  it('lässt eine 20-Minuten-Leistung parallel in die Einwirkzeit', () => {
    bucheTermin(db, { leistungId: LEISTUNG.straehnen, start: t(`${DI}T09:00`), jetzt });

    const zeiten = startzeiten(slotsAmTag(db, { tag: DI, leistungId: LEISTUNG.bart, jetzt }));

    assert.ok(
      zeiten.includes('09:45'),
      `Bartpflege 09:45–10:05 plus Puffer bis 10:10 passt in die Einwirkzeit — erhalten: ${zeiten.slice(0, 8)}`,
    );
  });

  it('lässt eine 60-Minuten-Leistung nicht parallel hinein', () => {
    const zeiten = startzeiten(slotsAmTag(db, { tag: DI, leistungId: LEISTUNG.komplett, jetzt }));

    assert.ok(
      !zeiten.some((z) => z >= '09:00' && z < '11:00'),
      `60 Minuten passen in kein 45-Minuten-Fenster — erhalten: ${zeiten}`,
    );
    assert.ok(zeiten.includes('11:00'), 'nach dem Termin ist wieder Platz');
  });
});

describe('7 — Wechselpuffer beim Verschachteln', () => {
  const jetzt = t(`${DI}T07:00`);

  it('verlangt Umschaltzeit vor und nach der eingeschobenen Leistung', () => {
    const { db, aufraeumen } = neueTestDb();
    try {
      bucheTermin(db, { leistungId: LEISTUNG.straehnen, start: t(`${DI}T09:00`), jetzt });

      const zeiten = startzeiten(slotsAmTag(db, { tag: DI, leistungId: LEISTUNG.bart, jetzt }));

      assert.ok(
        !zeiten.includes('09:30'),
        '09:30 würde nahtlos an die aktive Phase anschliessen — keine Umschaltzeit',
      );
      assert.ok(zeiten.includes('09:45'), 'mit 5 Minuten Abstand auf beiden Seiten passt es');
    } finally {
      aufraeumen();
    }
  });

  it('gibt den Slot frei, sobald der Wechselpuffer auf 0 steht', () => {
    const { db, aufraeumen } = neueTestDb();
    try {
      setzeEinstellung(db, 'wechsel_puffer_min', 0);
      bucheTermin(db, { leistungId: LEISTUNG.straehnen, start: t(`${DI}T09:00`), jetzt });

      const zeiten = startzeiten(slotsAmTag(db, { tag: DI, leistungId: LEISTUNG.bart, jetzt }));
      assert.ok(zeiten.includes('09:30'), 'ohne Wechselpuffer schliesst die Bartpflege nahtlos an');
    } finally {
      aufraeumen();
    }
  });
});

describe('8 — Kapazität gleichzeitig anwesender Kundschaft', () => {
  const jetzt = t(`${DI}T07:00`);

  it('verhindert die Parallelbuchung, wenn nur ein Platz vorhanden ist', () => {
    const { db, aufraeumen } = neueTestDb();
    try {
      setzeEinstellung(db, 'max_parallel_kunden', 1);
      bucheTermin(db, { leistungId: LEISTUNG.straehnen, start: t(`${DI}T09:00`), jetzt });

      const zeiten = startzeiten(slotsAmTag(db, { tag: DI, leistungId: LEISTUNG.bart, jetzt }));

      assert.ok(
        !zeiten.includes('09:45'),
        'der Stuhl ist besetzt, auch wenn Soner Zeit hätte',
      );
      assert.ok(zeiten.includes('11:00'), 'nach dem Termin wieder frei');
    } finally {
      aufraeumen();
    }
  });

  it('erlaubt sie bei zwei Plätzen', () => {
    const { db, aufraeumen } = neueTestDb();
    try {
      setzeEinstellung(db, 'max_parallel_kunden', 2);
      bucheTermin(db, { leistungId: LEISTUNG.straehnen, start: t(`${DI}T09:00`), jetzt });

      const zeiten = startzeiten(slotsAmTag(db, { tag: DI, leistungId: LEISTUNG.bart, jetzt }));
      assert.ok(zeiten.includes('09:45'));
    } finally {
      aufraeumen();
    }
  });
});

describe('9 — Mindestvorlauf', () => {
  const { db, aufraeumen } = neueTestDb();
  after(aufraeumen);

  const jetzt = t(`${DI}T09:00`);

  it('sperrt Slots innerhalb der nächsten 60 Minuten', () => {
    const zeiten = startzeiten(slotsAmTag(db, { tag: DI, leistungId: LEISTUNG.herrenschnitt, jetzt }));

    assert.ok(!zeiten.includes('09:30'), 'zu kurzfristig');
    assert.ok(!zeiten.includes('09:45'), 'zu kurzfristig');
    assert.equal(zeiten[0], '10:00', 'erster Slot exakt nach Ablauf des Vorlaufs');
  });

  it('respektiert den Override je Leistung', () => {
    const zeiten = startzeiten(slotsAmTag(db, { tag: DI, leistungId: LEISTUNG.sofort, jetzt }));

    assert.ok(zeiten.includes('09:15'), 'vorlauf_min = 0 erlaubt den nächsten Rasterpunkt');
  });
});

describe('10 — Buchungshorizont 12 Wochen', () => {
  const { db, aufraeumen } = neueTestDb();
  after(aufraeumen);

  const jetzt = t(`${DI}T07:00`);

  it('liefert Slots innerhalb des Horizonts', () => {
    const inElfWochen = DateTime.fromMillis(jetzt, { zone: ZONE }).plus({ weeks: 11 }).toISODate();
    const slots = slotsAmTag(db, { tag: inElfWochen, leistungId: LEISTUNG.herrenschnitt, jetzt });

    assert.ok(slots.length > 0, `Woche 11 (${inElfWochen}) muss buchbar sein`);
  });

  it('liefert jenseits des Horizonts keine Slots', () => {
    const inDreizehnWochen = DateTime.fromMillis(jetzt, { zone: ZONE }).plus({ weeks: 13 }).toISODate();
    const slots = slotsAmTag(db, { tag: inDreizehnWochen, leistungId: LEISTUNG.herrenschnitt, jetzt });

    assert.deepEqual(slots, [], `Woche 13 (${inDreizehnWochen}) liegt ausserhalb`);
  });
});

describe('11 — Weichreservierung läuft nach 15 Minuten ab', () => {
  const { db, aufraeumen } = neueTestDb();
  after(aufraeumen);

  const jetzt = t(`${DI}T07:00`);

  it('blockiert den Slot, solange sie gültig ist, und gibt ihn danach frei', () => {
    const hold = reserviere(db, {
      ressourceId: RESSOURCE,
      leistungId: LEISTUNG.herrenschnitt,
      start: t(`${DI}T10:00`),
      jetzt,
    });

    assert.equal(hold.expiresAt, jetzt + 15 * MINUTE, 'TTL kommt aus den Einstellungen');

    const waehrendGueltig = startzeiten(
      slotsAmTag(db, { tag: DI, leistungId: LEISTUNG.herrenschnitt, jetzt }),
    );
    assert.ok(!waehrendGueltig.includes('10:00'), 'reservierter Slot ist weg');

    const nachAblauf = startzeiten(
      slotsAmTag(db, { tag: DI, leistungId: LEISTUNG.herrenschnitt, jetzt: jetzt + 16 * MINUTE }),
    );
    assert.ok(nachAblauf.includes('10:00'), 'nach 16 Minuten ist der Slot wieder frei');
  });

  it('lässt eine abgelaufene Reservierung nicht mehr bestätigen', () => {
    const hold = reserviere(db, {
      ressourceId: RESSOURCE,
      leistungId: LEISTUNG.herrenschnitt,
      start: t(`${DI}T14:00`),
      jetzt,
    });

    assert.throws(
      () => bestaetige(db, { token: hold.token, kunde: 'Zu spät', jetzt: jetzt + 16 * MINUTE }),
      /abgelaufen/i,
    );
  });

  it('räumt abgelaufene Reservierungen auf, ohne gültige anzutasten', () => {
    const eigen = neueTestDb();
    try {
      const alt = reserviere(eigen.db, {
        ressourceId: RESSOURCE,
        leistungId: LEISTUNG.herrenschnitt,
        start: t(`${DI}T10:00`),
        jetzt,
      });
      const neu = reserviere(eigen.db, {
        ressourceId: RESSOURCE,
        leistungId: LEISTUNG.herrenschnitt,
        start: t(`${DI}T11:00`),
        jetzt: jetzt + 20 * MINUTE,
      });

      raeumeAbgelaufeneHolds(eigen.db, jetzt + 25 * MINUTE);

      const uebrig = eigen.db
        .prepare('SELECT token FROM holds WHERE status = ?')
        .all('aktiv')
        .map((z) => z.token);

      assert.ok(!uebrig.includes(alt.token), 'abgelaufen');
      assert.ok(uebrig.includes(neu.token), 'noch gültig');
    } finally {
      eigen.aufraeumen();
    }
  });
});

describe('12 — Zwei parallele Reservierungen auf denselben Slot', () => {
  const jetzt = t(`${DI}T07:00`);

  it('a) verschränkt: genau eine gewinnt, die zweite erkennt die Kollision', () => {
    const { db, pfad, aufraeumen } = neueTestDb();
    const zweite = oeffneDb(pfad, { busyTimeoutMs: 0 });
    try {
      const start = t(`${DI}T10:00`);

      // Verbindung A hält eine offene Schreibtransaktion.
      db.exec('BEGIN IMMEDIATE');
      assert.throws(
        () => reserviere(zweite, { ressourceId: RESSOURCE, leistungId: LEISTUNG.herrenschnitt, start, jetzt }),
        (fehler) => fehler.code === 'SQLITE_BUSY',
        'ohne Wartezeit prallt B am Schreib-Lock von A ab',
      );
      db.exec('ROLLBACK');

      // A reserviert und committet.
      const gewinner = reserviere(db, {
        ressourceId: RESSOURCE,
        leistungId: LEISTUNG.herrenschnitt,
        start,
        jetzt,
      });
      assert.ok(gewinner.token);

      // B bekommt den Lock jetzt problemlos — und muss die Kollision selbst erkennen.
      assert.throws(
        () => reserviere(zweite, { ressourceId: RESSOURCE, leistungId: LEISTUNG.herrenschnitt, start, jetzt }),
        SlotKollisionError,
        'die Prüfung liegt in derselben Transaktion wie der Insert',
      );

      const anzahl = db.prepare('SELECT COUNT(*) c FROM holds WHERE status = ?').get('aktiv').c;
      assert.equal(anzahl, 1, 'genau eine Reservierung überlebt');
    } finally {
      zweite.close();
      aufraeumen();
    }
  });

  it('b) echt nebenläufig über Worker-Threads: genau eine gewinnt', async () => {
    const { pfad, db, aufraeumen } = neueTestDb();
    db.close(); // die Worker arbeiten mit eigenen Verbindungen
    try {
      const start = t(`${DI}T10:00`);
      const anzahlWorker = 4;

      const ergebnisse = await Promise.all(
        Array.from({ length: anzahlWorker }, () =>
          new Promise((resolve, reject) => {
            const worker = new Worker(join(HIER, 'worker_reservieren.js'), {
              workerData: { pfad, start, jetzt, ressourceId: RESSOURCE, leistungId: LEISTUNG.herrenschnitt },
            });
            worker.once('message', resolve);
            worker.once('error', reject);
          }),
        ),
      );

      const erfolge = ergebnisse.filter((e) => e.ok);
      assert.equal(erfolge.length, 1, `genau einer darf gewinnen, erhalten: ${JSON.stringify(ergebnisse)}`);

      for (const fehler of ergebnisse.filter((e) => !e.ok)) {
        assert.match(
          fehler.fehler,
          /nicht buchbar|SQLITE_BUSY|database is locked|overlap/i,
          `sauberer Fehler statt Absturz, erhalten: ${fehler.fehler}`,
        );
      }

      const kontrolle = oeffneDb(pfad);
      const anzahl = kontrolle.prepare('SELECT COUNT(*) c FROM holds WHERE status = ?').get('aktiv').c;
      kontrolle.close();
      assert.equal(anzahl, 1);
    } finally {
      aufraeumen();
    }
  });
});

describe('13 — Umbuchen', () => {
  const jetzt = t(`${DI}T07:00`);

  it('lässt den alten Termin unangetastet, wenn der neue Slot belegt ist', () => {
    const { db, aufraeumen } = neueTestDb();
    try {
      const a = bucheTermin(db, { leistungId: LEISTUNG.herrenschnitt, start: t(`${DI}T10:00`), jetzt });
      bucheTermin(db, { leistungId: LEISTUNG.herrenschnitt, start: t(`${DI}T14:00`), jetzt });

      assert.throws(
        () => verschiebe(db, { terminId: a.terminId, neuerStart: t(`${DI}T14:00`), jetzt }),
        SlotKollisionError,
      );

      const unveraendert = db.prepare('SELECT start_ts, status FROM appointments WHERE id = ?').get(a.terminId);
      assert.equal(unveraendert.start_ts, t(`${DI}T10:00`), 'Rollback hat gegriffen');
      assert.equal(unveraendert.status, 'gebucht');

      const segmente = db
        .prepare('SELECT COUNT(*) c FROM busy_segments WHERE quelle = ? AND ref_id = ?')
        .get('termin', a.terminId).c;
      assert.ok(segmente > 0, 'die Segmente des alten Termins sind noch da');
    } finally {
      aufraeumen();
    }
  });

  it('verschiebt auf einen freien Slot und gibt den alten frei', () => {
    const { db, aufraeumen } = neueTestDb();
    try {
      const a = bucheTermin(db, { leistungId: LEISTUNG.herrenschnitt, start: t(`${DI}T10:00`), jetzt });

      const verschoben = verschiebe(db, { terminId: a.terminId, neuerStart: t(`${DI}T16:00`), jetzt });
      assert.equal(verschoben.start, t(`${DI}T16:00`));

      const zeiten = startzeiten(slotsAmTag(db, { tag: DI, leistungId: LEISTUNG.herrenschnitt, jetzt }));
      assert.ok(zeiten.includes('10:00'), 'der alte Slot ist wieder frei');
      assert.ok(!zeiten.includes('16:00'), 'der neue ist belegt');
    } finally {
      aufraeumen();
    }
  });

  it('gibt den Slot nach einer Stornierung wieder frei', () => {
    const { db, aufraeumen } = neueTestDb();
    try {
      const a = bucheTermin(db, { leistungId: LEISTUNG.herrenschnitt, start: t(`${DI}T10:00`), jetzt });
      storniere(db, { terminId: a.terminId });

      const zeiten = startzeiten(slotsAmTag(db, { tag: DI, leistungId: LEISTUNG.herrenschnitt, jetzt }));
      assert.ok(zeiten.includes('10:00'));
    } finally {
      aufraeumen();
    }
  });
});

describe('14 — Feiertage Baden-Württemberg', () => {
  it('berechnet die beweglichen Feste korrekt', () => {
    assert.deepEqual(ostersonntag(2027), { jahr: 2027, monat: 3, tag: 28 });

    const namen = new Map(feiertageBW(2027).map((f) => [f.name, f.datum]));
    assert.equal(namen.get('Heilige Drei Könige'), '2027-01-06');
    assert.equal(namen.get('Karfreitag'), '2027-03-26');
    assert.equal(namen.get('Christi Himmelfahrt'), '2027-05-06');
    assert.equal(namen.get('Fronleichnam'), '2027-05-27');
    assert.equal(namen.get('Allerheiligen'), '2027-11-01');
  });

  it('enthält keine Feiertage, die in Baden-Württemberg nicht gelten', () => {
    const namen = feiertageBW(2027).map((f) => f.name);

    assert.ok(!namen.some((n) => n.startsWith('Buß')), 'Buß- und Bettag gilt nur in Sachsen');
    assert.ok(!namen.includes('Reformationstag'));
    assert.ok(!namen.includes('Mariä Himmelfahrt'));
    assert.equal(namen.length, 12);
  });

  it('sperrt den Tag der Deutschen Einheit, obwohl der Samstag sonst offen ist', () => {
    const { db, aufraeumen } = neueTestDb();
    try {
      schreibeFeiertage(db, [2026], ZONE);

      const jetzt = t(`${DI}T07:00`);
      const vorher = slotsAmTag(db, { tag: '2026-09-26', leistungId: LEISTUNG.herrenschnitt, jetzt });
      const feiertag = slotsAmTag(db, { tag: '2026-10-03', leistungId: LEISTUNG.herrenschnitt, jetzt });

      assert.ok(vorher.length > 0, 'ein normaler Samstag im Horizont hat Slots');
      assert.deepEqual(feiertag, [], '03.10.2026 ist ein Samstag und ein Feiertag');
    } finally {
      aufraeumen();
    }
  });
});

describe('15 — Sommerzeit', () => {
  it('hält die Öffnungszeiten über die Zeitumstellung hinweg auf der Wanduhr', () => {
    const { db, aufraeumen } = neueTestDb();
    try {
      const jetzt = t(`${DI}T07:00`);
      // Umstellung auf Normalzeit: Sonntag, 25.10.2026. Der Dienstag danach:
      const slots = slotsAmTag(db, { tag: '2026-10-27', leistungId: LEISTUNG.herrenschnitt, jetzt });

      assert.ok(slots.length > 0);
      assert.equal(hhmm(slots[0].start), '09:00', 'weiterhin 09:00 Ortszeit, nicht 08:00 oder 10:00');
      assert.equal(
        DateTime.fromMillis(slots[0].start, { zone: ZONE }).offset,
        60,
        'Normalzeit, also UTC+1',
      );
    } finally {
      aufraeumen();
    }
  });

  it('rechnet Umstellungstage mit 23 bzw. 25 Stunden', () => {
    const lang = tagesGrenzen('2026-10-25', ZONE);
    const kurz = tagesGrenzen('2026-03-29', ZONE);

    assert.equal((lang.ende - lang.start) / STUNDE, 25);
    assert.equal((kurz.ende - kurz.start) / STUNDE, 23);
  });

  it('verschluckt eine nicht existierende Uhrzeit nicht stillschweigend', () => {
    assert.throws(
      () => lokalerZeitpunkt('2026-03-29', '02:30', ZONE),
      /Zeitumstellung/,
      '02:30 gibt es an diesem Tag nicht — Luxon würde still auf 03:30 schieben',
    );
  });
});

describe('16 — Overlap-Schutz auf Datenbankebene', () => {
  it('weist überlappende Segmente auch bei direktem SQL ab', () => {
    const { db, aufraeumen } = neueTestDb();
    try {
      const termin = bucheTermin(db, {
        leistungId: LEISTUNG.herrenschnitt,
        start: t(`${DI}T10:00`),
        jetzt: t(`${DI}T07:00`),
      });

      assert.throws(
        () =>
          db
            .prepare(
              `INSERT INTO busy_segments (resource_id, start_ts, end_ts, art, quelle, ref_id)
               VALUES (?, ?, ?, 'aktiv', 'termin', ?)`,
            )
            .run(RESSOURCE, t(`${DI}T10:15`), t(`${DI}T10:45`), termin.terminId),
        /overlap/,
        'der Trigger ist die letzte Verteidigungslinie, unabhängig vom Anwendungscode',
      );
    } finally {
      aufraeumen();
    }
  });
});

describe('17 — PRAGMA-Grundlagen', () => {
  it('aktiviert Foreign Keys auf jeder Verbindung', () => {
    const { db, pfad, aufraeumen } = neueTestDb();
    const zweite = oeffneDb(pfad);
    try {
      assert.equal(db.pragma('foreign_keys', { simple: true }), 1);
      assert.equal(zweite.pragma('foreign_keys', { simple: true }), 1);

      assert.throws(
        () =>
          db
            .prepare('INSERT INTO resource_services (resource_id, service_id) VALUES (?, ?)')
            .run(999, 1),
        /FOREIGN KEY/,
        'ohne das PRAGMA wären alle REFERENCES wirkungslos',
      );
    } finally {
      zweite.close();
      aufraeumen();
    }
  });
});

describe('18 — verfuegbareSlots ist seiteneffektfrei', () => {
  it('verändert die Datenbank nicht', () => {
    const { db, aufraeumen } = neueTestDb();
    try {
      const jetzt = t(`${DI}T07:00`);
      bucheTermin(db, { leistungId: LEISTUNG.herrenschnitt, start: t(`${DI}T10:00`), jetzt });

      const vorher = db.pragma('data_version', { simple: true });
      const zeilenVorher = db.prepare('SELECT COUNT(*) c FROM busy_segments').get().c;

      slotsAmTag(db, { tag: DI, leistungId: LEISTUNG.herrenschnitt, jetzt });
      slotsAmTag(db, { tag: DI, leistungId: LEISTUNG.bart, jetzt: jetzt + 60 * MINUTE });

      assert.equal(db.pragma('data_version', { simple: true }), vorher);
      assert.equal(db.prepare('SELECT COUNT(*) c FROM busy_segments').get().c, zeilenVorher);
    } finally {
      aufraeumen();
    }
  });

  it('läuft auf einer schreibgeschützten Verbindung', () => {
    const { db, pfad, aufraeumen } = neueTestDb();
    try {
      const jetzt = t(`${DI}T07:00`);
      bucheTermin(db, { leistungId: LEISTUNG.herrenschnitt, start: t(`${DI}T10:00`), jetzt });

      const nurLesen = oeffneDb(pfad, { readonly: true });
      try {
        const slots = slotsAmTag(nurLesen, { tag: DI, leistungId: LEISTUNG.herrenschnitt, jetzt });
        assert.ok(slots.length > 0);
        assert.ok(!startzeiten(slots).includes('10:00'));
      } finally {
        nurLesen.close();
      }
    } finally {
      aufraeumen();
    }
  });
});

describe('19 — keine versteckte Uhr', () => {
  it('verwendet in der Slot- und Schreiblogik kein Date.now()', () => {
    for (const datei of ['slots.js', 'reservierung.js', 'zeit.js', 'feiertage.js']) {
      const quelle = readFileSync(join(HIER, '..', 'src', datei), 'utf8');
      assert.ok(
        !/Date\.now\(/.test(quelle),
        `${datei} darf keine implizite Uhr benutzen — 'jetzt' wird immer injiziert`,
      );
    }
  });
});

/**
 * Tests fuer den Konkurrenzvergleich.
 *
 * Der Rang landet woertlich in der Outreach-Mail. Stimmt er nicht, steht eine
 * falsche Zahl in einer Mail an einen fremden Betrieb — schlimmer als gar
 * kein Vergleich.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rangBerechnen, vergleichsSatz, rangText } from '../src/lib/vergleich.js';

const lead = (name, ort, playbook, score) => ({
  slug: name.toLowerCase().replace(/\s/g, '-'),
  eingabe: { name, ort },
  places: { ort, name },
  klassifikation: { playbook },
  auditVorher: { score },
});

/** Fuenf Werkstaetten in Gersau, absichtlich unsortiert. */
const gruppe = () => [
  lead('Garage A', 'Gersau', 'kfz', 22),
  lead('Garage B', 'Gersau', 'kfz', 71),
  lead('Garage C', 'Gersau', 'kfz', 45),
  lead('Garage D', 'Gersau', 'kfz', 58),
  lead('Garage E', 'Gersau', 'kfz', 33),
];

test('Rang wird korrekt vergeben, bester zuerst', () => {
  const p = gruppe();
  rangBerechnen(p);
  const nach = (n) => p.find((x) => x.eingabe.name === n).vergleich;

  assert.equal(nach('Garage B').platz, 1);
  assert.equal(nach('Garage D').platz, 2);
  assert.equal(nach('Garage C').platz, 3);
  assert.equal(nach('Garage E').platz, 4);
  assert.equal(nach('Garage A').platz, 5);
});

test('Gruppengroesse, Bestwert und Median stimmen', () => {
  const p = gruppe();
  rangBerechnen(p);
  const v = p[0].vergleich;
  assert.equal(v.von, 5);
  assert.equal(v.bestwert, 71);
  assert.equal(v.median, 45); // 22, 33, 45, 58, 71
});

test('besserAls und schlechterAls ergaenzen sich zur Gruppe', () => {
  const p = gruppe();
  rangBerechnen(p);
  for (const x of p) {
    const v = x.vergleich;
    assert.equal(v.besserAls + v.schlechterAls + 1, v.von, `${x.eingabe.name} zaehlt falsch`);
  }
});

test('der Schlechteste hat alle anderen vor sich', () => {
  const p = gruppe();
  rangBerechnen(p);
  const a = p.find((x) => x.eingabe.name === 'Garage A').vergleich;
  assert.equal(a.schlechterAls, 4);
  assert.equal(a.besserAls, 0);
});

test('Gruppen unter vier Leads bekommen keinen Vergleich', () => {
  // "Sie sind Zweiter von zwei" ist kein Argument.
  const p = [
    lead('Garage A', 'Gersau', 'kfz', 22),
    lead('Garage B', 'Gersau', 'kfz', 71),
    lead('Garage C', 'Gersau', 'kfz', 45),
  ];
  rangBerechnen(p);
  assert.ok(p.every((x) => !x.vergleich));
});

test('verschiedene Orte bilden getrennte Gruppen', () => {
  const p = [...gruppe(), lead('Garage X', 'Brunnen', 'kfz', 90)];
  rangBerechnen(p);
  assert.ok(!p.find((x) => x.eingabe.name === 'Garage X').vergleich, 'Einzelner Ort darf keinen Rang bekommen');
  assert.equal(p[0].vergleich.von, 5, 'Gersauer Gruppe bleibt bei 5');
});

test('verschiedene Branchen bilden getrennte Gruppen', () => {
  const p = [...gruppe(), lead('Beiz A', 'Gersau', 'gastro', 90)];
  rangBerechnen(p);
  assert.ok(!p.find((x) => x.eingabe.name === 'Beiz A').vergleich);
});

test('regionsweit ignoriert den Ort', () => {
  const p = [
    lead('Garage A', 'Gersau', 'kfz', 22),
    lead('Garage B', 'Brunnen', 'kfz', 71),
    lead('Garage C', 'Vitznau', 'kfz', 45),
    lead('Garage D', 'Schwyz', 'kfz', 58),
  ];
  rangBerechnen(p, { regionsweit: true });
  assert.equal(p[0].vergleich.von, 4, 'ohne Ortsgruppierung bilden alle vier eine Gruppe');
});

test('Leads ohne Score verfaelschen die Rangliste nicht', () => {
  const ohne = lead('Kaputt AG', 'Gersau', 'kfz', 0);
  delete ohne.auditVorher;
  const p = [...gruppe(), ohne];
  rangBerechnen(p);
  assert.equal(p[0].vergleich.von, 5, 'nicht bewertete Leads zaehlen nicht mit');
  assert.ok(!ohne.vergleich);
});

test('zu kleine Gruppe loescht einen veralteten Rang', () => {
  const p = [lead('Garage A', 'Gersau', 'kfz', 22), lead('Garage B', 'Gersau', 'kfz', 71)];
  p[0].vergleich = { platz: 3, von: 9 }; // Rest aus einem frueheren Lauf
  rangBerechnen(p);
  assert.ok(!p[0].vergleich, 'veralteter Rang muss verschwinden');
});

/* ── Der Satz, der in die Mail geht ──────────────────────────────────── */

test('Vergleichssatz nennt Zahlen und keine Namen', () => {
  const p = gruppe();
  rangBerechnen(p);
  const schlechtester = p.find((x) => x.eingabe.name === 'Garage A');
  const satz = vergleichsSatz(schlechtester, 'Werkstaetten');

  assert.match(satz, /5 Werkstaetten/);
  assert.match(satz, /4 davon/);
  assert.match(satz, /71/);
  // Keine Namensnennung — vergleichende Werbung in Kaltakquise ist heikel.
  for (const name of ['Garage B', 'Garage C', 'Garage D', 'Garage E']) {
    assert.ok(!satz.includes(name), `Satz nennt "${name}" — Namen sind tabu`);
  }
});

test('der Beste bekommt keinen Vergleichssatz', () => {
  const p = gruppe();
  rangBerechnen(p);
  const bester = p.find((x) => x.eingabe.name === 'Garage B');
  assert.equal(vergleichsSatz(bester), null, 'Dem Besten zu sagen, er sei der Beste, verkauft nichts');
});

test('Einzahl wird korrekt formuliert', () => {
  const p = gruppe();
  rangBerechnen(p);
  const zweiter = p.find((x) => x.eingabe.name === 'Garage D');
  const satz = vergleichsSatz(zweiter, 'Werkstaetten');
  assert.match(satz, /Einer davon/);
});

test('ohne Vergleich gibt es keinen Satz und keinen Rangtext', () => {
  const ohne = lead('Allein AG', 'Gersau', 'kfz', 40);
  assert.equal(vergleichsSatz(ohne), null);
  assert.equal(rangText(ohne), null);
});

test('rangText ist kurz und lesbar', () => {
  const p = gruppe();
  rangBerechnen(p);
  assert.equal(rangText(p.find((x) => x.eingabe.name === 'Garage A')), 'Platz 5 von 5');
});

test('dieselbe Referenz mehrfach in der Liste blaeht die Gruppe nicht auf', () => {
  // Enthaelt eine CSV denselben Betrieb zweimal, liefert profilFuer beide Male
  // dasselbe Objekt. Ohne Entdopplung waere "9 von 12" in Wahrheit "9 von 8" —
  // und diese Zahl geht woertlich in eine Mail an einen fremden Betrieb.
  const a = lead('Garage A', 'Gersau', 'kfz', 22);
  const b = lead('Garage B', 'Gersau', 'kfz', 71);
  const c = lead('Garage C', 'Gersau', 'kfz', 45);
  const d = lead('Garage D', 'Gersau', 'kfz', 58);
  rangBerechnen([a, a, b, b, c, d]); // a und b doppelt
  assert.equal(a.vergleich.von, 4, 'Gruppe muss 4 sein, nicht 6');
});

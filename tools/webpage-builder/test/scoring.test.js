/**
 * Tests fuer den KI-Sichtbarkeits-Score.
 *
 * Der Score ist die Grundlage des Verkaufsgespraechs. Wenn er sich verschiebt,
 * ohne dass jemand es merkt, stimmen die Zahlen in bereits verschickten Mails
 * nicht mehr mit denen im Cockpit ueberein. Diese Tests halten die Skala fest.
 *
 * Wichtigster Test ist der letzte: Bestandsseite und Prototyp muessen durch
 * dieselbe Funktion laufen. Ohne das waere der Vorher/Nachher-Vergleich ein
 * Taschenspielertrick.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bewerte, note, groessteLuecken, KATEGORIEN } from '../src/lib/scoring.js';

/** Eine miserable, aber typische KMU-Seite von 2011. */
const alteSeite = {
  titel: 'Garage Bruderer',
  metaDescription: '',
  h1: [], h2: [], nav: [],
  bodyText: 'Herzlich willkommen bei der Garage Bruderer. Wir sind Ihr kompetenter Partner.',
  textLaenge: 78,
  jsonLd: [],
  bilder: [{ src: 'a.jpg', alt: '', flaeche: 300000 }],
  telLinks: [], mailLinks: [],
  https: false, lang: '', viewport: '',
  ladezeitMs: 3400,
  mobil: { ueberlauf: true, breite: 980 },
  robots: { vorhanden: false }, sitemap: { vorhanden: false }, llms: { vorhanden: false },
  hatFormular: false, hatKarte: false,
};

/** Ein Prototyp, wie ihn 07-render erzeugt. */
const prototyp = {
  titel: 'Garage Bruderer · KFZ-Werkstatt in Gersau',
  metaDescription: 'KFZ-Werkstatt in Gersau. Service, MFK-Vorbereitung, Reparaturen. Offerte anfordern.',
  ogTitle: 'Garage Bruderer', ogImage: 'bilder/hero.webp',
  h1: ['KFZ-Werkstatt in Gersau'],
  h2: ['Unsere Leistungen', 'So einfach geht es', 'So erreichen Sie uns'],
  nav: ['Leistungen', 'Ablauf', 'Kontakt'],
  bodyText: 'x'.repeat(1400),
  textLaenge: 1400,
  jsonLd: [{
    '@type': 'AutoRepair', name: 'Garage Bruderer',
    address: { '@type': 'PostalAddress', addressLocality: 'Gersau' },
    openingHoursSpecification: [{ '@type': 'OpeningHoursSpecification', opens: '07:30' }],
  }],
  bilder: [{ src: 'hero.webp', alt: 'Garage Bruderer — Aussenansicht', flaeche: 400000 }],
  telLinks: ['tel:0418281422'], mailLinks: [],
  https: true, lang: 'de-CH', viewport: 'width=device-width, initial-scale=1',
  ladezeitMs: 180,
  mobil: { ueberlauf: false, breite: 390 },
  robots: { vorhanden: true }, sitemap: { vorhanden: true }, llms: { vorhanden: true },
  hatFormular: true, hatKarte: true,
};

test('Gewichte ergeben zusammen 100', () => {
  const summe = Object.values(KATEGORIEN).reduce((a, k) => a + k.gewicht, 0);
  assert.equal(summe, 100);
});

test('Alte Seite landet im kritischen Bereich', () => {
  const r = bewerte({ scrape: alteSeite });
  assert.ok(r.score < 35, `erwartet unter 35, war ${r.score}`);
  assert.equal(r.note, 'Kritisch');
});

test('Prototyp erreicht mindestens 90', () => {
  const r = bewerte({ scrape: prototyp });
  assert.ok(r.score >= 90, `erwartet mindestens 90, war ${r.score}`);
});

test('Der Sprung ist gross genug, um ein Argument zu sein', () => {
  const vorher = bewerte({ scrape: alteSeite }).score;
  const nachher = bewerte({ scrape: prototyp }).score;
  assert.ok(nachher - vorher >= 50, `Sprung nur ${nachher - vorher} Punkte`);
});

test('Keine Seite ergibt Score 0 mit sprechendem Befund', () => {
  const r = bewerte({ scrape: null });
  assert.equal(r.score, 0);
  assert.equal(r.befunde.length, 1);
  assert.equal(r.befunde[0].erfuellt, false);
});

test('Ein HTTP-Fehler erscheint im Befund statt eines generischen Textes', () => {
  const r = bewerte({ scrape: null, hinweis: { statusCode: 404, text: 'Die Website antwortet mit HTTP 404.' } });
  assert.equal(r.score, 0);
  assert.match(r.befunde[0].text, /404/);
  assert.match(r.note, /404/);
});

test('Score bleibt immer zwischen 0 und 100', () => {
  for (const s of [alteSeite, prototyp, {}, { jsonLd: [], bilder: [] }]) {
    const r = bewerte({ scrape: s });
    assert.ok(r.score >= 0 && r.score <= 100, `Score ausserhalb: ${r.score}`);
  }
});

test('Jede Kategorie bleibt unter ihrem Gewicht', () => {
  const r = bewerte({ scrape: prototyp });
  for (const [k, v] of Object.entries(r.kategorien)) {
    assert.ok(v.erreicht <= v.gewicht, `${k}: ${v.erreicht} > ${v.gewicht}`);
  }
});

test('Jeder Befund traegt einen deutschen Klartext-Satz', () => {
  const r = bewerte({ scrape: alteSeite });
  for (const b of r.befunde) {
    assert.ok(b.text.length > 15, `zu kurz: ${b.text}`);
    assert.ok(b.text.endsWith('.'), `kein ganzer Satz: ${b.text}`);
    assert.ok(!/ß/.test(b.text + b.warum), `enthaelt ß: ${b.text}`);
  }
});

test('groessteLuecken liefert die gewichtigsten offenen Punkte', () => {
  const r = bewerte({ scrape: alteSeite });
  const l = groessteLuecken(r, 3);
  assert.equal(l.length, 3);
  assert.ok(l[0].punkte >= l[1].punkte && l[1].punkte >= l[2].punkte);
  assert.ok(l.every((x) => !x.erfuellt && x.warum));
});

test('note() bildet die ganze Skala ab', () => {
  assert.equal(note(95), 'Ausgezeichnet');
  assert.equal(note(80), 'Gut');
  assert.equal(note(60), 'Ausbaufaehig');
  assert.equal(note(40), 'Schwach');
  assert.equal(note(10), 'Kritisch');
  assert.equal(note(0), 'Kein Auftritt');
});

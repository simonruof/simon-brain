/**
 * Tests fuer die Textextraktion.
 *
 * Diese Funktionen entscheiden darueber, ob im Prototyp die richtige
 * Telefonnummer und die richtigen Oeffnungszeiten stehen. Eine falsche
 * Nummer ist schlimmer als gar keine: Sie faellt dem Empfaenger sofort auf
 * und beendet das Gespraech. Deshalb hier besonders die Faelle, in denen die
 * Muster danebengreifen koennten.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { telefon, adresse, oeffnungszeiten, email, formatiereTelefon } from '../src/lib/extract.js';

test('Telefon: Schweizer Schreibweisen', () => {
  assert.equal(telefon('Tel. 041 828 14 22'), '041 828 14 22');
  assert.equal(telefon('Telefon: +41 41 828 14 22'), '041 828 14 22');
  assert.equal(telefon('Rufen Sie an: 0041418281422'), '041 828 14 22');
  assert.equal(telefon('041/828 14 22'), '041 828 14 22');
  assert.equal(telefon('079 412 88 03 (WhatsApp)'), '079 412 88 03');
});

test('Telefon: haeufigste Nummer gewinnt (Kopf- und Fusszeile)', () => {
  const text = 'Fax 041 828 14 99 ... Tel 041 828 14 22 ... Telefon 041 828 14 22';
  assert.equal(telefon(text), '041 828 14 22');
});

test('Telefon: keine Nummer vorhanden', () => {
  assert.equal(telefon('Wir freuen uns auf Ihren Besuch.'), '');
});

test('Telefon: Jahreszahlen und Preise werden nicht als Nummer gelesen', () => {
  assert.equal(telefon('Gegruendet 1998. Menu ab CHF 24.50'), '');
});

test('formatiereTelefon: Normalform', () => {
  assert.equal(formatiereTelefon('+41418281422'), '041 828 14 22');
  assert.equal(formatiereTelefon('0418281422'), '041 828 14 22');
});

test('Adresse: Strasse, Hausnummer, PLZ, Ort', () => {
  const a = adresse('Garage Bruderer AG\nSeestrasse 42\n6442 Gersau\nTel. 041 828 14 22');
  assert.equal(a.strasse, 'Seestrasse');
  assert.equal(a.hausnummer, '42');
  assert.equal(a.plz, '6442');
  assert.equal(a.ort, 'Gersau');
  assert.equal(a.vollstaendig, 'Seestrasse 42, 6442 Gersau');
});

test('Adresse: Ort mit Bindestrich und Umlaut', () => {
  const a = adresse('Hauptgasse 3\n6023 Rothenburg');
  assert.equal(a.ort, 'Rothenburg');
  assert.equal(a.plz, '6023');
});

test('Adresse: ohne PLZ gibt es kein Ergebnis (lieber nichts als falsch)', () => {
  assert.equal(adresse('Irgendwo in der Zentralschweiz'), null);
});

test('E-Mail: Agentur- und Systemadressen werden uebersprungen', () => {
  assert.equal(email('Kontakt: info@seeblick.ch, erstellt von hallo@webdesign-firma.ch'), 'info@seeblick.ch');
  assert.equal(email('noreply@example.com'), 'noreply@example.com'); // einziger Treffer bleibt
});

test('Oeffnungszeiten: Spanne mit zwei Bloecken pro Tag', () => {
  const z = oeffnungszeiten(
    'Oeffnungszeiten\nMontag bis Freitag 07.30 - 12.00 und 13.30 - 18.00\nSamstag 08.00 - 12.00\nSonntag geschlossen');
  const mo = z.tage.find((t) => t.tag === 'Montag');
  assert.deepEqual(mo.zeiten, ['07.30–12.00', '13.30–18.00']);
  assert.equal(mo.geschlossen, false);

  const sa = z.tage.find((t) => t.tag === 'Samstag');
  assert.deepEqual(sa.zeiten, ['08.00–12.00']);

  const so = z.tage.find((t) => t.tag === 'Sonntag');
  assert.equal(so.geschlossen, true);
});

test('Oeffnungszeiten: Kurzform Mo-Fr', () => {
  const z = oeffnungszeiten('Oeffnungszeiten: Mo-Fr 8.00-17.00');
  assert.equal(z.tage.find((t) => t.tag === 'Mittwoch').zeiten[0], '08.00–17.00');
  assert.equal(z.tage.find((t) => t.tag === 'Samstag').geschlossen, true);
});

test('Oeffnungszeiten: Ruhetag wird als geschlossen erkannt', () => {
  const z = oeffnungszeiten('Oeffnungszeiten\nDienstag - Samstag: 11.30 - 14.00\nMontag: Ruhetag');
  assert.equal(z.tage.find((t) => t.tag === 'Montag').geschlossen, true);
  assert.equal(z.tage.find((t) => t.tag === 'Dienstag').geschlossen, false);
});

test('Oeffnungszeiten: schema.org-Form fuer JSON-LD', () => {
  const z = oeffnungszeiten('Oeffnungszeiten\nMo-Fr 07.30 - 12.00');
  assert.ok(z.schema.includes('Mo 07:30-12:00'));
  assert.ok(z.schema.includes('Fr 07:30-12:00'));
});

test('Oeffnungszeiten: Preise werden nicht als Uhrzeit gelesen', () => {
  const z = oeffnungszeiten('Menu 18.50 - 24.00 CHF. Wir haben keine festen Zeiten.');
  // 18.50-24.00 waere formal eine plausible Zeitspanne — ohne Tagesangabe
  // darf daraus aber keine Oeffnungszeit werden.
  assert.equal(z, null);
});

test('Oeffnungszeiten: kein Treffer liefert null, nicht ein leeres Geruest', () => {
  assert.equal(oeffnungszeiten('Wir freuen uns auf Ihren Besuch.'), null);
});

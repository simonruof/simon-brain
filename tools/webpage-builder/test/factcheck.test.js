/**
 * Tests fuer die Faktenpruefung.
 *
 * Diese Funktion entscheidet, ob ein Prototyp rausgehen darf. Zwei Fehlerarten,
 * und die zweite ist die gefaehrlichere:
 *
 *   Uebersehene Behauptung — ein erfundenes Gruendungsjahr geht raus und
 *   beendet das Gespraech.
 *
 *   Fehlalarm — nach dem dritten grundlosen Alarm schaut niemand mehr hin,
 *   und dann faengt die Pruefung auch die echten Faelle nicht mehr ab. Deshalb
 *   liegt hier der Schwerpunkt auf den Negativfaellen.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pruefeFakten, quellenText, zusammenfassung } from '../src/lib/factcheck.js';

const PB = {
  copy_brief: {
    leistungen_fallback: [{ titel: 'Reparaturen', text: 'Schnelle Hilfe, wenn etwas nicht mehr funktioniert.' }],
  },
  trust_signale: ['Festpreis nach Besichtigung'],
};

const profilMit = (text) => ({ scrape: { bodyText: text }, places: null, eingabe: {} });
const pruefe = (quelle, copy) => pruefeFakten(copy, profilMit(quelle), PB);

/* ── Treffer: unbelegte Behauptungen muessen gemeldet werden ─────────── */

test('erfundenes Gruendungsjahr wird gemeldet', () => {
  const r = pruefe('Wir reparieren Autos in Gersau.', { about: 'Garage seit 1987 in Familienbesitz.' });
  assert.equal(r.versandbereit, false);
  assert.equal(r.verdaechtig.length, 1);
  assert.equal(r.verdaechtig[0].typ, 'jahr');
});

test('erfundene Mitarbeiterzahl wird gemeldet', () => {
  const r = pruefe('Wir reparieren Autos.', { about: 'Unser Team von 12 Mitarbeitern betreut Sie.' });
  assert.equal(r.verdaechtig.length, 1);
  assert.equal(r.verdaechtig[0].typ, 'anzahl');
});

test('erfundene Zertifizierung wird gemeldet', () => {
  const r = pruefe('Wir arbeiten sauber.', { about: 'Wir sind ISO 9001 zertifiziert.' });
  assert.equal(r.verdaechtig[0].typ, 'zertifikat');
});

test('erfundene Garantiezusage wird gemeldet', () => {
  const r = pruefe('Wir arbeiten sauber.', { about: 'Wir geben 5 Jahre Garantie auf alle Arbeiten.' });
  assert.equal(r.verdaechtig[0].typ, 'garantie');
});

test('unbelegte Spitzenstellung wird gemeldet', () => {
  const r = pruefe('Wir sind eine Werkstatt in Gersau.', { about: 'Marktfuehrer der Region.' });
  assert.equal(r.verdaechtig[0].typ, 'auszeichnung');
});

test('erfundener Preis wird gemeldet', () => {
  const r = pruefe('Service nach Aufwand.', { leistungen: [{ titel: 'Service', text: 'Ab CHF 149.' }] });
  assert.equal(r.verdaechtig[0].typ, 'preis');
});

test('mehrere Behauptungen werden alle gemeldet', () => {
  const r = pruefe('Wir reparieren Autos.', {
    hero: { titel: 'Garage seit 1987', lead: 'Team von 12 Mitarbeitern.' },
    about: 'ISO 9001 zertifiziert, 5 Jahre Garantie.',
  });
  assert.ok(r.verdaechtig.length >= 4, `nur ${r.verdaechtig.length} gemeldet`);
  assert.equal(r.versandbereit, false);
});

/* ── Kein Fehlalarm: belegte Angaben duerfen nicht anschlagen ────────── */

test('belegtes Jahr wird nicht gemeldet', () => {
  const r = pruefe('Seit 1987 in Gersau taetig.', { about: 'Garage seit 1987 in Familienbesitz.' });
  assert.equal(r.versandbereit, true);
  assert.equal(r.verdaechtig.length, 0);
});

test('belegte Anzahl trotz deutscher Beugung', () => {
  // Quelle: "12 Mitarbeiter" — Entwurf: "12 Mitarbeitern" (Dativ)
  const r = pruefe('Unser Betrieb hat 12 Mitarbeiter.', { about: 'Mit 12 Mitarbeitern fuer Sie da.' });
  assert.equal(r.verdaechtig.length, 0, 'Beugungsendung darf keinen Fehlalarm ausloesen');
});

test('Zahlwort im Entwurf, Ziffer in der Quelle', () => {
  const r = pruefe('Unser Team von 8 Mitarbeitern.', { about: 'Acht Mitarbeiter kuemmern sich um Sie.' });
  assert.equal(r.verdaechtig.length, 0, 'acht und 8 muessen als dieselbe Angabe gelten');
});

test('Ziffer im Entwurf, Zahlwort in der Quelle', () => {
  const r = pruefe('Unser Team von acht Mitarbeitern.', { about: '8 Mitarbeiter kuemmern sich um Sie.' });
  assert.equal(r.verdaechtig.length, 0);
});

test('belegter Preis wird nicht gemeldet', () => {
  const r = pruefe('Der Service kostet ab CHF 149.', { leistungen: [{ titel: 'Service', text: 'Ab CHF 149.' }] });
  assert.equal(r.verdaechtig.length, 0);
});

test('Angaben aus den Playbook-Vorgaben loesen keinen Alarm aus', () => {
  // Die Vorgaben sind von Hand geschrieben und treffen keine Aussage ueber
  // diesen konkreten Betrieb — sie gelten deshalb als belegt.
  const r = pruefeFakten(
    { leistungen: [{ titel: 'Reparaturen', text: 'Schnelle Hilfe, wenn etwas nicht mehr funktioniert.' }] },
    profilMit('Werkstatt in Gersau.'),
    PB,
  );
  assert.equal(r.verdaechtig.length, 0);
});

test('Google-Bewertungstexte zaehlen als Quelle', () => {
  const profil = {
    scrape: { bodyText: 'Werkstatt in Gersau.' },
    places: { bewertungen: [{ text: 'Seit 1987 gehe ich hierhin, immer top.' }] },
    eingabe: {},
  };
  const r = pruefeFakten({ about: 'Garage seit 1987.' }, profil, PB);
  assert.equal(r.verdaechtig.length, 0);
});

test('interne Felder werden nicht geprueft', () => {
  const r = pruefe('Werkstatt.', { _quelle: 'claude', _modell: 'claude-sonnet-5 seit 2024' });
  assert.equal(r.geprueft, 0);
});

/* ── Form der Ausgabe ────────────────────────────────────────────────── */

test('jeder Befund traegt Fundstelle, Satz und Begruendung', () => {
  const r = pruefe('Wir reparieren Autos.', { about: 'Ein Familienbetrieb seit 1987 in Gersau.' });
  const v = r.verdaechtig[0];
  assert.ok(v.feld, 'Feldpfad fehlt');
  assert.ok(v.umgebung.includes('1987'), 'Satz um die Fundstelle fehlt');
  assert.ok(v.warum.length > 20, 'Begruendung fehlt');
  assert.ok(!/ß/.test(v.warum), 'kein ß in Schweizer Texten');
});

test('quellenText fasst alle Belegquellen zusammen', () => {
  const profil = {
    scrape: { bodyText: 'Werkstatt', titel: 'Garage Muster', h1: ['Willkommen'] },
    places: { name: 'Garage Muster AG', beschreibung: 'Autoservice' },
    eingabe: {},
  };
  const q = quellenText(profil, PB);
  for (const teil of ['werkstatt', 'garage muster', 'willkommen', 'autoservice']) {
    assert.ok(q.includes(teil), `"${teil}" fehlt in den Quellen`);
  }
});

test('zusammenfassung liefert lesbaren Text in beiden Faellen', () => {
  const ok = pruefe('Seit 1987.', { about: 'Seit 1987.' });
  assert.match(zusammenfassung(ok), /alle belegt/);

  const nicht = pruefe('Werkstatt.', { about: 'Seit 1987.' });
  assert.match(zusammenfassung(nicht), /nicht belegt/);
});

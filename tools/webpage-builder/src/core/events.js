/**
 * Ereignisstrom — eine Quelle, drei Verbraucher.
 *
 * CLI (--events)  : NDJSON auf stdout, von Agenten zeilenweise lesbar
 * CLI (normal)    : lesbare Zeilen auf stderr, damit stdout sauber JSON bleibt
 * Cockpit         : dieselben Ereignisse als SSE
 *
 * Regel ohne Ausnahme: nichts davon schreibt jemals auf stdout, ausser im
 * ausdruecklichen --events-Modus. stdout gehoert dem Ergebnis-JSON.
 */

import { EventEmitter } from 'node:events';

export const bus = new EventEmitter();
bus.setMaxListeners(50);

let modus = 'still'; // 'still' | 'lesbar' | 'ndjson'

export function setEventModus(m) {
  modus = m;
}

/**
 * @param {string} typ    z.B. 'stage:start', 'stage:ok', 'stage:fail', 'lead:done', 'info', 'warn'
 * @param {object} daten  frei, wird flach in das Ereignis gemischt
 */
export function emit(typ, daten = {}) {
  const ev = { ts: new Date().toISOString(), typ, ...daten };
  bus.emit('event', ev);

  if (modus === 'ndjson') {
    process.stdout.write(JSON.stringify(ev) + '\n');
  } else if (modus === 'lesbar') {
    process.stderr.write(formatiere(ev) + '\n');
  }
  return ev;
}

const zeichen = {
  'stage:start': '  ·',
  'stage:ok': '  ✓',
  'stage:skip': '  –',
  'stage:fail': '  ✗',
  'lead:start': '▸',
  'lead:done': '▪',
  info: '  i',
  warn: '  !',
};

function formatiere(ev) {
  const c = zeichen[ev.typ] ?? '  ·';
  const teile = [c];
  if (ev.lead) teile.push(`[${ev.lead}]`);
  if (ev.stage) teile.push(ev.stage);
  if (ev.text) teile.push(ev.text);
  if (ev.dauerMs != null) teile.push(`(${(ev.dauerMs / 1000).toFixed(1)}s)`);
  if (ev.fehler) teile.push(`— ${ev.fehler}`);
  return teile.join(' ');
}

/** Abonniert den Strom, gibt eine Abmelde-Funktion zurueck (fuer SSE). */
export function onEvent(fn) {
  bus.on('event', fn);
  return () => bus.off('event', fn);
}

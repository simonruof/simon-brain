#!/usr/bin/env node
/**
 * wb — Prototyp-Fabrik CLI
 *
 * Bedienbar von Menschen UND von anderen KIs. Die Regeln, die das moeglich machen:
 *
 *   stdout gehoert dem Ergebnis. Immer. Logs, Fortschritt und Warnungen
 *   gehen ausnahmslos auf stderr. Damit funktioniert `wb scan --json | jq`
 *   ohne Filterakrobatik.
 *
 *   Keine Interaktion. Keine Rueckfrage, keine Eingabeaufforderung, kein
 *   Fortschrittsbalken der die Ausgabe zerlegt. Ein Agent kann nicht antworten.
 *
 *   Fehler sind Daten. Jeder Fehler kommt als JSON mit code, message und hint —
 *   hint sagt im Klartext, was zu tun ist.
 *
 * Erste Anlaufstelle fuer Agenten: `wb describe --json` und AGENTS.md.
 */

import * as wb from '../src/core/index.js';
import { setEventModus, emit } from '../src/core/events.js';
import { EXIT, normalizeError, badInput } from '../src/core/errors.js';

const argv = process.argv.slice(2);

/** Flaggen-Parser: --key wert, --key=wert, --flagge, positionelle Argumente. */
function parse(args) {
  const flags = {};
  const pos = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('--')) {
      const [key, inline] = a.slice(2).split(/=(.*)/s);
      const name = key.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      if (inline !== undefined) flags[name] = inline;
      else if (args[i + 1] && !args[i + 1].startsWith('--')) flags[name] = args[++i];
      else flags[name] = true;
    } else pos.push(a);
  }
  return { flags, pos };
}

const { flags, pos } = parse(argv);
const befehl = pos[0] ?? 'help';
const alsJson = Boolean(flags.json);
const alsEvents = Boolean(flags.events);

setEventModus(alsEvents ? 'ndjson' : flags.still ? 'still' : 'lesbar');

const gemeinsam = {
  force: Boolean(flags.force),
  verbose: Boolean(flags.verbose),
  dryRun: Boolean(flags.dryRun),
  concurrency: flags.concurrency ? Number(flags.concurrency) : undefined,
};

const leadEingabe = () => ({
  url: typeof flags.url === 'string' ? flags.url : '',
  name: typeof flags.name === 'string' ? flags.name : '',
  ort: typeof flags.ort === 'string' ? flags.ort : '',
  telefon: typeof flags.telefon === 'string' ? flags.telefon : '',
  placeId: typeof flags.placeId === 'string' ? flags.placeId : '',
});

async function main() {
  switch (befehl) {
    case 'describe':
      return wb.describe();

    case 'discover':
      return wb.discover({
        was: flags.was, wo: flags.wo,
        radius: flags.radius, minRating: flags.minRating ? Number(flags.minRating) : undefined,
        limit: flags.limit ? Number(flags.limit) : undefined,
        nurOhneWebsite: Boolean(flags.nurOhneWebsite),
        out: typeof flags.out === 'string' ? flags.out : undefined,
      });

    case 'scan':
      return wb.scan(leadEingabe(), gemeinsam);

    case 'build':
      return wb.build(leadEingabe(), { ...gemeinsam, mitOutreach: Boolean(flags.mitOutreach) });

    case 'batch':
      return wb.batch(pos[1], { ...gemeinsam, deploy: Boolean(flags.deploy) });

    case 'stage':
      return wb.stage(pos[1], pos[2], gemeinsam);

    case 'list':
      return wb.list();

    case 'get':
      return wb.get(pos[1]);

    case 'deploy':
      return wb.deploy(pos[1]);

    case 'report':
      return { report: wb.report() };

    case 'playbooks':
      return wb.playbooks();

    case 'cleanup':
      return wb.aufraeumen({ dryRun: Boolean(flags.dryRun) });

    case 'help':
    case undefined:
      return hilfe();

    default:
      throw badInput(
        `Unbekannter Befehl "${befehl}".`,
        `Moeglich: ${wb.describe().befehle.map((b) => b.name).join(', ')}. Vollstaendig: wb describe --json`,
      );
  }
}

function hilfe() {
  const d = wb.describe();
  if (alsJson) return d;
  const zeilen = [
    '',
    '  wb — Prototyp-Fabrik fuer Schweizer KMU',
    '',
    '  Befehle:',
    ...d.befehle.map((b) => `    ${b.name.padEnd(11)} ${b.zweck}`),
    '',
    '  Globale Flaggen:',
    '    --json        Ergebnis als JSON auf stdout (fuer Skripte und KIs)',
    '    --events      NDJSON-Ereignisstrom statt Ergebnisobjekt',
    '    --force       Cache ignorieren, Stages erneut ausfuehren',
    '    --still       keine Fortschrittsausgabe',
    '    --verbose     Stacktraces bei Fehlern',
    '',
    '  Fuer andere KIs:  wb describe --json   ·   AGENTS.md lesen',
    '',
  ];
  process.stderr.write(zeilen.join('\n') + '\n');
  return null;
}

try {
  const ergebnis = await main();

  if (alsEvents) {
    // Im Ereignis-Modus ist der Strom die Ausgabe. Ergebnis als Abschlusszeile.
    process.stdout.write(JSON.stringify({ ts: new Date().toISOString(), typ: 'ergebnis', daten: ergebnis }) + '\n');
  } else if (alsJson) {
    process.stdout.write(JSON.stringify(ergebnis ?? {}, null, 2) + '\n');
  } else if (ergebnis != null) {
    process.stderr.write(menschenLesbar(befehl, ergebnis) + '\n');
  }

  // Teilerfolg im Batch ist kein Totalausfall, muss aber sichtbar sein.
  const teilweise = ergebnis?.fehlgeschlagen > 0;
  process.exit(teilweise ? EXIT.PARTIAL : EXIT.OK);
} catch (err) {
  const e = normalizeError(err);
  if (alsJson || alsEvents) {
    process.stdout.write(JSON.stringify({ error: e.toJSON() }, null, 2) + '\n');
  } else {
    process.stderr.write(`\n  ✗ ${e.message}\n`);
    if (e.hint) process.stderr.write(`    → ${e.hint}\n\n`);
  }
  if (flags.verbose) process.stderr.write(String(err?.stack ?? err) + '\n');
  process.exit(e.exit ?? EXIT.BAD_INPUT);
}

/** Ausgabe fuer Menschen. Landet auf stderr, damit stdout sauber bleibt. */
function menschenLesbar(befehl, r) {
  const balken = (n) => n == null ? '  –' : String(n).padStart(3);
  if (Array.isArray(r)) {
    if (!r.length) return '\n  (nichts vorhanden)\n';
    if (r[0]?.slug) {
      return '\n' + r.map((z) =>
        `  ${balken(z.scoreVorher)} → ${balken(z.scoreNachher)}  ${(z.branche ?? '?').padEnd(9)} ${(z.name ?? '').slice(0, 34).padEnd(36)} ${z.status}`,
      ).join('\n') + `\n\n  ${r.length} Leads\n`;
    }
    return '\n' + r.map((x) => '  ' + JSON.stringify(x)).join('\n') + '\n';
  }
  if (befehl === 'batch') {
    return `\n  ${r.erfolgreich}/${r.anzahl} Leads erfolgreich, ${r.fehlgeschlagen} fehlgeschlagen`
      + `\n  Uebersicht: ${r.report}\n`;
  }
  if (r?.slug) {
    const teile = [
      `\n  ${r.name}${r.ort ? ` · ${r.ort}` : ''}`,
      `  Branche: ${r.branche ?? 'unbekannt'}   KI-Sichtbarkeit: ${r.scoreVorher ?? '?'} → ${r.scoreNachher ?? '?'}`,
    ];
    if (r.befunde?.length) {
      teile.push('', '  Befunde:');
      for (const b of r.befunde.slice(0, 8)) teile.push(`    ${b.erfuellt ? '✓' : '✗'} ${b.text}`);
    }
    if (r.prototyp) teile.push('', `  Prototyp: ${r.prototyp}/index.html`);
    if (r.previewUrl) teile.push(`  Vorschau: ${r.previewUrl}`);
    return teile.join('\n') + '\n';
  }
  return '\n  ' + JSON.stringify(r) + '\n';
}

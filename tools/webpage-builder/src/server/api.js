#!/usr/bin/env node
/**
 * Cockpit-Server — die dritte Huelle um src/core/.
 *
 * Reines Node ohne Framework. Der Server hat drei Aufgaben:
 *   1. den Kern als JSON-API anbieten
 *   2. den Ereignisstrom als SSE weiterreichen (Live-Fortschritt im Batch)
 *   3. die fertigen Prototypen ausliefern, damit sie im iframe der
 *      Split-Ansicht direkt neben dem Screenshot der Altseite stehen
 *
 * Laeuft nur auf 127.0.0.1. Das Cockpit zeigt fremde Firmendaten und darf
 * unter keinen Umstaenden aus dem Netz erreichbar sein.
 */

import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname, normalize } from 'node:path';
import * as wb from '../core/index.js';
import { config } from '../core/config.js';
import { onEvent, setEventModus } from '../core/events.js';
import { normalizeError } from '../core/errors.js';
import { profilLaden, profilSpeichern } from '../core/profile.js';
import { deployStand } from '../lib/deploy.js';

setEventModus('still'); // Ereignisse gehen ueber SSE, nicht auf die Konsole

const PORT = Number(process.env.WB_COCKPIT_PORT ?? 4321);
const GUI_DIST = join(config.root, 'gui', 'dist');

const TYPEN = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml',
};

const json = (res, daten, status = 200) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(daten));
};

const fehler = (res, err) => {
  const e = normalizeError(err);
  json(res, { error: e.toJSON() }, e.exit === 3 ? 428 : 400);
};

async function koerper(req) {
  const teile = [];
  for await (const c of req) teile.push(c);
  const roh = Buffer.concat(teile).toString('utf8');
  return roh ? JSON.parse(roh) : {};
}

/**
 * Datei ausliefern, mit Schutz gegen Pfadausbruch.
 *
 * Zur Sicherheitslage, damit das niemand aus Versehen aufweicht: Der erste
 * Riegel liegt bereits vor dieser Funktion. `new URL(req.url, …)` decodiert
 * Prozent-Sequenzen und normalisiert den Pfad, bevor irgendein Vergleich
 * stattfindet — aus "/bild/%2e%2e/%2e%2e/package.json" wird "/package.json",
 * aus "/vorschau/../../.env" wird "/.env". Beide erreichen die Praefix-Zweige
 * gar nicht mehr und landen im normalen 404- beziehungsweise SPA-Zweig.
 *
 * Die Pruefung hier ist der zweite Riegel fuer den Fall, dass die Pfade
 * kuenftig aus einer anderen Quelle als der URL stammen.
 */
function datei(res, wurzel, relativ) {
  const pfad = join(wurzel, normalize(relativ).replace(/^(\.\.[/\\])+/, ''));
  if (!pfad.startsWith(wurzel) || !existsSync(pfad) || !statSync(pfad).isFile()) return false;
  res.writeHead(200, {
    'Content-Type': TYPEN[extname(pfad)] ?? 'application/octet-stream',
    'Cache-Control': 'no-store',
    // Auch lokal: eine Vorschau darf nirgends indexiert werden.
    'X-Robots-Tag': 'noindex, nofollow',
  });
  res.end(readFileSync(pfad));
  return true;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const pfad = url.pathname;

  try {
    // ── Ereignisstrom ────────────────────────────────────────────────────
    if (pfad === '/api/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });
      res.write(': verbunden\n\n');
      const ab = onEvent((ev) => res.write(`data: ${JSON.stringify(ev)}\n\n`));
      const puls = setInterval(() => res.write(': puls\n\n'), 25000);
      req.on('close', () => { ab(); clearInterval(puls); });
      return;
    }

    // ── Zustand ──────────────────────────────────────────────────────────
    if (pfad === '/api/state') {
      return json(res, {
        leads: wb.list(),
        faehigkeiten: wb.capabilities(),
        playbooks: wb.playbooks(),
        deploy: deployStand(),
        absender: { name: config.senderName, mail: config.senderMail },
      });
    }

    if (pfad.startsWith('/api/lead/')) {
      const [, , , slug, unterpfad] = pfad.split('/');

      if (req.method === 'GET' && !unterpfad) return json(res, wb.get(slug));

      // Texte im Cockpit korrigieren und sofort neu rendern. Der haeufigste
      // Eingriff vor dem Versand: ein Satz stimmt nicht ganz.
      if (req.method === 'PATCH' && unterpfad === 'copy') {
        const { copy } = await koerper(req);
        const profil = profilLaden(slug);
        if (!profil) throw new Error(`Kein Lead "${slug}".`);
        profil.copy = { ...profil.copy, ...copy, _quelle: 'cockpit' };
        profilSpeichern(profil);
        await wb.stage(slug, 'render');
        return json(res, wb.get(slug));
      }

      // Playbook oder Theme umschalten und neu bauen — die schnellste Art
      // herauszufinden, welcher Aufbau fuer diesen Betrieb passt.
      if (req.method === 'POST' && unterpfad === 'playbook') {
        const { playbook } = await koerper(req);
        const profil = profilLaden(slug);
        if (!profil) throw new Error(`Kein Lead "${slug}".`);
        profil.klassifikation = {
          ...profil.klassifikation,
          playbook,
          sicherheit: 'manuell',
          begruendung: 'Im Cockpit von Hand gesetzt.',
        };
        profilSpeichern(profil);
        await wb.stage(slug, 'render');
        await wb.stage(slug, 'verify');
        return json(res, wb.get(slug));
      }
    }

    // ── Aktionen ─────────────────────────────────────────────────────────
    if (req.method === 'POST') {
      const b = await koerper(req);
      if (pfad === '/api/scan') return json(res, await wb.scan(b, { force: b.force }));
      if (pfad === '/api/build') return json(res, await wb.build(b, { force: b.force, mitOutreach: true }));
      if (pfad === '/api/batch') return json(res, await wb.batch(b.csv, { concurrency: b.concurrency, deploy: b.deploy }));
      if (pfad === '/api/discover') return json(res, await wb.discover(b));
      if (pfad === '/api/stage') return json(res, await wb.stage(b.slug, b.stage, { force: true }));
      if (pfad === '/api/deploy') return json(res, await wb.deploy(b.slug));
      if (pfad === '/api/cleanup') return json(res, await wb.aufraeumen({ dryRun: b.dryRun }));
    }

    // ── Prototypen und Screenshots ausliefern ────────────────────────────
    //
    // Diese beiden Praefixe fallen bewusst NICHT auf die Oberflaeche zurueck.
    // Sonst beantwortet der Server einen Pfadausbruchsversuch mit 200 und der
    // Auslieferungsdatei der Oberflaeche — technisch harmlos, aber es
    // verschleiert, ob die Absicherung ueberhaupt greift.
    for (const [praefix, wurzel] of [['/vorschau/', config.outDir], ['/bild/', config.dataDir]]) {
      if (!pfad.startsWith(praefix)) continue;
      if (datei(res, wurzel, pfad.slice(praefix.length))) return;
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Nicht gefunden');
    }

    // ── Oberflaeche ──────────────────────────────────────────────────────
    if (existsSync(GUI_DIST)) {
      if (datei(res, GUI_DIST, pfad === '/' ? 'index.html' : pfad)) return;
      if (datei(res, GUI_DIST, 'index.html')) return; // Client-Routing
    }

    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!doctype html><meta charset="utf-8"><title>Cockpit</title>
<body style="font:16px/1.6 system-ui;max-width:44rem;margin:4rem auto;padding:0 1.5rem">
<h1>Cockpit-Oberflaeche noch nicht gebaut</h1>
<p>Die API laeuft bereits auf Port ${PORT}. Fuer die Oberflaeche einmalig:</p>
<pre style="background:#f4f6f8;padding:1rem;border-radius:8px">npm install
npm run gui:build</pre>
<p>Waehrend der Entwicklung stattdessen <code>npm run gui:dev</code> in einem zweiten Terminal.</p>
<p>API-Endpunkte: <a href="/api/state">/api/state</a> · /api/events (SSE)</p>
</body>`);
  } catch (err) {
    fehler(res, err);
  }
});

// Ausschliesslich lokal. Das Cockpit zeigt fremde Firmendaten und Vorschauen,
// die niemand ausser Simon sehen soll.
server.listen(PORT, '127.0.0.1', () => {
  process.stderr.write(`\n  Cockpit: http://127.0.0.1:${PORT}\n\n`);
});

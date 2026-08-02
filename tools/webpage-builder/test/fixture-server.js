/**
 * Fixture-Server fuer die Ende-zu-Ende-Pruefung.
 *
 *   node test/fixture-server.js
 *   node bin/wb.js batch test/leads.test.csv --concurrency 3
 *
 * Die vier Fixtures unter test/fixture/ bilden je einen realistisch schlechten
 * Auftritt der vier Branchen ab. Sie sind die einzige Moeglichkeit, die
 * Pipeline zu pruefen, ohne fremde Server anzufassen — und sie bleiben
 * unveraendert, waehrend echte Websites sich staendig aendern.
 */

import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const WURZEL = join(dirname(fileURLToPath(import.meta.url)), 'fixture');
const PORT = Number(process.env.WB_FIXTURE_PORT ?? 8099);

const TYPEN = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg' };

createServer((req, res) => {
  let pfad = decodeURIComponent(req.url.split('?')[0]);
  if (pfad.endsWith('/')) pfad += 'index.html';
  const datei = join(WURZEL, pfad);

  // Pfadausbruch verhindern
  if (!datei.startsWith(WURZEL) || !existsSync(datei)) {
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<html><body><h1>404 — Seite nicht gefunden</h1></body></html>');
    return;
  }

  res.writeHead(200, { 'Content-Type': TYPEN[extname(datei)] ?? 'application/octet-stream' });
  res.end(readFileSync(datei));
}).listen(PORT, '127.0.0.1', () => {
  process.stderr.write(`Fixtures auf http://127.0.0.1:${PORT}/ (kfz, gastro, handwerk, beauty)\n`);
});

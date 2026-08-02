#!/usr/bin/env node
/**
 * MCP-Server — die zweite Huelle um src/core/.
 *
 * Damit steuert Claude Code die Fabrik als normale Tool-Calls statt ueber
 * Shell-Aufrufe: keine Argumentzeichenketten, keine Ausgabe-Parserei,
 * getypte Eingaben.
 *
 * Der Server enthaelt bewusst keine eigene Logik. Jedes Tool ist eine
 * Weiterleitung. Steht hier jemals eine Fallunterscheidung, die es in der
 * CLI nicht gibt, driften die beiden Gesichter auseinander — und genau das
 * soll die Architektur verhindern.
 *
 * Einrichten in Claude Code:
 *   claude mcp add prototyp-fabrik -- node /pfad/zu/tools/webpage-builder/src/mcp/server.js
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

import * as wb from '../core/index.js';
import { setEventModus } from '../core/events.js';
import { normalizeError } from '../core/errors.js';

// Ueber stdio laeuft das MCP-Protokoll — jede Fortschrittsausgabe wuerde es
// zerstoeren. Ereignisse gehen deshalb an niemanden.
setEventModus('still');

const TOOLS = [
  {
    name: 'wb_describe',
    description: 'Selbstauskunft der Prototyp-Fabrik: alle Faehigkeiten, Stages, Playbooks und welche API-Keys aktuell vorhanden sind. Bei Unsicherheit immer zuerst aufrufen.',
    inputSchema: { type: 'object', properties: {} },
    run: () => wb.describe(),
  },
  {
    name: 'wb_discover',
    description: 'Findet Betriebe per Google-Places-Umkreissuche und schreibt sie als CSV. Sortiert nach Verkaufswahrscheinlichkeit: Betriebe ohne Website zuerst, danach gut bewertete mit schwachem Auftritt. Bereits bekannte Betriebe werden uebersprungen.',
    inputSchema: {
      type: 'object',
      properties: {
        was: { type: 'string', description: 'Branche oder Suchbegriff, z.B. "KFZ-Werkstatt"' },
        wo: { type: 'string', description: 'Ort oder Region, z.B. "Luzern" oder "Innerschweiz"' },
        radius: { type: 'string', description: 'Umkreis, z.B. "25km". Optional.' },
        minRating: { type: 'number', description: 'Mindest-Google-Bewertung, z.B. 4.0. Optional.' },
        limit: { type: 'number', description: 'Hoechstzahl Leads (Vorgabe 60, maximal 200).' },
        nurOhneWebsite: { type: 'boolean', description: 'Nur Betriebe ohne hinterlegte Website.' },
      },
      required: ['was', 'wo'],
    },
    run: (a) => wb.discover(a),
  },
  {
    name: 'wb_scan',
    description: 'Analysiert die bestehende Website eines Betriebs und berechnet den KI-Sichtbarkeits-Score (0-100). Baut noch keinen Prototyp — schnell und guenstig. Liefert die konkreten Befunde, die im Verkaufsgespraech verwendet werden.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Website des Betriebs' },
        name: { type: 'string', description: 'Name des Betriebs. Ohne URL erforderlich.' },
        ort: { type: 'string', description: 'Ortschaft — verbessert die Google-Zuordnung.' },
        force: { type: 'boolean', description: 'Cache ignorieren und neu erheben.' },
      },
    },
    run: (a) => wb.scan(a, { force: a.force }),
  },
  {
    name: 'wb_build',
    description: 'Kompletter Durchlauf bis zum fertigen Prototyp in out/<slug>/index.html: Website auslesen, Google-Daten holen, Branche bestimmen, Texte schreiben, Bilder aufbereiten, Seite bauen und gegenpruefen.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string' },
        name: { type: 'string' },
        ort: { type: 'string' },
        telefon: { type: 'string' },
        force: { type: 'boolean', description: 'Alle Stages erneut ausfuehren (kostet erneut API-Gebuehren).' },
        mitOutreach: { type: 'boolean', description: 'Zusaetzlich den Mail-Entwurf erzeugen.' },
      },
    },
    run: (a) => wb.build(a, { force: a.force, mitOutreach: a.mitOutreach }),
  },
  {
    name: 'wb_batch',
    description: 'Verarbeitet viele Leads aus einer CSV (Spalten: name, url, ort, telefon). Ein fehlgeschlagener Lead stoppt den Lauf nicht. Erzeugt am Ende die Uebersichtsseite out/_report.html.',
    inputSchema: {
      type: 'object',
      properties: {
        csv: { type: 'string', description: 'Pfad zur CSV-Datei' },
        concurrency: { type: 'number', description: 'Parallel verarbeitete Leads (Vorgabe 3).' },
        deploy: { type: 'boolean', description: 'Fertige Prototypen direkt auf den Vorschau-Server schieben.' },
      },
      required: ['csv'],
    },
    run: (a) => wb.batch(a.csv, { concurrency: a.concurrency, deploy: a.deploy }),
  },
  {
    name: 'wb_stage',
    description: 'Fuehrt eine einzelne Stage erneut aus — etwa "render" nach einer Textkorrektur oder "copy" fuer neue Texte. Stage-IDs: scrape, places, classify, audit, copy, images, render, verify, outreach.',
    inputSchema: {
      type: 'object',
      properties: {
        slug: { type: 'string', description: 'Slug des Leads (aus wb_list).' },
        stage: { type: 'string', description: 'Stage-ID' },
      },
      required: ['slug', 'stage'],
    },
    run: (a) => wb.stage(a.slug, a.stage),
  },
  {
    name: 'wb_list',
    description: 'Alle bekannten Leads mit Score vorher/nachher, Branche und Status.',
    inputSchema: { type: 'object', properties: {} },
    run: () => wb.list(),
  },
  {
    name: 'wb_get',
    description: 'Vollstaendiges Profil eines Leads: alle erhobenen Daten, Befunde, erzeugte Texte und der Status jeder Stage.',
    inputSchema: {
      type: 'object',
      properties: { slug: { type: 'string' } },
      required: ['slug'],
    },
    run: (a) => wb.get(a.slug),
  },
  {
    name: 'wb_deploy',
    description: 'Schiebt einen fertigen Prototyp auf den Vorschau-Server und liefert die teilbare URL zurueck.',
    inputSchema: {
      type: 'object',
      properties: { slug: { type: 'string' } },
      required: ['slug'],
    },
    run: (a) => wb.deploy(a.slug),
  },
  {
    name: 'wb_outreach_draft',
    description: 'Erzeugt Betreff, Mailtext und Vorher/Nachher-Bild fuer einen Lead. Verschickt nichts — das Absenden bleibt eine menschliche Entscheidung.',
    inputSchema: {
      type: 'object',
      properties: { slug: { type: 'string' } },
      required: ['slug'],
    },
    run: async (a) => {
      const r = await wb.stage(a.slug, 'outreach');
      return wb.get(a.slug).outreach ?? r;
    },
  },
  {
    name: 'wb_playbooks',
    description: 'Verfuegbare Branchen-Playbooks mit ihrem Seitenaufbau. Eine neue Branche entsteht durch eine neue YAML-Datei in playbooks/ — ohne Codeaenderung.',
    inputSchema: { type: 'object', properties: {} },
    run: () => wb.playbooks(),
  },
  {
    name: 'wb_report',
    description: 'Erzeugt die Uebersichtsseite out/_report.html mit Score-Tabelle und Vorher/Nachher-Bildern neu.',
    inputSchema: { type: 'object', properties: {} },
    run: () => ({ report: wb.report() }),
  },
  {
    name: 'wb_cleanup',
    description: 'Entfernt abgelaufene Vorschauen lokal und auf dem Server. Mit dryRun nur anzeigen, was entfernt wuerde.',
    inputSchema: {
      type: 'object',
      properties: { dryRun: { type: 'boolean' } },
    },
    run: (a) => wb.aufraeumen({ dryRun: a.dryRun }),
  },
];

const server = new Server(
  { name: 'prototyp-fabrik', version: '1.0.0' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const tool = TOOLS.find((t) => t.name === req.params.name);
  if (!tool) {
    return {
      isError: true,
      content: [{ type: 'text', text: JSON.stringify({ error: { code: 'UNBEKANNTES_TOOL', message: `Kein Tool "${req.params.name}".`, hint: `Verfuegbar: ${TOOLS.map((t) => t.name).join(', ')}` } }) }],
    };
  }

  try {
    const ergebnis = await tool.run(req.params.arguments ?? {});
    return { content: [{ type: 'text', text: JSON.stringify(ergebnis, null, 2) }] };
  } catch (err) {
    // Dasselbe Fehlerformat wie in der CLI, inklusive hint — der Aufrufer
    // soll ohne Zusatzwissen wissen, was zu tun ist.
    const e = normalizeError(err);
    return { isError: true, content: [{ type: 'text', text: JSON.stringify({ error: e.toJSON() }, null, 2) }] };
  }
});

await server.connect(new StdioServerTransport());
process.stderr.write('Prototyp-Fabrik MCP-Server bereit\n');

/**
 * Claude-API-Anbindung.
 *
 * Nur ein Aufruf pro Lead, der saemtliche Sektionstexte auf einmal erzeugt.
 * Ein Aufruf pro Sektion waere teurer, langsamer und — entscheidend — die
 * Texte wuerden nicht zusammenpassen, weil jeder Aufruf den anderen nicht kennt.
 */

import { config, requireKey } from '../core/config.js';
import { networkError, WbError, EXIT } from '../core/errors.js';

let client = null;

async function sdk() {
  if (client) return client;
  requireKey('anthropicKey');
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  client = new Anthropic({ apiKey: config.anthropicKey });
  return client;
}

/**
 * Fordert JSON an und gibt es geparst zurueck.
 *
 * Das Modell bekommt eine vorgefuellte Antwort ("{") mit auf den Weg — damit
 * kann es gar nicht erst mit "Gerne! Hier ist..." anfangen. Spart Tokens und
 * macht das Parsen zuverlaessig.
 */
export async function jsonAnfrage({ system, prompt, maxTokens = 4000, temperatur = 0.7 }) {
  const c = await sdk();

  let antwort;
  try {
    antwort = await c.messages.create({
      model: config.model,
      max_tokens: maxTokens,
      temperature: temperatur,
      system,
      messages: [
        { role: 'user', content: prompt },
        { role: 'assistant', content: '{' },
      ],
    });
  } catch (err) {
    const status = err?.status ?? 0;
    if (status === 401) {
      throw new WbError('MISSING_KEY', 'Claude API lehnt den Schluessel ab (401).',
        'ANTHROPIC_API_KEY in .env pruefen.', EXIT.MISSING_KEY);
    }
    if (status === 429 || status >= 500) {
      throw networkError(`Claude API nicht verfuegbar (${status}): ${err.message}`,
        'Kurz warten und erneut aufrufen — erledigte Stages sind gecacht.');
    }
    throw networkError(`Claude API Fehler: ${err.message}`);
  }

  const text = '{' + (antwort.content ?? []).filter((b) => b.type === 'text').map((b) => b.text).join('');

  try {
    return JSON.parse(text);
  } catch {
    // Manchmal haengt Fliesstext hinten dran. Den aeussersten JSON-Block herausschneiden.
    const start = text.indexOf('{');
    const ende = text.lastIndexOf('}');
    if (start >= 0 && ende > start) {
      try { return JSON.parse(text.slice(start, ende + 1)); } catch { /* faellt durch */ }
    }
    throw new WbError('COPY_PARSE',
      'Antwort der Copy-Generierung war kein gueltiges JSON.',
      'Mit --force erneut versuchen. Bleibt es dabei, ist das Playbook-Briefing zu lang oder widerspruechlich.',
      EXIT.BAD_INPUT);
  }
}

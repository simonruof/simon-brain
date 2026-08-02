/**
 * Stage 04 — KI-Sichtbarkeits-Score der Bestandsseite.
 *
 * Ab hier ist ein Lead schon verkaufbar, auch ohne dass je ein Prototyp
 * gebaut wird: Der Analyse-Report allein oeffnet Tueren.
 *
 * PageSpeed Insights wird abgefragt, wenn erreichbar — der Wert ist von
 * Google selbst, was ihn im Gespraech unangreifbar macht. Faellt die API
 * aus, greift die eigene Ladezeitmessung.
 */

import { config } from '../core/config.js';
import { emit } from '../core/events.js';
import { bewerte, groessteLuecken } from '../lib/scoring.js';

async function pagespeed(url) {
  const params = new URLSearchParams({ url, strategy: 'mobile', category: 'performance' });
  if (config.pagespeedKey) params.set('key', config.pagespeedKey);
  try {
    const res = await fetch(
      `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params}`,
      { signal: AbortSignal.timeout(45000) },
    );
    if (!res.ok) return null;
    const d = await res.json();
    const lh = d.lighthouseResult;
    if (!lh) return null;
    const audit = (id) => lh.audits?.[id]?.numericValue ?? null;
    return {
      mobilScore: Math.round((lh.categories?.performance?.score ?? 0) * 100),
      lcpMs: audit('largest-contentful-paint'),
      clsWert: audit('cumulative-layout-shift'),
      tbtMs: audit('total-blocking-time'),
      gemessenAm: new Date().toISOString(),
    };
  } catch {
    // PageSpeed ist ohne Key stark limitiert und faellt oft aus. Kein Beinbruch.
    return null;
  }
}

export default {
  id: 'audit',
  titel: 'KI-Sichtbarkeit der Bestandsseite messen',

  braucht() { return null; }, // laeuft immer — auch "keine Seite" ist ein Befund

  async run(profil, opts = {}) {
    let psi = null;
    if (profil.scrape?.finalUrl && !opts.ohnePagespeed) {
      psi = await pagespeed(profil.scrape.finalUrl);
      if (psi) emit('info', { lead: profil.slug, text: `PageSpeed mobil: ${psi.mobilScore}/100` });
    }

    const ergebnis = bewerte({
      scrape: profil.scrape,
      places: profil.places,
      pagespeed: psi,
      hinweis: profil.scrapeHinweis,
    });

    profil.auditVorher = {
      ...ergebnis,
      pagespeed: psi,
      luecken: groessteLuecken(ergebnis, 3),
      gemessenAm: new Date().toISOString(),
    };

    const offen = ergebnis.befunde.filter((b) => !b.erfuellt).length;
    emit('info', {
      lead: profil.slug,
      text: `KI-Sichtbarkeit ${ergebnis.score}/100 (${ergebnis.note}) · ${offen} von ${ergebnis.befunde.length} Kriterien nicht erfuellt`,
    });
  },
};

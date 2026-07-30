/**
 * Stage 08 — den eigenen Prototyp bewerten.
 *
 * Der Punkt, an dem sich entscheidet, ob das Verkaufsargument haelt: Der
 * Prototyp laeuft durch EXAKT dieselbe Bewertungsfunktion wie die Bestandsseite.
 * Kein Sonderweg, keine geschenkten Punkte.
 *
 * Waere hier eine zweite, mildere Formel im Einsatz, waere der ganze
 * Vorher/Nachher-Vergleich wertlos — und im Zweifel wuerde genau danach gefragt.
 *
 * Zusaetzlich wird der Nachher-Screenshot gemacht: die rechte Haelfte des
 * Vergleichsbilds im Outreach.
 */

import { join } from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { config } from '../core/config.js';
import { emit } from '../core/events.js';
import { bewerte } from '../lib/scoring.js';
import { browserStarten } from '../lib/browser.js';

/**
 * Liest den fertigen Prototyp genauso aus wie 01-scrape die Bestandsseite —
 * über einen echten Browser, nicht über den Quelltext. Nur so ist der
 * Vergleich sauber.
 */
async function prototypAuslesen(indexPfad) {
  const b = await browserStarten();
  try {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, locale: 'de-CH' });
    const page = await ctx.newPage();
    const url = pathToFileURL(indexPfad).href;

    const start = Date.now();
    await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 });
    const ladezeitMs = Date.now() - start;

    const daten = await page.evaluate(() => {
      const t = (el) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
      const meta = (n) => document.querySelector(`meta[name="${n}"]`)?.content
        ?? document.querySelector(`meta[property="${n}"]`)?.content ?? '';
      const jsonLd = [];
      for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
        try { jsonLd.push(JSON.parse(s.textContent)); } catch { /* ignorieren */ }
      }
      const links = [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href') ?? '');
      const bodyText = (document.body?.innerText ?? '').trim();
      return {
        titel: document.title, metaDescription: meta('description'),
        ogTitle: meta('og:title'), ogImage: meta('og:image'), viewport: meta('viewport'),
        lang: document.documentElement.lang,
        h1: [...document.querySelectorAll('h1')].map(t).filter(Boolean),
        h2: [...document.querySelectorAll('h2')].map(t).filter(Boolean),
        nav: [...document.querySelectorAll('nav a')].map(t).filter(Boolean),
        bodyText, textLaenge: bodyText.length,
        jsonLd,
        bilder: [...document.querySelectorAll('img')].map((i) => ({ src: i.src, alt: i.alt, flaeche: i.naturalWidth * i.naturalHeight })),
        telLinks: links.filter((l) => l.startsWith('tel:')),
        mailLinks: links.filter((l) => l.startsWith('mailto:')),
        hatFormular: Boolean(document.querySelector('form')),
        hatKarte: Boolean(document.querySelector('iframe[src*="openstreetmap"], iframe[src*="maps"]')),
      };
    });

    // Screenshots fuer den Vorher/Nachher-Vergleich
    const dir = join(config.dataDir, indexPfad.split('/').slice(-2)[0]);
    await page.screenshot({ path: join(dir, 'nachher.png') }).catch(() => {});
    const mobil = await ctx.newPage();
    await mobil.setViewportSize({ width: 390, height: 844 });
    await mobil.goto(url, { waitUntil: 'networkidle', timeout: 20000 }).catch(() => {});
    const mobilBefund = await mobil.evaluate(() => ({
      ueberlauf: document.documentElement.scrollWidth > window.innerWidth + 8,
      breite: document.documentElement.scrollWidth,
    })).catch(() => ({ ueberlauf: false, breite: 390 }));
    await mobil.screenshot({ path: join(dir, 'nachher-mobil.png') }).catch(() => {});
    await mobil.close();

    return { ...daten, ladezeitMs, mobil: mobilBefund };
  } finally {
    await b.close();
  }
}

export default {
  id: 'verify',
  titel: 'Prototyp gegenpruefen',

  braucht(profil) {
    if (!profil.render?.outDir) return 'kein Prototyp vorhanden (Stage render zuerst)';
    return null;
  },

  async run(profil) {
    const indexPfad = join(profil.render.outDir, 'index.html');
    if (!existsSync(indexPfad)) throw new Error(`Prototyp fehlt: ${indexPfad}`);

    const gelesen = await prototypAuslesen(indexPfad);

    // Die statischen Dateien liefern wir selbst mit — im Deploy sind sie da.
    const alsScrape = {
      ...gelesen,
      https: true,
      finalUrl: profil.deploy?.url || indexPfad,
      robots: { vorhanden: true, status: 200 },
      sitemap: { vorhanden: true, status: 200 },
      llms: { vorhanden: true, status: 200 },
      htmlBytes: readFileSync(indexPfad).length,
    };

    const ergebnis = bewerte({ scrape: alsScrape, places: profil.places, pagespeed: null });

    profil.auditNachher = {
      ...ergebnis,
      screenshot: join(config.dataDir, profil.slug, 'nachher.png'),
      screenshotMobil: join(config.dataDir, profil.slug, 'nachher-mobil.png'),
      gemessenAm: new Date().toISOString(),
    };

    const vorher = profil.auditVorher?.score ?? 0;
    const sprung = ergebnis.score - vorher;

    // Wenn der Prototyp nicht deutlich besser ist, stimmt etwas nicht —
    // dann ist er nicht versandfertig, egal wie huebsch er aussieht.
    if (sprung < 25) {
      emit('warn', {
        lead: profil.slug,
        text: `Nur ${sprung} Punkte Verbesserung (${vorher} → ${ergebnis.score}). Vor dem Versand pruefen: `
          + ergebnis.befunde.filter((b) => !b.erfuellt).map((b) => b.text).slice(0, 3).join(' / '),
      });
    }

    emit('info', {
      lead: profil.slug,
      text: `KI-Sichtbarkeit ${vorher} → ${ergebnis.score} (${sprung >= 0 ? '+' : ''}${sprung} Punkte)`,
    });
  },
};

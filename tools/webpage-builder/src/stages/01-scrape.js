/**
 * Stage 01 — Bestandsseite auslesen.
 *
 * Zwei Aufgaben, die oft verwechselt werden:
 *
 *   Beweise sammeln — was ist technisch schlecht? Das fuettert den Score
 *   und damit das Verkaufsgespraech.
 *
 *   Rohstoff sammeln — echte Texte, echte Bilder, echte Kontaktdaten. Ohne
 *   die wirkt der Prototyp wie eine Vorlage, und Vorlagen verkaufen nicht.
 *
 * Der Screenshot der Altseite ist spaeter die linke Haelfte des
 * Vorher/Nachher-Bilds im Outreach.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { config } from '../core/config.js';
import { networkError } from '../core/errors.js';
import { emit } from '../core/events.js';
import { browserStarten } from '../lib/browser.js';
import { kontaktdaten } from '../lib/extract.js';

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';

function normalisiereUrl(url) {
  let u = String(url).trim();
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  return u;
}

export default {
  id: 'scrape',
  titel: 'Bestandsseite auslesen',
  brauchtText: 'eine URL',

  braucht(profil) {
    if (!profil.eingabe.url && !profil.places?.website) {
      return 'keine URL vorhanden (Betrieb ohne Website — Prototyp wird rein aus Places-Daten gebaut)';
    }
    return null;
  },

  async run(profil) {
    const url = normalisiereUrl(profil.eingabe.url || profil.places.website);
    const dir = join(config.dataDir, profil.slug);
    mkdirSync(dir, { recursive: true });

    const b = await browserStarten();
    try {
      const ctx = await b.newContext({
        userAgent: UA,
        viewport: { width: 1440, height: 900 },
        locale: 'de-CH',
        ignoreHTTPSErrors: true,
      });
      const page = await ctx.newPage();

      // Antwort-Kopfzeilen mitschneiden: HTTPS, Weiterleitungen, X-Robots-Tag
      const netz = { statusCode: 0, finalUrl: '', headers: {}, redirects: 0 };
      page.on('response', (res) => {
        if (res.url() === page.url() || !netz.statusCode) {
          netz.statusCode = res.status();
          netz.headers = res.headers();
        }
      });

      const start = Date.now();
      let antwort;
      try {
        antwort = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      } catch (err) {
        throw networkError(
          `Seite ${url} nicht erreichbar: ${err.message}`,
          'URL pruefen. Wenn der Betrieb wirklich keine erreichbare Seite hat, ist das selbst ein Verkaufsargument — build laeuft auch ohne scrape weiter.',
        );
      }
      const ladezeitMs = Date.now() - start;

      netz.statusCode = antwort?.status() ?? netz.statusCode;
      netz.finalUrl = page.url();
      netz.headers = antwort?.headers() ?? netz.headers;

      // Fehlerseite: Ohne diese Pruefung wird die 404-Seite des Servers als
      // Inhalt des Betriebs verarbeitet — mit Ueberschriften wie "Error
      // response" im Prototyp. Aufgefallen im ersten Batch-Lauf.
      //
      // Kein Abbruch, sondern ein Befund: Eine tote Website ist geschaeftlich
      // der beste Lead, den es gibt. Der Prototyp entsteht dann allein aus
      // den Google-Daten, und der Score der Bestandsseite ist zu Recht 0.
      if (netz.statusCode >= 400) {
        profil.scrape = null;
        profil.scrapeHinweis = {
          statusCode: netz.statusCode,
          url,
          text: `Die Website antwortet mit HTTP ${netz.statusCode} — sie ist faktisch nicht erreichbar.`,
          geprueftAm: new Date().toISOString(),
        };
        emit('warn', {
          lead: profil.slug,
          text: `HTTP ${netz.statusCode} — keine nutzbare Website. Starker Lead: der Betrieb hat online praktisch nichts.`,
        });
        return;
      }

      // Kurz warten, damit nachgeladene Inhalte da sind — aber nicht ewig.
      await page.waitForTimeout(1200);

      const daten = await page.evaluate(() => {
        const t = (el) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
        const meta = (n) =>
          document.querySelector(`meta[name="${n}"]`)?.content
          ?? document.querySelector(`meta[property="${n}"]`)?.content ?? '';

        const bodyText = (document.body?.innerText ?? '').replace(/\n{3,}/g, '\n\n').trim();

        // JSON-LD ist das entscheidende Kriterium fuer maschinelle Lesbarkeit
        const jsonLd = [];
        for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
          try { jsonLd.push(JSON.parse(s.textContent)); } catch { /* kaputtes JSON-LD zaehlt als keins */ }
        }

        const bilder = [...document.querySelectorAll('img')]
          .map((i) => ({
            src: i.currentSrc || i.src,
            alt: i.alt ?? '',
            breite: i.naturalWidth,
            hoehe: i.naturalHeight,
            flaeche: i.naturalWidth * i.naturalHeight,
          }))
          .filter((i) => i.src && !i.src.startsWith('data:') && i.flaeche > 40000)
          .sort((a, b) => b.flaeche - a.flaeche)
          .slice(0, 25);

        // Hintergrundbilder aus CSS — dort steckt oft das beste Motiv
        for (const el of [...document.querySelectorAll('*')].slice(0, 600)) {
          const bg = getComputedStyle(el).backgroundImage;
          const m = bg?.match(/url\(["']?(https?:\/\/[^"')]+)/);
          if (m && bilder.length < 30) bilder.push({ src: m[1], alt: '', breite: 0, hoehe: 0, flaeche: 0, hintergrund: true });
        }

        const links = [...document.querySelectorAll('a[href]')].map((a) => a.href);
        const sozial = {};
        for (const [name, re] of Object.entries({
          facebook: /facebook\.com/i, instagram: /instagram\.com/i, linkedin: /linkedin\.com/i,
          youtube: /youtube\.com|youtu\.be/i, tiktok: /tiktok\.com/i,
        })) {
          const treffer = links.find((l) => re.test(l));
          if (treffer) sozial[name] = treffer;
        }

        const nav = [...document.querySelectorAll('nav a, header a')]
          .map((a) => t(a)).filter((x) => x && x.length < 30).slice(0, 15);

        return {
          titel: document.title ?? '',
          metaDescription: meta('description'),
          ogTitle: meta('og:title'),
          ogImage: meta('og:image'),
          viewport: meta('viewport'),
          lang: document.documentElement.lang ?? '',
          h1: [...document.querySelectorAll('h1')].map(t).filter(Boolean),
          h2: [...document.querySelectorAll('h2')].map(t).filter(Boolean).slice(0, 25),
          h3: [...document.querySelectorAll('h3')].map(t).filter(Boolean).slice(0, 30),
          bodyText: bodyText.slice(0, 18000),
          textLaenge: bodyText.length,
          jsonLd,
          bilder,
          sozial,
          nav,
          telLinks: links.filter((l) => l.startsWith('tel:')).map((l) => decodeURIComponent(l.slice(4))),
          mailLinks: links.filter((l) => l.startsWith('mailto:')).map((l) => decodeURIComponent(l.slice(7))),
          anzahlLinks: links.length,
          hatFormular: Boolean(document.querySelector('form')),
          hatKarte: Boolean(document.querySelector('iframe[src*="google.com/maps"], iframe[src*="openstreetmap"], .map, #map')),
          // Baukasten/CMS-Erkennung — sagt viel ueber Budget und Ansprechbarkeit
          generator: meta('generator'),
          hatJquery: Boolean(window.jQuery),
          anzahlScripts: document.querySelectorAll('script').length,
          anzahlStylesheets: document.querySelectorAll('link[rel="stylesheet"]').length,
          domKnoten: document.querySelectorAll('*').length,
        };
      });

      // Mobil-Tauglichkeit: bei fehlendem Viewport laeuft der Inhalt seitlich raus
      const mobil = await ctx.newPage();
      await mobil.setViewportSize({ width: 390, height: 844 });
      let mobilBefund = { ueberlauf: false, breite: 0 };
      try {
        await mobil.goto(netz.finalUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await mobil.waitForTimeout(800);
        mobilBefund = await mobil.evaluate(() => ({
          ueberlauf: document.documentElement.scrollWidth > window.innerWidth + 8,
          breite: document.documentElement.scrollWidth,
        }));
        await mobil.screenshot({ path: join(dir, 'vorher-mobil.png') });
      } catch { /* Mobil-Ansicht ist nice-to-have, kein Grund zu scheitern */ }
      await mobil.close();

      await page.screenshot({ path: join(dir, 'vorher.png'), fullPage: false });
      await page.screenshot({ path: join(dir, 'vorher-voll.png'), fullPage: true }).catch(() => {});

      // robots.txt, sitemap.xml und llms.txt — Bausteine der Auffindbarkeit
      const basis = new URL(netz.finalUrl).origin;
      const pruefe = async (pfad) => {
        try {
          const r = await fetch(basis + pfad, { redirect: 'follow', signal: AbortSignal.timeout(8000) });
          return { vorhanden: r.ok, status: r.status };
        } catch { return { vorhanden: false, status: 0 }; }
      };
      const [robots, sitemap, llms] = await Promise.all([
        pruefe('/robots.txt'), pruefe('/sitemap.xml'), pruefe('/llms.txt'),
      ]);

      const html = await page.content();
      writeFileSync(join(dir, 'vorher.html'), html);

      // Kontaktdaten aus dem Fliesstext ziehen. Auf alten KMU-Seiten stehen
      // Adresse, Telefon und Oeffnungszeiten fast immer da — nur eben
      // unstrukturiert. Genau das ist der Befund, den wir verkaufen, und
      // gleichzeitig der Rohstoff fuer den Prototyp.
      const extrahiert = kontaktdaten(daten.bodyText);

      profil.scrape = {
        url,
        extrahiert,
        finalUrl: netz.finalUrl,
        statusCode: netz.statusCode,
        https: netz.finalUrl.startsWith('https://'),
        ladezeitMs,
        htmlBytes: Buffer.byteLength(html),
        ...daten,
        mobil: mobilBefund,
        robots, sitemap, llms,
        screenshot: join(dir, 'vorher.png'),
        screenshotMobil: join(dir, 'vorher-mobil.png'),
        name: daten.h1[0] || daten.ogTitle || daten.titel.split(/[|·—-]/)[0].trim(),
        geholtAm: new Date().toISOString(),
      };

      const gefunden = [
        extrahiert.telefon ? 'Telefon' : null,
        extrahiert.adresse ? 'Adresse' : null,
        extrahiert.oeffnungszeiten ? 'Oeffnungszeiten' : null,
        extrahiert.email ? 'E-Mail' : null,
      ].filter(Boolean);

      emit('info', {
        lead: profil.slug,
        text: `${daten.textLaenge} Zeichen, ${daten.bilder.length} Bilder, ${daten.jsonLd.length}× JSON-LD, ${ladezeitMs}ms`
          + (gefunden.length ? ` · aus dem Text gelesen: ${gefunden.join(', ')}` : ''),
      });
    } finally {
      await b.close();
    }
  },
};

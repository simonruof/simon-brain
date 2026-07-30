/**
 * Stage 06 — Bilder beschaffen und aufbereiten.
 *
 * Bilder sind der haerteste Teil. Eine Werkstatt mit vier verpixelten Fotos von
 * 2011 ergibt ohne Gegenmassnahme einen Prototyp, der genauso billig aussieht
 * wie die alte Seite — und dann war die ganze Arbeit umsonst.
 *
 * Kaskade, absteigend nach Ueberzeugungskraft:
 *
 *   1. Google-Places-Fotos. Meist die besten Aufnahmen ueberhaupt, oft von
 *      Gaesten oder Kunden gemacht, und unverwechselbar dieser Betrieb.
 *   2. Bilder der Bestandsseite. Echt, aber haeufig zu klein oder schlecht.
 *   3. Neutrale Farbflaeche mit dem Betriebsnamen. Bewusst KEINE Stockfotos
 *      als stille Fuellung — ein fremdes Hochglanzbild im Prototyp ist eine
 *      Luege, die im Gespraech auffliegt. Die Leerstelle ist ehrlicher und
 *      gibt sogar ein Verkaufsargument her ("wir brauchen Fotos von Ihnen").
 *
 * Alles wird zu WebP in zwei Groessen konvertiert — das traegt sichtbar zum
 * Performance-Teil des Scores bei.
 */

import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { config } from '../core/config.js';
import { emit } from '../core/events.js';
import { foto as placesFoto } from '../lib/places-api.js';
import { playbook } from '../lib/playbooks.js';
import { theme } from '../themes/tokens.js';

const ZIELE = {
  hero: { breite: 1800, hoehe: 1100, qualitaet: 82 },
  about: { breite: 1000, hoehe: 750, qualitaet: 80 },
  galerie: { breite: 800, hoehe: 600, qualitaet: 78 },
};

async function sharpModul() {
  try {
    return (await import('sharp')).default;
  } catch {
    return null;
  }
}

async function ladeUrl(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000), redirect: 'follow' });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.length > 8000 ? buf : null; // unter 8 KB ist es ein Logo oder Icon
  } catch {
    return null;
  }
}

/**
 * Platzhalter statt Stockfoto.
 *
 * Bewusst kein huebsches Fremdbild: Ein Hochglanz-Stockfoto im Prototyp ist
 * eine Behauptung ueber den Betrieb, die im Gespraech auffliegt. Die ehrliche
 * Leerstelle ist besser — und liefert sogar ein Verkaufsargument
 * ("wir brauchen noch Fotos von Ihnen").
 *
 * Farbe kommt aus dem Theme des Playbooks, damit der Platzhalter nicht als
 * Fremdkoerper wirkt.
 */
function platzhalterSvg(text, { breite, hoehe }, akzent) {
  const kurz = String(text).slice(0, 28);
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${breite}" height="${hoehe}" viewBox="0 0 ${breite} ${hoehe}">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0%" stop-color="${akzent}" stop-opacity=".95"/>
    <stop offset="100%" stop-color="${akzent}" stop-opacity=".62"/>
  </linearGradient></defs>
  <rect width="${breite}" height="${hoehe}" fill="url(#g)"/>
  <text x="50%" y="46%" fill="#fff" fill-opacity=".95" font-family="Helvetica,Arial,sans-serif"
        font-size="${Math.round(breite / 20)}" font-weight="700" text-anchor="middle" dominant-baseline="middle">${kurz}</text>
  <text x="50%" y="57%" fill="#fff" fill-opacity=".62" font-family="Helvetica,Arial,sans-serif"
        font-size="${Math.round(breite / 48)}" font-weight="500" letter-spacing="2" text-anchor="middle"
        dominant-baseline="middle">HIER STEHT IHR FOTO</text>
</svg>`);
}

export default {
  id: 'images',
  titel: 'Bilder aufbereiten',

  braucht() { return null; },

  async run(profil) {
    const sharp = await sharpModul();
    const dir = join(config.outDir, profil.slug, 'bilder');
    mkdirSync(dir, { recursive: true });

    // Kandidaten sammeln, beste Quelle zuerst
    const kandidaten = [];

    for (const f of (profil.places?.fotos ?? []).slice(0, 8)) {
      kandidaten.push({ quelle: 'places', ref: f.name, flaeche: (f.breite ?? 0) * (f.hoehe ?? 0) });
    }
    for (const b of (profil.scrape?.bilder ?? []).slice(0, 12)) {
      // Logos, Icons und Zaehlpixel aussortieren
      if (/logo|icon|favicon|sprite|pixel|badge|button/i.test(b.src)) continue;
      if (b.flaeche && b.flaeche < 120000 && !b.hintergrund) continue;
      kandidaten.push({ quelle: 'website', ref: b.src, alt: b.alt, flaeche: b.flaeche ?? 0 });
    }

    const geladen = [];
    for (const k of kandidaten) {
      if (geladen.length >= 8) break;
      let buf = null;
      try {
        buf = k.quelle === 'places' ? await placesFoto(k.ref, 1800) : await ladeUrl(k.ref);
      } catch { /* ein einzelnes Bild darf scheitern */ }
      if (buf) geladen.push({ ...k, buf });
    }

    emit('info', { lead: profil.slug, text: `${geladen.length} von ${kandidaten.length} Bildkandidaten geladen` });

    const name = profil.places?.name || profil.scrape?.name || profil.eingabe.name || 'Betrieb';
    const ergebnis = { hero: null, about: null, galerie: [], quellen: {}, platzhalter: [] };

    /** Ein Bild in Zielgroesse schreiben. Liefert das Objekt fuer den Renderer. */
    async function schreibe(buf, dateiname, ziel, alt) {
      const rel = `bilder/${dateiname}.webp`;
      const rel2x = `bilder/${dateiname}@2x.webp`;
      if (!sharp) {
        // Ohne sharp: Original unveraendert ablegen. Nicht ideal, aber lauffaehig.
        const roh = `bilder/${dateiname}.jpg`;
        writeFileSync(join(config.outDir, profil.slug, roh), buf);
        return { datei: roh, alt, breite: ziel.breite, hoehe: ziel.hoehe };
      }
      await sharp(buf).resize(ziel.breite, ziel.hoehe, { fit: 'cover', position: 'attention' })
        .webp({ quality: ziel.qualitaet }).toFile(join(config.outDir, profil.slug, rel));
      await sharp(buf).resize(ziel.breite * 2, ziel.hoehe * 2, { fit: 'cover', position: 'attention', withoutEnlargement: true })
        .webp({ quality: Math.max(60, ziel.qualitaet - 12) }).toFile(join(config.outDir, profil.slug, rel2x))
        .catch(() => {});
      return {
        datei: rel,
        datei2x: existsSync(join(config.outDir, profil.slug, rel2x)) ? rel2x : null,
        alt, breite: ziel.breite, hoehe: ziel.hoehe,
      };
    }

    const altText = (zweck) => ({
      hero: `${name} — Aussenansicht`,
      about: `${name} — Einblick`,
      galerie: `${name}`,
    })[zweck] ?? name;

    let i = 0;
    if (geladen[i]) {
      ergebnis.hero = await schreibe(geladen[i].buf, 'hero', ZIELE.hero, geladen[i].alt || altText('hero'));
      ergebnis.quellen.hero = geladen[i].quelle;
      i++;
    }
    if (geladen[i]) {
      ergebnis.about = await schreibe(geladen[i].buf, 'about', ZIELE.about, geladen[i].alt || altText('about'));
      ergebnis.quellen.about = geladen[i].quelle;
      i++;
    }
    for (let g = 0; g < 6 && geladen[i]; g++, i++) {
      ergebnis.galerie.push(await schreibe(geladen[i].buf, `g${g}`, ZIELE.galerie, geladen[i].alt || altText('galerie')));
    }

    // Platzhalter, wo nichts Echtes vorhanden ist
    if (!ergebnis.hero) {
      const pb = playbook(profil.klassifikation?.playbook);
      const akzent = theme(pb.theme).hell.akzent;
      const svg = platzhalterSvg(name, ZIELE.hero, akzent);
      if (sharp) {
        await sharp(svg).webp({ quality: 80 }).toFile(join(config.outDir, profil.slug, 'bilder/hero.webp'));
        ergebnis.hero = { datei: 'bilder/hero.webp', alt: name, breite: ZIELE.hero.breite, hoehe: ZIELE.hero.hoehe };
      } else {
        writeFileSync(join(config.outDir, profil.slug, 'bilder/hero.svg'), svg);
        ergebnis.hero = { datei: 'bilder/hero.svg', alt: name, breite: ZIELE.hero.breite, hoehe: ZIELE.hero.hoehe };
      }
      ergebnis.platzhalter.push('hero');
      emit('warn', {
        lead: profil.slug,
        text: 'Kein brauchbares Foto gefunden — Platzhalter im Hero. Fuer den Versand eigenes Bildmaterial anfragen.',
      });
    }

    profil.bilder = ergebnis;
  },
};

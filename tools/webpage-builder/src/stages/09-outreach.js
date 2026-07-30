/**
 * Stage 09 — Outreach vorbereiten.
 *
 * Die unbequeme Wahrheit: Ein perfekter Prototyp, den niemand oeffnet, ist
 * wertlos. Der Engpass ist nicht der Bau, sondern die erste Zeile im Postfach.
 *
 * Deshalb ist die Mail so aufgebaut:
 *
 *   Betreff nennt einen konkreten, nachpruefbaren Befund — nicht "Ihre neue
 *   Website". Wer "Ihre Werkstatt ist fuer ChatGPT unsichtbar" liest, oeffnet.
 *
 *   Der erste Satz beweist, dass es kein Serienbrief ist: Name, Ort, ein Detail
 *   das nur auf diesen Betrieb passt.
 *
 *   Der Link kommt frueh. Alles nach dem Link wird ohnehin kaum gelesen.
 *
 *   Kein Preis, keine Leistungsbeschreibung, kein Anhang. Ziel der Mail ist
 *   eine Antwort, nicht ein Abschluss.
 *
 * Verschickt wird nie automatisch. Diese Stage erzeugt einen Entwurf; das
 * Absenden bleibt eine bewusste menschliche Entscheidung.
 */

import { writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { config } from '../core/config.js';
import { emit } from '../core/events.js';
import { groessteLuecken } from '../lib/scoring.js';
import { datumCh, ablaufdatum } from '../lib/guard.js';

/** Vorher/Nachher nebeneinander als ein Bild — der Anhang, der wirkt. */
async function vergleichsbild(profil) {
  const dir = join(config.dataDir, profil.slug);
  const vorher = join(dir, 'vorher.png');
  const nachher = join(dir, 'nachher.png');
  if (!existsSync(vorher) || !existsSync(nachher)) return null;

  let sharp;
  try { sharp = (await import('sharp')).default; } catch { return null; }

  const B = 900, H = 560, LUECKE = 24, KOPF = 46;
  const beschriften = async (pfad, text) => {
    const bild = await sharp(pfad).resize(B, H - KOPF, { fit: 'cover', position: 'top' }).toBuffer();
    const label = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${B}" height="${KOPF}">
        <rect width="${B}" height="${KOPF}" fill="#141A21"/>
        <text x="18" y="30" fill="#fff" font-family="Helvetica,Arial,sans-serif" font-size="19" font-weight="600">${text}</text>
      </svg>`);
    return sharp({ create: { width: B, height: H, channels: 3, background: '#141A21' } })
      .composite([{ input: label, top: 0, left: 0 }, { input: bild, top: KOPF, left: 0 }])
      .png().toBuffer();
  };

  const vs = profil.auditVorher?.score ?? 0;
  const ns = profil.auditNachher?.score ?? 0;

  const [links, rechts] = await Promise.all([
    beschriften(vorher, `Heute  ·  KI-Sichtbarkeit ${vs}/100`),
    beschriften(nachher, `Entwurf  ·  KI-Sichtbarkeit ${ns}/100`),
  ]);

  const ziel = join(dir, 'vergleich.png');
  await sharp({ create: { width: B * 2 + LUECKE, height: H, channels: 3, background: '#FFFFFF' } })
    .composite([{ input: links, top: 0, left: 0 }, { input: rechts, top: 0, left: B + LUECKE }])
    .png().toFile(ziel);
  return ziel;
}

/**
 * Betreffzeile aus dem staerksten Befund. Bewusst ohne Firmenname im Betreff —
 * das riecht nach Serienbrief. Der Name kommt in der ersten Zeile.
 */
function betreff(profil) {
  const branche = { kfz: 'Ihre Werkstatt', gastro: 'Ihr Restaurant', handwerk: 'Ihr Betrieb', beauty: 'Ihr Salon' }[profil.klassifikation?.playbook] ?? 'Ihr Betrieb';
  const score = profil.auditVorher?.score ?? 0;
  const ort = profil.places?.ort || profil.eingabe.ort || '';

  if (!profil.scrape) return `${branche} in ${ort} — online praktisch unsichtbar`;
  if (score < 35) return `${branche} wird von ChatGPT nicht gefunden`;
  if (profil.scrape?.mobil?.ueberlauf) return `${branche} auf dem Handy — kurze Rueckmeldung`;
  if ((profil.places?.rating ?? 0) >= 4.4) return `${profil.places.rating}★ auf Google — aber die Website zeigt es nicht`;
  return `Kurz zur Website von ${profil.places?.name || branche}`;
}

/** Die Mail. Kurz. Der Link steht oben. */
function mailText(profil) {
  const name = profil.places?.name || profil.scrape?.name || profil.eingabe.name || 'Ihr Betrieb';
  const ort = profil.places?.ort || '';
  const vorher = profil.auditVorher?.score ?? 0;
  const nachher = profil.auditNachher?.score ?? 0;
  const luecken = groessteLuecken(profil.auditVorher ?? {}, 2);
  const link = profil.deploy?.url || '[Vorschau-Link nach Deploy einfuegen]';
  const laeuftAb = datumCh(ablaufdatum(profil.deploy?.deployedAt ?? profil.render?.gebautAm));
  const rating = profil.places?.rating;

  // Erster Satz: der Beweis, dass es kein Serienbrief ist.
  let einstieg;
  if (rating >= 4.4) {
    einstieg = `Sie haben ${rating} Sterne aus ${profil.places.anzahlBewertungen} Google-Bewertungen — das ist stark. Ihre Website transportiert davon aktuell nichts.`;
  } else if (!profil.scrape) {
    einstieg = `Ich habe nach ${name} in ${ort} gesucht und ausser dem Google-Eintrag nichts gefunden.`;
  } else {
    einstieg = `Ich habe mir die Website von ${name} angeschaut — mit Blick darauf, wie gut sie von ChatGPT und Google AI gelesen wird.`;
  }

  return `Gruezi

${einstieg}

Ich habe Ihnen deshalb einen Entwurf gebaut, wie es aussehen koennte:
${link}

Das ist keine Vorlage — es sind Ihre echten Daten: ${[
    profil.places?.oeffnungszeiten ? 'Oeffnungszeiten' : null,
    profil.places?.bewertungen?.length ? 'Google-Bewertungen' : null,
    profil.places?.fotos?.length ? 'Fotos' : null,
    'Kontaktdaten',
  ].filter(Boolean).join(', ')}.

Zwei Punkte, die mir aufgefallen sind:
${luecken.map((l) => `• ${l.text.replace(/\.$/, '')} — ${l.warum}`).join('\n')}

Messbar macht das einen Unterschied: Ihre heutige Seite erreicht ${vorher} von 100 Punkten bei der maschinellen Lesbarkeit, der Entwurf ${nachher}.

Falls es Sie interessiert, melden Sie sich einfach. Wenn nicht, ist auch gut — der Link laeuft am ${laeuftAb} von selbst ab.

Freundliche Gruesse
${config.senderName}${config.senderPhone ? `\n${config.senderPhone}` : ''}${config.senderMail ? `\n${config.senderMail}` : ''}`;
}

export default {
  id: 'outreach',
  titel: 'Outreach vorbereiten',

  braucht(profil) {
    if (!profil.render?.outDir) return 'kein Prototyp vorhanden';
    return null;
  },

  async run(profil) {
    const bild = await vergleichsbild(profil).catch(() => null);

    const b = betreff(profil);
    const t = mailText(profil);

    // Als .eml ablegen: liegt neben dem Prototyp und laesst sich per Doppelklick
    // in jedem Mailprogramm oeffnen. Kein API-Zugang noetig, nichts wird gesendet.
    const empfaenger = profil.scrape?.mailLinks?.[0] ?? '';
    const eml = [
      `To: ${empfaenger}`,
      `Subject: ${b}`,
      'Content-Type: text/plain; charset=utf-8',
      'X-Unsent: 1',
      '',
      t,
    ].join('\n');
    const emlPfad = join(profil.render.outDir, 'outreach.eml');
    writeFileSync(emlPfad, eml);

    profil.outreach = {
      betreff: b,
      text: t,
      empfaenger,
      vergleichsbild: bild,
      eml: emlPfad,
      erstelltAm: new Date().toISOString(),
      gesendet: false, // wird nie automatisch auf true gesetzt
    };

    emit('info', {
      lead: profil.slug,
      text: `Entwurf bereit: "${b}"${empfaenger ? ` an ${empfaenger}` : ' (keine Mailadresse gefunden)'}`,
    });
  },
};

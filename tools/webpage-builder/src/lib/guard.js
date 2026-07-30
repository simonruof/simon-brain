/**
 * Rechtliche Leitplanken.
 *
 * Ein Prototyp verwendet den Namen, die Fotos und die Bewertungen eines
 * Betriebs, der davon nichts weiss. In der Schweiz und in Deutschland ist das
 * ein Graubereich — tragbar, solange die Vorschau erkennbar unverbindlich,
 * nicht oeffentlich auffindbar, zeitlich begrenzt und auf Zuruf loeschbar ist.
 *
 * Deshalb sind diese Massnahmen im Renderer erzwungen und nicht als Option
 * ausgefuehrt. Es gibt keine Flagge, die sie abschaltet. Wer sie umgehen will,
 * muesste den Code aendern — und wuerde dabei ueber diesen Kommentar stolpern.
 *
 * Zweiter, geschaeftlicher Zweck: Das Ablaufdatum ist der Verknappungshebel.
 * Eine Vorschau, die in vierzehn Tagen verschwindet, wird eher heute angeschaut.
 */

import { config } from '../core/config.js';

export function ablaufdatum(vonISO) {
  const d = vonISO ? new Date(vonISO) : new Date();
  d.setDate(d.getDate() + (config.previewDays || 14));
  return d;
}

export const datumCh = (d) =>
  new Intl.DateTimeFormat('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);

/**
 * Kopfzeilen-Angaben, die in jeden Prototyp gehoeren.
 * X-Robots-Tag kommt zusaetzlich vom Server (deploy/nginx.conf.example).
 */
export function metaTags() {
  return [
    '<meta name="robots" content="noindex, nofollow, noarchive, nosnippet, noimageindex">',
    '<meta name="googlebot" content="noindex, nofollow">',
    '<meta name="referrer" content="no-referrer">',
  ].join('\n  ');
}

/**
 * Der sichtbare Hinweis. Steht ganz oben, nicht im Footer — der Empfaenger
 * soll vor dem ersten Eindruck wissen, was er vor sich hat.
 */
export function vorschauBanner(profil) {
  const name = profil.places?.name || profil.scrape?.name || profil.eingabe.name || 'diesen Betrieb';
  const laeuftAb = datumCh(ablaufdatum(profil.deploy?.deployedAt ?? profil.render?.gebautAm));
  const absender = config.senderName;
  const mail = config.senderMail;

  return `<div class="f-vorschau" role="note">
  <span><strong>Unverbindliche Vorschau</strong> fuer ${esc(name)} — kein offizieller Auftritt des Betriebs.</span>
  <span>Erstellt von ${esc(absender)}${mail ? ` · <a href="mailto:${esc(mail)}?subject=${encodeURIComponent('Vorschau entfernen: ' + name)}">Vorschau entfernen</a>` : ''}</span>
  <span>Gueltig bis ${laeuftAb}</span>
</div>`;
}

/** Fusszeilen-Hinweis: Wiederholung der Rechtslage, dort wo man sie sucht. */
export function fussHinweis(profil) {
  const laeuftAb = datumCh(ablaufdatum(profil.deploy?.deployedAt ?? profil.render?.gebautAm));
  const mail = config.senderMail;
  return `Diese Seite ist ein unverbindlicher Entwurf und wird am ${laeuftAb} automatisch geloescht. `
    + `Verwendete Bilder und Bewertungen stammen aus oeffentlich zugaenglichen Quellen `
    + `(bestehende Website, Google-Unternehmensprofil) und dienen ausschliesslich der Veranschaulichung. `
    + (mail ? `Auf Wunsch wird die Vorschau sofort entfernt: <a href="mailto:${esc(mail)}">${esc(mail)}</a>.` : '');
}

/**
 * Der Formular-Hinweis. Das Kontaktformular im Prototyp sendet bewusst nichts.
 *
 * Zwei Gruende: Ein Formular, das an eine fremde Mailadresse zustellt, waere
 * ein echtes rechtliches Problem. Und ein vollstaendig fertiges Produkt, gratis
 * verschickt, nimmt dem Kunden jeden Grund zu zahlen.
 */
export const FORMULAR_HINWEIS =
  'Im Entwurf ohne Funktion — nach Freigabe wird das Formular an Ihre Mailadresse zugestellt.';

/** Wird der Datei out/<slug>/robots.txt beigelegt. */
export const ROBOTS_TXT = `# Unverbindliche Vorschau — nicht indexieren.
User-agent: *
Disallow: /
`;

export function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * Letzte Kontrolle vor dem Schreiben. Faengt den Fall ab, dass jemand den
 * Renderer umbaut und die Leitplanken dabei verliert.
 */
export function pruefeHtml(html) {
  const fehlend = [];
  if (!/name="robots"[^>]*noindex/i.test(html)) fehlend.push('noindex-Meta-Tag');
  if (!/class="f-vorschau"/.test(html)) fehlend.push('sichtbarer Vorschau-Hinweis');
  if (!/Gueltig bis/.test(html)) fehlend.push('Ablaufdatum');
  return fehlend;
}

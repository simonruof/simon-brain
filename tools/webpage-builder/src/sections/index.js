/**
 * Sektions-Bibliothek.
 *
 * Jede Sektion ist eine Funktion (daten, optionen) => html. Keine Template-Engine,
 * keine Abhaengigkeit, volle Kontrolle ueber jedes Zeichen der Ausgabe.
 *
 * Ein Playbook waehlt aus, welche Sektionen in welcher Reihenfolge erscheinen.
 * Dieselben Bausteine ergeben dadurch fuer eine Werkstatt eine voellig andere
 * Seite als fuer ein Restaurant — nicht nur eine andersfarbige.
 *
 * `daten` ist das aufbereitete Objekt aus 07-render (siehe dort seitenDaten()).
 */

import { esc, FORMULAR_HINWEIS } from '../lib/guard.js';

/* ── Kleine Helfer ──────────────────────────────────────────────────── */

const ICON = {
  telefon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>',
  ort: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>',
  uhr: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
  mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/></svg>',
  haken: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
  stern: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z"/></svg>',
  blitz: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
};

const sterne = (n) => '★'.repeat(Math.round(n)) + '☆'.repeat(Math.max(0, 5 - Math.round(n)));

/** Telefonnummer als tel:-Link — auf dem Handy der Unterschied zwischen Anruf und Abtippen. */
const telHref = (nr) => 'tel:' + String(nr).replace(/[^\d+]/g, '');

function ctaKnoepfe(d, { geist = false } = {}) {
  const p = d.cta?.primaer;
  const s = d.cta?.sekundaer;
  const teile = [];
  if (p) teile.push(`<a class="f-btn f-btn--primaer" href="${p.ziel === 'telefon' && d.telefon ? telHref(d.telefon) : '#kontakt'}">${esc(p.text)}</a>`);
  if (s && d.telefon) {
    teile.push(`<a class="f-btn ${geist ? 'f-btn--geist' : 'f-btn--sekundaer'}" href="${telHref(d.telefon)}">${ICON.telefon} ${esc(d.telefon)}</a>`);
  }
  return teile.length ? `<div class="f-btn-reihe">${teile.join('')}</div>` : '';
}

function bewertungsPille(d) {
  if (!d.rating) return '';
  return `<span class="f-sterne"><span class="f-sterne__grafik">${sterne(d.rating)}</span> ${d.rating.toFixed(1)} <span style="font-weight:400;opacity:.75">aus ${d.anzahlBewertungen} Google-Bewertungen</span></span>`;
}

function kopfzeile({ augenbraue, titel, lead }) {
  return `<div class="f-kopfzeile f-anim">
      ${augenbraue ? `<p class="f-augenbraue">${esc(augenbraue)}</p>` : ''}
      <h2>${esc(titel)}</h2>
      ${lead ? `<p class="f-lead">${esc(lead)}</p>` : ''}
    </div>`;
}

function bild(b, { klasse = '', sizes = '100vw', eager = false } = {}) {
  if (!b) return '';
  return `<img src="${esc(b.datei)}"${b.datei2x ? ` srcset="${esc(b.datei)} 1x, ${esc(b.datei2x)} 2x"` : ''}`
    + ` sizes="${sizes}" alt="${esc(b.alt ?? '')}"${b.breite ? ` width="${b.breite}" height="${b.hoehe}"` : ''}`
    + ` loading="${eager ? 'eager' : 'lazy'}" decoding="async"${klasse ? ` class="${klasse}"` : ''}>`;
}

/* ── Navigation ─────────────────────────────────────────────────────── */

export function nav(d) {
  const links = d.sektionsLinks ?? [];
  return `<nav class="f-nav">
  <div class="f-nav__inner">
    <a class="f-marke" href="#top">${esc(d.name)}</a>
    <div class="f-nav__links">
      ${links.map((l) => `<a href="#${esc(l.id)}">${esc(l.titel)}</a>`).join('\n      ')}
    </div>
    ${d.telefon ? `<a class="f-btn f-btn--primaer f-nav__cta" href="${telHref(d.telefon)}" style="padding:.6rem 1.2rem">${ICON.telefon} Anrufen</a>` : ''}
  </div>
</nav>`;
}

/* ── Hero ───────────────────────────────────────────────────────────── */

export function hero(d, opt = {}) {
  const zeige = opt.zeige ?? [];
  const variante = opt.variant ?? 'trust-bar';
  const c = d.copy?.hero ?? {};
  const titel = c.titel || `${d.leistung ?? d.name} in ${d.ort}`;
  const lead = c.lead || d.beschreibung || '';

  const trustLeiste = () => {
    const eintraege = [];
    if (zeige.includes('bewertung') && d.rating) eintraege.push(`<span class="f-trust__item">${ICON.stern} ${d.rating.toFixed(1)} aus ${d.anzahlBewertungen} Bewertungen</span>`);
    if (zeige.includes('oeffnungszeiten') && d.heuteText) eintraege.push(`<span class="f-trust__item">${ICON.uhr} Heute ${esc(d.heuteText)}</span>`);
    if (zeige.includes('einzugsgebiet') && d.ort) eintraege.push(`<span class="f-trust__item">${ICON.ort} ${esc(d.ort)} und Umgebung</span>`);
    if (zeige.includes('notfall')) eintraege.push(`<span class="f-trust__item">${ICON.blitz} Auch im Notfall erreichbar</span>`);
    for (const t of (d.trustSignale ?? []).slice(0, 3 - eintraege.length)) {
      if (eintraege.length < 3) eintraege.push(`<span class="f-trust__item">${ICON.haken} ${esc(t)}</span>`);
    }
    return eintraege.length ? `<div class="f-trust">${eintraege.join('')}</div>` : '';
  };

  if (variante === 'bild-gross' && d.heroBild) {
    return `<header class="f-hero f-hero--bild" id="top">
  <div class="f-hero__bg">${bild(d.heroBild, { sizes: '100vw', eager: true })}</div>
  <div class="f-hero__inhalt f-wrap">
    ${d.augenbraue ? `<p class="f-augenbraue" style="color:var(--f-gold)">${esc(d.augenbraue)}</p>` : ''}
    <h1>${esc(titel)}</h1>
    ${lead ? `<p class="f-hero__lead">${esc(lead)}</p>` : ''}
    ${trustLeiste()}
    ${ctaKnoepfe(d, { geist: true })}
  </div>
</header>`;
  }

  return `<header class="f-hero f-hero--trust" id="top">
  <div class="f-wrap">
    <div class="f-hero__grid">
      <div>
        ${d.augenbraue ? `<p class="f-augenbraue">${esc(d.augenbraue)}</p>` : ''}
        <h1>${esc(titel)}</h1>
        ${lead ? `<p class="f-hero__lead">${esc(lead)}</p>` : ''}
        ${trustLeiste()}
        ${ctaKnoepfe(d)}
      </div>
      ${d.heroBild ? `<div class="f-hero__bild f-anim">${bild(d.heroBild, { sizes: '(max-width:900px) 100vw, 45vw', eager: true })}</div>` : ''}
    </div>
  </div>
</header>`;
}

/* ── Leistungen ─────────────────────────────────────────────────────── */

export function services(d, opt = {}) {
  const eintraege = d.copy?.leistungen ?? [];
  if (!eintraege.length) return '';
  const titel = opt.titel ?? 'Unsere Leistungen';

  if (opt.layout === 'preisliste') {
    return `<section class="f-sek" id="leistungen">
  <div class="f-wrap">
    ${kopfzeile({ titel, lead: d.copy?.leistungenLead })}
    <div class="f-preise f-anim">
      ${eintraege.map((e) => `<div class="f-preis">
        <span class="f-preis__name">${esc(e.titel)}${e.text ? `<span class="f-preis__text">${esc(e.text)}</span>` : ''}</span>
        <span class="f-preis__linie"></span>
        <span class="f-preis__wert">${esc(e.preis ?? 'auf Anfrage')}</span>
      </div>`).join('\n      ')}
    </div>
  </div>
</section>`;
  }

  return `<section class="f-sek" id="leistungen">
  <div class="f-wrap">
    ${kopfzeile({ titel, lead: d.copy?.leistungenLead })}
    <div class="f-raster f-raster--3">
      ${eintraege.map((e) => `<article class="f-karte f-anim">
        <h3>${esc(e.titel)}</h3>
        <p>${esc(e.text)}</p>
      </article>`).join('\n      ')}
    </div>
  </div>
</section>`;
}

/* ── Highlights (Gastro) ────────────────────────────────────────────── */

export function highlights(d, opt = {}) {
  const eintraege = d.copy?.highlights ?? d.copy?.leistungen ?? [];
  if (!eintraege.length) return '';
  return `<section class="f-sek" id="highlights">
  <div class="f-wrap">
    ${kopfzeile({ titel: opt.titel ?? 'Das erwartet Sie' })}
    <div class="f-raster f-raster--3">
      ${eintraege.slice(0, 3).map((e) => `<article class="f-karte f-anim">
        <h3>${esc(e.titel)}</h3>
        <p>${esc(e.text)}</p>
      </article>`).join('\n      ')}
    </div>
  </div>
</section>`;
}

/* ── Speisekarte ────────────────────────────────────────────────────── */

export function menu(d, opt = {}) {
  const gerichte = d.copy?.menu ?? [];
  if (!gerichte.length) return '';
  return `<section class="f-sek" id="karte">
  <div class="f-wrap">
    ${kopfzeile({ titel: opt.titel ?? 'Aus unserer Kueche', lead: d.copy?.menuLead })}
    <div class="f-preise f-anim">
      ${gerichte.map((g) => `<div class="f-preis">
        <span class="f-preis__name">${esc(g.titel)}${g.text ? `<span class="f-preis__text">${esc(g.text)}</span>` : ''}</span>
        <span class="f-preis__linie"></span>
        <span class="f-preis__wert">${esc(g.preis ?? '')}</span>
      </div>`).join('\n      ')}
    </div>
    ${opt.hinweis_pdf ? `<p style="margin-top:var(--a-m);font-size:var(--t-s);color:var(--f-textLeise)">Die vollstaendige Karte wechselt saisonal — fragen Sie uns gerne nach dem aktuellen Angebot.</p>` : ''}
  </div>
</section>`;
}

/* ── Ablauf ─────────────────────────────────────────────────────────── */

export function process(d, opt = {}) {
  const schritte = d.copy?.prozess ?? [];
  if (!schritte.length) return '';
  return `<section class="f-sek" id="ablauf">
  <div class="f-wrap">
    ${kopfzeile({ titel: opt.titel ?? 'So einfach geht es' })}
    <div class="f-raster f-raster--3">
      ${schritte.map((s, i) => `<article class="f-karte f-anim">
        <div class="f-karte__nr">${i + 1}</div>
        <h3>${esc(s.titel)}</h3>
        <p>${esc(s.text)}</p>
      </article>`).join('\n      ')}
    </div>
  </div>
</section>`;
}

/* ── Bewertungen ────────────────────────────────────────────────────── */

export function proof(d, opt = {}) {
  const stimmen = d.bewertungen ?? [];
  if (stimmen.length < (opt.min ?? 2)) return '';
  return `<section class="f-sek" id="stimmen">
  <div class="f-wrap">
    <div class="f-kopfzeile f-anim">
      <p class="f-augenbraue">Google-Bewertungen</p>
      <h2>${esc(opt.titel ?? 'Was unsere Kunden sagen')}</h2>
      ${d.rating ? `<p class="f-lead">${bewertungsPille(d)}</p>` : ''}
    </div>
    <div class="f-stimmen">
      ${stimmen.slice(0, 3).map((s) => `<figure class="f-stimme f-anim" style="margin:0">
        <blockquote class="f-stimme__text" style="margin:0">${esc(kuerze(s.text, 320))}</blockquote>
        <figcaption class="f-stimme__fuss">
          ${s.bild ? `<img class="f-stimme__avatar" src="${esc(s.bild)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '<span class="f-stimme__avatar"></span>'}
          <span>
            <span class="f-stimme__name">${esc(s.autor)}</span>
            <span class="f-stimme__meta" style="display:block"><span class="f-sterne__grafik">${sterne(s.note)}</span>${s.wann ? ` · ${esc(s.wann)}` : ''}</span>
          </span>
        </figcaption>
      </figure>`).join('\n      ')}
    </div>
  </div>
</section>`;
}

/* ── Ueber uns ──────────────────────────────────────────────────────── */

export function about(d, opt = {}) {
  const text = d.copy?.about;
  if (!text) return '';
  const b = d.bilder?.about;
  return `<section class="f-sek" id="ueberuns">
  <div class="f-wrap">
    <div class="f-kontakt__grid" style="align-items:center">
      <div class="f-anim">
        ${kopfzeile({ titel: opt.titel ?? 'Ueber uns' })}
        ${text.split('\n\n').map((p) => `<p>${esc(p)}</p>`).join('\n        ')}
        ${(d.trustSignale ?? []).length ? `<div class="f-trust" style="margin-top:var(--a-m)">
          ${d.trustSignale.map((t) => `<span class="f-trust__item">${ICON.haken} ${esc(t)}</span>`).join('')}
        </div>` : ''}
      </div>
      ${b ? `<div class="f-anim">${bild(b, { klasse: '', sizes: '(max-width:900px) 100vw, 45vw' })}</div>` : ''}
    </div>
  </div>
</section>`;
}

/* ── Galerie ────────────────────────────────────────────────────────── */

export function gallery(d, opt = {}) {
  const b = d.bilder?.galerie ?? [];
  if (b.length < 3) return '';
  return `<section class="f-sek" id="galerie">
  <div class="f-wrap">
    ${kopfzeile({ titel: opt.titel ?? 'Einblicke' })}
    <div class="f-galerie f-anim">
      ${b.slice(0, 6).map((x) => bild(x, { sizes: '(max-width:760px) 50vw, 25vw' })).join('\n      ')}
    </div>
  </div>
</section>`;
}

/* ── Kontakt ────────────────────────────────────────────────────────── */

export function contact(d, opt = {}) {
  const zeitenTabelle = () => {
    const z = d.oeffnungszeiten?.tage;
    if (!z?.length) return '';
    const heute = new Date().getDay();
    return `<table class="f-zeiten">
        ${z.map((t) => `<tr${t.index === heute ? ' class="f-heute"' : ''}>
          <td>${esc(t.tag)}</td>
          <td class="${t.geschlossen ? 'f-zu' : ''}">${t.geschlossen ? 'geschlossen' : esc(t.zeiten.join(', '))}</td>
        </tr>`).join('\n        ')}
      </table>`;
  };

  const karte = opt.map && d.koordinaten
    ? `<div class="f-karte-map f-anim" style="margin-top:var(--a-m)">
        <iframe title="Standort ${esc(d.name)}" loading="lazy" referrerpolicy="no-referrer-when-downgrade"
          src="https://www.openstreetmap.org/export/embed.html?bbox=${d.koordinaten.lng - 0.006}%2C${d.koordinaten.lat - 0.003}%2C${d.koordinaten.lng + 0.006}%2C${d.koordinaten.lat + 0.003}&amp;layer=mapnik&amp;marker=${d.koordinaten.lat}%2C${d.koordinaten.lng}"></iframe>
      </div>` : '';

  return `<section class="f-sek" id="kontakt">
  <div class="f-wrap">
    ${kopfzeile({ augenbraue: 'Kontakt', titel: d.copy?.kontaktTitel ?? `So erreichen Sie uns`, lead: d.copy?.kontaktLead })}
    <div class="f-kontakt__grid">
      <div class="f-anim">
        <div class="f-daten">
          ${d.telefon ? `<div class="f-daten__zeile">${ICON.telefon}<div>
            <div class="f-daten__label">Telefon</div>
            <div class="f-daten__wert"><a href="${telHref(d.telefon)}">${esc(d.telefon)}</a></div>
          </div></div>` : ''}
          ${d.mail ? `<div class="f-daten__zeile">${ICON.mail}<div>
            <div class="f-daten__label">E-Mail</div>
            <div class="f-daten__wert"><a href="mailto:${esc(d.mail)}">${esc(d.mail)}</a></div>
          </div></div>` : ''}
          ${d.adresse ? `<div class="f-daten__zeile">${ICON.ort}<div>
            <div class="f-daten__label">Adresse</div>
            <div class="f-daten__wert">${esc(d.adresse)}</div>
          </div></div>` : ''}
          ${opt.hours && d.oeffnungszeiten ? `<div class="f-daten__zeile">${ICON.uhr}<div style="flex:1">
            <div class="f-daten__label">Oeffnungszeiten</div>
            ${zeitenTabelle()}
          </div></div>` : ''}
        </div>
        ${karte}
      </div>

      <div class="f-anim">
        <form class="f-form" onsubmit="return false" aria-label="Kontaktformular">
          <div class="f-feld"><label for="k-name">Name</label><input id="k-name" name="name" type="text" autocomplete="name" disabled></div>
          <div class="f-feld"><label for="k-tel">Telefon oder E-Mail</label><input id="k-tel" name="kontakt" type="text" disabled></div>
          <div class="f-feld"><label for="k-txt">Ihr Anliegen</label><textarea id="k-txt" name="anliegen" rows="4" disabled></textarea></div>
          <button class="f-btn f-btn--primaer" type="button" disabled style="opacity:.55;cursor:not-allowed">${esc(d.cta?.primaer?.text ?? 'Absenden')}</button>
          <p class="f-form__hinweis">${esc(FORMULAR_HINWEIS)}</p>
        </form>
      </div>
    </div>
  </div>
</section>`;
}

/* ── Fuss und Anrufleiste ───────────────────────────────────────────── */

export function fuss(d, hinweisHtml) {
  const jahr = new Date().getFullYear();
  return `<footer class="f-fuss">
  <div class="f-wrap">
    <div class="f-fuss__grid">
      <div>
        <h4>${esc(d.name)}</h4>
        ${d.adresse ? `<p style="color:rgba(255,255,255,.72)">${esc(d.adresse)}</p>` : ''}
        ${d.telefon ? `<p><a href="${telHref(d.telefon)}">${esc(d.telefon)}</a></p>` : ''}
      </div>
      ${d.oeffnungszeiten ? `<div>
        <h4>Oeffnungszeiten</h4>
        ${(d.oeffnungszeiten.text ?? []).map((z) => `<div style="font-size:var(--t-xs)">${esc(z)}</div>`).join('')}
      </div>` : '<div></div>'}
      <div>
        <h4>Direkt</h4>
        ${(d.sektionsLinks ?? []).map((l) => `<div><a href="#${esc(l.id)}">${esc(l.titel)}</a></div>`).join('')}
      </div>
    </div>
    <div class="f-fuss__unten">
      <span>© ${jahr} ${esc(d.name)}</span>
      <span style="max-width:70ch;opacity:.75">${hinweisHtml}</span>
    </div>
  </div>
</footer>`;
}

export function anrufleiste(d) {
  if (!d.telefon) return '';
  return `<div class="f-anrufleiste">
  <a class="f-btn f-btn--sekundaer" href="#kontakt">${esc(d.cta?.primaer?.text ?? 'Kontakt')}</a>
  <a class="f-btn f-btn--primaer" href="${telHref(d.telefon)}">${ICON.telefon} Anrufen</a>
</div>`;
}

function kuerze(s, max) {
  const t = String(s ?? '');
  if (t.length <= max) return t;
  return t.slice(0, t.lastIndexOf(' ', max)) + ' …';
}

/** Registrierung: Playbook-Sektionstyp → Funktion. */
export const SEKTIONEN = { hero, services, highlights, menu, process, proof, about, gallery, contact };

/** Anzeigename fuer die Navigation. */
export const SEKTION_TITEL = {
  services: 'Leistungen', highlights: 'Angebot', menu: 'Karte', process: 'Ablauf',
  proof: 'Bewertungen', about: 'Ueber uns', gallery: 'Galerie', contact: 'Kontakt',
};

export const SEKTION_ANKER = {
  services: 'leistungen', highlights: 'highlights', menu: 'karte', process: 'ablauf',
  proof: 'stimmen', about: 'ueberuns', gallery: 'galerie', contact: 'kontakt',
};

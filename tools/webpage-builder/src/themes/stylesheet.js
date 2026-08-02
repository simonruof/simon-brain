/**
 * Das Stylesheet — eines fuer alle Themes.
 *
 * Wird komplett in den <head> eingebettet. Kein externes CSS, keine Schriften
 * von fremden Servern, keine Anfrage die den Aufbau blockiert. Eine Seite ist
 * damit auch bei schlechter Verbindung sofort da — was den Performance-Teil
 * des Scores praktisch geschenkt gibt.
 *
 * Die Klassennamen sind bewusst kurz gehalten (f- fuer Fabrik), damit das
 * eingebettete CSS nicht unnoetig aufblaeht.
 */

import { tokensAlsCss, theme } from './tokens.js';

export function stylesheet(themeName, { animationen = true } = {}) {
  const t = theme(themeName);
  const grossbuchstaben = themeName === 'sharp';

  return `${tokensAlsCss(themeName)}

  *, *::before, *::after { box-sizing: border-box; }
  html { -webkit-text-size-adjust: 100%; scroll-behavior: smooth; }
  @media (prefers-reduced-motion: reduce) {
    html { scroll-behavior: auto; }
    *, *::before, *::after { animation-duration: .01ms !important; transition-duration: .01ms !important; }
  }

  body {
    margin: 0;
    background: var(--f-bg);
    color: var(--f-text);
    font-family: var(--font-body);
    font-size: var(--t-m);
    line-height: 1.65;
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
  }

  h1, h2, h3, h4 {
    font-family: var(--font-display);
    line-height: 1.1;
    margin: 0 0 var(--a-s);
    letter-spacing: ${grossbuchstaben ? '-.01em' : '-.02em'};
    text-wrap: balance;
  }
  h1 { font-size: var(--t-hero); }
  h2 { font-size: var(--t-xxl); }
  h3 { font-size: var(--t-xl); }
  h4 { font-size: var(--t-l); }
  ${grossbuchstaben ? 'h2, h3 { text-transform: uppercase; letter-spacing: .01em; }' : ''}

  p { margin: 0 0 var(--a-s); max-width: var(--b-text); text-wrap: pretty; }
  a { color: inherit; text-decoration-color: color-mix(in srgb, currentColor 35%, transparent); text-underline-offset: .18em; }
  a:hover { text-decoration-color: currentColor; }
  img { max-width: 100%; height: auto; display: block; }
  ul { padding-left: 1.1em; }

  :focus-visible { outline: 3px solid var(--f-akzent); outline-offset: 3px; border-radius: var(--r-s); }

  /* Die Icons tragen nur ein viewBox. Ohne feste Groesse faellt ein SVG auf
     die CSS-Vorgabe von 300x150px zurueck — in der Anrufleiste auf dem Handy
     wurde daraus ein bildschirmfuellendes Telefon. Einmal global setzen statt
     an jeder Fundstelle einzeln. */
  svg { width: 1.05em; height: 1.05em; flex: none; }

  /* ── Grundgerüst ─────────────────────────────────────────────────── */
  .f-wrap { width: min(100% - 2.5rem, var(--b-inhalt)); margin-inline: auto; }
  .f-schmal { width: min(100% - 2.5rem, var(--b-schmal)); margin-inline: auto; }
  .f-sek { padding-block: var(--a-xl); }
  .f-sek--alt { background: var(--f-bgAlt); }
  .f-sek--tief { background: var(--f-bgTief); color: #fff; }
  .f-sek--tief h2, .f-sek--tief h3 { color: #fff; }
  .f-sek--tief p { color: rgba(255,255,255,.78); }

  .f-kopfzeile { margin-bottom: var(--a-l); max-width: var(--b-text); }
  .f-augenbraue {
    font-size: var(--t-xs); font-weight: 600; letter-spacing: .14em;
    text-transform: uppercase; color: var(--f-akzent); margin: 0 0 var(--a-xs);
  }
  .f-lead { font-size: var(--t-l); color: var(--f-textLeise); }

  /* ── Kopf ────────────────────────────────────────────────────────── */
  .f-nav {
    position: sticky; top: 0; z-index: 40;
    display: flex; align-items: center; gap: var(--a-s);
    padding: .85rem 0;
    background: color-mix(in srgb, var(--f-bg) 88%, transparent);
    backdrop-filter: blur(12px);
    border-bottom: 1px solid var(--f-rand);
  }
  .f-nav__inner { display: flex; align-items: center; gap: var(--a-s); width: min(100% - 2.5rem, var(--b-inhalt)); margin-inline: auto; }
  .f-marke { font-family: var(--font-display); font-weight: 700; font-size: var(--t-l); letter-spacing: -.02em; text-decoration: none; }
  .f-nav__links { display: flex; gap: 1.6rem; margin-left: auto; font-size: var(--t-s); }
  .f-nav__links a { text-decoration: none; color: var(--f-textLeise); font-weight: 500; }
  .f-nav__links a:hover { color: var(--f-text); }
  @media (max-width: 820px) { .f-nav__links { display: none; } }
  .f-nav__inner > .f-nav__cta { margin-left: auto; }

  /* ── Schaltflächen ───────────────────────────────────────────────── */
  .f-btn {
    display: inline-flex; align-items: center; justify-content: center; gap: .55rem;
    padding: .95rem 1.7rem; border-radius: var(--r-m);
    font-weight: 650; font-size: var(--t-s); letter-spacing: .01em;
    text-decoration: none; border: 1.5px solid transparent; cursor: pointer;
    transition: transform .15s ease, box-shadow .2s ease, background-color .2s ease;
    white-space: nowrap;
  }
  .f-btn--primaer { background: var(--f-akzent); color: var(--f-akzentText); box-shadow: var(--s-m); }
  .f-btn--primaer:hover { transform: translateY(-2px); box-shadow: var(--s-l); }
  .f-btn--sekundaer { border-color: var(--f-rand); background: var(--f-flaeche); color: var(--f-text); }
  .f-btn--sekundaer:hover { border-color: var(--f-akzent); color: var(--f-akzent); }
  .f-btn--geist { border-color: rgba(255,255,255,.35); color: #fff; }
  .f-btn--geist:hover { background: rgba(255,255,255,.12); }
  .f-btn-reihe { display: flex; flex-wrap: wrap; gap: .75rem; margin-top: var(--a-m); }

  /* ── Hero ────────────────────────────────────────────────────────── */
  .f-hero { position: relative; overflow: hidden; }
  .f-hero--bild { min-height: min(82vh, 760px); display: grid; align-items: end; color: #fff; }
  .f-hero--bild .f-hero__bg { position: absolute; inset: 0; z-index: 0; }
  .f-hero--bild .f-hero__bg img { width: 100%; height: 100%; object-fit: cover; }
  .f-hero--bild .f-hero__bg::after {
    content: ''; position: absolute; inset: 0;
    background: linear-gradient(180deg, rgba(0,0,0,.28) 0%, rgba(0,0,0,.14) 38%, rgba(0,0,0,.82) 100%);
  }
  .f-hero--bild .f-hero__inhalt { position: relative; z-index: 1; padding-block: var(--a-xl) var(--a-l); }
  .f-hero--bild h1 { color: #fff; text-shadow: 0 2px 24px rgba(0,0,0,.35); }
  .f-hero--bild .f-hero__lead { color: rgba(255,255,255,.9); font-size: var(--t-l); max-width: 56ch; }

  .f-hero--trust { padding-block: var(--a-l) var(--a-l); background: var(--f-bgAlt); }
  .f-hero--trust .f-hero__grid { display: grid; grid-template-columns: 1.05fr .95fr; gap: var(--a-l); align-items: center; }
  .f-hero--trust .f-hero__bild img { border-radius: var(--r-l); box-shadow: var(--s-l); aspect-ratio: 4/3; object-fit: cover; width: 100%; }
  /* In der geteilten Ansicht steht der Titel in einer halb so breiten Spalte —
     die volle Hero-Groesse wuerde dort nach jedem zweiten Wort umbrechen. */
  .f-hero--trust h1 { font-size: var(--t-xxl); hyphens: none; }
  @media (max-width: 900px) { .f-hero--trust .f-hero__grid { grid-template-columns: 1fr; } }

  .f-hero__lead { font-size: var(--t-l); color: var(--f-textLeise); max-width: 54ch; margin-top: var(--a-s); }

  /* ── Vertrauensleiste ────────────────────────────────────────────── */
  .f-trust { display: flex; flex-wrap: wrap; gap: 1.4rem 2.2rem; align-items: center; margin-top: var(--a-m); font-size: var(--t-s); }
  .f-trust__item { display: flex; align-items: center; gap: .55rem; font-weight: 550; }
  .f-trust__item svg { flex: none; width: 1.1em; height: 1.1em; color: var(--f-akzent); }
  .f-hero--bild .f-trust__item svg { color: var(--f-gold); }

  .f-sterne { display: inline-flex; align-items: center; gap: .45rem; font-weight: 650; }
  .f-sterne__grafik { color: var(--f-gold); letter-spacing: .08em; }

  /* ── Karten-Raster ───────────────────────────────────────────────── */
  /* Feste Spaltenzahl statt auto-fit: auto-fit ergibt auf breiten Bildschirmen
     vier oder fuenf Spalten, in denen jede Karte zu schmal fuer ihre
     Ueberschrift wird. Drei Spalten sind der Punkt, an dem Karten noch
     lesbar und die Reihe noch gefuellt ist. */
  .f-raster { display: grid; gap: var(--a-s); }
  .f-raster--3 { grid-template-columns: repeat(3, 1fr); }
  .f-raster--2 { grid-template-columns: repeat(2, 1fr); }
  @media (max-width: 980px) { .f-raster--3 { grid-template-columns: repeat(2, 1fr); } }
  @media (max-width: 640px) { .f-raster--3, .f-raster--2 { grid-template-columns: 1fr; } }

  .f-karte {
    background: var(--f-flaeche); border: 1px solid var(--f-rand);
    border-radius: var(--r-l); padding: var(--a-m);
    transition: transform .2s ease, box-shadow .2s ease, border-color .2s ease;
  }
  .f-karte:hover { transform: translateY(-3px); box-shadow: var(--s-m); border-color: color-mix(in srgb, var(--f-akzent) 40%, var(--f-rand)); }
  .f-karte h3 { font-size: var(--t-l); margin-bottom: .5rem; }
  .f-karte p { color: var(--f-textLeise); font-size: var(--t-s); margin: 0; }
  .f-karte__nr {
    display: grid; place-items: center; width: 2.6rem; height: 2.6rem;
    border-radius: var(--r-voll); background: var(--f-akzentLeise); color: var(--f-akzent);
    font-family: var(--font-display); font-weight: 700; font-size: var(--t-l);
    margin-bottom: var(--a-s);
  }

  /* ── Preisliste ──────────────────────────────────────────────────── */
  .f-preise { display: grid; gap: .1rem; max-width: var(--b-schmal); }
  .f-preis {
    display: flex; align-items: baseline; gap: 1rem;
    padding: 1.05rem 0; border-bottom: 1px solid var(--f-rand);
  }
  .f-preis__name { font-weight: 600; }
  .f-preis__text { color: var(--f-textLeise); font-size: var(--t-s); display: block; font-weight: 400; margin-top: .15rem; }
  .f-preis__linie { flex: 1; border-bottom: 1px dotted var(--f-rand); transform: translateY(-.25em); }
  .f-preis__wert { font-family: var(--font-display); font-weight: 700; white-space: nowrap; }

  /* ── Bewertungen ─────────────────────────────────────────────────── */
  .f-stimmen { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: var(--a-s); }
  .f-stimme {
    background: var(--f-flaeche); border: 1px solid var(--f-rand);
    border-radius: var(--r-l); padding: var(--a-m); display: flex; flex-direction: column;
  }
  .f-stimme__text { font-size: var(--t-m); margin-bottom: var(--a-s); flex: 1; }
  .f-stimme__text::before { content: '\\201E'; font-family: var(--font-display); font-size: 2.4em; line-height: 0; vertical-align: -.35em; color: var(--f-akzent); margin-right: .1em; }
  .f-stimme__fuss { display: flex; align-items: center; gap: .7rem; font-size: var(--t-s); }
  .f-stimme__avatar { width: 2.3rem; height: 2.3rem; border-radius: var(--r-voll); object-fit: cover; flex: none; background: var(--f-bgAlt); }
  .f-stimme__name { font-weight: 600; }
  .f-stimme__meta { color: var(--f-textLeise); font-size: var(--t-xs); }

  /* ── Galerie ─────────────────────────────────────────────────────── */
  .f-galerie { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: .6rem; }
  .f-galerie img { border-radius: var(--r-m); aspect-ratio: 4/3; object-fit: cover; width: 100%; transition: transform .3s ease; }
  .f-galerie a:hover img { transform: scale(1.03); }

  /* ── Kontakt ─────────────────────────────────────────────────────── */
  .f-kontakt__grid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--a-l); }
  @media (max-width: 900px) { .f-kontakt__grid { grid-template-columns: 1fr; } }

  .f-daten { display: grid; gap: 1.15rem; }
  .f-daten__zeile { display: flex; gap: .9rem; align-items: flex-start; }
  .f-daten__zeile svg { flex: none; width: 1.25rem; height: 1.25rem; color: var(--f-akzent); margin-top: .2rem; }
  .f-daten__label { font-size: var(--t-xs); text-transform: uppercase; letter-spacing: .1em; color: var(--f-textLeise); font-weight: 600; }
  .f-daten__wert { font-weight: 550; }
  .f-daten__wert a { text-decoration: none; }
  .f-daten__wert a:hover { color: var(--f-akzent); }

  .f-zeiten { width: 100%; border-collapse: collapse; font-size: var(--t-s); }
  .f-zeiten td { padding: .42rem 0; border-bottom: 1px solid var(--f-rand); }
  .f-zeiten td:last-child { text-align: right; font-variant-numeric: tabular-nums; }
  .f-zeiten tr:last-child td { border-bottom: 0; }
  .f-zeiten .f-heute { font-weight: 700; color: var(--f-akzent); }
  .f-zeiten .f-zu { color: var(--f-textLeise); }

  .f-karte-map { border-radius: var(--r-l); overflow: hidden; border: 1px solid var(--f-rand); aspect-ratio: 16/10; }
  .f-karte-map iframe { width: 100%; height: 100%; border: 0; display: block; filter: grayscale(.15); }

  /* ── Formular (im Prototyp bewusst inaktiv) ──────────────────────── */
  .f-form { display: grid; gap: .85rem; }
  .f-feld { display: grid; gap: .35rem; }
  .f-feld label { font-size: var(--t-xs); font-weight: 600; text-transform: uppercase; letter-spacing: .08em; color: var(--f-textLeise); }
  .f-feld input, .f-feld textarea, .f-feld select {
    font: inherit; font-size: var(--t-s); padding: .8rem .95rem;
    border: 1.5px solid var(--f-rand); border-radius: var(--r-m);
    background: var(--f-flaeche); color: var(--f-text); width: 100%;
  }
  .f-feld input:focus, .f-feld textarea:focus { border-color: var(--f-akzent); outline: none; }
  .f-form__hinweis {
    font-size: var(--t-xs); color: var(--f-textLeise);
    background: var(--f-bgAlt); border: 1px dashed var(--f-rand);
    border-radius: var(--r-m); padding: .7rem .9rem;
  }

  /* ── Fuss ────────────────────────────────────────────────────────── */
  .f-fuss { background: var(--f-bgTief); color: rgba(255,255,255,.72); padding-block: var(--a-l) var(--a-m); font-size: var(--t-s); }
  .f-fuss a { color: rgba(255,255,255,.9); }
  .f-fuss__grid { display: grid; grid-template-columns: 1.4fr 1fr 1fr; gap: var(--a-m); margin-bottom: var(--a-m); }
  @media (max-width: 760px) { .f-fuss__grid { grid-template-columns: 1fr; } }
  .f-fuss h4 { color: #fff; font-size: var(--t-s); text-transform: uppercase; letter-spacing: .1em; margin-bottom: .8rem; }
  .f-fuss__unten { border-top: 1px solid rgba(255,255,255,.14); padding-top: var(--a-s); display: flex; flex-wrap: wrap; gap: 1rem; justify-content: space-between; font-size: var(--t-xs); }

  /* ── Anruf-Leiste auf dem Handy ──────────────────────────────────── */
  .f-anrufleiste { display: none; }
  @media (max-width: 720px) {
    /* Der Anruf-Knopf in der Kopfzeile weicht der festen Leiste am unteren
       Rand — zwei Anruf-Knoepfe auf einem Handybildschirm sind einer zu viel.
       Diese Regel muss NACH .f-btn stehen: Media Queries erhoehen die
       Spezifitaet nicht, eine spaetere .f-btn-Regel wuerde das display hier
       sonst wieder ueberschreiben. */
    .f-nav__cta { display: none !important; }

    .f-anrufleiste {
      display: flex; position: fixed; bottom: 0; left: 0; right: 0; z-index: 60;
      background: var(--f-flaeche); border-top: 1px solid var(--f-rand);
      padding: .6rem .8rem calc(.6rem + env(safe-area-inset-bottom)); gap: .6rem;
      box-shadow: 0 -4px 20px rgba(0,0,0,.10);
    }
    .f-anrufleiste .f-btn { flex: 1; padding: .85rem 1rem; }
    body { padding-bottom: 4.6rem; }
  }

  /* ── Vorschau-Banner (rechtliche Leitplanke, nicht abschaltbar) ──── */
  .f-vorschau {
    position: relative; z-index: 80;
    background: #1D1D1F; color: #fff; font-size: 13px; line-height: 1.45;
    padding: .6rem 1.1rem; display: flex; flex-wrap: wrap; gap: .35rem 1rem;
    align-items: center; justify-content: center; text-align: center;
    font-family: var(--font-body);
  }
  .f-vorschau strong { color: #FFD166; font-weight: 650; }
  .f-vorschau a { color: #9FD5FF; }

  ${animationen ? `
  /* ── Einblenden beim Scrollen ────────────────────────────────────── */
  .f-anim { opacity: 0; transform: translateY(18px); transition: opacity .6s cubic-bezier(.22,.61,.36,1), transform .6s cubic-bezier(.22,.61,.36,1); }
  .f-anim.f-sichtbar { opacity: 1; transform: none; }
  @media (prefers-reduced-motion: reduce) { .f-anim { opacity: 1; transform: none; } }
  ` : ''}

  @media print {
    .f-nav, .f-anrufleiste, .f-vorschau { display: none !important; }
    body { padding-bottom: 0; }
  }`;
}

/**
 * Das einzige Skript im Prototyp. Absichtlich winzig: Einblendungen und ein
 * Jahreszahl-Platzhalter. Kein Bundle, kein Framework — die Seite funktioniert
 * vollstaendig auch ohne JavaScript.
 */
export const SKRIPT = `
(function(){
  if (!('IntersectionObserver' in window)) {
    document.querySelectorAll('.f-anim').forEach(function(e){ e.classList.add('f-sichtbar'); });
    return;
  }
  var beobachter = new IntersectionObserver(function(eintraege){
    eintraege.forEach(function(e){
      if (e.isIntersecting) { e.target.classList.add('f-sichtbar'); beobachter.unobserve(e.target); }
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: .08 });
  document.querySelectorAll('.f-anim').forEach(function(e){ beobachter.observe(e); });
})();
`.trim();

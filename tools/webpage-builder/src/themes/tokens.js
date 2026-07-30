/**
 * Design-Tokens.
 *
 * Ein Theme ist nichts als ein Satz vertauschter CSS-Variablen. Das Stylesheet
 * ist fuer alle Themes dasselbe — dadurch ist ein Themewechsel im Cockpit
 * augenblicklich und ein Design-Fehler nur einmal zu beheben.
 *
 * Die Skalen sind bewusst begrenzt. Vier Abstaende und sechs Schriftgroessen
 * sehen ruhiger aus als zwanzig frei gewaehlte Werte — genau daran erkennt man
 * professionell gebaute Seiten gegenueber Baukasten-Ergebnissen.
 *
 * Schriften: ausschliesslich Systemschriften. Keine Google Fonts. Das ist
 * kein Kompromiss, sondern ein Vorteil: null Ladezeit, kein DSG-Problem durch
 * Uebertragung von IP-Adressen an Google, und auf Schweizer Geraeten stehen
 * mit Helvetica/Segoe/Inter ohnehin die passenden Schriften bereit.
 */

const SANS_NEUTRAL = `"Inter", "Helvetica Neue", "Segoe UI", system-ui, -apple-system, sans-serif`;
const SERIF_WARM = `"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, "Times New Roman", serif`;
const SANS_ENG = `"Helvetica Neue", "Arial Narrow", "Segoe UI", system-ui, sans-serif`;

export const THEMES = {
  /**
   * warm — Gastro und Beauty.
   * Cremiger Hintergrund statt Weiss, Serifen-Ueberschriften, sattes Terrakotta.
   * Wirkt handgemacht statt austauschbar.
   */
  warm: {
    label: 'Warm',
    passtZu: ['gastro', 'beauty'],
    fonts: { display: SERIF_WARM, body: SANS_NEUTRAL },
    hell: {
      bg: '#FBF7F2',
      bgAlt: '#F4EDE4',
      bgTief: '#2A2019',
      flaeche: '#FFFFFF',
      text: '#241C16',
      textLeise: '#6B5C50',
      rand: '#E4D9CB',
      akzent: '#B5501F',
      akzentText: '#FFFFFF',
      akzentLeise: '#F6E4D8',
      gold: '#A8802C',
    },
    dunkel: {
      bg: '#1A1410',
      bgAlt: '#231B15',
      bgTief: '#100C09',
      flaeche: '#241C16',
      text: '#F2E9DF',
      textLeise: '#B3A192',
      rand: '#3A2E25',
      akzent: '#E07A42',
      akzentText: '#1A1410',
      akzentLeise: '#33241B',
      gold: '#D4A94F',
    },
    radius: { s: '4px', m: '10px', l: '18px', voll: '999px' },
    schatten: {
      s: '0 1px 2px rgba(36,28,22,.06)',
      m: '0 4px 16px -4px rgba(36,28,22,.12)',
      l: '0 24px 48px -16px rgba(36,28,22,.22)',
    },
  },

  /**
   * sharp — KFZ und Handwerk.
   * Enge Grotesk, harte Kanten, Signalfarbe. Kompetenz statt Gemuetlichkeit.
   * Ueberschriften in Grossbuchstaben mit negativer Laufweite.
   */
  sharp: {
    label: 'Technisch',
    passtZu: ['kfz', 'handwerk'],
    fonts: { display: SANS_ENG, body: SANS_NEUTRAL },
    hell: {
      bg: '#FFFFFF',
      bgAlt: '#F2F4F6',
      bgTief: '#111820',
      flaeche: '#FFFFFF',
      text: '#111820',
      textLeise: '#5A6673',
      rand: '#DDE3E9',
      akzent: '#C8102E',
      akzentText: '#FFFFFF',
      akzentLeise: '#FDEBEE',
      gold: '#F0A500',
    },
    dunkel: {
      bg: '#0E141A',
      bgAlt: '#161E26',
      bgTief: '#080C10',
      flaeche: '#161E26',
      text: '#EAF0F5',
      textLeise: '#93A2B0',
      rand: '#26313C',
      akzent: '#FF3B54',
      akzentText: '#0E141A',
      akzentLeise: '#2A1419',
      gold: '#FFC233',
    },
    radius: { s: '2px', m: '4px', l: '8px', voll: '999px' },
    schatten: {
      s: '0 1px 2px rgba(17,24,32,.08)',
      m: '0 4px 14px -3px rgba(17,24,32,.14)',
      l: '0 20px 40px -14px rgba(17,24,32,.26)',
    },
  },

  /**
   * clean — Auffangnetz und alles Seriose.
   * Zurueckhaltend, viel Weissraum, ruhiges Blau. Wenn wir die Branche nicht
   * kennen, ist Zurueckhaltung die sicherste Wahl.
   */
  clean: {
    label: 'Klar',
    passtZu: ['_default'],
    fonts: { display: SANS_NEUTRAL, body: SANS_NEUTRAL },
    hell: {
      bg: '#FFFFFF',
      bgAlt: '#F6F8FA',
      bgTief: '#14202E',
      flaeche: '#FFFFFF',
      text: '#14202E',
      textLeise: '#5C6B7A',
      rand: '#E1E7EC',
      akzent: '#15607A',
      akzentText: '#FFFFFF',
      akzentLeise: '#E4F1F6',
      gold: '#B8860B',
    },
    dunkel: {
      bg: '#0F161D',
      bgAlt: '#161F28',
      bgTief: '#090D12',
      flaeche: '#161F28',
      text: '#E8EFF4',
      textLeise: '#96A5B3',
      rand: '#243039',
      akzent: '#4FB3D4',
      akzentText: '#0F161D',
      akzentLeise: '#14262E',
      gold: '#D9AE44',
    },
    radius: { s: '4px', m: '8px', l: '14px', voll: '999px' },
    schatten: {
      s: '0 1px 2px rgba(20,32,46,.06)',
      m: '0 4px 14px -3px rgba(20,32,46,.10)',
      l: '0 20px 44px -16px rgba(20,32,46,.18)',
    },
  },
};

/** Skalen sind themenuebergreifend — sie machen den gemeinsamen Rhythmus aus. */
export const SKALEN = {
  abstand: { xs: '.5rem', s: '1rem', m: '2rem', l: '4rem', xl: '6.5rem', xxl: '9rem' },
  schrift: {
    xs: '.8125rem',
    s: '.9375rem',
    m: '1.0625rem',
    l: 'clamp(1.15rem, .9rem + .8vw, 1.4rem)',
    xl: 'clamp(1.6rem, 1.2rem + 1.6vw, 2.3rem)',
    xxl: 'clamp(2.2rem, 1.4rem + 3.4vw, 4rem)',
    hero: 'clamp(2.6rem, 1.4rem + 4.8vw, 5.2rem)',
  },
  breite: { text: '62ch', inhalt: '1180px', schmal: '760px' },
};

export function theme(name) {
  return THEMES[name] ?? THEMES.clean;
}

/** Erzeugt den :root-Block mit allen Variablen inklusive Dunkelmodus. */
export function tokensAlsCss(themeName) {
  const t = theme(themeName);
  const vars = (satz) => Object.entries(satz).map(([k, v]) => `    --f-${k}: ${v};`).join('\n');

  return `:root {
${vars(t.hell)}
${Object.entries(t.radius).map(([k, v]) => `    --r-${k}: ${v};`).join('\n')}
${Object.entries(t.schatten).map(([k, v]) => `    --s-${k}: ${v};`).join('\n')}
${Object.entries(SKALEN.abstand).map(([k, v]) => `    --a-${k}: ${v};`).join('\n')}
${Object.entries(SKALEN.schrift).map(([k, v]) => `    --t-${k}: ${v};`).join('\n')}
${Object.entries(SKALEN.breite).map(([k, v]) => `    --b-${k}: ${v};`).join('\n')}
    --font-display: ${t.fonts.display};
    --font-body: ${t.fonts.body};
    color-scheme: light dark;
  }

  @media (prefers-color-scheme: dark) {
    :root {
${vars(t.dunkel)}
    }
  }`;
}

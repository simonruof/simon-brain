/**
 * Kontaktdaten aus dem Fliesstext der Bestandsseite ziehen.
 *
 * Der Anlass ist eine Beobachtung an echten KMU-Seiten: Adresse, Telefon und
 * Oeffnungszeiten stehen praktisch immer da — nur eben als Fliesstext in einer
 * Tabellenzelle statt maschinenlesbar. Genau das ist ja der Befund, den wir
 * verkaufen.
 *
 * Ohne diese Extraktion waere der Prototyp auf die Places-API angewiesen. Mit
 * ihr entsteht auch ohne API-Key eine Seite mit echten Kontaktdaten — und der
 * Score-Sprung faellt deutlich hoeher aus, weil dieselben Angaben im Prototyp
 * strukturiert ausgezeichnet werden.
 *
 * Alle Muster sind auf Schweizer Schreibweisen ausgelegt: vierstellige PLZ,
 * Rufnummern wie 041 828 14 22, Zeiten mit Punkt statt Doppelpunkt.
 */

const WOCHENTAGE = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

const TAG_MUSTER = [
  { index: 1, re: /\b(montag|mo|mon)\b/i },
  { index: 2, re: /\b(dienstag|di|die)\b/i },
  { index: 3, re: /\b(mittwoch|mi|mit)\b/i },
  { index: 4, re: /\b(donnerstag|do|don)\b/i },
  { index: 5, re: /\b(freitag|fr|fre)\b/i },
  { index: 6, re: /\b(samstag|sa|sam)\b/i },
  { index: 0, re: /\b(sonntag|so|son)\b/i },
];

/** Schweizer Festnetz und Mobil, mit und ohne Landesvorwahl. */
export function telefon(text) {
  const treffer = String(text).match(
    /(?:\+41|0041|0)[\s.\-/]?\(?0?\d{2}\)?[\s.\-/]?\d{3}[\s.\-/]?\d{2}[\s.\-/]?\d{2}\b/g,
  );
  if (!treffer?.length) return '';

  // Die haeufigste Nummer gewinnt — sie steht meist in Kopf und Fuss.
  const zaehler = new Map();
  for (const t of treffer) {
    const sauber = t.replace(/[\s.\-/()]/g, '');
    zaehler.set(sauber, (zaehler.get(sauber) ?? 0) + 1);
  }
  const beste = [...zaehler.entries()].sort((a, b) => b[1] - a[1])[0][0];
  return formatiereTelefon(beste);
}

/** 0418281422 → 041 828 14 22 (Schweizer Schreibweise) */
export function formatiereTelefon(nr) {
  let n = String(nr).replace(/[^\d+]/g, '');
  if (n.startsWith('0041')) n = '0' + n.slice(4);
  if (n.startsWith('+41')) n = '0' + n.slice(3);
  if (n.length === 10 && n.startsWith('0')) {
    return `${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6, 8)} ${n.slice(8, 10)}`;
  }
  return nr;
}

export function email(text) {
  const treffer = String(text).match(/[\w.+-]+@[\w-]+\.[\w.-]{2,}/g);
  if (!treffer?.length) return '';
  // Adressen von Agenturen und Zaehldiensten aussortieren
  const echt = treffer.filter((m) => !/(example|sentry|wixpress|noreply|no-reply|webdesign|@\d)/i.test(m));
  return (echt[0] ?? treffer[0]).toLowerCase();
}

/**
 * Adresse: PLZ und Ort sind das verlaessliche Ankerpaar. Die Strasse steht
 * praktisch immer unmittelbar davor.
 */
export function adresse(text) {
  const t = String(text).replace(/\r/g, '');
  const plzOrt = t.match(/\b(\d{4})\s+([A-ZÄÖÜ][A-Za-zäöüéèàÄÖÜ\-'. ]{2,28}?)(?=\s*(?:\n|,|\||Tel|Telefon|$))/);
  if (!plzOrt) return null;

  const plz = plzOrt[1];
  const ort = plzOrt[2].trim().replace(/\s{2,}/g, ' ');

  // Rueckwaerts nach einer Strassenzeile suchen: Wortfolge mit Hausnummer
  const davor = t.slice(Math.max(0, plzOrt.index - 120), plzOrt.index);
  const strasseZeile = davor.match(
    /([A-ZÄÖÜ][A-Za-zäöüéèàÄÖÜ\-. ]{2,40}(?:strasse|str\.|weg|platz|gasse|allee|ring|park|hof|matte|feld|rain))\s*(\d+[a-z]?)/i,
  );

  return {
    strasse: strasseZeile ? strasseZeile[1].trim() : '',
    hausnummer: strasseZeile ? strasseZeile[2] : '',
    plz, ort,
    vollstaendig: [
      strasseZeile ? `${strasseZeile[1].trim()} ${strasseZeile[2]}` : null,
      `${plz} ${ort}`,
    ].filter(Boolean).join(', '),
  };
}

/**
 * Oeffnungszeiten. Liefert dieselbe Struktur wie 02-places, damit Renderer
 * und schema.org-Erzeugung nicht unterscheiden muessen, woher sie stammen.
 *
 * Beherrscht die drei Schreibweisen, die auf Schweizer KMU-Seiten vorkommen:
 *   "Montag bis Freitag 07.30 - 12.00 und 13.30 - 18.00"
 *   "Mo-Fr 8-12 / 13.30-18"
 *   "Samstag 08.00 - 12.00"
 */
export function oeffnungszeiten(text) {
  const t = String(text).replace(/ /g, ' ');

  // Nur den Abschnitt rund um das Stichwort betrachten — sonst faengt man
  // Preise und Jahreszahlen ein.
  const anker = t.search(/oeffnungszeit|öffnungszeit|geöffnet|geoeffnet|betriebszeiten|wir sind für sie da/i);
  const ausschnitt = anker >= 0 ? t.slice(anker, anker + 600) : t.slice(0, 1200);

  const zeiten = new Map(); // index → string[]
  const geschlossen = new Set();

  const ZEIT = String.raw`(\d{1,2})(?:[.:](\d{2}))?`;
  const SPANNE = new RegExp(`${ZEIT}\\s*(?:-|–|—|bis)\\s*${ZEIT}`, 'g');

  for (const zeile of ausschnitt.split(/\n|;|(?<=\d)\s{2,}/)) {
    if (!/\d/.test(zeile) && !/geschlossen|ruhetag/i.test(zeile)) continue;

    // Welche Tage betrifft die Zeile?
    const tage = [];
    const spanneRe = /\b(mo|montag|di|dienstag|mi|mittwoch|do|donnerstag|fr|freitag|sa|samstag|so|sonntag)\b\s*(?:-|–|bis)\s*\b(mo|montag|di|dienstag|mi|mittwoch|do|donnerstag|fr|freitag|sa|samstag|so|sonntag)\b/i;
    const spanne = zeile.match(spanneRe);

    if (spanne) {
      const von = TAG_MUSTER.find((m) => m.re.test(spanne[1]))?.index;
      const bis = TAG_MUSTER.find((m) => m.re.test(spanne[2]))?.index;
      if (von != null && bis != null) {
        // Wochenreihenfolge ab Montag: 1..6,0
        const folge = [1, 2, 3, 4, 5, 6, 0];
        const a = folge.indexOf(von); const b = folge.indexOf(bis);
        if (a >= 0 && b >= a) tage.push(...folge.slice(a, b + 1));
      }
    } else {
      for (const m of TAG_MUSTER) if (m.re.test(zeile)) tage.push(m.index);
    }
    if (!tage.length) continue;

    if (/geschlossen|ruhetag/i.test(zeile)) {
      for (const d of tage) geschlossen.add(d);
      continue;
    }

    const spannen = [];
    let m;
    SPANNE.lastIndex = 0;
    while ((m = SPANNE.exec(zeile))) {
      const h1 = Number(m[1]); const min1 = m[2] ?? '00';
      const h2 = Number(m[3]); const min2 = m[4] ?? '00';
      if (h1 > 24 || h2 > 24) continue;                 // Jahreszahl oder Preis
      if (h2 <= h1 && !(h1 >= 20 && h2 <= 4)) continue; // unplausibel
      spannen.push(`${String(h1).padStart(2, '0')}.${min1}–${String(h2).padStart(2, '0')}.${min2}`);
    }
    if (!spannen.length) continue;

    for (const d of tage) {
      zeiten.set(d, [...(zeiten.get(d) ?? []), ...spannen]);
    }
  }

  if (!zeiten.size && !geschlossen.size) return null;

  const folge = [1, 2, 3, 4, 5, 6, 0];
  const tage = folge.map((i) => ({
    tag: WOCHENTAGE[i],
    index: i,
    zeiten: [...new Set(zeiten.get(i) ?? [])],
    geschlossen: geschlossen.has(i) || !zeiten.has(i),
  }));

  const KURZ = { 1: 'Mo', 2: 'Tu', 3: 'We', 4: 'Th', 5: 'Fr', 6: 'Sa', 0: 'Su' };
  return {
    tage,
    text: tage.map((t2) => `${t2.tag}: ${t2.geschlossen ? 'geschlossen' : t2.zeiten.join(', ')}`),
    schema: tage.filter((t2) => !t2.geschlossen).flatMap((t2) =>
      t2.zeiten.map((z) => {
        const [von, bis] = z.split('–');
        return `${KURZ[t2.index]} ${von.replace('.', ':')}-${bis.replace('.', ':')}`;
      })),
    quelle: 'website',
  };
}

/** Alles auf einmal. Wird von 01-scrape aufgerufen. */
export function kontaktdaten(bodyText) {
  const text = String(bodyText ?? '');
  const adr = adresse(text);
  return {
    telefon: telefon(text),
    email: email(text),
    adresse: adr,
    oeffnungszeiten: oeffnungszeiten(text),
  };
}

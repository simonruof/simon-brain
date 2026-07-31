/**
 * Faktenpruefung der generierten Texte.
 *
 * Der Prompt in 05-copy verbietet erfundene Angaben. Verlassen kann man sich
 * darauf nicht — ein Sprachmodell erfindet ein Gruendungsjahr nicht aus
 * Boshaftigkeit, sondern weil "Familienbetrieb seit 1987" gut klingt und in
 * jedem zweiten Werkstatttext steht, den es je gesehen hat.
 *
 * Steht im Prototyp "seit 1998" und der Betrieb wurde 2004 gegruendet, ist
 * das Gespraech vorbei — und zwar endgueltig. Das ist der eine Fehler, der
 * sich nicht reparieren laesst: Wer beim ersten Kontakt eine falsche Zahl
 * ueber den eigenen Betrieb liest, glaubt danach gar nichts mehr.
 *
 * Deshalb dieses Netz. Es ist bewusst deterministisch und ohne API: Jede
 * pruefbare Behauptung im generierten Text muss sich in den Quellen
 * wiederfinden. Was nicht belegbar ist, wird gemeldet — und der Lead gilt
 * als nicht versandbereit, bis ein Mensch daraufgeschaut hat.
 *
 * Bewusst nicht automatisch korrigiert: Ein Satz, aus dem eine Zahl
 * herausgeschnitten wurde, liest sich oft schlimmer als der Fehler selbst.
 */

/** Was gepruefte Behauptungen sein koennen — je mit eigener Fundlogik. */
const MUSTER = [
  {
    typ: 'jahr',
    label: 'Jahreszahl',
    // "seit 1987", "gegruendet 1998", "seit ueber 30 Jahren"
    re: /\b(?:seit|gegr(?:ue|ü)ndet|ab|im Jahr[e]?)\s+((?:19|20)\d{2})\b/gi,
    wert: (m) => m[1],
    schwere: 'hoch',
    warum: 'Ein falsches Gruendungsjahr faellt dem Inhaber sofort auf.',
  },
  {
    typ: 'jahre',
    label: 'Zeitspanne',
    re: /\b(?:seit\s+)?(?:ue|ü)ber\s+(\d{1,3})\s+Jahre/gi,
    wert: (m) => m[1],
    schwere: 'hoch',
    warum: 'Behauptete Betriebsdauer ohne Beleg in den Quellen.',
  },
  {
    typ: 'anzahl',
    label: 'Mengenangabe',
    // "12 Mitarbeitern", "acht Mitarbeiter", "60 Plaetzen", "drei Standorte"
    //
    // Zwei Fallen, beide beim Testen aufgefallen:
    //   Deutsche Beugung — "Mitarbeitern" bricht eine Wortgrenze nach
    //   "Mitarbeiter". Deshalb Stamm plus beliebige Endung.
    //   Ausgeschriebene Zahlen — "acht Mitarbeiter" ist die haeufigste
    //   Schreibweise auf KMU-Seiten und wurde ohne ZAHLWORT gar nicht geprueft.
    re: /\b(\d{1,4}|zwei|drei|vier|f(?:ü|ue)nf|sechs|sieben|acht|neun|zehn|elf|zw(?:ö|oe)lf)\s+(Mitarbeiter\w*|Mitarbeitende\w*|Angestellte\w*|Pl(?:ä|ae)tze\w*|Sitzpl(?:ä|ae)tze\w*|Fahrzeug\w*|Standort\w*|Filiale\w*|Betten\w*|Zimmer\w*|Monteur\w*|Mechaniker\w*)\b/gi,
    wert: (m) => `${m[1]} ${m[2]}`,
    schwere: 'hoch',
    warum: 'Konkrete Zahlen ueber den Betrieb, die nicht in den Quellen stehen.',
  },
  {
    typ: 'preis',
    label: 'Preis',
    re: /\b(?:CHF|Fr\.?|SFr\.?)\s?(\d{1,5}(?:[.,]\d{2})?)\b/gi,
    wert: (m) => m[1],
    schwere: 'hoch',
    warum: 'Ein erfundener Preis ist der schnellste Weg zu einer Beschwerde.',
  },
  {
    typ: 'zertifikat',
    label: 'Zertifizierung',
    re: /\b(ISO\s?\d{4,5}|SQS|EN\s?\d{3,5}|Meisterbetrieb|eidg(?:\.|enoessisch|enössisch)[a-zäöü\s]{0,20}(?:Fachausweis|Diplom)|Suisse Garantie|Gault\s?Millau|Michelin)\b/gi,
    wert: (m) => m[1],
    schwere: 'hoch',
    warum: 'Eine behauptete Zertifizierung ohne Beleg ist rechtlich heikel.',
  },
  {
    typ: 'garantie',
    label: 'Garantiezusage',
    re: /\b(\d{1,2})\s?(?:Jahre?|Monate?)\s+Garantie\b/gi,
    wert: (m) => m[0],
    schwere: 'hoch',
    warum: 'Garantiezusagen sind bindend — sie duerfen nicht erfunden werden.',
  },
  {
    typ: 'auszeichnung',
    label: 'Auszeichnung',
    re: /\b(ausgezeichnet als|pr(?:ae|ä)miert|Testsieger|Nummer\s?1|Marktf(?:ue|ü)hrer|beste[rs]?\s+\w+\s+(?:der|in)\s+(?:Region|Schweiz|Zentralschweiz))\b/gi,
    wert: (m) => m[1],
    schwere: 'hoch',
    warum: 'Unbelegte Spitzenstellungsbehauptung — nach UWG angreifbar.',
  },
];

/**
 * Ausgeschriebene Zahlen zu Ziffern.
 *
 * Ohne diese Abbildung entsteht ein Fehlalarm, sobald Quelle und generierter
 * Text dieselbe Zahl unterschiedlich schreiben: "acht Mitarbeiter" im Entwurf
 * gegen "8 Mitarbeiter" auf der Bestandsseite. Beide Seiten werden deshalb
 * auf Ziffern gebracht, bevor verglichen wird.
 */
const ZAHLWORT = {
  zwei: '2', drei: '3', vier: '4', fuenf: '5', sechs: '6',
  sieben: '7', acht: '8', neun: '9', zehn: '10', elf: '11', zwoelf: '12',
};

/** Vergleichstext normalisieren, damit Schreibvarianten nicht stoeren. */
function normalisiere(text) {
  let t = String(text ?? '')
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue')
    .replace(/[’'`]/g, "'")
    .replace(/\s+/g, ' ');
  for (const [wort, ziffer] of Object.entries(ZAHLWORT)) {
    t = t.replace(new RegExp(`\\b${wort}\\b`, 'g'), ziffer);
  }
  return t;
}

/**
 * Deutsche Beugungsendung abschneiden, damit "12 mitarbeitern" im Entwurf
 * und "12 mitarbeiter" in der Quelle als dieselbe Angabe gelten.
 *
 * Mehrfach bis zur Stabilitaet, weil ein einzelner Durchlauf die beiden Formen
 * NICHT zusammenbringt: "mitarbeitern" verliert nur das -n und landet bei
 * "mitarbeiter", waehrend "mitarbeiter" das -er verliert und bei "mitarbeit"
 * landet. Erst der zweite Durchlauf fuehrt beide auf "mitarbeit" zusammen.
 * Beim Testen aufgefallen — die Fassung mit einem Durchlauf erzeugte genau
 * den Fehlalarm, den diese Funktion verhindern soll.
 */
function stamm(wert) {
  let t = normalisiere(wert);
  for (let i = 0; i < 3; i++) {
    const vorher = t;
    t = t.replace(/(?:nen|en|er|es|em|n|e|s)\b/g, '');
    if (t === vorher) break;
  }
  return t;
}

/**
 * Alles zusammentragen, was als Beleg gilt: die Bestandsseite, das
 * Google-Profil, die Bewertungstexte und die Playbook-Vorgaben.
 *
 * Die Playbook-Vorgaben zaehlen als Quelle, weil sie von Hand geschrieben
 * wurden und keine Aussage ueber diesen konkreten Betrieb treffen —
 * "Kostenvoranschlag vorab" ist ein Leistungsversprechen der Vorlage,
 * keine erfundene Tatsache.
 */
export function quellenText(profil, playbook) {
  const teile = [
    profil.scrape?.bodyText,
    profil.scrape?.titel,
    profil.scrape?.metaDescription,
    ...(profil.scrape?.h1 ?? []),
    ...(profil.scrape?.h2 ?? []),
    ...(profil.scrape?.h3 ?? []),
    profil.places?.name,
    profil.places?.beschreibung,
    profil.places?.adresse,
    profil.places?.typLabel,
    ...(profil.places?.bewertungen ?? []).map((b) => b.text),
    ...(profil.places?.oeffnungszeiten?.text ?? []),
    // Playbook-Vorgaben: von Hand geschrieben, ohne Aussage ueber den Betrieb
    JSON.stringify(playbook?.copy_brief?.leistungen_fallback ?? []),
    JSON.stringify(playbook?.copy_brief?.prozess_fallback ?? []),
    JSON.stringify(playbook?.copy_brief?.highlights_fallback ?? []),
    JSON.stringify(playbook?.trust_signale ?? []),
  ];
  return normalisiere(teile.filter(Boolean).join('\n'));
}

/** Alle Textfelder des Copy-Objekts einsammeln, mit ihrer Herkunft. */
function textFelder(copy) {
  const felder = [];
  const sammle = (wert, pfad) => {
    if (typeof wert === 'string') {
      if (wert.trim()) felder.push({ pfad, text: wert });
    } else if (Array.isArray(wert)) {
      wert.forEach((v, i) => sammle(v, `${pfad}[${i}]`));
    } else if (wert && typeof wert === 'object') {
      for (const [k, v] of Object.entries(wert)) {
        if (k.startsWith('_')) continue; // interne Felder wie _quelle
        sammle(v, pfad ? `${pfad}.${k}` : k);
      }
    }
  };
  sammle(copy, '');
  return felder;
}

/**
 * Prueft den generierten Text gegen die Quellen.
 *
 * @param {object} copy      Ergebnis von 05-copy
 * @param {object} profil    Lead-Profil (fuer die Quellen)
 * @param {object} playbook  Branchen-Playbook
 * @returns {{versandbereit:boolean, verdaechtig:Array, geprueft:number, quellenLaenge:number}}
 */
export function pruefeFakten(copy, profil, playbook) {
  const quellen = quellenText(profil, playbook);
  const quellenStamm = stamm(quellen);
  const felder = textFelder(copy);
  const verdaechtig = [];
  let geprueft = 0;

  for (const feld of felder) {
    for (const muster of MUSTER) {
      muster.re.lastIndex = 0;
      let treffer;
      while ((treffer = muster.re.exec(feld.text))) {
        geprueft++;
        const wert = normalisiere(muster.wert(treffer));

        // Belegt, wenn der Wert in den Quellen auftaucht — entweder wörtlich
        // oder nach Abschneiden der Beugungsendung.
        //
        // Bewusst grosszuegig ausgelegt: Der teuerste Fehler ist nicht eine
        // uebersehene Behauptung, sondern der Fehlalarm. Nach dem dritten
        // grundlosen Alarm schaut niemand mehr hin, und dann faengt die
        // Pruefung auch die echten Faelle nicht mehr ab.
        if (quellen.includes(wert)) continue;
        if (quellenStamm.includes(stamm(wert))) continue;

        verdaechtig.push({
          typ: muster.typ,
          label: muster.label,
          behauptung: treffer[0].trim(),
          feld: feld.pfad,
          umgebung: umgebung(feld.text, treffer.index, treffer[0].length),
          schwere: muster.schwere,
          warum: muster.warum,
        });
      }
    }
  }

  return {
    versandbereit: verdaechtig.length === 0,
    verdaechtig,
    geprueft,
    quellenLaenge: quellen.length,
    geprueftAm: new Date().toISOString(),
  };
}

/** Den Satz um die Fundstelle herum, damit man sie im Cockpit einordnen kann. */
function umgebung(text, index, laenge) {
  const von = Math.max(0, text.lastIndexOf('.', index) + 1);
  const bisPunkt = text.indexOf('.', index + laenge);
  const bis = bisPunkt === -1 ? text.length : bisPunkt + 1;
  return text.slice(von, bis).trim().slice(0, 220);
}

/** Kurzfassung fuer Protokollzeilen und den Report. */
export function zusammenfassung(ergebnis) {
  if (ergebnis.versandbereit) {
    return `${ergebnis.geprueft} Behauptungen geprueft, alle belegt`;
  }
  const arten = [...new Set(ergebnis.verdaechtig.map((v) => v.label))];
  return `${ergebnis.verdaechtig.length} von ${ergebnis.geprueft} Behauptungen nicht belegt (${arten.join(', ')})`;
}

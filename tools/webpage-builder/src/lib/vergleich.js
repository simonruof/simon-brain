/**
 * Konkurrenzvergleich innerhalb eines Laufs.
 *
 * Eine Punktzahl allein ist abstrakt. "Sie erreichen 22 von 100" laesst sich
 * wegargumentieren ("was soll das schon heissen"). "Von den 12 Werkstaetten
 * Ihrer Region, die ich angeschaut habe, liegen 9 vor Ihnen" laesst sich nicht
 * wegargumentieren — das ist eine Rangliste, und niemand ist gern hinten.
 *
 * Der Clou: Das kostet keinen einzigen zusaetzlichen API-Aufruf. In einem
 * Batch sind die Leads einander bereits Konkurrenz — dieselbe Region,
 * dieselbe Branche, alle schon bewertet. Die Daten liegen vor, es fehlte nur
 * die Auswertung.
 *
 * Bewusst OHNE Namensnennung. Vergleichende Werbung mit Nennung des
 * Mitbewerbers ist in einer unaufgeforderten Kaltakquise-Mail nach UWG
 * angreifbar — und die anonyme Fassung wirkt ohnehin staerker, weil sie
 * offenlaesst, wer gemeint ist.
 */

/** Unter dieser Gruppengroesse ist ein Rang kein Argument. */
const MINDESTGRUPPE = 4;

const median = (zahlen) => {
  if (!zahlen.length) return null;
  const s = [...zahlen].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};

/** Gruppenschluessel: Region und Branche. Ort normalisiert, damit
 *  "Gersau" und "gersau " zusammenfallen. */
function gruppe(p) {
  const ort = (p.places?.ort || p.eingabe?.ort || '').trim().toLowerCase();
  const branche = p.klassifikation?.playbook ?? '_default';
  return `${branche}|${ort}`;
}

/**
 * Berechnet fuer jeden Lead seinen Rang innerhalb seiner Gruppe und schreibt
 * das Ergebnis nach `profil.vergleich`. Veraendert die uebergebenen Objekte.
 *
 * @param {object[]} profile  alle Profile eines Laufs
 * @param {{minGruppe?:number, regionsweit?:boolean}} opts
 *        regionsweit: Ort ignorieren und nur nach Branche gruppieren — sinnvoll,
 *        wenn ein Batch viele Doerfer mit je zwei Betrieben umfasst.
 * @returns {{gruppen:number, bewertet:number}}
 */
export function rangBerechnen(profile, opts = {}) {
  const minGruppe = opts.minGruppe ?? MINDESTGRUPPE;

  // Nur Leads mit gemessenem Score zaehlen. Ein fehlgeschlagener Lead
  // verfaelscht sonst die Rangliste nach unten.
  //
  // Zusaetzlich nach Slug entdoppeln: Enthaelt eine CSV denselben Betrieb
  // zweimal (etwa unter zwei Schreibweisen), liefert profilFuer beide Male
  // dasselbe Objekt — dieselbe Referenz stuende dann mehrfach in der Liste
  // und die Gruppe waere kuenstlich gross. "9 von 12" waeren in Wahrheit
  // "9 von 8", und diese Zahl geht woertlich in eine Mail an einen fremden
  // Betrieb. Beim Testen aufgefallen.
  const gesehen = new Set();
  const bewertbar = profile.filter((p) => {
    if (typeof p.auditVorher?.score !== 'number') return false;
    if (gesehen.has(p.slug)) return false;
    gesehen.add(p.slug);
    return true;
  });

  const gruppen = new Map();
  for (const p of bewertbar) {
    const schluessel = opts.regionsweit ? (p.klassifikation?.playbook ?? '_default') : gruppe(p);
    if (!gruppen.has(schluessel)) gruppen.set(schluessel, []);
    gruppen.get(schluessel).push(p);
  }

  let bewertet = 0;
  for (const [schluessel, mitglieder] of gruppen) {
    if (mitglieder.length < minGruppe) {
      // Zu kleine Gruppe: alten Vergleich entfernen, damit kein veralteter
      // Rang aus einem frueheren Lauf stehen bleibt.
      for (const p of mitglieder) delete p.vergleich;
      continue;
    }

    const scores = mitglieder.map((p) => p.auditVorher.score);
    const sortiert = [...mitglieder].sort((a, b) => b.auditVorher.score - a.auditVorher.score);
    const med = median(scores);
    const bester = Math.max(...scores);

    sortiert.forEach((p, i) => {
      const besser = sortiert.filter((x) => x.auditVorher.score > p.auditVorher.score).length;
      p.vergleich = {
        gruppe: schluessel,
        platz: i + 1,
        von: mitglieder.length,
        besserAls: mitglieder.length - besser - 1,
        schlechterAls: besser,
        median: med,
        bestwert: bester,
        eigenerWert: p.auditVorher.score,
        berechnetAm: new Date().toISOString(),
      };
      bewertet++;
    });
  }

  return { gruppen: [...gruppen.values()].filter((g) => g.length >= minGruppe).length, bewertet };
}

/**
 * Der Satz fuer die Outreach-Mail. Anonym, mit Zahlen, ohne Wertung.
 * Gibt null zurueck, wenn der Vergleich nichts hergibt — dann bleibt die
 * Mail eben kuerzer, statt eine schwache Aussage zu enthalten.
 */
export function vergleichsSatz(profil, branchenLabel = 'Betriebe') {
  const v = profil.vergleich;
  if (!v) return null;

  const ort = profil.places?.ort || profil.eingabe?.ort || 'Ihrer Region';

  // Wer vorne liegt, bekommt keinen Vergleichssatz. Ihn darauf hinzuweisen,
  // dass er der Beste einer schwachen Gruppe ist, verkauft nichts.
  if (v.schlechterAls === 0) return null;

  if (v.schlechterAls === 1) {
    return `Ich habe ${v.von} ${branchenLabel} in ${ort} angeschaut. Einer davon erreicht einen besseren Wert als Ihre Seite.`;
  }
  return `Ich habe ${v.von} ${branchenLabel} in ${ort} angeschaut. ${v.schlechterAls} davon erreichen einen besseren Wert als Ihre Seite — der beste liegt bei ${v.bestwert} Punkten.`;
}

/** Kurzform fuer Report und Cockpit: "Platz 9 von 12". */
export function rangText(profil) {
  const v = profil.vergleich;
  if (!v) return null;
  return `Platz ${v.platz} von ${v.von}`;
}

/**
 * Stage 03 — Branche bestimmen.
 *
 * Drei Signale, absteigend nach Verlaesslichkeit:
 *
 *   1. Google-Places-Typ. Von Google kuratiert, praktisch immer richtig.
 *   2. Schlagworte im Seitentext. Gewichtet nach Fundstelle — was im Titel
 *      steht, wiegt schwerer als was im Footer steht.
 *   3. Der Betriebsname selbst. "Garage Mueller" ist eindeutig.
 *
 * Bewusst ohne Sprachmodell: Das hier ist ein Abgleich, kein Verstaendnisproblem.
 * Ein API-Aufruf pro Lead waere fuer diese Aufgabe verschwendetes Geld und
 * ausserdem nicht reproduzierbar.
 */

import { emit } from '../core/events.js';
import { ladePlaybooks } from '../lib/playbooks.js';

export default {
  id: 'classify',
  titel: 'Branche bestimmen',

  braucht() { return null; }, // faellt notfalls auf _default zurueck

  async run(profil) {
    const playbooks = ladePlaybooks().filter((p) => p.id !== '_default');

    const placesTypen = [
      profil.places?.typ, ...(profil.places?.typen ?? []),
    ].filter(Boolean).map((t) => String(t).toLowerCase());

    // Fundstellen unterschiedlich gewichten — der Titel sagt mehr als der Fliesstext
    const felder = [
      { text: profil.places?.name ?? '', gewicht: 4 },
      { text: profil.places?.typLabel ?? '', gewicht: 4 },
      { text: profil.eingabe.name ?? '', gewicht: 3 },
      { text: profil.scrape?.titel ?? '', gewicht: 3 },
      { text: (profil.scrape?.h1 ?? []).join(' '), gewicht: 3 },
      { text: profil.eingabe.url ?? '', gewicht: 2 },
      { text: (profil.scrape?.nav ?? []).join(' '), gewicht: 2 },
      { text: (profil.scrape?.h2 ?? []).join(' '), gewicht: 1.5 },
      { text: profil.scrape?.metaDescription ?? '', gewicht: 1.5 },
      { text: (profil.scrape?.bodyText ?? '').slice(0, 8000), gewicht: 0.9 },
    ].map((f) => ({ ...f, text: f.text.toLowerCase() }));

    const bewertungen = playbooks.map((pb) => {
      let punkte = 0;
      const treffer = [];
      let verschiedene = 0;

      for (const typ of pb.match.places_types ?? []) {
        if (placesTypen.includes(String(typ).toLowerCase())) {
          punkte += 25;
          treffer.push(`Google-Typ "${typ}"`);
        }
      }

      for (const wort of pb.match.keywords ?? []) {
        const w = String(wort).toLowerCase();
        for (const f of felder) {
          if (!f.text.includes(w)) continue;
          // Ein Wort zaehlt pro Feld einmal — sonst gewinnt der laengste Text
          punkte += f.gewicht;
          verschiedene++;
          if (f.gewicht >= 3) treffer.push(`"${wort}"`);
          break;
        }
      }

      // Bonus fuer Vielfalt. Genau die Zielgruppe — alte Tabellen-Seiten ohne
      // Ueberschriften, Navigation oder Auszeichnung — traegt ihre Branche
      // ausschliesslich im Fliesstext. Fuenf verschiedene Fachbegriffe darin
      // sind ein staerkeres Signal als ein einzelner Treffer im Seitentitel.
      if (verschiedene >= 5) punkte += 8;
      else if (verschiedene >= 3) punkte += 4;

      return {
        playbook: pb.id, label: pb.label,
        punkte: punkte * (pb.match.gewicht ?? 1),
        verschiedene,
        treffer: [...new Set(treffer)].slice(0, 6),
      };
    }).sort((a, b) => b.punkte - a.punkte);

    const bester = bewertungen[0];
    const zweiter = bewertungen[1];

    // Schwelle: unter 8 Punkten ist es Rauschen, nicht Erkennung.
    const sicher = bester && bester.punkte >= 8;
    const abstand = bester && zweiter ? bester.punkte - zweiter.punkte : 99;

    profil.klassifikation = {
      playbook: sicher ? bester.playbook : '_default',
      label: sicher ? bester.label : 'Allgemein',
      punkte: bester?.punkte ?? 0,
      sicherheit: !sicher ? 'niedrig' : abstand < 6 ? 'mittel' : 'hoch',
      begruendung: sicher
        ? `Erkannt an: ${bester.treffer.join(', ') || 'Schlagworten im Seitentext'}`
        : 'Keine Branche sicher erkannt — allgemeines Playbook wird verwendet.',
      alternativen: bewertungen.slice(0, 3).map((b) => ({ playbook: b.playbook, punkte: Math.round(b.punkte) })),
    };

    emit('info', {
      lead: profil.slug,
      text: `Branche: ${profil.klassifikation.label} (Sicherheit ${profil.klassifikation.sicherheit})`,
    });
  },
};

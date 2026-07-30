/**
 * Stage 02 — Google Business Profile anreichern.
 *
 * Das hier ist der Unterschied zwischen "schoene Vorlage" und "das ist mein Laden".
 * Echte Oeffnungszeiten, echte Bewertungen mit echten Namen, echte Fotos vom
 * Betrieb. Genau diese Daten kann kein generischer Website-Baukasten liefern —
 * und genau sie erzeugen beim Empfaenger den Moment, der das Gespraech eroeffnet.
 *
 * Ohne Places-Key wird uebersprungen statt zu scheitern; der Prototyp verliert
 * dann seine staerkste Wirkung, entsteht aber trotzdem.
 */

import { config } from '../core/config.js';
import { emit } from '../core/events.js';
import { textSuche, details, ortAus } from '../lib/places-api.js';

const WOCHENTAGE = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

/** Places liefert Zeiten als Perioden. Wir wollen eine anzeigbare Woche. */
function oeffnungszeiten(hours) {
  if (!hours) return null;
  const tage = Array.from({ length: 7 }, (_, i) => ({ tag: WOCHENTAGE[i], index: i, zeiten: [], geschlossen: true }));
  for (const p of hours.periods ?? []) {
    const tag = tage[p.open?.day ?? 0];
    if (!tag) continue;
    const fmt = (x) => x ? `${String(x.hour ?? 0).padStart(2, '0')}.${String(x.minute ?? 0).padStart(2, '0')}` : '';
    if (!p.close) { tag.zeiten = ['durchgehend']; tag.geschlossen = false; continue; }
    tag.zeiten.push(`${fmt(p.open)}–${fmt(p.close)}`);
    tag.geschlossen = false;
  }
  // Montag zuerst — Sonntag als erster Wochentag ist eine US-Konvention
  const sortiert = [...tage.slice(1), tage[0]];
  return {
    tage: sortiert,
    text: hours.weekdayDescriptions ?? [],
    // Fuer schema.org: "Mo-Fr 08:00-18:00"
    schema: (hours.periods ?? []).map((p) => {
      if (!p.close) return null;
      const d = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'][p.open.day];
      const z = (x) => `${String(x.hour ?? 0).padStart(2, '0')}:${String(x.minute ?? 0).padStart(2, '0')}`;
      return `${d} ${z(p.open)}-${z(p.close)}`;
    }).filter(Boolean),
  };
}

/** Nur Bewertungen, die als Zitat taugen: genug Text, positive Note. */
function brauchbareBewertungen(reviews = []) {
  return reviews
    .map((r) => ({
      autor: r.authorAttribution?.displayName ?? 'Google-Nutzer',
      bild: r.authorAttribution?.photoUri ?? '',
      note: r.rating ?? 0,
      text: (r.originalText?.text ?? r.text?.text ?? '').replace(/\s+/g, ' ').trim(),
      wann: r.relativePublishTimeDescription ?? '',
      sprache: r.originalText?.languageCode ?? r.text?.languageCode ?? '',
    }))
    .filter((r) => r.note >= 4 && r.text.length >= 40)
    .sort((a, b) => b.note - a.note || b.text.length - a.text.length)
    .slice(0, 6);
}

export default {
  id: 'places',
  titel: 'Google-Profil anreichern',
  brauchtText: 'GOOGLE_PLACES_API_KEY',

  braucht(profil) {
    if (!config.placesKey) {
      return 'GOOGLE_PLACES_API_KEY fehlt — ohne Bewertungen, Fotos und Oeffnungszeiten wirkt der Prototyp generisch';
    }
    if (!profil.eingabe.placeId && !profil.eingabe.name && !profil.eingabe.url && !profil.scrape?.name) {
      return 'kein Name, keine URL und keine Place-ID — nichts zum Suchen';
    }
    return null;
  },

  async run(profil) {
    let placeId = profil.eingabe.placeId;

    if (!placeId) {
      // Ueber Name + Ort suchen. Die Domain hilft beim Abgleich, falls es
      // mehrere Betriebe mit aehnlichem Namen gibt.
      const name = profil.eingabe.name || profil.scrape?.name || '';
      const ort = profil.eingabe.ort || '';
      const antwort = await textSuche({ anfrage: name, ort, maxErgebnisse: 5 });
      const treffer = antwort.places ?? [];

      const domain = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
      const eigene = domain(profil.scrape?.finalUrl || profil.eingabe.url);

      const passend = (eigene && treffer.find((p) => domain(p.websiteUri) === eigene)) || treffer[0];
      if (!passend) {
        emit('warn', { lead: profil.slug, text: `Kein Google-Profil gefunden fuer "${name} ${ort}"` });
        profil.places = null;
        return;
      }
      placeId = passend.id;
    }

    const d = await details(placeId);

    profil.places = {
      placeId,
      name: d.displayName?.text ?? '',
      adresse: d.formattedAddress ?? '',
      adresseKurz: d.shortFormattedAddress ?? '',
      ort: ortAus(d),
      strasse: (d.addressComponents ?? []).find((k) => k.types?.includes('route'))?.longText ?? '',
      hausnummer: (d.addressComponents ?? []).find((k) => k.types?.includes('street_number'))?.longText ?? '',
      plz: (d.addressComponents ?? []).find((k) => k.types?.includes('postal_code'))?.longText ?? '',
      land: (d.addressComponents ?? []).find((k) => k.types?.includes('country'))?.shortText ?? 'CH',
      koordinaten: d.location ? { lat: d.location.latitude, lng: d.location.longitude } : null,
      telefon: d.nationalPhoneNumber ?? '',
      telefonIntl: d.internationalPhoneNumber ?? '',
      website: d.websiteUri ?? '',
      rating: d.rating ?? null,
      anzahlBewertungen: d.userRatingCount ?? 0,
      bewertungen: brauchbareBewertungen(d.reviews),
      fotos: (d.photos ?? []).slice(0, 12).map((f) => ({
        name: f.name, breite: f.widthPx, hoehe: f.heightPx,
        quelle: f.authorAttributions?.[0]?.displayName ?? '',
      })),
      oeffnungszeiten: oeffnungszeiten(d.regularOpeningHours),
      typ: d.primaryType ?? '',
      typLabel: d.primaryTypeDisplayName?.text ?? '',
      typen: d.types ?? [],
      status: d.businessStatus ?? '',
      preisniveau: d.priceLevel ?? '',
      mapsUrl: d.googleMapsUri ?? '',
      beschreibung: d.editorialSummary?.text ?? '',
      geholtAm: new Date().toISOString(),
    };

    emit('info', {
      lead: profil.slug,
      text: `${profil.places.name} · ${profil.places.rating ?? '–'}★ aus ${profil.places.anzahlBewertungen} · `
        + `${profil.places.bewertungen.length} zitierbar · ${profil.places.fotos.length} Fotos`,
    });
  },
};

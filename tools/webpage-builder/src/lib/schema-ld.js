/**
 * schema.org JSON-LD und llms.txt.
 *
 * Das ist der Teil, der den KI-Sichtbarkeits-Score von 30 auf 95 hebt — und
 * damit das Verkaufsargument technisch einloest statt es nur zu behaupten.
 *
 * JSON-LD sagt einem Sprachmodell in maschinenlesbarer Form, was fuer ein
 * Betrieb das ist, wo er liegt, wann er offen hat und wie gut er bewertet ist.
 * Ohne diese Auszeichnung muss das Modell aus Fliesstext raten.
 */

import { esc } from './guard.js';

export function jsonLd(d, schemaTyp) {
  const knoten = {
    '@context': 'https://schema.org',
    '@type': schemaTyp || 'LocalBusiness',
    name: d.name,
    url: d.previewUrl || undefined,
  };

  if (d.beschreibung || d.copy?.metaBeschreibung) {
    knoten.description = d.copy?.metaBeschreibung || d.beschreibung;
  }
  if (d.telefon) knoten.telephone = d.telefonIntl || d.telefon;
  if (d.mail) knoten.email = d.mail;
  if (d.heroBild?.datei) knoten.image = d.heroBild.datei;

  if (d.adresse || d.ort) {
    knoten.address = {
      '@type': 'PostalAddress',
      streetAddress: [d.strasse, d.hausnummer].filter(Boolean).join(' ') || undefined,
      postalCode: d.plz || undefined,
      addressLocality: d.ort || undefined,
      addressCountry: d.land || 'CH',
    };
  }
  if (d.koordinaten) {
    knoten.geo = { '@type': 'GeoCoordinates', latitude: d.koordinaten.lat, longitude: d.koordinaten.lng };
  }

  // Oeffnungszeiten strukturiert — beantwortet "hat der jetzt offen?"
  if (d.oeffnungszeiten?.tage?.length) {
    const TAG = { Montag: 'Monday', Dienstag: 'Tuesday', Mittwoch: 'Wednesday', Donnerstag: 'Thursday', Freitag: 'Friday', Samstag: 'Saturday', Sonntag: 'Sunday' };
    knoten.openingHoursSpecification = d.oeffnungszeiten.tage
      .filter((t) => !t.geschlossen && t.zeiten.length)
      .flatMap((t) => t.zeiten.map((z) => {
        const [von, bis] = String(z).split('–');
        if (!bis) return null;
        return {
          '@type': 'OpeningHoursSpecification',
          dayOfWeek: `https://schema.org/${TAG[t.tag] ?? t.tag}`,
          opens: von.replace('.', ':'),
          closes: bis.replace('.', ':'),
        };
      }).filter(Boolean));
  }

  if (d.rating && d.anzahlBewertungen) {
    knoten.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: d.rating,
      reviewCount: d.anzahlBewertungen,
      bestRating: 5, worstRating: 1,
    };
  }

  if (d.bewertungen?.length) {
    knoten.review = d.bewertungen.slice(0, 3).map((b) => ({
      '@type': 'Review',
      author: { '@type': 'Person', name: b.autor },
      reviewRating: { '@type': 'Rating', ratingValue: b.note, bestRating: 5 },
      reviewBody: b.text.slice(0, 400),
    }));
  }

  if (d.copy?.leistungen?.length) {
    knoten.hasOfferCatalog = {
      '@type': 'OfferCatalog',
      name: 'Leistungen',
      itemListElement: d.copy.leistungen.map((l) => ({
        '@type': 'Offer',
        itemOffered: { '@type': 'Service', name: l.titel, description: l.text },
        ...(l.preis && /\d/.test(l.preis) ? { price: String(l.preis).replace(/[^\d.]/g, ''), priceCurrency: 'CHF' } : {}),
      })),
    };
  }

  if (d.sozial && Object.keys(d.sozial).length) knoten.sameAs = Object.values(d.sozial);
  if (d.mapsUrl) knoten.hasMap = d.mapsUrl;

  return JSON.stringify(knoten, (_, v) => (v === undefined ? undefined : v), 2);
}

/**
 * llms.txt — der neue Standard, mit dem eine Seite Sprachmodellen direkt
 * erklaert, worum es geht. Praktisch kein Schweizer KMU hat das. Genau deshalb
 * ist es im Verkaufsgespraech ein starkes Detail: nachweisbar, konkret, neu.
 */
export function llmsTxt(d) {
  const zeilen = [`# ${d.name}`, ''];
  if (d.copy?.hero?.lead || d.beschreibung) zeilen.push(`> ${d.copy?.hero?.lead || d.beschreibung}`, '');

  zeilen.push('## Betrieb', '');
  if (d.branche) zeilen.push(`- Art: ${d.branche}`);
  if (d.adresse) zeilen.push(`- Adresse: ${d.adresse}`);
  if (d.telefon) zeilen.push(`- Telefon: ${d.telefon}`);
  if (d.mail) zeilen.push(`- E-Mail: ${d.mail}`);
  if (d.rating) zeilen.push(`- Google-Bewertung: ${d.rating} von 5 (${d.anzahlBewertungen} Bewertungen)`);
  zeilen.push('');

  if (d.oeffnungszeiten?.text?.length) {
    zeilen.push('## Oeffnungszeiten', '', ...d.oeffnungszeiten.text.map((z) => `- ${z}`), '');
  }

  if (d.copy?.leistungen?.length) {
    zeilen.push('## Leistungen', '');
    for (const l of d.copy.leistungen) {
      zeilen.push(`- **${l.titel}**: ${l.text}${l.preis ? ` (${l.preis})` : ''}`);
    }
    zeilen.push('');
  }

  if (d.copy?.about) zeilen.push('## Ueber uns', '', d.copy.about, '');

  zeilen.push('## Hinweis', '',
    'Diese Seite ist ein unverbindlicher Entwurf und kein offizieller Auftritt des Betriebs.');

  return zeilen.join('\n');
}

/** Die JSON-LD-Auszeichnung als fertiger Script-Block. */
export function jsonLdTag(d, schemaTyp) {
  return `<script type="application/ld+json">\n${jsonLd(d, schemaTyp)}\n</script>`;
}

export { esc };

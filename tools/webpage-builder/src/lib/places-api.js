/**
 * Google Places API (New) — duenner Wrapper.
 *
 * Nur die drei Endpunkte, die wir brauchen. Feldmasken sind bewusst eng
 * gehalten: Places rechnet nach angeforderten Feldern ab, jedes ungenutzte
 * Feld ist bezahltes Nichts.
 */

import { requireKey } from '../core/config.js';
import { networkError } from '../core/errors.js';

const BASIS = 'https://places.googleapis.com/v1';

async function anfrage(pfad, { methode = 'POST', body, felder }) {
  const key = requireKey('placesKey');
  const kopf = { 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': felder };
  if (body) kopf['Content-Type'] = 'application/json';

  let res;
  try {
    res = await fetch(`${BASIS}${pfad}`, {
      method: methode,
      headers: kopf,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    throw networkError(`Places API nicht erreichbar: ${err.message}`);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    if (res.status === 403 || res.status === 401) {
      throw networkError(
        `Places API lehnt den Key ab (${res.status}). ${text.slice(0, 200)}`,
        'Pruefe, ob "Places API (New)" im Google-Cloud-Projekt aktiviert und Billing hinterlegt ist.',
      );
    }
    if (res.status === 429) {
      throw networkError('Places API Kontingent erschoepft (429).', 'Spaeter erneut aufrufen — bereits geholte Daten sind gecacht.');
    }
    throw networkError(`Places API Fehler ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json();
}

/** Volltextsuche mit Ortsbezug — Grundlage der Lead-Beschaffung. */
export async function textSuche({ anfrage: q, ort, radiusMeter, seiteToken, maxErgebnisse = 20 }) {
  const felder = [
    'places.id', 'places.displayName', 'places.formattedAddress', 'places.location',
    'places.nationalPhoneNumber', 'places.websiteUri', 'places.rating',
    'places.userRatingCount', 'places.primaryType', 'places.types',
    'places.businessStatus', 'nextPageToken',
  ].join(',');

  const body = {
    textQuery: ort ? `${q} ${ort}` : q,
    languageCode: 'de',
    regionCode: 'CH',
    maxResultCount: Math.min(20, maxErgebnisse),
  };
  if (seiteToken) body.pageToken = seiteToken;
  if (radiusMeter && radiusMeter > 0) body.rankPreference = 'RELEVANCE';

  return anfrage('/places:searchText', { body, felder });
}

/** Volle Details zu einem Betrieb — Bewertungen, Fotos, Oeffnungszeiten. */
export async function details(placeId) {
  const felder = [
    'id', 'displayName', 'formattedAddress', 'shortFormattedAddress', 'addressComponents',
    'location', 'nationalPhoneNumber', 'internationalPhoneNumber', 'websiteUri',
    'rating', 'userRatingCount', 'reviews', 'photos', 'regularOpeningHours',
    'primaryType', 'primaryTypeDisplayName', 'types', 'businessStatus',
    'priceLevel', 'googleMapsUri', 'editorialSummary',
  ].join(',');
  return anfrage(`/places/${encodeURIComponent(placeId)}`, { methode: 'GET', felder });
}

/** Fotobytes zu einem Places-Fotonamen. Liefert einen ArrayBuffer. */
export async function foto(fotoName, maxBreite = 1600) {
  const key = requireKey('placesKey');
  const url = `${BASIS}/${fotoName}/media?maxWidthPx=${maxBreite}&key=${encodeURIComponent(key)}`;
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw networkError(`Places-Foto konnte nicht geladen werden (${res.status}).`);
  return Buffer.from(await res.arrayBuffer());
}

/** Ortsteil aus den Adresskomponenten ziehen — fuer Ueberschriften wie "in Gersau". */
export function ortAus(place) {
  const komp = place.addressComponents ?? [];
  const suche = (typ) => komp.find((k) => k.types?.includes(typ))?.longText;
  return suche('locality') || suche('postal_town') || suche('administrative_area_level_2')
    || (place.formattedAddress ?? '').split(',').slice(-2)[0]?.replace(/\d{4}\s*/, '').trim() || '';
}

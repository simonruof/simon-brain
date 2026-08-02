/**
 * Street View — die echte Fassade des Betriebs.
 *
 * Das loest das haerteste Problem der ganzen Pipeline: Bilder. Eine Werkstatt
 * mit vier verpixelten Fotos von 2011 ergibt ohne Gegenmassnahme einen
 * Prototyp, der genauso billig aussieht wie die alte Seite.
 *
 * Street View liefert das Gebaeude des Betriebs — sein Schild, seine Strasse,
 * sein Vordach. Faktisch korrekt, unverwechselbar, und der "das ist mein
 * Laden"-Moment im woertlichsten Sinn. Kein Stockfoto kann das.
 *
 * ZWEI DINGE, DIE MAN WISSEN MUSS:
 *
 * 1. Erst Metadaten, dann Bild. Der Metadaten-Endpunkt ist kostenlos und sagt,
 *    ob es an dieser Stelle ueberhaupt eine Aufnahme gibt. Ohne diese Abfrage
 *    bezahlt man Bildabrufe, die ein graues Ersatzbild zurueckliefern.
 *
 * 2. Die Standard-API liefert hoechstens 640x640. Fuer den vollflaechigen
 *    Bild-Hero (Gastro, Beauty) ist das zu wenig — dort bleiben Places-Fotos
 *    erste Wahl. Fuer die geteilte trust-bar-Variante (KFZ, Handwerk) wird das
 *    Bild mit etwa 600-700 CSS-Pixeln dargestellt, da passt 640 nativ.
 */

import { config } from '../core/config.js';

const BASIS = 'https://maps.googleapis.com/maps/api/streetview';
export const MAX_KANTE = 640; // harte Grenze der Standard-API

function ortsangabe({ koordinaten, adresse }) {
  if (koordinaten?.lat != null && koordinaten?.lng != null) {
    return `${koordinaten.lat},${koordinaten.lng}`;
  }
  return adresse || null;
}

/**
 * Kostenlose Vorabfrage: Gibt es an dieser Stelle eine Aufnahme?
 * @returns {Promise<{vorhanden:boolean, status:string, aufnahmeDatum?:string, entfernungOk?:boolean}>}
 */
export async function verfuegbar({ koordinaten, adresse }) {
  if (!config.placesKey) return { vorhanden: false, status: 'KEIN_KEY' };
  const ort = ortsangabe({ koordinaten, adresse });
  if (!ort) return { vorhanden: false, status: 'KEINE_POSITION' };

  const params = new URLSearchParams({
    location: ort,
    key: config.placesKey,
    // Nur offizielle Google-Aufnahmen. Nutzerfotos sind qualitativ
    // unzuverlaessig und zeigen oft das Innere statt der Fassade.
    source: 'outdoor',
    radius: '60',
  });

  try {
    const res = await fetch(`${BASIS}/metadata?${params}`, { signal: AbortSignal.timeout(12000) });
    if (!res.ok) return { vorhanden: false, status: `HTTP_${res.status}` };
    const d = await res.json();
    return {
      vorhanden: d.status === 'OK',
      status: d.status,
      aufnahmeDatum: d.date ?? null,
      position: d.location ?? null,
      panoId: d.pano_id ?? null,
    };
  } catch (err) {
    // Street View ist ein Zusatz, kein Kernbestandteil. Faellt es aus,
    // greift die bestehende Bildkaskade weiter.
    return { vorhanden: false, status: `FEHLER: ${err.message}` };
  }
}

/**
 * Fassadenbild holen. Vorher immer `verfuegbar()` aufrufen — sonst bezahlt
 * man fuer graue Ersatzbilder.
 *
 * @param {{koordinaten?:object, adresse?:string, heading?:number, fov?:number}} opts
 * @returns {Promise<Buffer|null>}
 */
export async function fassade({ koordinaten, adresse, heading, fov = 80, pitch = 8 }) {
  if (!config.placesKey) return null;
  const ort = ortsangabe({ koordinaten, adresse });
  if (!ort) return null;

  const params = new URLSearchParams({
    location: ort,
    size: `${MAX_KANTE}x${Math.round(MAX_KANTE * 0.66)}`, // 640x422, naeher am Querformat des Heros
    key: config.placesKey,
    source: 'outdoor',
    radius: '60',
    // Leicht nach oben, damit Beschriftung und Obergeschoss im Bild sind
    // statt Asphalt und parkender Autos.
    pitch: String(pitch),
    fov: String(fov),
    return_error_code: 'true',
  });
  if (heading != null) params.set('heading', String(heading));

  try {
    const res = await fetch(`${BASIS}?${params}`, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    // Ein graues Ersatzbild ist winzig. Unter 12 KB ist es keine echte Aufnahme.
    return buf.length > 12000 ? buf : null;
  } catch {
    return null;
  }
}

/**
 * Beides in einem Schritt, mit der kostenlosen Pruefung vorweg.
 * @returns {Promise<{buffer:Buffer, quelle:'streetview', aufnahmeDatum:string|null}|null>}
 */
export async function holeFassade(profil) {
  const koordinaten = profil.places?.koordinaten ?? null;
  const adresse = profil.places?.adresse || profil.scrape?.extrahiert?.adresse?.vollstaendig || '';

  const pruefung = await verfuegbar({ koordinaten, adresse });
  if (!pruefung.vorhanden) return null;

  const buf = await fassade({ koordinaten, adresse });
  if (!buf) return null;

  return { buffer: buf, quelle: 'streetview', aufnahmeDatum: pruefung.aufnahmeDatum };
}

/**
 * Wie das Playbook Street View einordnet.
 * 'bevorzugt' — vor den Website-Bildern (KFZ, Handwerk: die Werkstatt von aussen
 *               sagt mehr als ein Katalogfoto)
 * 'fallback'  — nur wenn sonst nichts da ist (Gastro, Beauty: das Essen und der
 *               Innenraum verkaufen, nicht die Hausfassade)
 * 'nie'       — ausgeschaltet
 */
export function rangImPlaybook(playbook) {
  return playbook?.images?.streetview ?? 'fallback';
}
